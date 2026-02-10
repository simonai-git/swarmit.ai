import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTask, getAutomationUserId } from '@/lib/db';
import { agentQueue } from '@/lib/agent-queue';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// POST /api/tasks/:id/run - Trigger an agent run for a task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Allow either API key OR authenticated session
  const session = await getServerSession(authOptions);
  if (!verifyApiKey(request) && !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { agentType = 'developer' } = body;

    // Validate agent type
    if (!['developer', 'qa', 'reviewer'].includes(agentType)) {
      return NextResponse.json(
        { error: 'Invalid agentType. Must be developer, qa, or reviewer' },
        { status: 400 }
      );
    }

    // Get the task
    const task = await getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Determine priority based on task priority
    const priorityMap = { high: 10, medium: 5, low: 1 };
    const priority = priorityMap[task.priority] || 5;

    // Get user ID: from request body, from session, from task owner, or look up automation user
    const { userId: requestUserId } = body;
    let userId = requestUserId || session?.user?.id || task.user_id;

    // If no user ID provided, look up the automation user dynamically
    if (!userId) {
      userId = await getAutomationUserId();
    }

    // tenantId for multi-tenant support (scoped to user)
    const tenantId = userId || 'default';

    // Enqueue the job
    const job = await agentQueue.enqueue({
      taskId: id,
      agentType: agentType as 'developer' | 'qa' | 'reviewer',
      priority,
      tenantId,
      userId,
    });

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        taskId: job.taskId,
        agentType: job.agentType,
        status: job.status,
        createdAt: job.createdAt,
      },
      message: `Agent run queued for task ${id}`,
    });
  } catch (error) {
    console.error('Error triggering agent run:', error);
    return NextResponse.json(
      { error: 'Failed to trigger agent run' },
      { status: 500 }
    );
  }
}

// GET /api/tasks/:id/run - Get run history for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Verify API key
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Get the task
    const task = await getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get queue status for this task
    const queueStatus = await agentQueue.getStatus();
    const taskJobs = queueStatus.jobs.filter(j => j.taskId === id);
    const taskRuns = queueStatus.activeRuns.filter(r => r.taskId === id);

    return NextResponse.json({
      jobs: taskJobs,
      activeRuns: taskRuns,
    });
  } catch (error) {
    console.error('Error getting run history:', error);
    return NextResponse.json(
      { error: 'Failed to get run history' },
      { status: 500 }
    );
  }
}
