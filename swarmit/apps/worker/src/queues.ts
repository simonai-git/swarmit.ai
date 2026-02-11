import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export interface AgentJobData {
  runId: string;
  taskId: string;
  userId: string;
}

export interface LifecycleJobData {
  type: 'unblock-dependents' | 'check-project-completion' | 'auto-spawn-agent';
  taskId: string;
  userId: string;
  agentId?: string;
}

export interface SchedulerJobData {
  type: 'check-stalled-runs' | 'cleanup-old-logs';
}

export function createQueues(connection: Redis) {
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

  const schedulerQueue = new Queue<SchedulerJobData>('scheduler', {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });

  return { agentQueue, lifecycleQueue, schedulerQueue };
}
