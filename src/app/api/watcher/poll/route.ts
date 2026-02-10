import { NextRequest, NextResponse } from 'next/server';
import { getAllTasks, getWatcherConfig, getUsersWithApiKeys, getTasksByUserId } from '@/lib/db';
import { agentQueue } from '@/lib/agent-queue';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.SIMON_API_KEY;
  // Also allow cron secret for Railway cron jobs
  const cronSecret = request.headers.get('x-cron-secret');
  const validCronSecret = process.env.CRON_SECRET;

  return apiKey === validKey || (!!cronSecret && cronSecret === validCronSecret);
}

// POST /api/watcher/poll - Process pending jobs and enqueue new tasks
export async function POST(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getWatcherConfig();

    // If watcher is disabled, do nothing
    if (!config.is_running) {
      return NextResponse.json({
        success: true,
        message: 'Watcher is paused',
        processed: 0,
        enqueued: 0,
      });
    }

    // Get all users with Claude API keys for multi-tenant processing
    const users = await getUsersWithApiKeys();

    const results = {
      processed: 0,
      enqueued: 0,
      errors: [] as string[],
    };

    // Step 1: Process each user's TODO tasks
    for (const user of users) {
      const tasks = await getTasksByUserId(user.id);
      const todoTasks = tasks.filter(t => t.status === 'todo');

      // Get queue status scoped to this user to avoid double-enqueueing
      let queuedTaskIds = new Set<string>();
      try {
        const queueStatus = await agentQueue.getStatus(user.id);
        queuedTaskIds = new Set(
          queueStatus.jobs
            .filter(j => ['pending', 'running'].includes(j.status))
            .map(j => j.taskId)
        );
      } catch (error) {
        console.warn(`[Watcher] Failed to get queue status for ${user.id}:`, error instanceof Error ? error.message : String(error));
      }

      for (const task of todoTasks) {
        if (queuedTaskIds.has(task.id)) continue;

        try {
          const priorityMap: Record<string, number> = { high: 10, medium: 5, low: 1 };
          const priority = priorityMap[task.priority] || 5;

          await agentQueue.enqueue({
            taskId: task.id,
            agentType: 'developer',
            priority,
            tenantId: user.id,
            userId: user.id,
          });
          results.enqueued++;
          console.log(`[Watcher] Enqueued task ${task.id}: ${task.title} for ${user.id}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.errors.push(`Failed to enqueue ${task.id}: ${msg}`);
        }
      }
    }

    // Step 2: Process pending jobs in the queue
    const maxToProcess = 3;

    for (let i = 0; i < maxToProcess; i++) {
      try {
        const status = await agentQueue.getStatus();
        const pendingJob = status.jobs.find(j => j.status === 'pending');
        if (!pendingJob) break;
        results.processed++;
      } catch {
        break; // Queue unavailable, stop trying
      }
    }

    // Trigger queue processing (in case it's not running)
    agentQueue.startProcessing();

    let queueStatusInfo = { pending: 0, running: 0 };
    try {
      const queueStatus = await agentQueue.getStatus();
      queueStatusInfo = {
        pending: queueStatus.pending,
        running: queueStatus.running,
      };
    } catch (error) {
      console.warn('[Watcher] Failed to get queue status for response:', error instanceof Error ? error.message : String(error));
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} jobs, enqueued ${results.enqueued} tasks`,
      ...results,
      queueStatus: queueStatusInfo,
    });
  } catch (error) {
    console.error('Error in watcher poll:', error);
    return NextResponse.json(
      { error: 'Failed to poll watcher' },
      { status: 500 }
    );
  }
}

// GET /api/watcher/poll - Check status (for health checks)
export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getWatcherConfig();
    const tasks = await getAllTasks();
    const todoCount = tasks.filter(t => t.status === 'todo').length;

    let queueInfo = { pending: 0, running: 0 };
    try {
      const queueStatus = await agentQueue.getStatus();
      queueInfo = {
        pending: queueStatus.pending,
        running: queueStatus.running,
      };
    } catch (error) {
      console.warn('[Watcher GET] Failed to get queue status:', error instanceof Error ? error.message : String(error));
    }

    return NextResponse.json({
      watcher: {
        isRunning: config.is_running,
        lastRun: config.last_run,
      },
      queue: queueInfo,
      tasks: {
        todo: todoCount,
        total: tasks.length,
      },
    });
  } catch (error) {
    console.error('Error getting watcher status:', error);
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
