import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { EncryptJWT } from 'jose';
import { hkdfSync } from 'node:crypto';
import { authPlugin } from '../plugins/auth.js';

const TEST_SECRET = 'test-auth-secret';

function deriveKey(secret: string) {
  return new Uint8Array(
    hkdfSync('sha256', secret, '', 'NextAuth.js Generated Encryption Key', 32)
  );
}

async function createJWE(userId: string, secret: string, expiresIn = '1h') {
  const key = deriveKey(secret);
  return new EncryptJWT({ sub: userId, userId })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setJti(crypto.randomUUID())
    .encrypt(key);
}

describe('auth plugin', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = TEST_SECRET;

    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(authPlugin);

    // Test route that requires auth
    app.get('/protected', { preHandler: [app.authenticate] }, async (request: FastifyRequest) => {
      return { userId: request.userId };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.NEXTAUTH_SECRET;
  });

  it('authenticates with valid Bearer JWE token', async () => {
    const token = await createJWE('user-123', TEST_SECRET);
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: 'user-123' });
  });

  it('authenticates with valid session cookie', async () => {
    const token = await createJWE('user-456', TEST_SECRET);
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { 'next-auth.session-token': token },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: 'user-456' });
  });

  it('authenticates with __Secure- prefixed cookie', async () => {
    const token = await createJWE('user-789', TEST_SECRET);
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { '__Secure-next-auth.session-token': token },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: 'user-789' });
  });

  it('returns 401 when no auth is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 for invalid Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer invalid-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid token' });
  });

  it('returns 401 for expired token', async () => {
    const token = await createJWE('user-expired', TEST_SECRET, '0s');
    // Wait a moment to ensure token is expired
    await new Promise((r) => setTimeout(r, 50));

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid token' });
  });

  it('returns 401 for token encrypted with wrong secret', async () => {
    const token = await createJWE('user-wrong', 'wrong-secret-value');
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid token' });
  });

  it('returns 401 for invalid session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { 'next-auth.session-token': 'not-a-valid-jwe' },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid token' });
  });

  it('extracts userId from sub claim when userId is missing', async () => {
    const key = deriveKey(TEST_SECRET);
    const token = await new EncryptJWT({ sub: 'user-sub-only' })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setJti(crypto.randomUUID())
      .encrypt(key);

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: 'user-sub-only' });
  });

  it('uses default secret when NEXTAUTH_SECRET is not set', async () => {
    // Create a separate app with no NEXTAUTH_SECRET
    const savedSecret = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    const app2 = Fastify({ logger: false });
    await app2.register(cookie);
    await app2.register(authPlugin);
    app2.get('/test', { preHandler: [app2.authenticate] }, async (req) => {
      return { userId: req.userId };
    });
    await app2.ready();

    // Token encrypted with the default fallback secret
    const token = await createJWE('user-default', 'dev-secret-for-local-development-only');
    const res = await app2.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: 'user-default' });

    await app2.close();
    process.env.NEXTAUTH_SECRET = savedSecret;
  });
});
