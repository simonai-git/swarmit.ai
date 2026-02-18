import type { PrismaClient } from '@swarmit/db';
import type { WorkflowNode, WorkflowEdge, ProjectContext } from '@swarmit/shared';
import { serializeWorkflowToPrompt, parseStepMarkers } from '@swarmit/shared';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('workflow-runner');

interface WorkflowContext {
  runId: string;
  workflowVersionId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  executionStateId: string;
  completedNodes: string[];
}

/**
 * Initialize workflow execution state if the agent has a workflow assigned.
 */
export async function initWorkflow(
  prisma: PrismaClient,
  runId: string,
  agent: {
    agentWorkflows: Array<{
      workflow: {
        versions: Array<{ id: string; nodes: unknown; edges: unknown }>;
      };
    }>;
  }
): Promise<WorkflowContext | null> {
  // Get the latest published workflow version
  const agentWorkflow = agent.agentWorkflows?.[0];
  if (!agentWorkflow) return null;

  const latestVersion = agentWorkflow.workflow.versions[0];
  if (!latestVersion) return null;

  const nodes = latestVersion.nodes as WorkflowNode[];
  const edges = latestVersion.edges as WorkflowEdge[];

  if (nodes.length === 0) return null;

  // Create execution state record
  const state = await prisma.workflowExecutionState.create({
    data: {
      runId,
      workflowVersionId: latestVersion.id,
      completedNodes: [],
      variables: {},
      status: 'RUNNING',
    },
  });

  logger.info({ runId, workflowVersionId: latestVersion.id }, 'Workflow execution initialized');

  return {
    runId,
    workflowVersionId: latestVersion.id,
    nodes,
    edges,
    executionStateId: state.id,
    completedNodes: [],
  };
}

/**
 * Generate the workflow prompt injection for the agent's system prompt.
 */
export function getWorkflowPrompt(ctx: WorkflowContext, projectContext?: ProjectContext): string {
  return serializeWorkflowToPrompt(
    { nodes: ctx.nodes, edges: ctx.edges },
    ctx.completedNodes,
    projectContext
  );
}

/**
 * Process agent output for workflow step markers and update execution state.
 */
export async function processWorkflowOutput(
  prisma: PrismaClient,
  ctx: WorkflowContext,
  output: string
): Promise<void> {
  const { started, completed } = parseStepMarkers(output);

  const nodeMap = new Map(ctx.nodes.map(n => [n.id, n]));

  // Record started steps
  for (const nodeId of started) {
    const node = nodeMap.get(nodeId);
    await prisma.workflowExecutionEvent.create({
      data: {
        executionStateId: ctx.executionStateId,
        nodeId,
        type: 'step_started',
        nodeLabel: node?.data.label,
        data: { timestamp: new Date().toISOString() },
      },
    });

    await prisma.workflowExecutionState.update({
      where: { id: ctx.executionStateId },
      data: { currentNodeId: nodeId },
    });
  }

  // Record completed steps
  for (const nodeId of completed) {
    if (!ctx.completedNodes.includes(nodeId)) {
      ctx.completedNodes.push(nodeId);
    }

    const node = nodeMap.get(nodeId);
    await prisma.workflowExecutionEvent.create({
      data: {
        executionStateId: ctx.executionStateId,
        nodeId,
        type: 'step_completed',
        nodeLabel: node?.data.label,
        data: { timestamp: new Date().toISOString() },
      },
    });

    await prisma.workflowExecutionState.update({
      where: { id: ctx.executionStateId },
      data: {
        completedNodes: ctx.completedNodes,
      },
    });
  }
}

/**
 * Finalize workflow execution state.
 */
export async function finalizeWorkflow(
  prisma: PrismaClient,
  ctx: WorkflowContext,
  status: 'COMPLETED' | 'FAILED'
): Promise<void> {
  await prisma.workflowExecutionState.update({
    where: { id: ctx.executionStateId },
    data: { status, currentNodeId: null },
  });

  logger.info(
    { executionStateId: ctx.executionStateId, status, completedSteps: ctx.completedNodes.length },
    'Workflow execution finalized'
  );
}
