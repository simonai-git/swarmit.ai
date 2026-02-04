import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask, deleteTask, logActivity, getProject } from '@/lib/db';
import { sendWebhook } from '@/lib/webhook';
import { v4 as uuidv4 } from 'uuid';

const API_KEY = process.env.SIMON_API_KEY;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('x-api-key');
  return authHeader === API_KEY && !!API_KEY;
}

// Add a contributor to the worked_by list if not already present
function addContributor(workedByJson: string | null, contributor: string): string {
  const workedBy: string[] = workedByJson ? JSON.parse(workedByJson) : [];
  if (!workedBy.includes(contributor)) {
    workedBy.push(contributor);
  }
  return JSON.stringify(workedBy);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Get current task for activity logging
    const oldTask = await getTask(id);
    if (!oldTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // Determine the actor making this change
    // Allow explicit agent identification via X-Agent header, otherwise infer from auth
    const agentHeader = request.headers.get('x-agent');
    const actor = agentHeader || (isAuthorized(request) ? 'Simon' : 'Bogdan');
    
    // Get project reviewer (if task belongs to a project)
    let reviewer = 'Bogdan'; // default
    if (oldTask.project_id) {
      const project = await getProject(oldTask.project_id);
      if (project?.reviewer) {
        reviewer = project.reviewer;
      }
    }
    
    // Auto-assign based on status transitions
    if (body.status && body.status !== oldTask.status) {
      if (body.status === 'in_review') {
        // in_review → project reviewer (or Bogdan if no project)
        body.assignee = reviewer;
      } else if ((body.status === 'todo' || body.status === 'in_progress') && oldTask.assignee === reviewer) {
        // Reviewer moving task back to todo/in_progress → Simon (default agent)
        body.assignee = 'Simon';
      }
      // done → keep current assignee
      
      // Track who worked on the task: add to worked_by for any work-related status transition
      // This includes: in_progress (starting), testing (submitting), in_review (submitting), done (completing)
      if (['in_progress', 'testing', 'in_review', 'done'].includes(body.status)) {
        // The actor is the one doing the work
        body.worked_by = addContributor(oldTask.worked_by, actor);
      }
    }
    
    const task = await updateTask(id, body);
    if (!task) {
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }
    
    // Log activity for each changed field
    for (const field of Object.keys(body)) {
      const oldValue = String(oldTask[field as keyof typeof oldTask] ?? '');
      const newValue = String(body[field] ?? '');
      if (oldValue !== newValue) {
        await logActivity({
          id: uuidv4(),
          task_id: id,
          action: 'updated',
          field_changed: field,
          old_value: oldValue,
          new_value: newValue,
          actor,
        });
      }
    }
    
    // Send webhook for ALL task updates so Simon stays in sync
    const isCompleted = body.status === 'done';
    await sendWebhook({
      event: isCompleted ? 'task.completed' : 'task.updated',
      task: task,
    });
    
    return NextResponse.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get task before deleting for webhook
    const task = await getTask(id);
    
    const success = await deleteTask(id);
    if (!success) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // Send webhook for deletion
    if (task) {
      await sendWebhook({
        event: 'task.deleted',
        task: task,
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
