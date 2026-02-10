import { WorkflowNode, WorkflowEdge } from './db';

// Node count limits
const NODE_WARN_THRESHOLD = 30;
const NODE_SOFT_LIMIT = 50;
const NODE_HARD_LIMIT = 100;

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validate a workflow's structure, checking for:
 * - Required start/end nodes
 * - DAG structure (no cycles)
 * - All nodes reachable from start
 * - All paths reach end
 * - Valid condition expressions
 * - Node count limits
 * - Edge connectivity
 */
export function validateWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check node count limits
  if (nodes.length > NODE_HARD_LIMIT) {
    errors.push({
      type: 'error',
      message: `Workflow has ${nodes.length} nodes, exceeding the hard limit of ${NODE_HARD_LIMIT}`,
    });
    return { valid: false, errors, warnings };
  }
  if (nodes.length > NODE_SOFT_LIMIT) {
    errors.push({
      type: 'error',
      message: `Workflow has ${nodes.length} nodes, exceeding the soft limit of ${NODE_SOFT_LIMIT}`,
    });
  }
  if (nodes.length > NODE_WARN_THRESHOLD) {
    warnings.push({
      type: 'warning',
      message: `Workflow has ${nodes.length} nodes. Consider simplifying (recommended max: ${NODE_WARN_THRESHOLD})`,
    });
  }

  // Check for start node
  const startNodes = nodes.filter(n => n.type === 'start');
  if (startNodes.length === 0) {
    errors.push({ type: 'error', message: 'Workflow must have a start node' });
  } else if (startNodes.length > 1) {
    errors.push({ type: 'error', message: 'Workflow must have exactly one start node' });
  }

  // Check for end node
  const endNodes = nodes.filter(n => n.type === 'end');
  if (endNodes.length === 0) {
    errors.push({ type: 'error', message: 'Workflow must have at least one end node' });
  }

  // If no start or end nodes, can't validate further
  if (startNodes.length !== 1 || endNodes.length === 0) {
    return { valid: errors.filter(e => e.type === 'error').length === 0, errors, warnings };
  }

  const nodeIds = new Set(nodes.map(n => n.id));

  // Check edge validity - all edges reference existing nodes
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        type: 'error',
        message: `Edge "${edge.id}" references non-existent source node "${edge.source}"`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        type: 'error',
        message: `Edge "${edge.id}" references non-existent target node "${edge.target}"`,
      });
    }
  }

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
  }

  // Check for cycles using DFS with coloring
  const cycleDetected = detectCycles(nodes, adjacency);
  if (cycleDetected) {
    errors.push({ type: 'error', message: 'Workflow contains a cycle - must be a DAG' });
  }

  // Check reachability from start
  const startId = startNodes[0].id;
  const reachableFromStart = getReachableNodes(startId, adjacency);
  for (const node of nodes) {
    if (node.type !== 'start' && !reachableFromStart.has(node.id)) {
      warnings.push({
        type: 'warning',
        message: `Node "${node.data.label || node.id}" is not reachable from start`,
        nodeId: node.id,
      });
    }
  }

  // Check that all non-end nodes have at least one outgoing edge
  for (const node of nodes) {
    if (node.type === 'end') continue;
    const outgoing = adjacency.get(node.id) || [];
    if (outgoing.length === 0) {
      errors.push({
        type: 'error',
        message: `Node "${node.data.label || node.id}" has no outgoing edges (dead end)`,
        nodeId: node.id,
      });
    }
  }

  // Check that end nodes have no outgoing edges
  for (const endNode of endNodes) {
    const outgoing = adjacency.get(endNode.id) || [];
    if (outgoing.length > 0) {
      errors.push({
        type: 'error',
        message: `End node "${endNode.data.label || endNode.id}" should not have outgoing edges`,
        nodeId: endNode.id,
      });
    }
  }

  // Check start node has no incoming edges
  const incomingToStart = edges.filter(e => e.target === startId);
  if (incomingToStart.length > 0) {
    errors.push({
      type: 'error',
      message: 'Start node should not have incoming edges',
      nodeId: startId,
    });
  }

  // Validate condition nodes
  const conditionNodes = nodes.filter(n => n.type === 'condition');
  for (const node of conditionNodes) {
    if (!node.data.condition) {
      errors.push({
        type: 'error',
        message: `Condition node "${node.data.label || node.id}" has no condition expression`,
        nodeId: node.id,
      });
    } else {
      const condErrors = validateConditionExpression(node.data.condition);
      for (const msg of condErrors) {
        errors.push({ type: 'error', message: msg, nodeId: node.id });
      }
    }

    // Condition nodes should have exactly 2 outgoing edges (true/false)
    const outgoing = edges.filter(e => e.source === node.id);
    const trueEdge = outgoing.find(e => e.sourceHandle === 'true');
    const falseEdge = outgoing.find(e => e.sourceHandle === 'false');
    if (!trueEdge) {
      errors.push({
        type: 'error',
        message: `Condition node "${node.data.label || node.id}" is missing a "true" branch`,
        nodeId: node.id,
      });
    }
    if (!falseEdge) {
      errors.push({
        type: 'error',
        message: `Condition node "${node.data.label || node.id}" is missing a "false" branch`,
        nodeId: node.id,
      });
    }
  }

  // Validate instruction nodes have instructions
  const instructionNodes = nodes.filter(n => n.type === 'instruction');
  for (const node of instructionNodes) {
    if (!node.data.instructions || node.data.instructions.trim() === '') {
      warnings.push({
        type: 'warning',
        message: `Instruction node "${node.data.label || node.id}" has no instructions`,
        nodeId: node.id,
      });
    }
  }

  const hasErrors = errors.filter(e => e.type === 'error').length > 0;
  return { valid: !hasErrors, errors, warnings };
}

