import { NextRequest, NextResponse } from 'next/server';
import {
  getTask,
  getTaskDependencies,
  getTaskDependents,
  addTaskDependency,
  removeTaskDependency,
} from '@/lib/db';

// GET /api/tasks/[id]/dependencies - List dependencies and dependents
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const task = await getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const [dependencies, dependents] = await Promise.all([
      getTaskDependencies(id),
      getTaskDependents(id),
    ]);

    return NextResponse.json({ dependencies, dependents });
  } catch (error) {
    console.error('Error fetching dependencies:', error);
    return NextResponse.json({ error: 'Failed to fetch dependencies' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/dependencies - Add a dependency
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { depends_on_id } = body;

    if (!depends_on_id) {
      return NextResponse.json({ error: 'depends_on_id is required' }, { status: 400 });
    }

    const task = await getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const dependsOn = await getTask(depends_on_id);
    if (!dependsOn) {
      return NextResponse.json({ error: 'Dependency task not found' }, { status: 404 });
    }

    const dependency = await addTaskDependency(id, depends_on_id);
    return NextResponse.json(dependency, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add dependency';
    const status = message.includes('circular') ? 400 : message.includes('unique') || message.includes('duplicate') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE /api/tasks/[id]/dependencies - Remove a dependency
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const dependsOnId = searchParams.get('depends_on_id');

    if (!dependsOnId) {
      return NextResponse.json({ error: 'depends_on_id query param is required' }, { status: 400 });
    }

    const removed = await removeTaskDependency(id, dependsOnId);
    if (!removed) {
      return NextResponse.json({ error: 'Dependency not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing dependency:', error);
    return NextResponse.json({ error: 'Failed to remove dependency' }, { status: 500 });
  }
}
