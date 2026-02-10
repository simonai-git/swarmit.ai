import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowEvents } from '@/lib/db';

function isWorkflowsEnabled(): boolean {
  return process.env.FEATURE_WORKFLOWS === 'true';
}

// GET /api/tasks/:id/workflow-events - Get workflow execution events for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isWorkflowsEnabled()) {
    return NextResponse.json({ error: 'Workflows feature is not enabled' }, { status: 404 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const runId = searchParams.get('run_id') || undefined;
    const afterId = searchParams.get('after_id')
      ? parseInt(searchParams.get('after_id')!)
      : undefined;
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : undefined;

    const events = await getWorkflowEvents(id, { runId, afterId, limit });
    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching workflow events:', error);
    return NextResponse.json({ error: 'Failed to fetch workflow events' }, { status: 500 });
  }
}
