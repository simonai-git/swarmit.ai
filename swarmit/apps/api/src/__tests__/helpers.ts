import { vi } from 'vitest';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { hkdfSync } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { ZodError } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';

const TEST_SECRET_RAW = 'test-secret';
const TEST_ENCRYPTION_KEY = new Uint8Array(
  hkdfSync('sha256', TEST_SECRET_RAW, '', 'NextAuth.js Generated Encryption Key', 32)
);

/**
 * Creates a minimal Fastify app with mocked prisma, auth, and socket.io
 * for use in fastify.inject() route tests.
 */
export async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);

  // Mock prisma — all model methods are vi.fn()
  const mockPrisma = createMockPrisma();
  app.decorate('prisma', mockPrisma as any);

  // Mock auth decorator (mirrors plugins/auth.ts)
  app.decorateRequest('userId', '');
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { payload } = await jwtDecrypt(token, TEST_ENCRYPTION_KEY);
        request.userId = (payload.userId as string) || (payload.sub as string);
        return;
      }

      const sessionToken =
        request.cookies?.['next-auth.session-token'] ||
        request.cookies?.['__Secure-next-auth.session-token'];

      if (sessionToken) {
        const { payload } = await jwtDecrypt(sessionToken, TEST_ENCRYPTION_KEY);
        request.userId = (payload.userId as string) || (payload.sub as string);
        return;
      }

      reply.code(401).send({ error: 'Unauthorized' });
    } catch {
      reply.code(401).send({ error: 'Invalid token' });
    }
  });

  // Zod validation error handler
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation error',
        details: error.flatten().fieldErrors,
      });
    }
    reply.code(error.statusCode ?? 500).send({ error: error.message });
  });

  // Mock Socket.io
  app.decorate('io', { emit: vi.fn() } as any);

  // Mock BullMQ queues
  const mockAgentQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }), close: vi.fn() };
  const mockLifecycleQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }), close: vi.fn() };
  app.decorate('agentQueue', mockAgentQueue as any);
  app.decorate('lifecycleQueue', mockLifecycleQueue as any);

  return { app, prisma: mockPrisma, agentQueue: mockAgentQueue, lifecycleQueue: mockLifecycleQueue };
}

/**
 * Creates a valid encrypted JWT (JWE) matching next-auth v4 format.
 */
export async function createTestToken(userId: string = 'test-user-id') {
  return new EncryptJWT({ sub: userId, userId })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setJti(crypto.randomUUID())
    .encrypt(TEST_ENCRYPTION_KEY);
}

/**
 * Returns an authorization header object for convenience.
 */
export async function authHeaders(userId?: string) {
  const token = await createTestToken(userId);
  return { authorization: `Bearer ${token}` };
}

function createMockPrisma() {
  return {
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    taskComment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    taskDependency: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    taskRun: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    taskLog: {
      findMany: vi.fn(),
    },
    skill: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    specialization: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    workflow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    workflowVersion: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    agentWorkflow: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    agentSkill: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    automationSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    integrationToken: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
