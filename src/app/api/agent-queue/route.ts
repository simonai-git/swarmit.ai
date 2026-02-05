import { NextRequest, NextResponse } from 'next/server';
import { agentQueue, getTodaySpend } from '@/lib/agent-queue';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// GET /api/agent-queue - Get queue status
export async function GET(request: NextRequest) {
  // Verify API key
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // tenantId is optional - if not provided, returns global status
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;
    
    const status = await agentQueue.getStatus();
    
    // Get today's spend
    let todaySpend = 0;
    try {
      todaySpend = await getTodaySpend();
    } catch {
      // Table might not exist yet
    }

    return NextResponse.json({
      queue: {
        pending: status.pending,
        running: status.running,
        completed: status.completed,
        failed: status.failed,
      },
      jobs: status.jobs.map(j => ({
        id: j.id,
        taskId: j.taskId,
        agentType: j.agentType,
        status: j.status,
        priority: j.priority,
        createdAt: j.createdAt,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        error: j.error,
      })),
      activeRuns: status.activeRuns.map(r => ({
        id: r.id,
        taskId: r.taskId,
        agentType: r.agentType,
        status: r.status,
        startedAt: r.startedAt,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costCents: r.costCents,
      })),
      costs: {
        todaySpendCents: todaySpend,
        dailyBudgetCents: parseInt(process.env.DAILY_BUDGET_CENTS || '1000'),
      },
      redis: !!process.env.REDIS_URL,
      tenantId: tenantId || 'default',
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    return NextResponse.json(
      { error: 'Failed to get queue status' },
      { status: 500 }
    );
  }
}

// POST /api/agent-queue - Control queue (pause/resume/cleanup)
export async function POST(request: NextRequest) {
  // Verify API key
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'start':
        agentQueue.startProcessing();
        return NextResponse.json({ success: true, message: 'Queue processing started' });

      case 'stop':
        agentQueue.stopProcessing();
        return NextResponse.json({ success: true, message: 'Queue processing stopped' });

      case 'cleanup':
        const maxAgeMs = body.maxAgeMs || 86400000; // 24 hours default
        agentQueue.cleanup(maxAgeMs);
        return NextResponse.json({ success: true, message: 'Queue cleaned up' });

      case 'cancel':
        if (!body.jobId) {
          return NextResponse.json({ error: 'jobId required' }, { status: 400 });
        }
        const cancelled = await agentQueue.cancel(body.jobId);
        return NextResponse.json({ 
          success: cancelled, 
          message: cancelled ? 'Job cancelled' : 'Job not found' 
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: start, stop, cleanup, or cancel' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error controlling queue:', error);
    return NextResponse.json(
      { error: 'Failed to control queue' },
      { status: 500 }
    );
  }
}
