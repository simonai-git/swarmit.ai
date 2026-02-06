import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllTasks, searchTasks, createTask, getTasksByUserEmail, Task } from '@/lib/db';
import { sendWebhook } from '@/lib/webhook';
import { onTaskCreated, selectSpecialist } from '@/lib/task-lifecycle';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const status = searchParams.get('status');
    const assignee = searchParams.get('assignee');
    const priority = searchParams.get('priority');
    const project_id = searchParams.get('project_id');
    const is_blocked = searchParams.get('is_blocked');

    // Determine user from session
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;

    // Use server-side search if any filter params are provided
    const hasFilters = q || assignee || priority || project_id || is_blocked;

    let tasks;
    if (hasFilters) {
      tasks = await searchTasks({
        q: q || undefined,
        status: status || undefined,
        assignee: assignee || undefined,
        priority: priority || undefined,
        project_id: project_id || undefined,
        is_blocked: is_blocked || undefined,
        user_email: userEmail || undefined,
      });
    } else if (userEmail) {
      // Authenticated user: show only their tasks
      tasks = await getTasksByUserEmail(userEmail);

      // Filter by status if provided (supports comma-separated values)
      if (status) {
        const statuses = status.split(',').map(s => s.trim());
        tasks = tasks.filter(task => statuses.includes(task.status));
      }
    } else {
      // No session (API key auth or unauthenticated): show all tasks
      tasks = await getAllTasks();

      // Filter by status if provided (supports comma-separated values)
      if (status) {
        const statuses = status.split(',').map(s => s.trim());
        tasks = tasks.filter(task => statuses.includes(task.status));
      }
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

    // Determine user email from session
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || null;

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
      user_email: userEmail,
    });

    // Send webhook notification
    await sendWebhook({
      event: 'task.created',
      task: task,
    });

    // Trigger lifecycle automation (auto-spawn agents if enabled)
    onTaskCreated(task as Task, userEmail || undefined).catch(err => {
      console.error('Lifecycle hook error:', err);
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
