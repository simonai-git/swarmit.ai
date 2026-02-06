import { NextRequest, NextResponse } from 'next/server';
import { getTask, getTaskLogs, getTaskLogCount } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  const task = await getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const afterId = searchParams.get('afterId') ? parseInt(searchParams.get('afterId')!) : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
  const runId = searchParams.get('runId') || undefined;

  const [logs, total] = await Promise.all([
    getTaskLogs(taskId, { afterId, limit, runId }),
    getTaskLogCount(taskId),
  ]);

  return NextResponse.json({ logs, total });
}
