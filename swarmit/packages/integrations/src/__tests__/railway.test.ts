import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createRailwayClient, refreshRailwayOAuthToken, type RailwayClient } from '../railway/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';

function mockGraphQLResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
    text: () => Promise.resolve(JSON.stringify({ data })),
  };
}

function mockGraphQLErrors(errors: Array<{ message: string }>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ errors }),
    text: () => Promise.resolve(JSON.stringify({ errors })),
  };
}

function mockErrorResponse(status: number, body = 'Error') {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ message: body }),
    text: () => Promise.resolve(body),
  };
}

describe('RailwayClient', () => {
  let client: RailwayClient;
  const token = 'railway-test-token';

  beforeEach(() => {
    vi.clearAllMocks();
    client = createRailwayClient(token);
  });

  describe('query', () => {
    it('sends correct GraphQL body and headers', async () => {
      mockFetch.mockResolvedValueOnce(mockGraphQLResponse({ me: { id: '123' } }));

      const result = await client.query('query { me { id } }', { foo: 'bar' });

      expect(result).toEqual({ me: { id: '123' } });
      expect(mockFetch).toHaveBeenCalledWith(RAILWAY_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'query { me { id } }',
          variables: { foo: 'bar' },
        }),
      });
    });

    it('works without variables', async () => {
      mockFetch.mockResolvedValueOnce(mockGraphQLResponse({ me: { id: '123' } }));

      await client.query('query { me { id } }');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables).toBeUndefined();
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(500, 'Internal Server Error'));

      await expect(client.query('query { me { id } }')).rejects.toThrow(
        'Railway API error: 500'
      );
    });

    it('throws on GraphQL errors', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLErrors([{ message: 'Unauthorized' }])
      );

      await expect(client.query('query { me { id } }')).rejects.toThrow(
        'Railway GraphQL error: Unauthorized'
      );
    });
  });

  describe('setEnvVars', () => {
    it('formats variables correctly in the mutation', async () => {
      mockFetch.mockResolvedValueOnce(mockGraphQLResponse(true));

      await client.setEnvVars('env-123', 'svc-456', {
        DATABASE_URL: 'postgres://...',
        PORT: '3000',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables).toEqual({
        input: {
          variables: [
            { name: 'DATABASE_URL', value: 'postgres://...', environmentId: 'env-123', serviceId: 'svc-456' },
            { name: 'PORT', value: '3000', environmentId: 'env-123', serviceId: 'svc-456' },
          ],
          environmentId: 'env-123',
          serviceId: 'svc-456',
        },
      });
    });

    it('sends the variableCollectionUpsert mutation', async () => {
      mockFetch.mockResolvedValueOnce(mockGraphQLResponse(true));

      await client.setEnvVars('env-1', 'svc-1', { KEY: 'val' });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.query).toContain('variableCollectionUpsert');
    });
  });

  describe('getDeployments', () => {
    it('calls with correct serviceId', async () => {
      const deployments = {
        deployments: {
          edges: [
            { node: { id: 'dep-1', status: 'SUCCESS', createdAt: '2024-01-01' } },
          ],
        },
      };
      mockFetch.mockResolvedValueOnce(mockGraphQLResponse(deployments));

      const result = await client.getDeployments('svc-789');

      expect(result).toEqual(deployments);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables).toEqual({ serviceId: 'svc-789' });
      expect(callBody.query).toContain('deployments(serviceId: $serviceId');
    });
  });

  describe('createProject', () => {
    it('returns projectId and environmentId from production env', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLResponse({
          projectCreate: {
            id: 'proj-abc',
            environments: {
              edges: [
                { node: { id: 'env-staging', name: 'staging' } },
                { node: { id: 'env-production', name: 'production' } },
              ],
            },
          },
        })
      );

      const result = await client.createProject('my-project');

      expect(result).toEqual({
        projectId: 'proj-abc',
        environmentId: 'env-production',
      });
    });

    it('falls back to first environment if no production env', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLResponse({
          projectCreate: {
            id: 'proj-xyz',
            environments: {
              edges: [
                { node: { id: 'env-dev', name: 'development' } },
              ],
            },
          },
        })
      );

      const result = await client.createProject('dev-project');

      expect(result).toEqual({
        projectId: 'proj-xyz',
        environmentId: 'env-dev',
      });
    });

    it('sends project name in variables', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLResponse({
          projectCreate: {
            id: 'proj-1',
            environments: { edges: [{ node: { id: 'env-1', name: 'production' } }] },
          },
        })
      );

      await client.createProject('test-project');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables).toEqual({ input: { name: 'test-project' } });
    });
  });

  describe('createServiceFromRepo', () => {
    it('returns serviceId', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLResponse({
          serviceCreate: { id: 'svc-new-123' },
        })
      );

      const serviceId = await client.createServiceFromRepo(
        'proj-abc', 'env-abc', 'user/my-app'
      );

      expect(serviceId).toBe('svc-new-123');
    });

    it('extracts repo name for service name', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLResponse({ serviceCreate: { id: 'svc-1' } })
      );

      await client.createServiceFromRepo('proj-1', 'env-1', 'org/cool-service');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables.input.name).toBe('cool-service');
      expect(callBody.variables.input.source).toEqual({ repo: 'org/cool-service' });
      expect(callBody.variables.input.projectId).toBe('proj-1');
    });
  });

  describe('generateDomain', () => {
    it('returns domain string', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLResponse({
          serviceDomainCreate: { domain: 'my-app-production.up.railway.app' },
        })
      );

      const domain = await client.generateDomain('svc-123', 'env-456');

      expect(domain).toBe('my-app-production.up.railway.app');
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables).toEqual({
        input: { serviceId: 'svc-123', environmentId: 'env-456' },
      });
    });
  });

  describe('redeployService', () => {
    it('sends redeploy mutation and returns true', async () => {
      mockFetch.mockResolvedValueOnce(mockGraphQLResponse(true));

      const result = await client.redeployService('svc-123', 'env-456');

      expect(result).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.query).toContain('serviceInstanceRedeploy');
      expect(callBody.variables).toEqual({ serviceId: 'svc-123', environmentId: 'env-456' });
    });

    it('throws on GraphQL error', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLErrors([{ message: 'Service not found' }])
      );

      await expect(client.redeployService('bad-svc', 'env-1')).rejects.toThrow(
        'Railway GraphQL error: Service not found'
      );
    });
  });

  describe('error handling', () => {
    it('throws on HTTP error for any method', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(403));

      await expect(client.getDeployments('svc-1')).rejects.toThrow('Railway API error: 403');
    });

    it('throws on GraphQL error for mutations', async () => {
      mockFetch.mockResolvedValueOnce(
        mockGraphQLErrors([{ message: 'Insufficient permissions' }])
      );

      await expect(client.setEnvVars('env-1', 'svc-1', { K: 'v' })).rejects.toThrow(
        'Railway GraphQL error: Insufficient permissions'
      );
    });
  });
});

describe('refreshRailwayOAuthToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends correct Basic auth and form body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 7200,
        }),
      text: () => Promise.resolve(''),
    });

    const result = await refreshRailwayOAuthToken(
      'old-refresh-token',
      'client-id-123',
      'client-secret-456'
    );

    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 7200,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://backboard.railway.com/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      })
    );

    // Verify Basic auth header
    const expectedBasic = Buffer.from('client-id-123:client-secret-456').toString('base64');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(`Basic ${expectedBasic}`);

    // Verify form body
    const body = mockFetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('old-refresh-token');
  });

  it('handles missing refresh_token and expires_in in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 'token-only' }),
      text: () => Promise.resolve(''),
    });

    const result = await refreshRailwayOAuthToken('rt', 'cid', 'cs');

    expect(result).toEqual({
      accessToken: 'token-only',
      refreshToken: null,
      expiresIn: 3600,
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('invalid_grant'),
    });

    await expect(
      refreshRailwayOAuthToken('bad-token', 'cid', 'cs')
    ).rejects.toThrow('Railway token refresh failed: 400 invalid_grant');
  });
});
