import { createLogger } from '@swarmit/logger';

const logger = createLogger('railway');

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';

export interface RailwayClient {
  query(gql: string, variables?: Record<string, unknown>): Promise<unknown>;
  setEnvVars(environmentId: string, serviceId: string, vars: Record<string, string>): Promise<void>;
  getDeployments(serviceId: string): Promise<unknown>;
  createProject(name: string): Promise<{ projectId: string; environmentId: string }>;
  createServiceFromRepo(projectId: string, environmentId: string, repoFullName: string): Promise<string>;
  generateDomain(serviceId: string, environmentId: string): Promise<string>;
  redeployService(serviceId: string, environmentId: string): Promise<boolean>;
}

export interface RailwayDeployResult {
  projectId: string;
  serviceId: string;
  environmentId: string;
  domain: string;
  url: string;
}

export function createRailwayClient(token: string): RailwayClient {
  async function railwayFetch(gql: string, variables?: Record<string, unknown>) {
    const response = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: gql, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, body: text }, 'Railway API error');
      throw new Error(`Railway API error: ${response.status}`);
    }

    const result = await response.json() as { data?: unknown; errors?: Array<{ message: string }> };
    if (result.errors?.length) {
      logger.error({ errors: result.errors }, 'Railway GraphQL errors');
      throw new Error(`Railway GraphQL error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  return {
    async query(gql, variables) {
      return railwayFetch(gql, variables);
    },

    async setEnvVars(environmentId, serviceId, vars) {
      const input = Object.entries(vars).map(([name, value]) => ({
        name,
        value,
        environmentId,
        serviceId,
      }));

      await railwayFetch(`
        mutation ($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input)
        }
      `, { input: { variables: input, environmentId, serviceId } });
    },

    async getDeployments(serviceId) {
      return railwayFetch(`
        query ($serviceId: String!) {
          deployments(serviceId: $serviceId, first: 10) {
            edges { node { id status createdAt } }
          }
        }
      `, { serviceId });
    },

    async createProject(name) {
      const data = await railwayFetch(`
        mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            id
            environments {
              edges {
                node { id name }
              }
            }
          }
        }
      `, { input: { name } }) as {
        projectCreate: {
          id: string;
          environments: { edges: Array<{ node: { id: string; name: string } }> };
        };
      };

      const project = data.projectCreate;
      const productionEnv = project.environments.edges.find(
        e => e.node.name === 'production'
      ) || project.environments.edges[0];

      logger.info({ projectId: project.id, environmentId: productionEnv.node.id }, 'Railway project created');

      return {
        projectId: project.id,
        environmentId: productionEnv.node.id,
      };
    },

    async createServiceFromRepo(projectId, environmentId, repoFullName) {
      const data = await railwayFetch(`
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
      }) as { serviceCreate: { id: string } };

      // environmentId is passed for future use
      void environmentId;

      const serviceId = data.serviceCreate.id;
      logger.info({ serviceId, repoFullName }, 'Railway service created');
      return serviceId;
    },

    async generateDomain(serviceId, environmentId) {
      const data = await railwayFetch(`
        mutation($input: ServiceDomainCreateInput!) {
          serviceDomainCreate(input: $input) {
            domain
          }
        }
      `, {
        input: { serviceId, environmentId },
      }) as { serviceDomainCreate: { domain: string } };

      const domain = data.serviceDomainCreate.domain;
      logger.info({ serviceId, domain }, 'Railway domain generated');
      return domain;
    },

    async redeployService(serviceId, environmentId) {
      await railwayFetch(`
        mutation ($serviceId: String!, $environmentId: String!) {
          serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
        }
      `, { serviceId, environmentId });
      return true;
    },
  };
}

/**
 * Refresh an OAuth token using the refresh_token grant.
 * Standalone function (not part of client) because it doesn't need an existing valid token.
 */
export async function refreshRailwayOAuthToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://backboard.railway.com/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Railway token refresh failed: ${response.status} ${text}`);
  }

  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || 3600,
  };
}
