import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  publishWorkflowVersion,
  getWorkflowVersions,
  getAgentsByWorkflow,
  removeAgentWorkflow,
} from '@/lib/db';
import { validateWorkflow } from '@/lib/workflow-validation';

function isWorkflowsEnabled(): boolean {
  return process.env.FEATURE_WORKFLOWS === 'true';
}

// GET /api/workflows/:id - Get a specific workflow with versions
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

    const workflow = await getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
    if (workflow.user_email !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const includeVersions = searchParams.get('include_versions') === 'true';
    const includeAgents = searchParams.get('include_agents') === 'true';

    const result: Record<string, unknown> = { ...workflow };
    if (includeVersions) {
      result.versions = await getWorkflowVersions(id);
    }
    if (includeAgents) {
      result.agents = await getAgentsByWorkflow(id);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching workflow:', error);
    return NextResponse.json({ error: 'Failed to fetch workflow' }, { status: 500 });
  }
}

// PATCH /api/workflows/:id - Update workflow or perform actions
export async function PATCH(
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

    const workflow = await getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
    if (workflow.user_email !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Action: publish
    if (body.action === 'publish') {
      // Validate workflow before publishing
      const validation = validateWorkflow(workflow.nodes, workflow.edges);
      if (!validation.valid) {
        return NextResponse.json({
          error: 'Workflow validation failed',
          validation,
        }, { status: 400 });
      }

      const version = await publishWorkflowVersion(id, session.user.email);
      if (!version) {
        return NextResponse.json({ error: 'Failed to publish workflow' }, { status: 500 });
      }

      return NextResponse.json({
        version,
        warnings: validation.warnings,
      });
    }

    // Action: validate (dry-run validation without publishing)
    if (body.action === 'validate') {
      const nodesToValidate = body.nodes || workflow.nodes;
      const edgesToValidate = body.edges || workflow.edges;
      const validation = validateWorkflow(nodesToValidate, edgesToValidate);
      return NextResponse.json(validation);
    }

    // Regular update - requires lock_version for optimistic concurrency
    if (body.lock_version === undefined) {
      return NextResponse.json({
        error: 'lock_version is required for updates',
      }, { status: 400 });
    }

    const updated = await updateWorkflow(id, {
      name: body.name,
      description: body.description,
      nodes: body.nodes,
      edges: body.edges,
    }, body.lock_version);

    if (!updated) {
      return NextResponse.json({
        error: 'Conflict: workflow was modified by another session. Please refresh and try again.',
      }, { status: 409 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating workflow:', error);
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
  }
}

// DELETE /api/workflows/:id - Delete a workflow
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

    const workflow = await getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
    if (workflow.user_email !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if any agents are using this workflow
    const agents = await getAgentsByWorkflow(id);
    if (agents.length > 0) {
      // Remove workflow assignments from agents
      for (const agent of agents) {
        await removeAgentWorkflow(agent.agent_id);
      }
    }

    const deleted = await deleteWorkflow(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 });
    }

    return NextResponse.json({ success: true, unassigned_agents: agents.length });
  } catch (error) {
    console.error('Error deleting workflow:', error);
    return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 });
  }
}
