import { NextRequest, NextResponse } from 'next/server';
import { getSchedulerStatus, forceSchedulerTick, startScheduler, stopScheduler } from '@/lib/scheduler';
import { agentQueue } from '@/lib/agent-queue';

// GET /api/scheduler - Get scheduler status
export async function GET() {
  const schedulerStatus = getSchedulerStatus();

  // Self-healing: auto-start scheduler if it's not running
  if (!schedulerStatus.isRunning) {
    console.log('[Scheduler API] Scheduler not running, auto-starting...');
    startScheduler();
  }

  let queueInfo = { jobsQueued: 0, activeRuns: 0, jobs: [] as unknown[], runs: [] as unknown[] };
  try {
    const queueStatus = await agentQueue.getStatus();
    queueInfo = {
      jobsQueued: queueStatus.jobs.length,
      activeRuns: queueStatus.activeRuns.length,
      jobs: queueStatus.jobs,
      runs: queueStatus.activeRuns,
    };
  } catch (error) {
    console.warn('[Scheduler API] Failed to get queue status:', error instanceof Error ? error.message : String(error));
  }

  return NextResponse.json({
    scheduler: { ...getSchedulerStatus() },
    queue: queueInfo,
  });
}

// POST /api/scheduler - Control scheduler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'start':
        startScheduler();
        return NextResponse.json({ success: true, message: 'Scheduler started' });

      case 'stop':
        stopScheduler();
        return NextResponse.json({ success: true, message: 'Scheduler stopped' });

      case 'tick': {
        await forceSchedulerTick();
        let tickQueueInfo = { jobsQueued: 0, activeRuns: 0 };
        try {
          const status = await agentQueue.getStatus();
          tickQueueInfo = {
            jobsQueued: status.jobs.length,
            activeRuns: status.activeRuns.length,
          };
        } catch (error) {
          console.warn('[Scheduler API] Failed to get queue status after tick:', error instanceof Error ? error.message : String(error));
        }
        return NextResponse.json({
          success: true,
          message: 'Scheduler tick executed',
          queue: tickQueueInfo,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: start, stop, or tick' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Scheduler API error:', error);
    return NextResponse.json(
      { error: 'Failed to control scheduler' },
      { status: 500 }
    );
  }
}
