import cron, { ScheduledTask } from 'node-cron';
import { Task, getUsersWithApiKeys, getTasksByUserId, getAgentRunsByTask, updateTask, getOrphanedTasks, assignOrphanedTasks, cleanupOldTaskLogs, getProject, getAgent, getAgentWorkflow, getAgentTypeFromSpecialization } from './db';
import { agentQueue } from './agent-queue';
import { taskLogBuffer } from './task-log-buffer';

// Track if scheduler is already running (singleton)
let isSchedulerRunning = false;
let scheduledTask: ScheduledTask | null = null;

// Track the last successful tick for staleness detection and self-healing
let lastTickTime: number = 0;
const STALE_THRESHOLD_MS = 120000; // 2 minutes — if no tick for this long, scheduler is stale

// Track tasks we've already enqueued this cycle, per user
const recentlyEnqueued = new Map<string, Set<string>>();

// Stuck-task detection: skip tasks with too many completed runs in a window
const MAX_RECENT_RUNS = 5;
const STUCK_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MAX_LIFETIME_RUNS = 10; // Runs per agent type before permanent block

/**
 * Determine agent type based on task status (fallback)
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
 * Determine agent type based on task assignee (agent ID), falling back to status-based.
 * Looks up the agent by ID and derives type from specialization.
 */
