import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUserRailwayToken, mockUpdateUserRailwayToken } = vi.hoisted(() => ({
  mockGetUserRailwayToken: vi.fn(),
  mockUpdateUserRailwayToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getUserRailwayToken: mockGetUserRailwayToken,
  updateUserRailwayToken: mockUpdateUserRailwayToken,
  default: { query: vi.fn() },
}));

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import {
  railwayGraphQL,
  refreshRailwayOAuthToken,
  getValidRailwayToken,
  createRailwayProject,
  createServiceFromRepo,
  generateDomain,
  deployToRailway,
} from '@/lib/railway-deploy';

describe('railway-deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('railwayGraphQL', () => {
    it('should execute a GraphQL query and return data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { me: { name: 'test' } } }),
      });

      const result = await railwayGraphQL('token123', 'query { me { name } }');
      expect(result).toEqual({ me: { name: 'test' } });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        })
      );
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(railwayGraphQL('bad-token', 'query { me { name } }'))
        .rejects.toThrow('Railway API HTTP 401: Unauthorized');
    });

    it('should throw on GraphQL errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Project not found' }],
        }),
      });

      await expect(railwayGraphQL('token', 'mutation { projectCreate }'))
        .rejects.toThrow('Railway API error: Project not found');
    });
  });

  describe('refreshRailwayOAuthToken', () => {
    it('should refresh token successfully', async () => {
      vi.stubEnv('RAILWAY_CLIENT_ID', 'test-client-id');
      vi.stubEnv('RAILWAY_CLIENT_SECRET', 'test-client-secret');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 7200,
        }),
      });

      const result = await refreshRailwayOAuthToken('old-refresh-token');
      expect(result).toEqual({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresIn: 7200,
      });

      vi.unstubAllEnvs();
    });

    it('should throw when client credentials missing', async () => {
      vi.stubEnv('RAILWAY_CLIENT_ID', '');
      vi.stubEnv('RAILWAY_CLIENT_SECRET', '');

      await expect(refreshRailwayOAuthToken('refresh'))
        .rejects.toThrow('Railway OAuth client credentials not configured');

      vi.unstubAllEnvs();
    });

    it('should throw on refresh failure', async () => {
      vi.stubEnv('RAILWAY_CLIENT_ID', 'id');
      vi.stubEnv('RAILWAY_CLIENT_SECRET', 'secret');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      await expect(refreshRailwayOAuthToken('bad-refresh'))
        .rejects.toThrow('Railway token refresh failed: 400 Bad Request');

      vi.unstubAllEnvs();
    });
  });

  describe('getValidRailwayToken', () => {
    it('should return null when no token stored', async () => {
      mockGetUserRailwayToken.mockResolvedValueOnce(null);

      const result = await getValidRailwayToken('user@test.com');
      expect(result).toBeNull();
    });

    it('should return API token directly (no expiry check)', async () => {
      mockGetUserRailwayToken.mockResolvedValueOnce({
        token: 'api-token',
        authMethod: 'token',
        refreshToken: null,
        expiresAt: null,
      });

      const result = await getValidRailwayToken('user@test.com');
      expect(result).toBe('api-token');
    });

    it('should return OAuth token if not expired', async () => {
      mockGetUserRailwayToken.mockResolvedValueOnce({
        token: 'oauth-token',
        authMethod: 'oauth',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      });

      const result = await getValidRailwayToken('user@test.com');
      expect(result).toBe('oauth-token');
    });

    it('should refresh expired OAuth token', async () => {
      vi.stubEnv('RAILWAY_CLIENT_ID', 'id');
      vi.stubEnv('RAILWAY_CLIENT_SECRET', 'secret');

      mockGetUserRailwayToken.mockResolvedValueOnce({
        token: 'expired-token',
        authMethod: 'oauth',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      const result = await getValidRailwayToken('user@test.com');
      expect(result).toBe('refreshed-token');
      expect(mockUpdateUserRailwayToken).toHaveBeenCalledWith(
        'user@test.com',
        'refreshed-token',
        'new-refresh',
        expect.any(Date)
      );

      vi.unstubAllEnvs();
    });

    it('should return null when OAuth expired and no refresh token', async () => {
      mockGetUserRailwayToken.mockResolvedValueOnce({
        token: 'expired-token',
        authMethod: 'oauth',
        refreshToken: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await getValidRailwayToken('user@test.com');
      expect(result).toBeNull();
    });
  });

  describe('createRailwayProject', () => {
    it('should create project and return IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            projectCreate: {
              id: 'proj-123',
              environments: {
                edges: [
                  { node: { id: 'env-prod', name: 'production' } },
                ],
              },
            },
          },
        }),
      });

      const result = await createRailwayProject('token', 'my-project');
      expect(result).toEqual({
        projectId: 'proj-123',
        environmentId: 'env-prod',
      });
    });

    it('should use first env if no production env', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            projectCreate: {
              id: 'proj-456',
              environments: {
                edges: [
                  { node: { id: 'env-staging', name: 'staging' } },
                ],
              },
            },
          },
        }),
      });

      const result = await createRailwayProject('token', 'test');
      expect(result.environmentId).toBe('env-staging');
    });
  });

  describe('createServiceFromRepo', () => {
    it('should create service from repo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            serviceCreate: { id: 'svc-789' },
          },
        }),
      });

      const result = await createServiceFromRepo('token', 'proj-123', 'env-prod', 'user/repo');
      expect(result).toBe('svc-789');
    });
  });

  describe('generateDomain', () => {
    it('should generate domain for service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            serviceDomainCreate: { domain: 'my-app.up.railway.app' },
          },
        }),
      });

      const result = await generateDomain('token', 'svc-789', 'env-prod');
      expect(result).toBe('my-app.up.railway.app');
    });
  });

  describe('deployToRailway', () => {
    it('should return null when no token', async () => {
      mockGetUserRailwayToken.mockResolvedValueOnce(null);

      const result = await deployToRailway('user@test.com', 'user/repo', 'task-uuid-1234', 'Test Task');
      expect(result).toBeNull();
    });

    it('should orchestrate full deploy flow', async () => {
      mockGetUserRailwayToken.mockResolvedValueOnce({
        token: 'api-token',
        authMethod: 'token',
        refreshToken: null,
        expiresAt: null,
      });

      // createRailwayProject
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            projectCreate: {
              id: 'proj-abc',
              environments: {
                edges: [{ node: { id: 'env-prod', name: 'production' } }],
              },
            },
          },
        }),
      });

      // createServiceFromRepo
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            serviceCreate: { id: 'svc-def' },
          },
        }),
      });

      // generateDomain
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            serviceDomainCreate: { domain: 'swarmit-task-uui.up.railway.app' },
          },
        }),
      });

      const result = await deployToRailway('user@test.com', 'user/repo', 'task-uuid-1234', 'Test Task');
      expect(result).toEqual({
        projectId: 'proj-abc',
        serviceId: 'svc-def',
        environmentId: 'env-prod',
        domain: 'swarmit-task-uui.up.railway.app',
        url: 'https://swarmit-task-uui.up.railway.app',
      });
    });

    it('should return null on API error (non-blocking)', async () => {
      mockGetUserRailwayToken.mockResolvedValueOnce({
        token: 'api-token',
        authMethod: 'token',
        refreshToken: null,
        expiresAt: null,
      });

      // createRailwayProject fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await deployToRailway('user@test.com', 'user/repo', 'task-id', 'Task');
      expect(result).toBeNull();
    });
  });
});
