import { NextRequest, NextResponse } from 'next/server';
import { getSchedulerStatus, forceSchedulerTick, startScheduler, stopScheduler } from '@/lib/scheduler';
import { agentQueue } from '@/lib/agent-queue';

// GET /api/scheduler - Get scheduler status
export async function GET() {
  const schedulerStatus = getSchedulerStatus();
  const queueStatus = await agentQueue.getStatus();
  
  return NextResponse.json({
    scheduler: schedulerStatus,
    queue: {
      jobsQueued: queueStatus.jobs.length,
      activeRuns: queueStatus.activeRuns.length,
      jobs: queueStatus.jobs,
      runs: queueStatus.activeRuns,
    },
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

      case 'tick':
        await forceSchedulerTick();
        const status = await agentQueue.getStatus();
        return NextResponse.json({ 
          success: true, 
          message: 'Scheduler tick executed',
          queue: {
            jobsQueued: status.jobs.length,
            activeRuns: status.activeRuns.length,
          },
        });

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
