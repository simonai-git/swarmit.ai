import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getProject,
  updateProject,
  deleteProject,
  getTasksByProjectId,
  startProject,
  pauseProject,
  resumeProject,
  cancelProject,
  completeProject,
  createTask,
  getAutomationUserEmail
} from '@/lib/db';
import { onTaskCreated } from '@/lib/task-lifecycle';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const includeTasks = searchParams.get('include_tasks') === 'true';
    
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    if (includeTasks) {
      const tasks = await getTasksByProjectId(id);
      return NextResponse.json({ ...project, tasks });
    }
    
    return NextResponse.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Check if this is a lifecycle action
    if (body.action) {
      let result;
      switch (body.action) {
        case 'start': {
          result = await startProject(id);
          if (!result) {
            return NextResponse.json({ error: 'Cannot start project (must be in defined status)' }, { status: 400 });
          }
          // Create PM planning task for the project
          const session = await getServerSession(authOptions);
          const userEmail = session?.user?.email || await getAutomationUserEmail() || null;
          const pmTaskId = uuidv4();
          const deployPrefs: string[] = [];
          if (result.deploy_to_railway) deployPrefs.push('Deploy to Railway is ENABLED - create a deployment task assigned to Jordan.');
          if (result.push_to_github) deployPrefs.push('Push to GitHub is ENABLED - include GitHub push in deployment tasks.');
          if (!result.deploy_to_railway && !result.push_to_github) deployPrefs.push('No deployment or GitHub integration requested - skip deployment tasks.');
          const pmTask = await createTask({
            id: pmTaskId,
            title: `[PM] Plan: ${result.title}`,
            description: `Analyze project requirements and create all tasks needed to deliver: ${result.title}\n\n## Deployment Preferences\n${deployPrefs.join('\n')}`,
            status: 'todo',
            assignee: result.product_manager || 'Sam',
            priority: 'high',
            project_id: id,
            user_email: userEmail,
          });
          // Trigger lifecycle automation (enqueues PM agent)
          onTaskCreated(pmTask, userEmail || undefined).catch(err =>
            console.error('[Project] Failed to trigger PM task lifecycle:', err)
          );
          break;
        }
        case 'pause':
          result = await pauseProject(id);
          if (!result) {
            return NextResponse.json({ error: 'Cannot pause project (must be in_progress)' }, { status: 400 });
          }
          break;
        case 'resume':
          result = await resumeProject(id);
          if (!result) {
            return NextResponse.json({ error: 'Cannot resume project (must be paused)' }, { status: 400 });
          }
          break;
        case 'cancel':
          result = await cancelProject(id);
          if (!result) {
            return NextResponse.json({ error: 'Cannot cancel project' }, { status: 400 });
          }
          break;
        case 'complete':
          result = await completeProject(id);
          if (!result) {
            return NextResponse.json({ error: 'Cannot complete project (must be in_progress)' }, { status: 400 });
          }
          break;
        default:
          return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
      }
      return NextResponse.json(result);
    }
    
    // Regular update
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    const updated = await updateProject(id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }
    
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const success = await deleteProject(id);
    if (!success) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
