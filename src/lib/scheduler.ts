import cron, { ScheduledTask } from 'node-cron';
import { Task, getUsersWithApiKeys, getTasksByUserEmail, getAgentRunsByTask, updateTask, getOrphanedTasks, assignOrphanedTasks, cleanupOldTaskLogs } from './db';
import { agentQueue } from './agent-queue';
import { taskLogBuffer } from './task-log-buffer';

// Track if scheduler is already running (singleton)
let isSchedulerRunning = false;
let scheduledTask: ScheduledTask | null = null;

// Track tasks we've already enqueued this cycle, per user
const recentlyEnqueued = new Map<string, Set<string>>();

// Stuck-task detection: skip tasks with too many completed runs in a window
const MAX_RECENT_RUNS = 3;
const STUCK_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MAX_LIFETIME_RUNS = 6; // Total runs before permanent block

/**
 * Determine agent type based on task status
 */
function getAgentTypeForStatus(status: string): 'developer' | 'qa' | 'reviewer' {
  switch (status) {
    case 'testing':
      return 'qa';
    case 'in_review':
      return 'reviewer';
    default:
      return 'developer';
  }
}

/**
 * Priority mapping
 */
function getPriorityValue(priority: string): number {
  switch (priority) {
    case 'high':
      return 10;
    case 'medium':
      return 5;
    case 'low':
      return 1;
    default:
      return 5;
  }
}

/**
 * Process tasks for a single user
 */
async function processUserTasks(userEmail: string): Promise<void> {
  // Get tasks owned by this user
  const allTasks = await getTasksByUserEmail(userEmail);

  // Get current queue status scoped to this user's tenant
  let queuedTaskIds = new Set<string>();
  let activeTaskIds = new Set<string>();
  try {
    const queueStatus = await agentQueue.getStatus(userEmail);
    queuedTaskIds = new Set(
      queueStatus.jobs
        .filter(j => ['pending', 'running'].includes(j.status))
        .map(j => j.taskId)
    );
    activeTaskIds = new Set(queueStatus.activeRuns.map(r => r.taskId));
  } catch (error) {
    console.warn(`[Scheduler] Failed to get queue status for ${userEmail}, proceeding without queue dedup:`, error instanceof Error ? error.message : String(error));
  }

  // Get or create per-user recently enqueued set
  if (!recentlyEnqueued.has(userEmail)) {
    recentlyEnqueued.set(userEmail, new Set<string>());
  }
  const userRecentlyEnqueued = recentlyEnqueued.get(userEmail)!;

  // Filter to tasks that need agent work
  const tasksNeedingWork: Task[] = [];
  for (const task of allTasks) {
    if (task.status === 'done') continue;
    if (!task.assignee) continue;
    if (queuedTaskIds.has(task.id)) {
      console.log(`[Scheduler] Task ${task.id.slice(0, 8)} already queued for ${userEmail}, skipping`);
      continue;
    }
    if (activeTaskIds.has(task.id)) {
      console.log(`[Scheduler] Task ${task.id.slice(0, 8)} has active agent for ${userEmail}, skipping`);
      continue;
    }
    if (userRecentlyEnqueued.has(task.id)) continue;
    if (!['todo', 'in_progress', 'testing', 'in_review'].includes(task.status)) continue;
    if (task.is_blocked) continue;

    // Stuck detection: check both windowed and lifetime metrics
    const recentRuns = await getAgentRunsByTask(task.id);
    const finishedRuns = recentRuns.filter(r =>
      ['completed', 'failed'].includes(r.status)
    );

    // Tier 1: Rapid loop — 3+ runs in 30 minutes
    const recentFinishedRuns = finishedRuns.filter(r =>
      new Date(r.created_at).getTime() > Date.now() - STUCK_WINDOW_MS
    );
    if (recentFinishedRuns.length >= MAX_RECENT_RUNS) {
      console.warn(`[Scheduler] Task ${task.id.slice(0, 8)} stuck (rapid): ${recentFinishedRuns.length} runs in 30min, marking blocked`);
      await updateTask(task.id, {
        is_blocked: true,
        blocked_reason: `Agent ran ${recentFinishedRuns.length} times in 30 minutes without advancing status. Manual intervention needed.`,
      });
      continue;
    }

    // Tier 2: Slow burn — 6+ total lifetime runs without status change
    if (finishedRuns.length >= MAX_LIFETIME_RUNS) {
      console.warn(`[Scheduler] Task ${task.id.slice(0, 8)} stuck (lifetime): ${finishedRuns.length} total runs, marking blocked`);
      await updateTask(task.id, {
        is_blocked: true,
        blocked_reason: `Agent ran ${finishedRuns.length} times total without advancing status. Manual intervention needed.`,
      });
      continue;
    }

    // Exponential backoff: wait longer between retries as failures accumulate
    if (finishedRuns.length > 0) {
      const lastRunTime = new Date(finishedRuns[0].created_at).getTime();
      const backoffMs = Math.min(finishedRuns.length * 60_000, 600_000); // 1min per run, max 10min
      if (Date.now() - lastRunTime < backoffMs) {
        continue; // Not enough time has passed, skip for now
      }
    }

    tasksNeedingWork.push(task);
  }

  console.log(`[Scheduler] Found ${tasksNeedingWork.length} tasks needing work for ${userEmail}`);

  // Enqueue tasks (limit to prevent flooding)
  const maxToEnqueue = 5;
  const tasksToEnqueue = tasksNeedingWork.slice(0, maxToEnqueue);

  for (const task of tasksToEnqueue) {
    try {
      const agentType = getAgentTypeForStatus(task.status);
      const priority = getPriorityValue(task.priority);

      console.log(`[Scheduler] Enqueuing task ${task.id.slice(0, 8)} (${task.title}) for ${agentType} agent [${userEmail}]`);

      await agentQueue.enqueue({
        taskId: task.id,
        agentType,
        priority,
        tenantId: userEmail,
        userEmail,
      });

      userRecentlyEnqueued.add(task.id);

      // Clear from recently enqueued after 60 seconds
      setTimeout(() => {
        userRecentlyEnqueued.delete(task.id);
      }, 60000);

    } catch (error) {
      console.error(`[Scheduler] Failed to enqueue task ${task.id} for ${userEmail}:`, error);
    }
  }
}

