import type { WorkflowNode, WorkflowEdge } from '../types/workflow.js';

export const STEP_MARKER_PREFIX = '[[WORKFLOW_STEP]]';
export const STEP_COMPLETE_PREFIX = '[[WORKFLOW_STEP_COMPLETE]]';

export interface WorkflowVersionData {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export function serializeWorkflowToPrompt(
  version: WorkflowVersionData,
  completedNodeIds?: string[]
): string {
  const { nodes, edges } = version;

  if (nodes.length === 0) return '';

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const adjacency = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge);
  }

  const startNode = nodes.find(n => n.type === 'start');
  if (!startNode) return '';

  const completedNodes = new Set(completedNodeIds || []);

  const lines: string[] = [];
  lines.push('## Workflow Instructions');
  lines.push('');
  lines.push('Follow these steps in order. Mark each step when you start and complete it.');
  lines.push('');

  let stepNum = 1;
  const visited = new Set<string>();
  const queue: string[] = [];

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
        continue;
      }
    }

    const nodeEdges = adjacency.get(nodeId) || [];
    for (const edge of nodeEdges) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  return lines.join('\n');
}

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
