import { NextRequest, NextResponse } from 'next/server';
import { 
  getProject, 
  updateProject, 
  deleteProject, 
  getTasksByProjectId,
  startProject,
  pauseProject,
  resumeProject,
  cancelProject,
  completeProject
} from '@/lib/db';

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
        case 'start':
          result = await startProject(id);
          if (!result) {
            return NextResponse.json({ error: 'Cannot start project (must be in defined status)' }, { status: 400 });
          }
          break;
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
