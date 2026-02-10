import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getAgent,
  updateAgent,
  getAgentWorkflow,
  setAgentWorkflow,
  removeAgentWorkflow,
  getWorkflow,
  getWorkflowVersion,
} from '@/lib/db';

function isWorkflowsEnabled(): boolean {
  return process.env.FEATURE_WORKFLOWS === 'true';
}

// GET /api/agents/:id/workflow - Get agent's assigned workflow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isWorkflowsEnabled()) {
    return NextResponse.json({ error: 'Workflows feature is not enabled' }, { status: 404 });
  }

  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agent = await getAgent(id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const agentWorkflow = await getAgentWorkflow(id);
    if (!agentWorkflow) {
      return NextResponse.json({ workflow: null, requires_workflow: agent.requires_workflow });
    }

    // Include the version details
    const version = await getWorkflowVersion(agentWorkflow.workflow_version_id);

    return NextResponse.json({
      ...agentWorkflow,
      version,
      requires_workflow: agent.requires_workflow,
    });
  } catch (error) {
    console.error('Error fetching agent workflow:', error);
    return NextResponse.json({ error: 'Failed to fetch agent workflow' }, { status: 500 });
  }
}

// PUT /api/agents/:id/workflow - Set agent's workflow
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isWorkflowsEnabled()) {
    return NextResponse.json({ error: 'Workflows feature is not enabled' }, { status: 404 });
  }

  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agent = await getAgent(id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const body = await request.json();

    // Handle requires_workflow flag update
    if (body.requires_workflow !== undefined) {
      await updateAgent(id, { requires_workflow: body.requires_workflow } as Parameters<typeof updateAgent>[1]);
    }

    // Handle workflow assignment
    if (body.workflow_id) {
      const workflow = await getWorkflow(body.workflow_id);
      if (!workflow) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
      }

      // Use specified version or latest published version
      const versionId = body.workflow_version_id || workflow.published_version_id;
      if (!versionId) {
        return NextResponse.json({
          error: 'Workflow has no published version. Publish the workflow first.',
        }, { status: 400 });
      }

      const version = await getWorkflowVersion(versionId);
      if (!version) {
        return NextResponse.json({ error: 'Workflow version not found' }, { status: 404 });
      }

      const agentWorkflow = await setAgentWorkflow(
        id,
        body.workflow_id,
        versionId,
        session.user.email
      );

      return NextResponse.json(agentWorkflow);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error setting agent workflow:', error);
    return NextResponse.json({ error: 'Failed to set agent workflow' }, { status: 500 });
  }
}

// DELETE /api/agents/:id/workflow - Remove agent's workflow
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isWorkflowsEnabled()) {
    return NextResponse.json({ error: 'Workflows feature is not enabled' }, { status: 404 });
  }

  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agent = await getAgent(id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    await removeAgentWorkflow(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing agent workflow:', error);
    return NextResponse.json({ error: 'Failed to remove agent workflow' }, { status: 500 });
  }
}
