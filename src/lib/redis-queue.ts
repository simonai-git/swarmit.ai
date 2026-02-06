import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

// Redis client singleton
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable not set');
    }
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    
    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
    
    redis.on('connect', () => {
      console.log('[Redis] Connected');
    });
  }
  return redis;
}

// Job structure with multi-tenant support
export interface QueueJob {
  id: string;
  tenantId: string;           // Organization/user ID for multi-tenancy
  taskId: string;
  agentType: 'developer' | 'qa' | 'reviewer';
  priority: number;           // Higher = more urgent (1-10)
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  workerId?: string;          // ID of worker processing this job
  userEmail?: string;         // User email for Claude API key lookup
  metadata?: Record<string, unknown>;  // Additional data
}

// Queue configuration
export interface QueueConfig {
  maxConcurrentPerTenant: number;    // Max concurrent jobs per tenant
  maxConcurrentGlobal: number;       // Max concurrent jobs globally
  jobTimeoutMs: number;              // How long before a job is considered stuck
  retryDelayMs: number;              // Delay between retries
  cleanupIntervalMs: number;         // How often to clean up old jobs
  jobRetentionMs: number;            // How long to keep completed jobs
}

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrentPerTenant: 3,
  maxConcurrentGlobal: 10,
  jobTimeoutMs: 300000,        // 5 minutes
  retryDelayMs: 10000,         // 10 seconds
  cleanupIntervalMs: 60000,    // 1 minute
  jobRetentionMs: 86400000,    // 24 hours
};

// Redis keys
const KEYS = {
  // Sorted sets for job queues (score = priority * 1000000 + timestamp for ordering)
  pendingQueue: (tenantId: string) => `queue:${tenantId}:pending`,
  globalPending: 'queue:global:pending',
  
  // Sets for tracking
  runningJobs: (tenantId: string) => `queue:${tenantId}:running`,
  globalRunning: 'queue:global:running',
  
  // Hash for job data
  job: (jobId: string) => `job:${jobId}`,
  
  // Tenant metadata
  tenant: (tenantId: string) => `tenant:${tenantId}`,
  
  // Worker heartbeats
  worker: (workerId: string) => `worker:${workerId}`,
  
  // Global config
  config: 'queue:config',
};

