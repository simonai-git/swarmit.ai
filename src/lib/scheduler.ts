import cron, { ScheduledTask } from 'node-cron';
import { getAllTasks, Task, pool } from './db';
import { agentQueue } from './agent-queue';

// Get the automation user email (first user with a Claude API key configured)
async function getAutomationUserEmail(): Promise<string | undefined> {
  try {
    const result = await pool.query(
      'SELECT email FROM user_profiles WHERE claude_api_key IS NOT NULL LIMIT 1'
    );
    return result.rows[0]?.email;
  } catch (error) {
    console.error('[Scheduler] Failed to get automation user:', error);
    return undefined;
  }
}

// Track if scheduler is already running (singleton)
let isSchedulerRunning = false;
let scheduledTask: ScheduledTask | null = null;

// Track tasks we've already enqueued this cycle to prevent duplicates
const recentlyEnqueued = new Set<string>();

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
 * Main scheduler tick - check for tasks that need processing
 */
async function schedulerTick(): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[Scheduler] Tick at ${timestamp}`);

  try {
    // Get the automation user (for Claude API key)
    const automationUserEmail = await getAutomationUserEmail();
    if (!automationUserEmail) {
      console.log('[Scheduler] No user with Claude API key configured. Skipping tick.');
      return;
    }
    console.log(`[Scheduler] Using automation user: ${automationUserEmail}`);

    // Get all tasks
    const allTasks = await getAllTasks();
    
    // Get current queue status to see what's already queued/active
    const queueStatus = await agentQueue.getStatus();
    const queuedTaskIds = new Set(queueStatus.jobs.map(j => j.taskId));
    const activeTaskIds = new Set(queueStatus.activeRuns.map(r => r.taskId));

    // Filter to tasks that need agent work
    const tasksNeedingWork = allTasks.filter((task: Task) => {
      // Skip done tasks
      if (task.status === 'done') return false;
      
      // Skip tasks without assignee
      if (!task.assignee) return false;
      
      // Skip tasks already queued
      if (queuedTaskIds.has(task.id)) {
        console.log(`[Scheduler] Task ${task.id.slice(0, 8)} already queued, skipping`);
        return false;
      }
      
      // Skip tasks with active agent runs
      if (activeTaskIds.has(task.id)) {
        console.log(`[Scheduler] Task ${task.id.slice(0, 8)} has active agent, skipping`);
        return false;
      }

      // Skip recently enqueued (within last cycle)
      if (recentlyEnqueued.has(task.id)) {
        return false;
      }
      
      // Process these statuses
      return ['todo', 'in_progress', 'testing', 'in_review'].includes(task.status);
    });

    console.log(`[Scheduler] Found ${tasksNeedingWork.length} tasks needing work`);

    // Enqueue tasks (limit to prevent flooding)
    const maxToEnqueue = 5;
    const tasksToEnqueue = tasksNeedingWork.slice(0, maxToEnqueue);

    for (const task of tasksToEnqueue) {
      try {
        const agentType = getAgentTypeForStatus(task.status);
        const priority = getPriorityValue(task.priority);

        console.log(`[Scheduler] Enqueuing task ${task.id.slice(0, 8)} (${task.title}) for ${agentType} agent`);
        
        await agentQueue.enqueue({
          taskId: task.id,
          agentType,
          priority,
          tenantId: 'default',
          userEmail: automationUserEmail,
        });

        recentlyEnqueued.add(task.id);

        // Clear from recently enqueued after 60 seconds
        setTimeout(() => {
          recentlyEnqueued.delete(task.id);
        }, 60000);

      } catch (error) {
        console.error(`[Scheduler] Failed to enqueue task ${task.id}:`, error);
      }
    }

    // Log summary
    const updatedStatus = await agentQueue.getStatus();
    console.log(`[Scheduler] Queue status: ${updatedStatus.jobs.length} queued, ${updatedStatus.activeRuns.length} active`);

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
  isSchedulerRunning = false;
  recentlyEnqueued.clear();
  console.log('[Scheduler] Scheduler stopped');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  recentlyEnqueuedCount: number;
} {
  return {
    isRunning: isSchedulerRunning,
    recentlyEnqueuedCount: recentlyEnqueued.size,
  };
}

/**
 * Force a scheduler tick (for testing/manual trigger)
 */
export async function forceSchedulerTick(): Promise<void> {
  await schedulerTick();
}
