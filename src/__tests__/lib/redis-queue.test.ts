import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up environment before imports
process.env.REDIS_URL = 'redis://test:6379';

// Use vi.hoisted so mocks are available in vi.mock factories (which get hoisted)
const { mockRedis, mockMulti } = vi.hoisted(() => {
  const mockMulti = {
    zrem: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const mockRedis = {
    hset: vi.fn(),
    hgetall: vi.fn(),
    zadd: vi.fn(),
    zrem: vi.fn(),
    zrange: vi.fn(),
    zrevrange: vi.fn(),
    zcard: vi.fn(),
    scard: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
    expire: vi.fn(),
    multi: vi.fn().mockReturnValue(mockMulti),
    on: vi.fn(),
    quit: vi.fn(),
  };

  return { mockRedis, mockMulti };
});

vi.mock('ioredis', () => {
  const RedisClass = vi.fn(function(this: any) {
    Object.assign(this, mockRedis);
  });
  return { default: RedisClass, Redis: RedisClass };
});

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

import { RedisQueue, getQueue, QueueJob, getRedis, KEYS } from '@/lib/redis-queue';

describe('RedisQueue', () => {
  let queue: RedisQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new RedisQueue({
      maxConcurrentPerTenant: 2,
      maxConcurrentGlobal: 5,
      jobTimeoutMs: 60000,
      retryDelayMs: 5000,
      cleanupIntervalMs: 30000,
      jobRetentionMs: 3600000,
    });
  });

  afterEach(() => {
    queue.stopProcessing();
  });

  describe('enqueue', () => {
    it('should create a job with correct fields including userEmail', async () => {
      mockRedis.zrange.mockResolvedValueOnce([]);
      mockRedis.smembers.mockResolvedValueOnce([]);
      mockRedis.hset.mockResolvedValueOnce(1);
      mockRedis.zadd.mockResolvedValueOnce(1);

      const params = {
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer' as const,
        priority: 8,
        maxRetries: 2,
        userEmail: 'user@example.com',
        metadata: { customField: 'value' },
      };

      const job = await queue.enqueue(params);

      expect(job.id).toBe('test-uuid-123');
      expect(job.tenantId).toBe('tenant-1');
      expect(job.taskId).toBe('task-1');
      expect(job.agentType).toBe('developer');
      expect(job.priority).toBe(8);
      expect(job.status).toBe('pending');
      expect(job.retryCount).toBe(0);
      expect(job.maxRetries).toBe(2);
      expect(job.userEmail).toBe('user@example.com');
      expect(job.metadata).toEqual({ customField: 'value' });
      expect(job.createdAt).toBeDefined();
    });

    it('should store job hash in Redis', async () => {
      mockRedis.zrange.mockResolvedValueOnce([]);
      mockRedis.smembers.mockResolvedValueOnce([]);
      mockRedis.hset.mockResolvedValueOnce(1);
      mockRedis.zadd.mockResolvedValueOnce(1);

      const params = {
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer' as const,
        userEmail: 'user@example.com',
      };

      await queue.enqueue(params);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        KEYS.job('test-uuid-123'),
        expect.objectContaining({
          id: 'test-uuid-123',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'developer',
          priority: '5',
          status: 'pending',
          retryCount: '0',
          maxRetries: '3',
          userEmail: 'user@example.com',
        })
      );
    });

    it('should add to both tenant and global pending queues with priority score', async () => {
      mockRedis.zrange.mockResolvedValueOnce([]);
      mockRedis.smembers.mockResolvedValueOnce([]);
      mockRedis.hset.mockResolvedValueOnce(1);
      mockRedis.zadd.mockResolvedValueOnce(1);

      const params = {
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer' as const,
        priority: 7,
      };

      await queue.enqueue(params);

      // Should add to tenant pending queue
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        KEYS.pendingQueue('tenant-1'),
        expect.any(Number),
        'test-uuid-123'
      );

      // Should add to global pending queue
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        KEYS.globalPending,
        expect.any(Number),
        'test-uuid-123'
      );

      // Verify score is priority-based (priority * 1e12 + timestamp)
      const call = mockRedis.zadd.mock.calls[0];
      const score = call[1] as number;
      expect(score).toBeGreaterThan(7 * 1e12);
    });

    it('should return existing job if duplicate found (same tenant/task/agent/pending)', async () => {
      const existingJob: QueueJob = {
        id: 'existing-job',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: 5,
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: 0,
        maxRetries: 3,
      };

      // Mock getJobsByTask to return existing job
      mockRedis.zrange.mockResolvedValueOnce(['existing-job']);
      mockRedis.smembers.mockResolvedValueOnce([]);
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'existing-job',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt: existingJob.createdAt,
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: '',
        metadata: '{}',
      });

      const params = {
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer' as const,
      };

      const job = await queue.enqueue(params);

      expect(job.id).toBe('existing-job');
      expect(mockRedis.hset).not.toHaveBeenCalled();
    });

    it('should create new job if existing job is completed', async () => {
      // Mock getJobsByTask to return completed job
      mockRedis.zrange.mockResolvedValueOnce(['existing-job']);
      mockRedis.smembers.mockResolvedValueOnce([]);
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'existing-job',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'completed',
        createdAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: new Date().toISOString(),
        error: '',
        workerId: '',
        userEmail: '',
        metadata: '{}',
      });
      mockRedis.hset.mockResolvedValueOnce(1);
      mockRedis.zadd.mockResolvedValueOnce(1);

      const params = {
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer' as const,
      };

      const job = await queue.enqueue(params);

      expect(job.id).toBe('test-uuid-123');
      expect(mockRedis.hset).toHaveBeenCalled();
    });
  });

  describe('claim', () => {
    it('should return null when global concurrency limit reached', async () => {
      mockRedis.scard.mockResolvedValueOnce(5); // Global running = 5, limit = 5

      const job = await queue.claim();

      expect(job).toBeNull();
      expect(mockRedis.zrevrange).not.toHaveBeenCalled();
    });

    it('should return null when no pending jobs', async () => {
      mockRedis.scard.mockResolvedValueOnce(0); // Global running = 0
      mockRedis.zrevrange.mockResolvedValueOnce([]); // No pending jobs

      const job = await queue.claim();

      expect(job).toBeNull();
    });

    it('should return null when tenant concurrency limit reached', async () => {
      mockRedis.scard
        .mockResolvedValueOnce(0) // Global running = 0
        .mockResolvedValueOnce(2); // Tenant running = 2, limit = 2
      mockRedis.zrevrange.mockResolvedValueOnce(['job-1']);
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: '',
        metadata: '{}',
      });

      const job = await queue.claim();

      expect(job).toBeNull();
    });

    it('should claim job: removes from pending, adds to running, sets status/startedAt/workerId', async () => {
      const createdAt = new Date().toISOString();
      mockRedis.scard
        .mockResolvedValueOnce(0) // Global running = 0
        .mockResolvedValueOnce(0); // Tenant running = 0
      mockRedis.zrevrange.mockResolvedValueOnce(['job-1']);
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt,
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: 'user@example.com',
        metadata: '{}',
      });

      const job = await queue.claim();

      expect(job).toBeDefined();
      expect(job?.id).toBe('job-1');
      expect(job?.status).toBe('running');
      expect(job?.startedAt).toBeDefined();
      expect(job?.workerId).toMatch(/^worker-/);

      // Verify multi transaction
      expect(mockMulti.zrem).toHaveBeenCalledWith(KEYS.pendingQueue('tenant-1'), 'job-1');
      expect(mockMulti.zrem).toHaveBeenCalledWith(KEYS.globalPending, 'job-1');
      expect(mockMulti.sadd).toHaveBeenCalledWith(KEYS.runningJobs('tenant-1'), 'job-1');
      expect(mockMulti.sadd).toHaveBeenCalledWith(KEYS.globalRunning, 'job-1');
      expect(mockMulti.hset).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        expect.objectContaining({
          status: 'running',
          startedAt: expect.any(String),
          workerId: expect.stringMatching(/^worker-/),
        })
      );
      expect(mockMulti.exec).toHaveBeenCalled();
    });

    it('should recursively try again if job was deleted', async () => {
      mockRedis.scard
        .mockResolvedValueOnce(0) // First attempt: global running = 0
        .mockResolvedValueOnce(0); // Second attempt: global running = 0
      mockRedis.zrevrange
        .mockResolvedValueOnce(['deleted-job']) // First attempt
        .mockResolvedValueOnce([]); // Second attempt: no more jobs
      mockRedis.hgetall.mockResolvedValueOnce({}); // Job not found

      const job = await queue.claim();

      expect(job).toBeNull();
      expect(mockRedis.zrem).toHaveBeenCalledWith(KEYS.globalPending, 'deleted-job');
      expect(mockRedis.zrevrange).toHaveBeenCalledTimes(2);
    });
  });

  describe('complete', () => {
    it('should remove from running sets', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'running',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-1',
        userEmail: '',
        metadata: '{}',
      });

      await queue.complete('job-1');

      expect(mockMulti.srem).toHaveBeenCalledWith(KEYS.runningJobs('tenant-1'), 'job-1');
      expect(mockMulti.srem).toHaveBeenCalledWith(KEYS.globalRunning, 'job-1');
    });

    it('should update job status to completed', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'running',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-1',
        userEmail: '',
        metadata: '{}',
      });

      await queue.complete('job-1');

      expect(mockMulti.hset).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        expect.objectContaining({
          status: 'completed',
          completedAt: expect.any(String),
        })
      );
    });

    it('should set expiration for cleanup', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'running',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-1',
        userEmail: '',
        metadata: '{}',
      });

      await queue.complete('job-1');

      // Expiration should be jobRetentionMs / 1000 seconds
      expect(mockMulti.expire).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        3600 // 3600000ms / 1000
      );
    });

    it('should do nothing if job not found', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      await queue.complete('non-existent-job');

      expect(mockMulti.srem).not.toHaveBeenCalled();
      expect(mockMulti.hset).not.toHaveBeenCalled();
    });
  });

  describe('fail', () => {
    it('should retry if retryCount < maxRetries (puts back in pending with delay)', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'running',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        retryCount: '1',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-1',
        userEmail: '',
        metadata: '{}',
      });

      await queue.fail('job-1', 'Temporary error');

      // Remove from running
      expect(mockMulti.srem).toHaveBeenCalledWith(KEYS.runningJobs('tenant-1'), 'job-1');
      expect(mockMulti.srem).toHaveBeenCalledWith(KEYS.globalRunning, 'job-1');

      // Update job with retry
      expect(mockMulti.hset).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        expect.objectContaining({
          status: 'pending',
          retryCount: 2,
          error: 'Retry 2/3: Temporary error',
          startedAt: '',
          workerId: '',
        })
      );

      // Add back to pending queues with delay
      expect(mockMulti.zadd).toHaveBeenCalledWith(
        KEYS.pendingQueue('tenant-1'),
        expect.any(Number),
        'job-1'
      );
      expect(mockMulti.zadd).toHaveBeenCalledWith(
        KEYS.globalPending,
        expect.any(Number),
        'job-1'
      );

      // Should not expire job (it's being retried)
      expect(mockMulti.expire).not.toHaveBeenCalled();
    });

    it('should mark as permanently failed if max retries exceeded', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'running',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        retryCount: '3',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-1',
        userEmail: '',
        metadata: '{}',
      });

      await queue.fail('job-1', 'Fatal error');

      // Remove from running
      expect(mockMulti.srem).toHaveBeenCalledWith(KEYS.runningJobs('tenant-1'), 'job-1');
      expect(mockMulti.srem).toHaveBeenCalledWith(KEYS.globalRunning, 'job-1');

      // Mark as failed
      expect(mockMulti.hset).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        expect.objectContaining({
          status: 'failed',
          completedAt: expect.any(String),
          error: 'Fatal error',
        })
      );

      // Set expiration
      expect(mockMulti.expire).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        3600
      );

      // Should not add back to pending
      expect(mockMulti.zadd).not.toHaveBeenCalled();
    });

    it('should do nothing if job not found', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      await queue.fail('non-existent-job', 'Error');

      expect(mockMulti.srem).not.toHaveBeenCalled();
      expect(mockMulti.hset).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should remove from all queues', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: '',
        metadata: '{}',
      });

      const result = await queue.cancel('job-1');

      expect(result).toBe(true);
      expect(mockMulti.zrem).toHaveBeenCalledWith(KEYS.pendingQueue('tenant-1'), 'job-1');
      expect(mockMulti.zrem).toHaveBeenCalledWith(KEYS.globalPending, 'job-1');
      expect(mockMulti.srem).toHaveBeenCalledWith(KEYS.runningJobs('tenant-1'), 'job-1');
      expect(mockMulti.srem).toHaveBeenCalledWith(KEYS.globalRunning, 'job-1');
    });

    it('should update status to cancelled', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: '',
        metadata: '{}',
      });

      await queue.cancel('job-1');

      expect(mockMulti.hset).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        expect.objectContaining({
          status: 'cancelled',
          completedAt: expect.any(String),
        })
      );
      expect(mockMulti.expire).toHaveBeenCalledWith(KEYS.job('job-1'), 3600);
    });

    it('should return false if job not found', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      const result = await queue.cancel('non-existent-job');

      expect(result).toBe(false);
      expect(mockMulti.zrem).not.toHaveBeenCalled();
    });
  });

  describe('getJob', () => {
    it('should return job when found', async () => {
      const createdAt = new Date().toISOString();
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '7',
        status: 'pending',
        createdAt,
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: 'user@example.com',
        metadata: JSON.stringify({ key: 'value' }),
      });

      const job = await queue.getJob('job-1');

      expect(job).toBeDefined();
      expect(job?.id).toBe('job-1');
      expect(job?.tenantId).toBe('tenant-1');
      expect(job?.taskId).toBe('task-1');
      expect(job?.agentType).toBe('developer');
      expect(job?.priority).toBe(7);
      expect(job?.status).toBe('pending');
      expect(job?.userEmail).toBe('user@example.com');
      expect(job?.metadata).toEqual({ key: 'value' });
    });

    it('should return null when job not found', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      const job = await queue.getJob('non-existent-job');

      expect(job).toBeNull();
    });

    it('should handle empty userEmail correctly', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: '',
        metadata: '{}',
      });

      const job = await queue.getJob('job-1');

      expect(job?.userEmail).toBeUndefined();
    });
  });

  describe('getJobsByTask', () => {
    it('should check both pending and running queues', async () => {
      const createdAt = new Date().toISOString();
      mockRedis.zrange.mockResolvedValueOnce(['job-1', 'job-2']);
      mockRedis.smembers.mockResolvedValueOnce(['job-3']);
      mockRedis.hgetall
        .mockResolvedValueOnce({
          id: 'job-1',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'developer',
          priority: '5',
          status: 'pending',
          createdAt,
          retryCount: '0',
          maxRetries: '3',
          startedAt: '',
          completedAt: '',
          error: '',
          workerId: '',
          userEmail: '',
          metadata: '{}',
        })
        .mockResolvedValueOnce({
          id: 'job-2',
          tenantId: 'tenant-1',
          taskId: 'task-2',
          agentType: 'qa',
          priority: '5',
          status: 'pending',
          createdAt,
          retryCount: '0',
          maxRetries: '3',
          startedAt: '',
          completedAt: '',
          error: '',
          workerId: '',
          userEmail: '',
          metadata: '{}',
        })
        .mockResolvedValueOnce({
          id: 'job-3',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'qa',
          priority: '5',
          status: 'running',
          createdAt,
          startedAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          completedAt: '',
          error: '',
          workerId: 'worker-1',
          userEmail: '',
          metadata: '{}',
        });

      const jobs = await queue.getJobsByTask('tenant-1', 'task-1');

      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe('job-1');
      expect(jobs[1].id).toBe('job-3');
      expect(mockRedis.zrange).toHaveBeenCalledWith(KEYS.pendingQueue('tenant-1'), 0, -1);
      expect(mockRedis.smembers).toHaveBeenCalledWith(KEYS.runningJobs('tenant-1'));
    });

    it('should return empty array when no jobs found', async () => {
      mockRedis.zrange.mockResolvedValueOnce([]);
      mockRedis.smembers.mockResolvedValueOnce([]);

      const jobs = await queue.getJobsByTask('tenant-1', 'task-1');

      expect(jobs).toEqual([]);
    });

    it('should not include duplicate jobs', async () => {
      const createdAt = new Date().toISOString();
      mockRedis.zrange.mockResolvedValueOnce(['job-1']);
      mockRedis.smembers.mockResolvedValueOnce(['job-1']);
      mockRedis.hgetall.mockResolvedValue({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'running',
        createdAt,
        startedAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-1',
        userEmail: '',
        metadata: '{}',
      });

      const jobs = await queue.getJobsByTask('tenant-1', 'task-1');

      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('job-1');
    });
  });

  describe('getStatus', () => {
    it('should return global status when no tenantId provided', async () => {
      mockRedis.zcard.mockResolvedValueOnce(5); // Global pending
      mockRedis.scard.mockResolvedValueOnce(2); // Global running
      mockRedis.zrevrange.mockResolvedValueOnce(['job-1', 'job-2']);
      mockRedis.smembers.mockResolvedValueOnce(['job-3']);
      mockRedis.hgetall
        .mockResolvedValueOnce({
          id: 'job-1',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'developer',
          priority: '5',
          status: 'pending',
          createdAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          startedAt: '',
          completedAt: '',
          error: '',
          workerId: '',
          userEmail: '',
          metadata: '{}',
        })
        .mockResolvedValueOnce({
          id: 'job-2',
          tenantId: 'tenant-1',
          taskId: 'task-2',
          agentType: 'qa',
          priority: '5',
          status: 'pending',
          createdAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          startedAt: '',
          completedAt: '',
          error: '',
          workerId: '',
          userEmail: '',
          metadata: '{}',
        })
        .mockResolvedValueOnce({
          id: 'job-3',
          tenantId: 'tenant-2',
          taskId: 'task-3',
          agentType: 'reviewer',
          priority: '5',
          status: 'running',
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          completedAt: '',
          error: '',
          workerId: 'worker-1',
          userEmail: '',
          metadata: '{}',
        });

      const status = await queue.getStatus();

      expect(status.pending).toBe(5);
      expect(status.running).toBe(2);
      expect(status.jobs).toHaveLength(3);
    });

    it('should return tenant-specific status when tenantId provided', async () => {
      mockRedis.zrange.mockResolvedValueOnce(['job-1']);
      mockRedis.smembers.mockResolvedValueOnce(['job-2']);
      mockRedis.hgetall
        .mockResolvedValueOnce({
          id: 'job-1',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'developer',
          priority: '5',
          status: 'pending',
          createdAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          startedAt: '',
          completedAt: '',
          error: '',
          workerId: '',
          userEmail: '',
          metadata: '{}',
        })
        .mockResolvedValueOnce({
          id: 'job-2',
          tenantId: 'tenant-1',
          taskId: 'task-2',
          agentType: 'qa',
          priority: '5',
          status: 'running',
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          completedAt: '',
          error: '',
          workerId: 'worker-1',
          userEmail: '',
          metadata: '{}',
        });

      const status = await queue.getStatus('tenant-1');

      expect(status.pending).toBe(1);
      expect(status.running).toBe(1);
      expect(status.jobs).toHaveLength(2);
    });
  });

  describe('cleanupStuckJobs', () => {
    it('should find and fail jobs running beyond timeout', async () => {
      const oldStartTime = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
      const job1Hash = {
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'running',
        createdAt: new Date(Date.now() - 150000).toISOString(),
        startedAt: oldStartTime,
        retryCount: '0',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-1',
        userEmail: '',
        metadata: '{}',
      };
      const job2Hash = {
        id: 'job-2',
        tenantId: 'tenant-1',
        taskId: 'task-2',
        agentType: 'qa',
        priority: '5',
        status: 'running',
        createdAt: new Date(Date.now() - 10000).toISOString(),
        startedAt: new Date(Date.now() - 10000).toISOString(), // Recent
        retryCount: '0',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-2',
        userEmail: '',
        metadata: '{}',
      };

      mockRedis.smembers.mockResolvedValueOnce(['job-1', 'job-2']);
      mockRedis.hgetall
        // 1: getJob('job-1') in cleanupStuckJobs loop
        .mockResolvedValueOnce(job1Hash)
        // 2: getJob('job-1') inside fail() — fail calls getJob again
        .mockResolvedValueOnce(job1Hash)
        // 3: getJob('job-2') in cleanupStuckJobs loop
        .mockResolvedValueOnce(job2Hash);

      const cleaned = await queue.cleanupStuckJobs();

      expect(cleaned).toBe(1);
      expect(mockRedis.smembers).toHaveBeenCalledWith(KEYS.globalRunning);
    });

    it('should return 0 when no stuck jobs', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['job-1']);
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'running',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        completedAt: '',
        error: '',
        workerId: 'worker-1',
        userEmail: '',
        metadata: '{}',
      });

      const cleaned = await queue.cleanupStuckJobs();

      expect(cleaned).toBe(0);
    });
  });

  describe('startProcessing and stopProcessing', () => {
    it('should set up interval for processing', () => {
      vi.useFakeTimers();
      const processor = vi.fn().mockResolvedValue(undefined);

      queue.startProcessing(processor);

      // Should have interval set
      expect(queue['processInterval']).toBeDefined();

      vi.useRealTimers();
    });

    it('should clear interval when stopped', () => {
      vi.useFakeTimers();
      const processor = vi.fn().mockResolvedValue(undefined);

      queue.startProcessing(processor);
      const interval = queue['processInterval'];
      queue.stopProcessing();

      expect(queue['processInterval']).toBeNull();

      vi.useRealTimers();
    });

    it('should not start multiple intervals', () => {
      vi.useFakeTimers();
      const processor = vi.fn().mockResolvedValue(undefined);

      queue.startProcessing(processor);
      const interval1 = queue['processInterval'];
      queue.startProcessing(processor);
      const interval2 = queue['processInterval'];

      expect(interval1).toBe(interval2);

      queue.stopProcessing();
      vi.useRealTimers();
    });

    it('should call processor with claimed job', async () => {
      vi.useFakeTimers();
      const processor = vi.fn().mockResolvedValue(undefined);

      // Mock cleanupStuckJobs and claim
      mockRedis.smembers.mockResolvedValue([]);
      mockRedis.scard
        .mockResolvedValueOnce(0) // Global running
        .mockResolvedValueOnce(0); // Tenant running
      mockRedis.zrevrange.mockResolvedValueOnce(['job-1']);
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: '',
        metadata: '{}',
      });

      queue.startProcessing(processor);

      // Wait for initial processing
      await vi.runOnlyPendingTimersAsync();

      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-1',
          taskId: 'task-1',
        })
      );

      queue.stopProcessing();
      vi.useRealTimers();
    });

    it('should complete job after successful processing', async () => {
      vi.useFakeTimers();
      const processor = vi.fn().mockResolvedValue(undefined);

      mockRedis.smembers.mockResolvedValue([]);
      mockRedis.scard
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRedis.zrevrange.mockResolvedValueOnce(['job-1']);
      mockRedis.hgetall
        .mockResolvedValueOnce({
          id: 'job-1',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'developer',
          priority: '5',
          status: 'pending',
          createdAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          startedAt: '',
          completedAt: '',
          error: '',
          workerId: '',
          userEmail: '',
          metadata: '{}',
        })
        .mockResolvedValueOnce({
          id: 'job-1',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'developer',
          priority: '5',
          status: 'running',
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          completedAt: '',
          error: '',
          workerId: 'worker-1',
          userEmail: '',
          metadata: '{}',
        });

      queue.startProcessing(processor);

      await vi.runOnlyPendingTimersAsync();

      expect(mockMulti.hset).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        expect.objectContaining({
          status: 'completed',
        })
      );

      queue.stopProcessing();
      vi.useRealTimers();
    });

    it('should fail job if processor throws error', async () => {
      vi.useFakeTimers();
      const processor = vi.fn().mockRejectedValue(new Error('Processing failed'));

      mockRedis.smembers.mockResolvedValue([]);
      mockRedis.scard
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRedis.zrevrange.mockResolvedValueOnce(['job-1']);
      mockRedis.hgetall
        .mockResolvedValueOnce({
          id: 'job-1',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'developer',
          priority: '5',
          status: 'pending',
          createdAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          startedAt: '',
          completedAt: '',
          error: '',
          workerId: '',
          userEmail: '',
          metadata: '{}',
        })
        .mockResolvedValueOnce({
          id: 'job-1',
          tenantId: 'tenant-1',
          taskId: 'task-1',
          agentType: 'developer',
          priority: '5',
          status: 'running',
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          retryCount: '0',
          maxRetries: '3',
          completedAt: '',
          error: '',
          workerId: 'worker-1',
          userEmail: '',
          metadata: '{}',
        });

      queue.startProcessing(processor);

      await vi.runOnlyPendingTimersAsync();

      expect(mockMulti.hset).toHaveBeenCalledWith(
        KEYS.job('job-1'),
        expect.objectContaining({
          status: 'pending',
          retryCount: 1,
          error: expect.stringContaining('Processing failed'),
        })
      );

      queue.stopProcessing();
      vi.useRealTimers();
    });
  });

  describe('jobToHash and hashToJob', () => {
    it('should include userEmail in serialization', async () => {
      mockRedis.zrange.mockResolvedValueOnce([]);
      mockRedis.smembers.mockResolvedValueOnce([]);
      mockRedis.hset.mockResolvedValueOnce(1);
      mockRedis.zadd.mockResolvedValueOnce(1);

      const params = {
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer' as const,
        userEmail: 'user@example.com',
        metadata: { key: 'value' },
      };

      await queue.enqueue(params);

      // Verify userEmail was included in hash
      expect(mockRedis.hset).toHaveBeenCalledWith(
        KEYS.job('test-uuid-123'),
        expect.objectContaining({
          userEmail: 'user@example.com',
        })
      );
    });

    it('should deserialize userEmail correctly via getJob', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: 'test@example.com',
        metadata: JSON.stringify({ foo: 'bar' }),
      });

      const job = await queue.getJob('job-1');

      expect(job?.userEmail).toBe('test@example.com');
      expect(job?.metadata).toEqual({ foo: 'bar' });
    });

    it('should handle empty strings as undefined', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
        agentType: 'developer',
        priority: '5',
        status: 'pending',
        createdAt: new Date().toISOString(),
        retryCount: '0',
        maxRetries: '3',
        startedAt: '',
        completedAt: '',
        error: '',
        workerId: '',
        userEmail: '',
        metadata: '{}',
      });

      const job = await queue.getJob('job-1');

      expect(job?.startedAt).toBeUndefined();
      expect(job?.completedAt).toBeUndefined();
      expect(job?.error).toBeUndefined();
      expect(job?.workerId).toBeUndefined();
      expect(job?.userEmail).toBeUndefined();
    });
  });

  describe('getQueue singleton', () => {
    it('should return singleton instance', () => {
      const queue1 = getQueue();
      const queue2 = getQueue();

      expect(queue1).toBe(queue2);
    });

    it('should accept config parameter', () => {
      // getQueue is a singleton — once created, config is fixed
      const customQueue = getQueue({ maxConcurrentGlobal: 20 });

      expect(customQueue).toBeDefined();
      // Singleton was already created with default config, so it keeps the initial config
      expect(customQueue['config'].maxConcurrentGlobal).toBe(10);
    });
  });

  describe('close', () => {
    it('should stop processing and quit redis', async () => {
      mockRedis.quit.mockResolvedValueOnce('OK');

      await queue.close();

      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('getRedis', () => {
    it('should return redis client', () => {
      const redis = getRedis();

      expect(redis).toBeDefined();
      // The redis client is created via `new Redis(url, config)` using our mock constructor
      // which assigns mockRedis properties — check that the methods exist
      expect(typeof redis.hset).toBe('function');
      expect(typeof redis.hgetall).toBe('function');
      expect(typeof redis.zadd).toBe('function');
    });
  });

  describe('KEYS', () => {
    it('should generate correct key patterns', () => {
      expect(KEYS.pendingQueue('tenant-1')).toBe('queue:tenant-1:pending');
      expect(KEYS.globalPending).toBe('queue:global:pending');
      expect(KEYS.runningJobs('tenant-1')).toBe('queue:tenant-1:running');
      expect(KEYS.globalRunning).toBe('queue:global:running');
      expect(KEYS.job('job-123')).toBe('job:job-123');
      expect(KEYS.tenant('tenant-1')).toBe('tenant:tenant-1');
      expect(KEYS.worker('worker-1')).toBe('worker:worker-1');
      expect(KEYS.config).toBe('queue:config');
    });
  });
});