export class RedisQueue {
  private config: QueueConfig;
  private workerId: string;
  private isProcessing: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.workerId = `worker-${uuidv4().slice(0, 8)}`;
  }

  // Enqueue a new job
  async enqueue(params: {
    tenantId: string;
    taskId: string;
    agentType: 'developer' | 'qa' | 'reviewer';
    priority?: number;
    maxRetries?: number;
    userEmail?: string;
    metadata?: Record<string, unknown>;
  }): Promise<QueueJob> {
    const r = getRedis();
    const jobId = uuidv4();
    const now = new Date().toISOString();
    const priority = params.priority ?? 5;

    const job: QueueJob = {
      id: jobId,
      tenantId: params.tenantId,
      taskId: params.taskId,
      agentType: params.agentType,
      priority,
      status: 'pending',
      createdAt: now,
      retryCount: 0,
      maxRetries: params.maxRetries ?? 3,
      userEmail: params.userEmail,
      metadata: params.metadata,
    };

    // Check for duplicate (same tenant, task, agent type, pending/running)
    const existingJobs = await this.getJobsByTask(params.tenantId, params.taskId);
    const duplicate = existingJobs.find(
      j => j.agentType === params.agentType && 
           ['pending', 'running'].includes(j.status)
    );
    if (duplicate) {
      console.log(`[Queue] Duplicate job exists for task ${params.taskId}`);
      return duplicate;
    }

    // Store job data
    await r.hset(KEYS.job(jobId), this.jobToHash(job));

    // Add to pending queues with priority score
    // Score: priority * 1e12 + (MAX_TIMESTAMP - created_timestamp) for FIFO within priority
    const score = priority * 1e12 + (Date.now());
    await r.zadd(KEYS.pendingQueue(params.tenantId), score, jobId);
    await r.zadd(KEYS.globalPending, score, jobId);

    console.log(`[Queue] Enqueued job ${jobId} for task ${params.taskId} (tenant: ${params.tenantId})`);
    return job;
  }

  // Claim the next available job for processing
  async claim(): Promise<QueueJob | null> {
    const r = getRedis();

    // Check global concurrency limit
    const globalRunning = await r.scard(KEYS.globalRunning);
    if (globalRunning >= this.config.maxConcurrentGlobal) {
      return null;
    }

    // Get highest priority pending job
    const jobIds = await r.zrevrange(KEYS.globalPending, 0, 0);
    if (jobIds.length === 0) {
      return null;
    }

    const jobId = jobIds[0];
    const job = await this.getJob(jobId);
    if (!job) {
      // Job was deleted, remove from queue
      await r.zrem(KEYS.globalPending, jobId);
      return this.claim(); // Try again
    }

    // Check tenant concurrency limit
    const tenantRunning = await r.scard(KEYS.runningJobs(job.tenantId));
    if (tenantRunning >= this.config.maxConcurrentPerTenant) {
      // Skip this tenant, try next job
      // TODO: Implement fair scheduling across tenants
      return null;
    }

    // Atomically move job from pending to running
    const multi = r.multi();
    multi.zrem(KEYS.pendingQueue(job.tenantId), jobId);
    multi.zrem(KEYS.globalPending, jobId);
    multi.sadd(KEYS.runningJobs(job.tenantId), jobId);
    multi.sadd(KEYS.globalRunning, jobId);
    
    const now = new Date().toISOString();
    multi.hset(KEYS.job(jobId), {
      status: 'running',
      startedAt: now,
      workerId: this.workerId,
    });
    
    await multi.exec();

    // Update local job object
    job.status = 'running';
    job.startedAt = now;
    job.workerId = this.workerId;

    console.log(`[Queue] Claimed job ${jobId} (task: ${job.taskId}, tenant: ${job.tenantId})`);
    return job;
  }

  // Mark job as completed
  async complete(jobId: string, result?: { summary?: string; error?: string }): Promise<void> {
    const r = getRedis();
    const job = await this.getJob(jobId);
    if (!job) return;

    const now = new Date().toISOString();
    const multi = r.multi();

    // Remove from running sets
    multi.srem(KEYS.runningJobs(job.tenantId), jobId);
    multi.srem(KEYS.globalRunning, jobId);

    // Update job status
    multi.hset(KEYS.job(jobId), {
      status: 'completed',
      completedAt: now,
      ...(result?.summary && { 'metadata.summary': result.summary }),
    });

    // Set expiration for cleanup
    multi.expire(KEYS.job(jobId), Math.floor(this.config.jobRetentionMs / 1000));

    await multi.exec();
    console.log(`[Queue] Completed job ${jobId}`);
  }

  // Mark job as failed (with optional retry)
  async fail(jobId: string, error: string): Promise<void> {
    const r = getRedis();
    const job = await this.getJob(jobId);
    if (!job) return;

    const multi = r.multi();

    // Remove from running sets
    multi.srem(KEYS.runningJobs(job.tenantId), jobId);
    multi.srem(KEYS.globalRunning, jobId);

    if (job.retryCount < job.maxRetries) {
      // Retry: put back in pending queue with updated retry count
      const now = new Date().toISOString();
      multi.hset(KEYS.job(jobId), {
        status: 'pending',
        retryCount: job.retryCount + 1,
        error: `Retry ${job.retryCount + 1}/${job.maxRetries}: ${error}`,
        startedAt: '',
        workerId: '',
      });

      // Add back to pending with same priority (delayed)
      const score = job.priority * 1e12 + Date.now() + this.config.retryDelayMs;
      multi.zadd(KEYS.pendingQueue(job.tenantId), score, jobId);
      multi.zadd(KEYS.globalPending, score, jobId);

      console.log(`[Queue] Job ${jobId} failed, scheduling retry ${job.retryCount + 1}/${job.maxRetries}`);
    } else {
      // Max retries exceeded
      multi.hset(KEYS.job(jobId), {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error,
      });
      multi.expire(KEYS.job(jobId), Math.floor(this.config.jobRetentionMs / 1000));

      console.log(`[Queue] Job ${jobId} failed permanently after ${job.retryCount} retries`);
    }

    await multi.exec();
  }

  // Cancel a job
  async cancel(jobId: string): Promise<boolean> {
    const r = getRedis();
    const job = await this.getJob(jobId);
    if (!job) return false;

    const multi = r.multi();

    // Remove from all queues
    multi.zrem(KEYS.pendingQueue(job.tenantId), jobId);
    multi.zrem(KEYS.globalPending, jobId);
    multi.srem(KEYS.runningJobs(job.tenantId), jobId);
    multi.srem(KEYS.globalRunning, jobId);

    // Update status
    multi.hset(KEYS.job(jobId), {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
    multi.expire(KEYS.job(jobId), Math.floor(this.config.jobRetentionMs / 1000));

    await multi.exec();
    console.log(`[Queue] Cancelled job ${jobId}`);
    return true;
  }

  // Get a job by ID
  async getJob(jobId: string): Promise<QueueJob | null> {
    const r = getRedis();
    const data = await r.hgetall(KEYS.job(jobId));
    if (!data || Object.keys(data).length === 0) return null;
    return this.hashToJob(data);
  }

  // Get jobs by task ID
  async getJobsByTask(tenantId: string, taskId: string): Promise<QueueJob[]> {
    const r = getRedis();
    const jobs: QueueJob[] = [];

    // Check pending
    const pendingIds = await r.zrange(KEYS.pendingQueue(tenantId), 0, -1);
    for (const jobId of pendingIds) {
      const job = await this.getJob(jobId);
      if (job && job.taskId === taskId) {
        jobs.push(job);
      }
    }

    // Check running
    const runningIds = await r.smembers(KEYS.runningJobs(tenantId));
    for (const jobId of runningIds) {
      const job = await this.getJob(jobId);
      if (job && job.taskId === taskId && !jobs.find(j => j.id === jobId)) {
        jobs.push(job);
      }
    }

    return jobs;
  }

  // Get queue status
  async getStatus(tenantId?: string): Promise<{
    pending: number;
    running: number;
    jobs: QueueJob[];
  }> {
    const r = getRedis();

    if (tenantId) {
      // Tenant-specific status
      const pendingIds = await r.zrange(KEYS.pendingQueue(tenantId), 0, -1);
      const runningIds = await r.smembers(KEYS.runningJobs(tenantId));

      const jobs: QueueJob[] = [];
      for (const jobId of [...pendingIds, ...runningIds]) {
        const job = await this.getJob(jobId);
        if (job) jobs.push(job);
      }

      return {
        pending: pendingIds.length,
        running: runningIds.length,
        jobs,
      };
    } else {
      // Global status
      const pending = await r.zcard(KEYS.globalPending);
      const running = await r.scard(KEYS.globalRunning);

      // Get recent jobs (limited)
      const pendingIds = await r.zrevrange(KEYS.globalPending, 0, 49);
      const runningIds = await r.smembers(KEYS.globalRunning);

      const jobs: QueueJob[] = [];
      for (const jobId of [...new Set([...pendingIds, ...runningIds])].slice(0, 50)) {
        const job = await this.getJob(jobId);
        if (job) jobs.push(job);
      }

      return { pending, running, jobs };
    }
  }

  // Clean up stuck jobs (jobs that have been running too long)
  async cleanupStuckJobs(): Promise<number> {
    const r = getRedis();
    const stuckThreshold = Date.now() - this.config.jobTimeoutMs;
    let cleaned = 0;

    const runningIds = await r.smembers(KEYS.globalRunning);
    for (const jobId of runningIds) {
      const job = await this.getJob(jobId);
      if (job && job.startedAt) {
        const startedAt = new Date(job.startedAt).getTime();
        if (startedAt < stuckThreshold) {
          await this.fail(jobId, 'Job timed out (stuck)');
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[Queue] Cleaned up ${cleaned} stuck jobs`);
    }
    return cleaned;
  }

  // Start the processing loop
  startProcessing(processor: (job: QueueJob) => Promise<void>): void {
    if (this.processInterval) return;

    console.log(`[Queue] Starting processor (worker: ${this.workerId})`);

    const process = async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;

      try {
        // Clean up stuck jobs periodically
        await this.cleanupStuckJobs();

        // Claim and process jobs
        const job = await this.claim();
        if (job) {
          try {
            await processor(job);
            await this.complete(job.id);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await this.fail(job.id, errorMsg);
          }
        }
      } catch (error) {
        console.error('[Queue] Processing error:', error);
      } finally {
        this.isProcessing = false;
      }
    };

    // Run immediately, then on interval
    process();
    this.processInterval = setInterval(process, 5000);
  }

  // Stop the processing loop
  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
      console.log(`[Queue] Stopped processor (worker: ${this.workerId})`);
    }
  }

  // Helper: Convert job to Redis hash
  private jobToHash(job: QueueJob): Record<string, string> {
    return {
      id: job.id,
      tenantId: job.tenantId,
      taskId: job.taskId,
      agentType: job.agentType,
      priority: String(job.priority),
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt || '',
      completedAt: job.completedAt || '',
      error: job.error || '',
      retryCount: String(job.retryCount),
      maxRetries: String(job.maxRetries),
      workerId: job.workerId || '',
      userEmail: job.userEmail || '',
      metadata: JSON.stringify(job.metadata || {}),
    };
  }

  // Helper: Convert Redis hash to job
  private hashToJob(hash: Record<string, string>): QueueJob {
    return {
      id: hash.id,
      tenantId: hash.tenantId,
      taskId: hash.taskId,
      agentType: hash.agentType as QueueJob['agentType'],
      priority: parseInt(hash.priority) || 5,
      status: hash.status as QueueJob['status'],
      createdAt: hash.createdAt,
      startedAt: hash.startedAt || undefined,
      completedAt: hash.completedAt || undefined,
      error: hash.error || undefined,
      retryCount: parseInt(hash.retryCount) || 0,
      maxRetries: parseInt(hash.maxRetries) || 3,
      workerId: hash.workerId || undefined,
      userEmail: hash.userEmail || undefined,
      metadata: hash.metadata ? JSON.parse(hash.metadata) : undefined,
    };
  }

  // Close Redis connection
  async close(): Promise<void> {
    this.stopProcessing();
    if (redis) {
      await redis.quit();
      redis = null;
    }
  }
}

// Singleton instance
let queueInstance: RedisQueue | null = null;

export function getQueue(config?: Partial<QueueConfig>): RedisQueue {
  if (!queueInstance) {
    queueInstance = new RedisQueue(config);
  }
  return queueInstance;
}

// Export for testing/direct use
export { getRedis, KEYS };