/**
 * Detect cycles in the graph using DFS with 3-color marking
 */
function detectCycles(
  nodes: WorkflowNode[],
  adjacency: Map<string, string[]>
): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of nodes) {
    color.set(node.id, WHITE);
  }

  function dfs(nodeId: string): boolean {
    color.set(nodeId, GRAY);
    for (const neighbor of adjacency.get(nodeId) || []) {
      if (color.get(neighbor) === GRAY) return true; // Back edge = cycle
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
    }
    color.set(nodeId, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.id) === WHITE) {
      if (dfs(node.id)) return true;
    }
  }
  return false;
}

/**
 * Get all nodes reachable from a given start node via BFS
 */
function getReachableNodes(
  startId: string,
  adjacency: Map<string, string[]>
): Set<string> {
  const visited = new Set<string>();
  const queue = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

// Allowed field prefixes for condition expressions
const ALLOWED_PREFIXES = ['task.', 'run.', 'variable.'];

// Allowed comparison operators
const ALLOWED_OPERATORS = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith', 'endsWith'];

/**
 * Validate a condition expression string.
 * Supported format: "field.path operator value"
 * Examples:
 *   task.status == 'done'
 *   run.output_tokens > 1000
 *   variable.retryCount >= 3
 *   task.title contains 'API'
 */
export function validateConditionExpression(expr: string): string[] {
  const errors: string[] = [];
  const trimmed = expr.trim();

  if (!trimmed) {
    errors.push('Condition expression is empty');
    return errors;
  }

  // Parse: field operator value
  const parts = parseConditionExpression(trimmed);
  if (!parts) {
    errors.push(`Invalid condition syntax: "${trimmed}". Expected format: "field operator value"`);
    return errors;
  }

  const { field, operator } = parts;

  // Validate field prefix
  const hasValidPrefix = ALLOWED_PREFIXES.some(p => field.startsWith(p));
  if (!hasValidPrefix) {
    errors.push(
      `Invalid field "${field}". Must start with one of: ${ALLOWED_PREFIXES.join(', ')}`
    );
  }

  // Validate operator
  if (!ALLOWED_OPERATORS.includes(operator)) {
    errors.push(
      `Invalid operator "${operator}". Allowed: ${ALLOWED_OPERATORS.join(', ')}`
    );
  }

  return errors;
}

export interface ParsedCondition {
  field: string;
  operator: string;
  value: string;
}

/**
 * Parse a condition expression into its components.
 * Returns null if the expression can't be parsed.
 */
export function parseConditionExpression(expr: string): ParsedCondition | null {
  const trimmed = expr.trim();

  // Try multi-char operators first (>=, <=, !=, ==) then single-char (>, <)
  // Also try word operators (contains, startsWith, endsWith)
  for (const op of ['>=', '<=', '!=', '==', '>', '<', 'contains', 'startsWith', 'endsWith']) {
    const idx = trimmed.indexOf(` ${op} `);
    if (idx !== -1) {
      const field = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + op.length + 2).trim();
      if (field && value) {
        return { field, operator: op, value };
      }
    }
  }

  return null;
}

/**
 * Evaluate a condition expression against runtime context.
 * Returns true/false based on the condition.
 */
export function evaluateCondition(
  expr: string,
  context: {
    task: Record<string, unknown>;
    run: Record<string, unknown>;
    variables: Record<string, unknown>;
  }
): boolean {
  const parsed = parseConditionExpression(expr);
  if (!parsed) return false;

  const { field, operator, value } = parsed;

  // Resolve field value from context
  const fieldValue = resolveField(field, context);

  // Parse the comparison value (strip quotes for strings)
  const compValue = parseValue(value);

  return compare(fieldValue, operator, compValue);
}

function resolveField(
  field: string,
  context: { task: Record<string, unknown>; run: Record<string, unknown>; variables: Record<string, unknown> }
): unknown {
  const [prefix, ...rest] = field.split('.');
  const path = rest.join('.');

  let obj: Record<string, unknown>;
  switch (prefix) {
    case 'task':
      obj = context.task;
      break;
    case 'run':
      obj = context.run;
      break;
    case 'variable':
      obj = context.variables;
      break;
    default:
      return undefined;
  }

  // Simple dot-path resolution
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function parseValue(value: string): unknown {
  // String literal (quoted)
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Null
  if (value === 'null') return null;
  // Number
  const num = Number(value);
  if (!isNaN(num)) return num;
  // Raw string (unquoted)
  return value;
}

function compare(fieldValue: unknown, operator: string, compValue: unknown): boolean {
  switch (operator) {
    case '==':
      return fieldValue == compValue;
    case '!=':
      return fieldValue != compValue;
    case '>':
      return Number(fieldValue) > Number(compValue);
    case '<':
      return Number(fieldValue) < Number(compValue);
    case '>=':
      return Number(fieldValue) >= Number(compValue);
    case '<=':
      return Number(fieldValue) <= Number(compValue);
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(String(compValue));
    case 'startsWith':
      return typeof fieldValue === 'string' && fieldValue.startsWith(String(compValue));
    case 'endsWith':
      return typeof fieldValue === 'string' && fieldValue.endsWith(String(compValue));
    default:
      return false;
  }
}
