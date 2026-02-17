import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@swarmit/logger';
import { processAgentJob, processLifecycleJob } from './orchestrator.js';
import { processSchedulerJob } from './scheduler.js';
import type { AgentJobData, LifecycleJobData, SchedulerJobData } from './queues.js';

const logger = createLogger('worker');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

// Queue instance for enqueuing agent jobs from lifecycle events
const agentQueue = new Queue<AgentJobData>('agent-execution', { connection });

// Agent execution worker
const agentWorker = new Worker<AgentJobData>(
  'agent-execution',
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, 'Processing agent job');
    await processAgentJob(job.data, connection);
  },
  {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

agentWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Agent job completed');
});

agentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Agent job failed');
});

// Lifecycle worker (post-execution hooks)
const lifecycleWorker = new Worker<LifecycleJobData>(
  'lifecycle',
  async (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, 'Processing lifecycle event');
    await processLifecycleJob(job.data, connection, agentQueue);
  },
  { connection }
);

lifecycleWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Lifecycle job failed');
});

// Scheduler worker (periodic tasks)
const schedulerWorker = new Worker<SchedulerJobData>(
  'scheduler',
  async (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, 'Processing scheduler job');
    await processSchedulerJob(job.data);
  },
  { connection }
);

schedulerWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Scheduler job failed');
});

// Register repeatable scheduler jobs
const schedulerQueue = new Queue<SchedulerJobData>('scheduler', { connection });

async function registerRepeatableJobs() {
  await schedulerQueue.add('check-stalled-runs', { type: 'check-stalled-runs' }, {
    repeat: { every: 5 * 60 * 1000 }, // every 5 minutes
    jobId: 'check-stalled-runs',
  });

  await schedulerQueue.add('cleanup-old-logs', { type: 'cleanup-old-logs' }, {
    repeat: { every: 24 * 60 * 60 * 1000 }, // every 24 hours
    jobId: 'cleanup-old-logs',
  });

  await schedulerQueue.add('check-budget-exceeded', { type: 'check-budget-exceeded' }, {
    repeat: { every: 10 * 60 * 1000 }, // every 10 minutes
    jobId: 'check-budget-exceeded',
  });

  logger.info('Repeatable scheduler jobs registered');
}

registerRepeatableJobs().catch(err => logger.error({ err }, 'Failed to register scheduler jobs'));

logger.info('All workers started');

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down workers...');
  await agentWorker.close();
  await lifecycleWorker.close();
  await schedulerWorker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
