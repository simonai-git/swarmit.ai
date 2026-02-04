import { NextRequest, NextResponse } from 'next/server';
import { getProject, getTasksByProjectId, createTask, updateTask } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    const tasks = await getTasksByProjectId(id);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error fetching project tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch project tasks' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    // Handle bulk task creation
    if (Array.isArray(body.tasks)) {
      const createdTasks = [];
      for (const taskData of body.tasks) {
        const task = await createTask({
          id: uuidv4(),
          title: taskData.title,
          description: taskData.description || null,
          status: taskData.status || 'todo',
          assignee: taskData.assignee ?? null,  // Allow null/unassigned tasks
          priority: taskData.priority || 'medium',
          due_date: taskData.due_date || null,
          project_id: projectId,
        });
        createdTasks.push(task);
      }
      return NextResponse.json(createdTasks, { status: 201 });
    }
    
    // Single task creation
    const task = await createTask({
      id: uuidv4(),
      title: body.title,
      description: body.description || null,
      status: body.status || 'todo',
      assignee: body.assignee ?? null,  // Allow null/unassigned tasks
      priority: body.priority || 'medium',
      due_date: body.due_date || null,
      project_id: projectId,
    });
    
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Error creating project task:', error);
    return NextResponse.json({ error: 'Failed to create project task' }, { status: 500 });
  }
}

// Link existing tasks to this project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    if (!Array.isArray(body.task_ids)) {
      return NextResponse.json({ error: 'task_ids array required' }, { status: 400 });
    }
    
    const linkedTasks = [];
    for (const taskId of body.task_ids) {
      const updated = await updateTask(taskId, { project_id: projectId });
      if (updated) {
        linkedTasks.push(updated);
      }
    }
    
    return NextResponse.json(linkedTasks);
  } catch (error) {
    console.error('Error linking tasks to project:', error);
    return NextResponse.json({ error: 'Failed to link tasks' }, { status: 500 });
  }
}
