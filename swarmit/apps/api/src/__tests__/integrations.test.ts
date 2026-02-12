import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, authHeaders, type MockPrisma } from './helpers.js';
import { integrationRoutes } from '../routes/integrations.js';

describe('integration routes', () => {
  let app: FastifyInstance;
  let prisma: MockPrisma;
  let headers: Record<string, string>;

  beforeAll(async () => {
    const testApp = await buildTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    await app.register(integrationRoutes, { prefix: '/integrations' });
    await app.ready();
    headers = await authHeaders();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === 'object' && model !== null) {
        Object.values(model).forEach((fn) => {
          if (typeof fn === 'function' && 'mockReset' in fn) {
            (fn as { mockReset: () => void }).mockReset();
          }
        });
      }
    });
  });

  it('POST /integrations/tokens upserts a token', async () => {
    prisma.integrationToken.upsert.mockResolvedValue({
      id: 'it-1',
      provider: 'github',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/integrations/tokens',
      headers,
      payload: { provider: 'github', accessToken: 'ghp_test123' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.provider).toBe('github');
    expect(body.id).toBe('it-1');
    // Should NOT include accessToken in response
    expect(body.accessToken).toBeUndefined();
  });

  it('GET /integrations/tokens lists tokens without secrets', async () => {
    prisma.integrationToken.findMany.mockResolvedValue([
      { id: 'it-1', provider: 'github', createdAt: new Date(), updatedAt: new Date() },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/integrations/tokens',
      headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0].provider).toBe('github');
  });

  it('DELETE /integrations/tokens/:provider removes token', async () => {
    prisma.integrationToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await app.inject({
      method: 'DELETE',
      url: '/integrations/tokens/github',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
  });

  it('DELETE /integrations/tokens/:provider returns 404 if not found', async () => {
    prisma.integrationToken.deleteMany.mockResolvedValue({ count: 0 });

    const res = await app.inject({
      method: 'DELETE',
      url: '/integrations/tokens/railway',
      headers,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/integrations/tokens',
    });

    expect(res.statusCode).toBe(401);
  });
});
