import { NextRequest, NextResponse } from 'next/server';
import { getAllTasks, getWatcherConfig } from '@/lib/db';
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

    const results = {
      processed: 0,
      enqueued: 0,
      errors: [] as string[],
    };

    // Step 1: Check for TODO tasks that need to be enqueued
    const tasks = await getAllTasks();
    const todoTasks = tasks.filter(t => t.status === 'todo');
    
    // Get current queue status to avoid double-enqueueing
    const queueStatus = await agentQueue.getStatus();
    const queuedTaskIds = new Set(queueStatus.jobs.map(j => j.taskId));
    
    for (const task of todoTasks) {
      // Skip if already in queue
      if (queuedTaskIds.has(task.id)) continue;
      
      try {
        // Determine priority
        const priorityMap: Record<string, number> = { high: 10, medium: 5, low: 1 };
        const priority = priorityMap[task.priority] || 5;
        
        await agentQueue.enqueue({
          taskId: task.id,
          agentType: 'developer',
          priority,
        });
        results.enqueued++;
        console.log(`[Watcher] Enqueued task ${task.id}: ${task.title}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Failed to enqueue ${task.id}: ${msg}`);
      }
    }

    // Step 2: Process pending jobs in the queue
    // In serverless, we process jobs inline rather than relying on intervals
    const maxToProcess = 3; // Process up to 3 jobs per poll
    
    for (let i = 0; i < maxToProcess; i++) {
      const status = await agentQueue.getStatus();
      const pendingJob = status.jobs.find(j => j.status === 'pending');
      
      if (!pendingJob) break;
      
      // Note: The actual job processing happens via the agent queue's internal
      // mechanism. We just need to ensure startProcessing has been called.
      // The queue will process jobs on its interval.
      results.processed++;
    }

    // Trigger queue processing (in case it's not running)
    agentQueue.startProcessing();

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} jobs, enqueued ${results.enqueued} tasks`,
      ...results,
      queueStatus: {
        pending: queueStatus.pending,
        running: queueStatus.running,
      },
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
    const queueStatus = await agentQueue.getStatus();
    const tasks = await getAllTasks();
    const todoCount = tasks.filter(t => t.status === 'todo').length;

    return NextResponse.json({
      watcher: {
        isRunning: config.is_running,
        lastRun: config.last_run,
      },
      queue: {
        pending: queueStatus.pending,
        running: queueStatus.running,
      },
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
