import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects, createProject, getProjectsByStatus, ProjectStatus } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as ProjectStatus | null;
    
    const projects = status 
      ? await getProjectsByStatus(status)
      : await getAllProjects();
    
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    
    const project = await createProject({
      id: uuidv4(),
      title: body.title,
      description: body.description || null,
      status: body.status || 'defined',
      owner: body.owner || 'Bogdan',
      prd: body.prd || null,
      goals: body.goals || null,
      requirements: body.requirements || null,
      constraints: body.constraints || null,
      tech_stack: body.tech_stack || null,
      timeline: body.timeline || null,
      deadline: body.deadline || null,
    });
    
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
