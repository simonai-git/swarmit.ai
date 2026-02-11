import { describe, it, expect, vi } from 'vitest';

// ── Mock BullMQ Queue ───────────────────────────────────────
const mockQueueInstances = vi.hoisted(() => [] as Array<{ name: string; connection: unknown; opts: unknown }>);

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string, opts: Record<string, unknown>) => {
    const instance = { name, connection: opts.connection, opts, close: vi.fn().mockResolvedValue(undefined) };
    mockQueueInstances.push(instance);
    return instance;
  }),
}));

import { createQueues } from '../queues.js';

describe('createQueues', () => {
  it('returns three queues with correct names', () => {
    mockQueueInstances.length = 0;

    const mockConnection = { host: 'localhost', port: 6379 } as unknown as Parameters<typeof createQueues>[0];
    const queues = createQueues(mockConnection);

    expect(queues.agentQueue).toBeDefined();
    expect(queues.lifecycleQueue).toBeDefined();
    expect(queues.schedulerQueue).toBeDefined();

    expect(mockQueueInstances).toHaveLength(3);
    const names = mockQueueInstances.map(q => q.name);
    expect(names).toContain('agent-execution');
    expect(names).toContain('lifecycle');
    expect(names).toContain('scheduler');
  });

  it('passes the connection to each queue', () => {
    mockQueueInstances.length = 0;

    const mockConnection = { host: 'redis.prod', port: 6380 } as unknown as Parameters<typeof createQueues>[0];
    createQueues(mockConnection);

    for (const instance of mockQueueInstances) {
      expect(instance.connection).toBe(mockConnection);
    }
  });

  it('configures agent-execution queue with retry options', () => {
    mockQueueInstances.length = 0;

    const mockConnection = {} as unknown as Parameters<typeof createQueues>[0];
    createQueues(mockConnection);

    const agentQueue = mockQueueInstances.find(q => q.name === 'agent-execution');
    expect(agentQueue).toBeDefined();
    const opts = agentQueue!.opts as { defaultJobOptions?: { attempts?: number; backoff?: { type: string; delay: number } } };
    expect(opts.defaultJobOptions?.attempts).toBe(3);
    expect(opts.defaultJobOptions?.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });

  it('configures lifecycle queue with retry options', () => {
    mockQueueInstances.length = 0;

    const mockConnection = {} as unknown as Parameters<typeof createQueues>[0];
    createQueues(mockConnection);

    const lifecycleQueue = mockQueueInstances.find(q => q.name === 'lifecycle');
    expect(lifecycleQueue).toBeDefined();
    const opts = lifecycleQueue!.opts as { defaultJobOptions?: { attempts?: number; backoff?: { type: string; delay: number } } };
    expect(opts.defaultJobOptions?.attempts).toBe(3);
    expect(opts.defaultJobOptions?.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });

  it('configures scheduler queue with cleanup options', () => {
    mockQueueInstances.length = 0;

    const mockConnection = {} as unknown as Parameters<typeof createQueues>[0];
    createQueues(mockConnection);

    const schedulerQueue = mockQueueInstances.find(q => q.name === 'scheduler');
    expect(schedulerQueue).toBeDefined();
    const opts = schedulerQueue!.opts as { defaultJobOptions?: { removeOnComplete?: { count: number }; removeOnFail?: { count: number } } };
    expect(opts.defaultJobOptions?.removeOnComplete).toEqual({ count: 100 });
    expect(opts.defaultJobOptions?.removeOnFail).toEqual({ count: 100 });
  });
});
