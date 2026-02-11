import fp from 'fastify-plugin';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('queue-plugin');

interface AgentJobData {
  runId: string;
  taskId: string;
  userId: string;
}

interface LifecycleJobData {
  type: 'unblock-dependents' | 'check-project-completion' | 'auto-spawn-agent';
  taskId: string;
  userId: string;
  agentId?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    agentQueue: Queue<AgentJobData>;
    lifecycleQueue: Queue<LifecycleJobData>;
  }
}

async function queuePlugin(app: FastifyInstance) {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const agentQueue = new Queue<AgentJobData>('agent-execution', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  const lifecycleQueue = new Queue<LifecycleJobData>('lifecycle', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });

  app.decorate('agentQueue', agentQueue);
  app.decorate('lifecycleQueue', lifecycleQueue);

  app.addHook('onClose', async () => {
    await agentQueue.close();
    await lifecycleQueue.close();
    await connection.quit();
    logger.info('Queue connections closed');
  });

  logger.info('Queue plugin registered');
}

export default fp(queuePlugin, {
  name: 'queue',
});
