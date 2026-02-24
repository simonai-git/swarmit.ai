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
 * Helper to create a budget notification with deduplication.
 */
async function createBudgetNotification(
  userId: string,
  todayStart: Date,
  title: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  // Deduplicate: skip if a notification with same level already exists today
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'BUDGET_EXCEEDED',
      createdAt: { gte: todayStart },
      metadata: { path: ['level'], equals: metadata.level as string },
    },
  });

  if (existing) return;

  await prisma.notification.create({
    data: {
      userId,
      type: 'BUDGET_EXCEEDED' as any,
      title,
      message,
      metadata: metadata as any,
    },
  });

  logger.info({ userId, level: metadata.level }, 'Budget notification created');
}

/**
 * Check if any user has exceeded their daily budget and send notifications.
 */
async function checkBudgetExceeded(): Promise<void> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Get ALL users with automation settings (not just autoSpawn=true)
  const settings = await prisma.automationSetting.findMany({
    select: { userId: true, dailyBudgetCents: true, autoSpawn: true },
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
    const budgetPercent = setting.dailyBudgetCents > 0
      ? Math.round((todaySpendCents / setting.dailyBudgetCents) * 100)
      : 0;

    if (todaySpendCents >= setting.dailyBudgetCents) {
      // 100%: disable autoSpawn + critical notification
      if (setting.autoSpawn) {
        await prisma.automationSetting.update({
          where: { userId: setting.userId },
          data: { autoSpawn: false },
        });
      }

      await createBudgetNotification(
        setting.userId,
        todayStart,
        'Daily budget exceeded',
        `Your daily spend ($${(todaySpendCents / 100).toFixed(2)}) has exceeded your budget ($${(setting.dailyBudgetCents / 100).toFixed(2)}). Auto-spawn has been disabled.`,
        { level: 'critical', budgetPercent },
      );

      logger.info(
        { userId: setting.userId, todaySpendCents, dailyBudgetCents: setting.dailyBudgetCents },
        'Budget exceeded — autoSpawn disabled'
      );
    } else if (budgetPercent >= 80) {
      // 80%: warning notification
      await createBudgetNotification(
        setting.userId,
        todayStart,
        'Budget warning: 80% spent',
        `You have used $${(todaySpendCents / 100).toFixed(2)} of your $${(setting.dailyBudgetCents / 100).toFixed(2)} daily budget (${budgetPercent}%).`,
        { level: 'warning', budgetPercent },
      );
    }
  }
}
