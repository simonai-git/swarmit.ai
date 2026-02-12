import { prisma } from '@swarmit/db';
import { createLogger } from '@swarmit/logger';
import type { SchedulerJobData } from './queues.js';

const logger = createLogger('scheduler');

const STALLED_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const LOG_RETENTION_DAYS = 30;

/**
 * Process scheduler jobs (periodic maintenance tasks).
 */
export async function processSchedulerJob(data: SchedulerJobData): Promise<void> {
  switch (data.type) {
    case 'check-stalled-runs':
      await checkStalledRuns();
      break;
    case 'cleanup-old-logs':
      await cleanupOldLogs();
      break;
    case 'check-budget-exceeded':
      await checkBudgetExceeded();
      break;
    default:
      logger.warn({ type: (data as SchedulerJobData).type }, 'Unknown scheduler job type');
  }
}

/**
 * Mark runs that have been RUNNING for too long as FAILED.
 */
async function checkStalledRuns(): Promise<void> {
  const threshold = new Date(Date.now() - STALLED_THRESHOLD_MS);

  const stalledRuns = await prisma.taskRun.findMany({
    where: {
      status: 'RUNNING',
      startedAt: { lt: threshold },
    },
    select: { id: true, taskId: true },
  });

  if (stalledRuns.length === 0) {
    logger.info('No stalled runs found');
    return;
  }

  for (const run of stalledRuns) {
    await prisma.taskRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', endedAt: new Date() },
    });

    await prisma.task.update({
      where: { id: run.taskId },
      data: { currentRunId: null },
    });

    logger.info({ runId: run.id, taskId: run.taskId }, 'Marked stalled run as FAILED');
  }

  logger.info({ count: stalledRuns.length }, 'Stalled runs cleanup complete');
}

/**
 * Delete old task logs past the retention period.
 */
async function cleanupOldLogs(): Promise<void> {
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.taskLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  logger.info({ deleted: result.count, cutoff: cutoff.toISOString() }, 'Old logs cleanup complete');
}

/**
 * Check if any user has exceeded their daily budget and disable autoSpawn.
 */
async function checkBudgetExceeded(): Promise<void> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Get all users with automation settings
  const settings = await prisma.automationSetting.findMany({
    where: { autoSpawn: true },
    select: { userId: true, dailyBudgetCents: true },
  });

  for (const setting of settings) {
    const { _sum } = await prisma.taskRun.aggregate({
      where: {
        task: { userId: setting.userId },
        createdAt: { gte: todayStart },
        status: { in: ['SUCCESS', 'FAILED'] },
      },
      _sum: { cost: true },
    });

    const todaySpendCents = Math.round((_sum.cost || 0) * 100);

    if (todaySpendCents >= setting.dailyBudgetCents) {
      await prisma.automationSetting.update({
        where: { userId: setting.userId },
        data: { autoSpawn: false },
      });

      logger.info(
        { userId: setting.userId, todaySpendCents, dailyBudgetCents: setting.dailyBudgetCents },
        'Budget exceeded — autoSpawn disabled'
      );
    }
  }
}
