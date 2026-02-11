import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@swarmit/logger';
import { processAgentJob, processLifecycleJob } from './orchestrator.js';
import type { AgentJobData, LifecycleJobData, SchedulerJobData } from './queues.js';

const logger = createLogger('worker');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

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
    await processLifecycleJob(job.data, connection);
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
    // Scheduler handlers will be implemented when needed
  },
  { connection }
);

schedulerWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Scheduler job failed');
});

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
