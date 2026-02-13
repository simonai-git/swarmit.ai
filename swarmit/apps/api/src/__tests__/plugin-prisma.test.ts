import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

const { mockDisconnect } = vi.hoisted(() => ({
  mockDisconnect: vi.fn(),
}));

vi.mock('@swarmit/db', () => ({
  prisma: {
    $disconnect: mockDisconnect,
  },
}));

import { prismaPlugin } from '../plugins/prisma.js';

describe('prismaPlugin', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    vi.clearAllMocks();
  });

  it('decorates the app with prisma', async () => {
    app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.ready();

    expect(app.prisma).toBeDefined();
    expect(app.prisma.$disconnect).toBe(mockDisconnect);
  });

  it('calls prisma.$disconnect() on close', async () => {
    app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.ready();

    await app.close();
    expect(mockDisconnect).toHaveBeenCalledOnce();

    // Prevent afterEach from closing again
    app = undefined as any;
  });
});
