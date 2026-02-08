/**
 * Railway deployment via GraphQL API
 *
 * Handles creating Railway projects and deploying from GitHub repos.
 * Called after pushToGitHub in the agent pipeline.
 */

import { getUserRailwayToken, updateUserRailwayToken } from './db';

const RAILWAY_GRAPHQL = 'https://backboard.railway.app/graphql/v2';

export interface RailwayDeployResult {
  projectId: string;
  serviceId: string;
  environmentId: string;
  domain: string;
  url: string;
}

/** Execute a Railway GraphQL query/mutation */
export async function railwayGraphQL(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<any> {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Railway API HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(`Railway API error: ${data.errors[0].message}`);
  }

  return data.data;
}

/** Refresh an OAuth token using the refresh_token grant */
export async function refreshRailwayOAuthToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}> {
  const clientId = process.env.RAILWAY_CLIENT_ID;
  const clientSecret = process.env.RAILWAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Railway OAuth client credentials not configured');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://backboard.railway.com/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Railway token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || 3600,
  };
}

/** Get a valid Railway token, refreshing OAuth tokens if expired */
export async function getValidRailwayToken(userEmail: string): Promise<string | null> {
  const stored = await getUserRailwayToken(userEmail);
  if (!stored) return null;

  // API tokens (non-OAuth) don't expire
  if (stored.authMethod !== 'oauth') return stored.token;

  // Check if OAuth token is still valid (with 5-min buffer)
  if (stored.expiresAt && stored.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return stored.token;
  }

  // Need to refresh
  if (!stored.refreshToken) {
    console.warn('[Railway] OAuth token expired and no refresh token available');
    return null;
  }

  try {
    const refreshed = await refreshRailwayOAuthToken(stored.refreshToken);
    const newExpiry = new Date(Date.now() + refreshed.expiresIn * 1000);
    await updateUserRailwayToken(userEmail, refreshed.accessToken, refreshed.refreshToken, newExpiry);
    return refreshed.accessToken;
  } catch (err) {
    console.error('[Railway] Token refresh failed:', err);
    return null;
  }
}

/** Create a new Railway project */
export async function createRailwayProject(
  token: string,
  name: string
): Promise<{ projectId: string; environmentId: string }> {
  const data = await railwayGraphQL(token, `
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `, { input: { name } });

  const project = data.projectCreate;
  const productionEnv = project.environments.edges.find(
    (e: any) => e.node.name === 'production'
  ) || project.environments.edges[0];

  return {
    projectId: project.id,
    environmentId: productionEnv.node.id,
  };
}

/** Create a service linked to a GitHub repo (triggers auto-deploy) */
export async function createServiceFromRepo(
  token: string,
  projectId: string,
  environmentId: string,
  repoFullName: string
): Promise<string> {
  const data = await railwayGraphQL(token, `
    mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
      }
    }
  `, {
    input: {
      projectId,
      name: repoFullName.split('/').pop() || 'app',
      source: { repo: repoFullName },
    },
  });

  // Suppress unused variable - environmentId is passed for future use
  void environmentId;

  return data.serviceCreate.id;
}

/** Generate a Railway domain for a service */
export async function generateDomain(
  token: string,
  serviceId: string,
  environmentId: string
): Promise<string> {
  const data = await railwayGraphQL(token, `
    mutation($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) {
        domain
      }
    }
  `, {
    input: { serviceId, environmentId },
  });

  return data.serviceDomainCreate.domain;
}

/**
 * Orchestrate a full Railway deployment:
 * get token → create project → create service from repo → generate domain
 *
 * Returns null on failure (non-blocking).
 */
export async function deployToRailway(
  userEmail: string,
  githubRepoFullName: string,
  taskId: string,
  taskTitle: string
): Promise<RailwayDeployResult | null> {
  try {
    const token = await getValidRailwayToken(userEmail);
    if (!token) {
      console.log('[Railway] No valid token for', userEmail);
      return null;
    }

    const projectName = `swarmit-${taskId.slice(0, 8)}`;
    console.log(`[Railway] Creating project "${projectName}" for task: ${taskTitle}`);

    const { projectId, environmentId } = await createRailwayProject(token, projectName);
    console.log(`[Railway] Project created: ${projectId}`);

    const serviceId = await createServiceFromRepo(token, projectId, environmentId, githubRepoFullName);
    console.log(`[Railway] Service created: ${serviceId} (linked to ${githubRepoFullName})`);

    const domain = await generateDomain(token, serviceId, environmentId);
    const url = `https://${domain}`;
    console.log(`[Railway] Domain assigned: ${url}`);

    return { projectId, serviceId, environmentId, domain, url };
  } catch (err) {
    console.error('[Railway] Deploy failed:', err);
    return null;
  }
}