/**
 * Main scheduler tick - check for tasks that need processing across all users
 */
async function schedulerTick(): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[Scheduler] Tick at ${timestamp}`);

  try {
    // Get all users with Claude API keys
    const users = await getUsersWithApiKeys();
    if (users.length === 0) {
      console.log('[Scheduler] No users with Claude API key configured. Skipping tick.');
      return;
    }
    console.log(`[Scheduler] Processing ${users.length} user(s)`);

    // Process each user's tasks independently
    for (const user of users) {
      try {
        await processUserTasks(user.email);
      } catch (error) {
        console.error(`[Scheduler] Error processing tasks for ${user.email}:`, error);
      }
    }

    // Backfill orphaned tasks (user_email IS NULL) to first available user
    const orphanedTasks = await getOrphanedTasks();
    if (orphanedTasks.length > 0 && users.length > 0) {
      console.warn(`[Scheduler] Found ${orphanedTasks.length} orphaned tasks, assigning to ${users[0].email}`);
      await assignOrphanedTasks(users[0].email);
    }

    // Log summary
    try {
      const updatedStatus = await agentQueue.getStatus();
      console.log(`[Scheduler] Queue status: ${updatedStatus.jobs.length} queued, ${updatedStatus.activeRuns.length} active`);
    } catch (error) {
      console.warn('[Scheduler] Failed to get queue status for summary:', error instanceof Error ? error.message : String(error));
    }

    // Cleanup old task logs (7-day retention)
    try {
      const cleaned = await cleanupOldTaskLogs(7);
      if (cleaned > 0) {
        console.log(`[Scheduler] Cleaned up ${cleaned} old task log entries`);
      }
    } catch (err) {
      console.error('[Scheduler] Failed to cleanup old task logs:', err);
    }

  } catch (error) {
    console.error('[Scheduler] Error in scheduler tick:', error);
  }
}

/**
 * Start the internal scheduler
 * Runs every 30 seconds to check for tasks needing work
 */
export function startScheduler(): void {
  if (isSchedulerRunning) {
    console.log('[Scheduler] Already running, skipping start');
    return;
  }

  console.log('[Scheduler] Starting internal task scheduler...');

  // Start the task log buffer flush interval
  taskLogBuffer.start();

  // Run immediately on start
  schedulerTick().catch(console.error);

  // Schedule to run every 30 seconds
  // Cron format: second minute hour day month weekday
  scheduledTask = cron.schedule('*/30 * * * * *', () => {
    schedulerTick().catch(console.error);
  });

  isSchedulerRunning = true;
  console.log('[Scheduler] Internal scheduler started (runs every 30 seconds)');
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  taskLogBuffer.stop();
  isSchedulerRunning = false;
  recentlyEnqueued.clear();
  console.log('[Scheduler] Scheduler stopped');
}

/**
 * Stop the scheduler and await final log flush (for graceful shutdown)
 */
export async function stopSchedulerAsync(): Promise<void> {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  await taskLogBuffer.stopAsync();
  isSchedulerRunning = false;
  recentlyEnqueued.clear();
  console.log('[Scheduler] Scheduler stopped (async)');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  recentlyEnqueuedCount: number;
} {
  let total = 0;
  for (const set of recentlyEnqueued.values()) {
    total += set.size;
  }
  return {
    isRunning: isSchedulerRunning,
    recentlyEnqueuedCount: total,
  };
}

/**
 * Force a scheduler tick (for testing/manual trigger)
 */
export async function forceSchedulerTick(): Promise<void> {
  await schedulerTick();
}