async function getAgentTypeForTask(task: Task): Promise<'developer' | 'qa' | 'reviewer' | 'pm' | 'devops' | 'product_manager'> {
  if (task.assignee) {
    const agent = await getAgent(task.assignee);
    if (agent) {
      return getAgentTypeFromSpecialization(agent.specialization);
    }
  }
  // Fall back to status-based for non-assigned or unknown agents
  return getAgentTypeForStatus(task.status);
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
async function processUserTasks(userId: string): Promise<void> {
  // Get tasks owned by this user
  const allTasks = await getTasksByUserId(userId);

  // Build set of cancelled/completed project IDs to skip their tasks
  const projectIds = [...new Set(allTasks.map(t => t.project_id).filter(Boolean))] as string[];
  const inactiveProjectIds = new Set<string>();
  for (const pid of projectIds) {
    try {
      const project = await getProject(pid);
      if (project && ['canceled', 'completed'].includes(project.status)) {
        inactiveProjectIds.add(pid);
      }
    } catch { /* skip if project lookup fails */ }
  }

  // Get current queue status scoped to this user's tenant
  let queuedTaskIds = new Set<string>();
  let activeTaskIds = new Set<string>();
  try {
    const queueStatus = await agentQueue.getStatus(userId);
    queuedTaskIds = new Set(
      queueStatus.jobs
        .filter(j => ['pending', 'running'].includes(j.status))
        .map(j => j.taskId)
    );
    // Check both in-memory active runs AND DB-level current_run_id
    // DB survives process restarts; in-memory is a fast path
    const inMemoryActiveTaskIds = new Set(queueStatus.activeRuns.map(r => r.taskId));
    const tasksWithDbClaim = allTasks
      .filter(t => t.current_run_id != null)
      .map(t => t.id);
    activeTaskIds = new Set([
      ...inMemoryActiveTaskIds,
      ...tasksWithDbClaim,
    ]);

    // Detect stale DB claims: task has current_run_id but no matching in-memory active run
    // This happens when the process restarts (deploy) and running agents are killed
    for (const task of allTasks) {
      if (task.current_run_id && !inMemoryActiveTaskIds.has(task.id)) {
        const runAge = Date.now() - new Date(task.updated_at).getTime();
        if (runAge > 10 * 60 * 1000) {
          console.warn(`[Scheduler] Releasing stale current_run_id on task ${task.id.slice(0, 8)} (no in-memory run, age: ${Math.round(runAge / 60000)}min)`);
          await updateTask(task.id, { current_run_id: null } as any);
          activeTaskIds.delete(task.id);
        }
      }
    }
  } catch (error) {
    console.warn(`[Scheduler] Failed to get queue status for ${userId}, proceeding without queue dedup:`, error instanceof Error ? error.message : String(error));
  }

  // Get or create per-user recently enqueued set
  if (!recentlyEnqueued.has(userId)) {
    recentlyEnqueued.set(userId, new Set<string>());
  }
  const userRecentlyEnqueued = recentlyEnqueued.get(userId)!;

  // Filter to tasks that need agent work
  const tasksNeedingWork: Task[] = [];
  for (const task of allTasks) {
    if (task.status === 'done') continue;
    if (task.project_id && inactiveProjectIds.has(task.project_id)) continue;
    if (!task.assignee) continue;
    if (queuedTaskIds.has(task.id)) {
      console.log(`[Scheduler] Task ${task.id.slice(0, 8)} already queued for ${userId}, skipping`);
      continue;
    }
    if (activeTaskIds.has(task.id)) {
      console.log(`[Scheduler] Task ${task.id.slice(0, 8)} has active agent for ${userId}, skipping`);
      continue;
    }
    if (userRecentlyEnqueued.has(task.id)) continue;
    if (!['todo', 'in_progress', 'testing', 'in_review'].includes(task.status)) continue;
    if (task.is_blocked) {
      // Auto-unblock throttle-blocked tasks after 60 minutes cooldown
      if (task.blocked_reason?.includes('Manual intervention needed')) {
        const cooldownRuns = await getAgentRunsByTask(task.id);
        const lastFinished = cooldownRuns.find(r => ['completed', 'failed'].includes(r.status));
        const lastRunTime = lastFinished ? new Date(lastFinished.created_at).getTime() : 0;
        const cooldownMs = 60 * 60 * 1000; // 60 minutes
        if (lastRunTime > 0 && Date.now() - lastRunTime > cooldownMs) {
          await updateTask(task.id, { is_blocked: false, blocked_reason: null });
          console.log(`[Scheduler] Auto-unblocked throttle-blocked task ${task.id.slice(0, 8)} after cooldown`);
          // Fall through — let it be processed this tick
        } else {
          continue;
        }
      } else {
        continue; // Dependency-blocked — skip
      }
    }

    // Stuck detection: check both windowed and lifetime metrics
    // Count only runs matching the agent type we'd spawn for this task
    const expectedAgentType = await getAgentTypeForTask(task);
    const recentRuns = await getAgentRunsByTask(task.id);
    const finishedRuns = recentRuns.filter(r =>
      ['completed', 'failed'].includes(r.status) && r.agent_type === expectedAgentType
    );

    // Tier 1: Rapid loop — 3+ runs of the same type in 30 minutes
    const recentFinishedRuns = finishedRuns.filter(r =>
      new Date(r.created_at).getTime() > Date.now() - STUCK_WINDOW_MS
    );
    if (recentFinishedRuns.length >= MAX_RECENT_RUNS) {
      console.warn(`[Scheduler] Task ${task.id.slice(0, 8)} stuck (rapid): ${recentFinishedRuns.length} ${expectedAgentType} runs in 30min, marking blocked`);
      await updateTask(task.id, {
        is_blocked: true,
        blocked_reason: `${expectedAgentType} agent ran ${recentFinishedRuns.length} times in 30 minutes without advancing status. Manual intervention needed.`,
      });
      continue;
    }

    // Tier 2: Slow burn — 10+ total lifetime runs of the same type
    if (finishedRuns.length >= MAX_LIFETIME_RUNS) {
      console.warn(`[Scheduler] Task ${task.id.slice(0, 8)} stuck (lifetime): ${finishedRuns.length} ${expectedAgentType} runs total, marking blocked`);
      await updateTask(task.id, {
        is_blocked: true,
        blocked_reason: `${expectedAgentType} agent ran ${finishedRuns.length} times total without advancing status. Manual intervention needed.`,
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

    // Gate: if the agent requires a workflow but has none assigned, skip
    if (process.env.FEATURE_WORKFLOWS === 'true' && task.assignee) {
      try {
        const agent = await getAgent(task.assignee);
        if (agent?.requires_workflow) {
          const workflow = await getAgentWorkflow(agent.id);
          if (!workflow) {
            console.log(`[Scheduler] Task ${task.id.slice(0, 8)} skipped: agent ${task.assignee} requires_workflow but has none assigned`);
            continue;
          }
        }
      } catch {
        // Non-blocking — proceed without workflow gate
      }
    }

    tasksNeedingWork.push(task);
  }

  console.log(`[Scheduler] Found ${tasksNeedingWork.length} tasks needing work for ${userId}`);

  // Enqueue tasks (limit to prevent flooding)
  const maxToEnqueue = 5;
  const tasksToEnqueue = tasksNeedingWork.slice(0, maxToEnqueue);

  for (const task of tasksToEnqueue) {
    try {
      const agentType = await getAgentTypeForTask(task);
      const priority = getPriorityValue(task.priority);

      console.log(`[Scheduler] Enqueuing task ${task.id.slice(0, 8)} (${task.title}) for ${agentType} agent [${userId}]`);

      await agentQueue.enqueue({
        taskId: task.id,
        agentType,
        priority,
        tenantId: userId,
        userId,
      });

      userRecentlyEnqueued.add(task.id);

      // Clear from recently enqueued after 60 seconds
      setTimeout(() => {
        userRecentlyEnqueued.delete(task.id);
      }, 60000);

    } catch (error) {
      console.error(`[Scheduler] Failed to enqueue task ${task.id} for ${userId}:`, error);
    }
  }
}

/**
 * Main scheduler tick - check for tasks that need processing across all users
 */
async function schedulerTick(): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[Scheduler] Tick at ${timestamp}`);
  lastTickTime = Date.now();

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
        await processUserTasks(user.id);
      } catch (error) {
        console.error(`[Scheduler] Error processing tasks for ${user.id}:`, error);
      }
    }

    // Backfill orphaned tasks (user_id IS NULL) to first available user
    const orphanedTasks = await getOrphanedTasks();
    if (orphanedTasks.length > 0 && users.length > 0) {
      console.warn(`[Scheduler] Found ${orphanedTasks.length} orphaned tasks, assigning to ${users[0].id}`);
      await assignOrphanedTasks(users[0].id);
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
  lastTickTime = 0;
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
  lastTickTime = 0;
  recentlyEnqueued.clear();
  console.log('[Scheduler] Scheduler stopped (async)');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  recentlyEnqueuedCount: number;
  lastTickTime: number;
  lastTickAgo: number;
  isStale: boolean;
} {
  let total = 0;
  for (const set of recentlyEnqueued.values()) {
    total += set.size;
  }
  const now = Date.now();
  const lastTickAgo = lastTickTime > 0 ? now - lastTickTime : -1;
  return {
    isRunning: isSchedulerRunning,
    recentlyEnqueuedCount: total,
    lastTickTime,
    lastTickAgo,
    isStale: isSchedulerRunning && lastTickTime > 0 && lastTickAgo > STALE_THRESHOLD_MS,
  };
}

/**
 * Force a scheduler tick (for testing/manual trigger)
 */
export async function forceSchedulerTick(): Promise<void> {
  await schedulerTick();
}
