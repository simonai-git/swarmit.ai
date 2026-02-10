import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createWorkflow, getWorkflowsByUser } from '@/lib/db';

// Feature flag check
function isWorkflowsEnabled(): boolean {
  return process.env.FEATURE_WORKFLOWS === 'true';
}

// GET /api/workflows - List workflows for the current user
export async function GET(_request: NextRequest) {
  if (!isWorkflowsEnabled()) {
    return NextResponse.json({ error: 'Workflows feature is not enabled' }, { status: 404 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workflows = await getWorkflowsByUser(session.user.email);
    return NextResponse.json(workflows);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}

// POST /api/workflows - Create a new workflow
export async function POST(request: NextRequest) {
  if (!isWorkflowsEnabled()) {
    return NextResponse.json({ error: 'Workflows feature is not enabled' }, { status: 404 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const workflow = await createWorkflow({
      id: uuidv4(),
      name: body.name,
      description: body.description || null,
      nodes: body.nodes || [],
      edges: body.edges || [],
      user_email: session.user.email,
    });

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    console.error('Error creating workflow:', error);
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
  }
}
