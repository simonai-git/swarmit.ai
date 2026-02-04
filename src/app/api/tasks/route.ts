import { NextRequest, NextResponse } from 'next/server';
import { getAllTasks, createTask } from '@/lib/db';
import { sendWebhook } from '@/lib/webhook';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    let tasks = await getAllTasks();
    
    // Filter by status if provided (supports comma-separated values)
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      tasks = tasks.filter(task => statuses.includes(task.status));
    }
    
    return NextResponse.json(tasks, {
      headers: {
        'Cache-Control': 'private, max-age=5, stale-while-revalidate=10',
      },
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const task = await createTask({
      id: uuidv4(),
      title: body.title,
      description: body.description || null,
      status: body.status || 'todo',
      assignee: body.assignee ?? null,  // Allow null/unassigned tasks
      priority: body.priority || 'medium',
      due_date: body.due_date || null,
      project_id: body.project_id || null,
      estimated_hours: body.estimated_hours || null,
      agent_context: body.agent_context || null,
    });
    
    // Send webhook notification
    await sendWebhook({
      event: 'task.created',
      task: task,
    });
    
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
