import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

const mockQueueClose = vi.fn();
const mockRedisQuit = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    close: mockQueueClose,
  })),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    quit: mockRedisQuit,
  })),
}));

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import queuePlugin from '../plugins/queue.js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

describe('queuePlugin', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('decorates the app with agentQueue and lifecycleQueue', async () => {
    app = Fastify({ logger: false });
    await app.register(queuePlugin);
    await app.ready();

    expect(app.agentQueue).toBeDefined();
    expect(app.lifecycleQueue).toBeDefined();
  });

  it('creates a Redis connection', async () => {
    app = Fastify({ logger: false });
    await app.register(queuePlugin);
    await app.ready();

    expect(Redis).toHaveBeenCalledOnce();
    expect(Redis).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxRetriesPerRequest: null })
    );
  });

  it('creates two BullMQ queues with correct names', async () => {
    app = Fastify({ logger: false });
    await app.register(queuePlugin);
    await app.ready();

    expect(Queue).toHaveBeenCalledTimes(2);
    expect(Queue).toHaveBeenCalledWith(
      'agent-execution',
      expect.objectContaining({
        connection: expect.any(Object),
        defaultJobOptions: expect.objectContaining({
          attempts: 3,
        }),
      })
    );
    expect(Queue).toHaveBeenCalledWith(
      'lifecycle',
      expect.objectContaining({
        connection: expect.any(Object),
        defaultJobOptions: expect.objectContaining({
          attempts: 3,
        }),
      })
    );
  });

  it('closes queues and Redis connection on app close', async () => {
    app = Fastify({ logger: false });
    await app.register(queuePlugin);
    await app.ready();

    await app.close();

    // Both queues should be closed
    expect(mockQueueClose).toHaveBeenCalledTimes(2);
    // Redis connection should be quit
    expect(mockRedisQuit).toHaveBeenCalledOnce();

    // Prevent afterEach from closing again
    app = undefined as any;
  });
});
