import { NextRequest, NextResponse } from 'next/server';
import { getAllTasks, createTask, Task } from '@/lib/db';
import { sendWebhook } from '@/lib/webhook';
import { onTaskCreated, selectSpecialist } from '@/lib/task-lifecycle';
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
    
    // Auto-assign if no assignee specified
    let assignee = body.assignee;
    if (assignee === undefined || assignee === null) {
      assignee = selectSpecialist({ title: body.title, description: body.description });
    }
    
    const task = await createTask({
      id: uuidv4(),
      title: body.title,
      description: body.description || null,
      status: body.status || 'todo',
      assignee,
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
    
    // Trigger lifecycle automation (auto-spawn agents if enabled)
    onTaskCreated(task as Task).catch(err => {
      console.error('Lifecycle hook error:', err);
    });
    
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
