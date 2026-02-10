import {
  WorkflowEdge,
  WorkflowVersion,
  WorkflowExecutionState,
  getWorkflowExecutionState,
  createWorkflowExecutionState,
  updateWorkflowExecutionState,
  appendWorkflowEvent,
  getWorkflowVersion,
} from './db';
import { evaluateCondition } from './workflow-validation';

/**
 * Machine-parseable step marker format for agent output.
 * Agents emit these so the executor can track progress.
 */
export const STEP_MARKER_PREFIX = '[[WORKFLOW_STEP]]';
export const STEP_COMPLETE_PREFIX = '[[WORKFLOW_STEP_COMPLETE]]';

/**
 * Serialize a workflow version into agent prompt instructions.
 * Converts the DAG into a step-by-step instruction set that the LLM follows.
 */
export function serializeWorkflowToPrompt(
  version: WorkflowVersion,
  executionState?: WorkflowExecutionState | null
): string {
  const { nodes, edges } = version;

  if (nodes.length === 0) return '';

  // Build adjacency and find start node
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const adjacency = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge);
  }

  const startNode = nodes.find(n => n.type === 'start');
  if (!startNode) return '';

  // Determine completed nodes from execution state
  const completedNodes = new Set(executionState?.completed_nodes || []);

  // Topological walk to build ordered instructions
  const lines: string[] = [];
  lines.push('## Workflow Instructions');
  lines.push('');
  lines.push('Follow these steps in order. Mark each step when you start and complete it.');
  lines.push('');

  let stepNum = 1;
  const visited = new Set<string>();
  const queue: string[] = [];

  // Start from start node's successors
  const startEdges = adjacency.get(startNode.id) || [];
  for (const edge of startEdges) {
    queue.push(edge.target);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const isCompleted = completedNodes.has(nodeId);

    switch (node.type) {
      case 'instruction': {
        const status = isCompleted ? '[COMPLETED]' : '[PENDING]';
        lines.push(`### Step ${stepNum}: ${node.data.label} ${status}`);
        if (node.data.instructions) {
          lines.push('');
          lines.push(node.data.instructions);
        }
        lines.push('');
        if (!isCompleted) {
          lines.push(`When starting this step, output: ${STEP_MARKER_PREFIX} ${nodeId}`);
          lines.push(`When done, output: ${STEP_COMPLETE_PREFIX} ${nodeId}`);
        }
        lines.push('');
        stepNum++;
        break;
      }
      case 'condition': {
        lines.push(`### Decision Point: ${node.data.label}`);
        lines.push(`Condition: \`${node.data.condition}\``);
        lines.push('');
        // Don't increment stepNum for conditions - they're decision points
        break;
      }
      case 'checkpoint': {
        const status = isCompleted ? '[REACHED]' : '[PENDING]';
        lines.push(`### Checkpoint: ${node.data.label} ${status}`);
        lines.push('');
        break;
      }
      case 'end': {
        lines.push('### Workflow Complete');
        lines.push('All steps have been executed. Summarize results.');
        lines.push('');
        continue; // Don't add end node's successors
      }
    }

    // Add successors to queue
    const nodeEdges = adjacency.get(nodeId) || [];
    for (const edge of nodeEdges) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Initialize workflow execution for a new agent run.
 * Creates execution state pointing to the first instruction after start.
 */
export async function initializeExecution(
  runId: string,
  taskId: string,
  workflowVersionId: string
): Promise<WorkflowExecutionState | null> {
  const version = await getWorkflowVersion(workflowVersionId);
  if (!version) return null;

  const startNode = version.nodes.find(n => n.type === 'start');
  if (!startNode) return null;

  // Find first node after start
  const firstEdge = version.edges.find(e => e.source === startNode.id);
  const firstNodeId = firstEdge?.target || startNode.id;

  const stateId = `wes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const state = await createWorkflowExecutionState({
    id: stateId,
    run_id: runId,
    task_id: taskId,
    workflow_version_id: workflowVersionId,
    current_node_id: firstNodeId,
  });

  // Emit start event
  await appendWorkflowEvent({
    run_id: runId,
    task_id: taskId,
    node_id: startNode.id,
    event_type: 'step_started',
    node_label: 'Workflow Started',
  });

  return state;
}

/**
 * Advance the workflow execution when a step is completed.
 * Evaluates conditions deterministically and moves to the next node.
 */
export async function advanceExecution(
  runId: string,
  completedNodeId: string,
  context: {
    task: Record<string, unknown>;
    run: Record<string, unknown>;
    variables: Record<string, unknown>;
  }
): Promise<{
  nextNodeId: string | null;
  isComplete: boolean;
  promptAddendum?: string;
} | null> {
  const state = await getWorkflowExecutionState(runId);
  if (!state || state.status !== 'running') return null;

  const version = await getWorkflowVersion(state.workflow_version_id);
  if (!version) return null;

  const nodeMap = new Map(version.nodes.map(n => [n.id, n]));
  const completedNode = nodeMap.get(completedNodeId);
  if (!completedNode) return null;

  // Mark node as completed
  const completedNodes = [...state.completed_nodes, completedNodeId];

  // Emit step_completed event
  await appendWorkflowEvent({
    run_id: runId,
    task_id: state.task_id,
    node_id: completedNodeId,
    event_type: 'step_completed',
    node_label: completedNode.data.label || completedNodeId,
  });

  // Find outgoing edges from completed node
  const outEdges = version.edges.filter(e => e.source === completedNodeId);

  if (outEdges.length === 0) {
    // Dead end - mark as complete
    await updateWorkflowExecutionState(runId, {
      completed_nodes: completedNodes,
      status: 'completed',
    });
    return { nextNodeId: null, isComplete: true };
  }

  // Determine next node
  let nextNodeId: string;

  if (outEdges.length === 1) {
    nextNodeId = outEdges[0].target;
  } else {
    // Multiple edges - likely a condition node downstream, or need to evaluate
    // If current node IS a condition, evaluate it
    if (completedNode.type === 'condition' && completedNode.data.condition) {
      const result = evaluateCondition(completedNode.data.condition, context);
      const branchHandle = result ? 'true' : 'false';
      const selectedEdge = outEdges.find(e => e.sourceHandle === branchHandle);

      await appendWorkflowEvent({
        run_id: runId,
        task_id: state.task_id,
        node_id: completedNodeId,
        event_type: 'condition_evaluated',
        node_label: completedNode.data.label || completedNodeId,
        details: { condition: completedNode.data.condition, result, branch: branchHandle },
      });

      nextNodeId = selectedEdge?.target || outEdges[0].target;
    } else {
      // Non-condition with multiple edges - take the first
      nextNodeId = outEdges[0].target;
    }
  }

  const nextNode = nodeMap.get(nextNodeId);

  // Check if next node is an end node
  if (nextNode?.type === 'end') {
    await updateWorkflowExecutionState(runId, {
      completed_nodes: completedNodes,
      current_node_id: nextNodeId,
      status: 'completed',
    });
    return { nextNodeId, isComplete: true };
  }

  // If next node is a condition, auto-advance through it
  if (nextNode?.type === 'condition') {
    await updateWorkflowExecutionState(runId, {
      completed_nodes: completedNodes,
      current_node_id: nextNodeId,
    });
    // Recursively advance through the condition
    return advanceExecution(runId, nextNodeId, context);
  }

  // If next node is a checkpoint, emit event and auto-advance
  if (nextNode?.type === 'checkpoint') {
    await appendWorkflowEvent({
      run_id: runId,
      task_id: state.task_id,
      node_id: nextNodeId,
      event_type: 'checkpoint_reached',
      node_label: nextNode.data.label || nextNodeId,
    });
    await updateWorkflowExecutionState(runId, {
      completed_nodes: [...completedNodes, nextNodeId],
      current_node_id: nextNodeId,
    });
    // Continue advancing past the checkpoint
    return advanceExecution(runId, nextNodeId, context);
  }

  // Update state to next instruction node
  await updateWorkflowExecutionState(runId, {
    completed_nodes: completedNodes,
    current_node_id: nextNodeId,
    variables: context.variables,
  });

  // Emit step_started for the next node
  if (nextNode) {
    await appendWorkflowEvent({
      run_id: runId,
      task_id: state.task_id,
      node_id: nextNodeId,
      event_type: 'step_started',
      node_label: nextNode.data.label || nextNodeId,
    });
  }

  // Build prompt addendum for the next step
  let promptAddendum: string | undefined;
  if (nextNode?.type === 'instruction' && nextNode.data.instructions) {
    promptAddendum = [
      `\n## Current Workflow Step: ${nextNode.data.label}`,
      nextNode.data.instructions,
      `When done, output: ${STEP_COMPLETE_PREFIX} ${nextNodeId}`,
    ].join('\n');
  }

  return { nextNodeId, isComplete: false, promptAddendum };
}

/**
 * Parse step markers from agent output to detect workflow step transitions.
 */
export function parseStepMarkers(output: string): {
  started: string[];
  completed: string[];
} {
  const started: string[] = [];
  const completed: string[] = [];

  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(STEP_MARKER_PREFIX)) {
      const nodeId = trimmed.slice(STEP_MARKER_PREFIX.length).trim();
      if (nodeId) started.push(nodeId);
    }
    if (trimmed.startsWith(STEP_COMPLETE_PREFIX)) {
      const nodeId = trimmed.slice(STEP_COMPLETE_PREFIX.length).trim();
      if (nodeId) completed.push(nodeId);
    }
  }

  return { started, completed };
}
