import { describe, it, expect } from 'vitest';
import {
  validateWorkflow,
  validateConditionExpression,
  parseConditionExpression,
  evaluateCondition,
} from '@/lib/workflow-validation';
import type { WorkflowNode, WorkflowEdge } from '@/lib/db';

function makeNode(id: string, type: WorkflowNode['type'], label: string, extra?: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label, ...extra },
  };
}

function makeEdge(source: string, target: string, sourceHandle?: string): WorkflowEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  };
}

describe('validateWorkflow', () => {
  it('should validate a minimal valid workflow (start → end)', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [makeEdge('start-1', 'end-1')];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate a workflow with instruction steps', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('step-1', 'instruction', 'Step 1', { instructions: 'Do something' }),
      makeNode('step-2', 'instruction', 'Step 2', { instructions: 'Do more' }),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [
      makeEdge('start-1', 'step-1'),
      makeEdge('step-1', 'step-2'),
      makeEdge('step-2', 'end-1'),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true);
  });

  it('should error when no start node', () => {
    const nodes = [makeNode('end-1', 'end', 'End')];
    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('start node'))).toBe(true);
  });

  it('should error when no end node', () => {
    const nodes = [makeNode('start-1', 'start', 'Start')];
    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('end node'))).toBe(true);
  });

  it('should error when multiple start nodes', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start 1'),
      makeNode('start-2', 'start', 'Start 2'),
      makeNode('end-1', 'end', 'End'),
    ];
    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('exactly one start'))).toBe(true);
  });

  it('should detect cycles', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('step-1', 'instruction', 'Step 1'),
      makeNode('step-2', 'instruction', 'Step 2'),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [
      makeEdge('start-1', 'step-1'),
      makeEdge('step-1', 'step-2'),
      makeEdge('step-2', 'step-1'), // cycle
      makeEdge('step-2', 'end-1'),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('cycle'))).toBe(true);
  });

  it('should error on dead-end nodes (no outgoing edges except end)', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('step-1', 'instruction', 'Step 1'),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [
      makeEdge('start-1', 'step-1'),
      // step-1 has no outgoing edge
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('no outgoing edges'))).toBe(true);
  });

  it('should warn about unreachable nodes', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('step-1', 'instruction', 'Step 1'),
      makeNode('step-2', 'instruction', 'Orphan'),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [
      makeEdge('start-1', 'step-1'),
      makeEdge('step-1', 'end-1'),
      // step-2 is not connected
    ];

    const result = validateWorkflow(nodes, edges);
    // Valid but with warnings
    expect(result.warnings.some(w => w.message.includes('not reachable'))).toBe(true);
  });

  it('should error on condition node missing branches', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('cond-1', 'condition', 'Check', { condition: "task.status == 'done'" }),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [
      makeEdge('start-1', 'cond-1'),
      makeEdge('cond-1', 'end-1'), // No sourceHandle - missing true/false
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('"true" branch'))).toBe(true);
    expect(result.errors.some(e => e.message.includes('"false" branch'))).toBe(true);
  });

  it('should validate condition node with both branches', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('cond-1', 'condition', 'Check', { condition: "task.status == 'done'" }),
      makeNode('step-1', 'instruction', 'On True', { instructions: 'Do A' }),
      makeNode('step-2', 'instruction', 'On False', { instructions: 'Do B' }),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [
      makeEdge('start-1', 'cond-1'),
      { id: 'e-true', source: 'cond-1', target: 'step-1', sourceHandle: 'true' },
      { id: 'e-false', source: 'cond-1', target: 'step-2', sourceHandle: 'false' },
      makeEdge('step-1', 'end-1'),
      makeEdge('step-2', 'end-1'),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true);
  });

  it('should error when node count exceeds hard limit', () => {
    const nodes: WorkflowNode[] = [];
    for (let i = 0; i < 101; i++) {
      nodes.push(makeNode(`node-${i}`, 'instruction', `Node ${i}`));
    }
    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('hard limit'))).toBe(true);
  });

  it('should error when node count exceeds soft limit', () => {
    const nodes: WorkflowNode[] = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('end-1', 'end', 'End'),
    ];
    for (let i = 0; i < 50; i++) {
      nodes.push(makeNode(`node-${i}`, 'instruction', `Node ${i}`, { instructions: 'do' }));
    }
    // 52 total (start + end + 50 instruction)
    const edges: WorkflowEdge[] = [makeEdge('start-1', 'node-0')];
    for (let i = 0; i < 49; i++) {
      edges.push(makeEdge(`node-${i}`, `node-${i + 1}`));
    }
    edges.push(makeEdge('node-49', 'end-1'));

    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('soft limit'))).toBe(true);
  });

  it('should warn when node count exceeds warn threshold', () => {
    const nodes: WorkflowNode[] = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('end-1', 'end', 'End'),
    ];
    for (let i = 0; i < 30; i++) {
      nodes.push(makeNode(`node-${i}`, 'instruction', `Node ${i}`, { instructions: 'do' }));
    }
    const edges: WorkflowEdge[] = [makeEdge('start-1', 'node-0')];
    for (let i = 0; i < 29; i++) {
      edges.push(makeEdge(`node-${i}`, `node-${i + 1}`));
    }
    edges.push(makeEdge('node-29', 'end-1'));

    const result = validateWorkflow(nodes, edges);
    expect(result.warnings.some(w => w.message.includes('Consider simplifying'))).toBe(true);
  });

  it('should warn when instruction node has no instructions', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('step-1', 'instruction', 'Empty Step'),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [
      makeEdge('start-1', 'step-1'),
      makeEdge('step-1', 'end-1'),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.warnings.some(w => w.message.includes('no instructions'))).toBe(true);
  });

  it('should error on invalid edge references', () => {
    const nodes = [
      makeNode('start-1', 'start', 'Start'),
      makeNode('end-1', 'end', 'End'),
    ];
    const edges = [
      makeEdge('start-1', 'end-1'),
      makeEdge('start-1', 'nonexistent'),
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('non-existent'))).toBe(true);
  });
});

describe('validateConditionExpression', () => {
  it('should accept valid expressions', () => {
    expect(validateConditionExpression("task.status == 'done'")).toHaveLength(0);
    expect(validateConditionExpression("run.output_tokens > 1000")).toHaveLength(0);
    expect(validateConditionExpression("variable.retryCount >= 3")).toHaveLength(0);
    expect(validateConditionExpression("task.title contains 'API'")).toHaveLength(0);
  });

  it('should reject empty expression', () => {
    const errors = validateConditionExpression('');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('empty');
  });

  it('should reject invalid field prefix', () => {
    const errors = validateConditionExpression("foo.bar == 'baz'");
    expect(errors.some(e => e.includes('Invalid field'))).toBe(true);
  });

  it('should reject invalid operator', () => {
    const errors = validateConditionExpression("task.status === 'done'");
    expect(errors.some(e => e.includes('Invalid condition syntax'))).toBe(true);
  });
});

describe('parseConditionExpression', () => {
  it('should parse comparison expressions', () => {
    const result = parseConditionExpression("task.status == 'done'");
    expect(result).toEqual({ field: 'task.status', operator: '==', value: "'done'" });
  });

  it('should parse numeric comparisons', () => {
    const result = parseConditionExpression("run.output_tokens > 1000");
    expect(result).toEqual({ field: 'run.output_tokens', operator: '>', value: '1000' });
  });

  it('should parse word operators', () => {
    const result = parseConditionExpression("task.title contains 'API'");
    expect(result).toEqual({ field: 'task.title', operator: 'contains', value: "'API'" });
  });

  it('should return null for unparseable expressions', () => {
    expect(parseConditionExpression('gibberish')).toBeNull();
    expect(parseConditionExpression('')).toBeNull();
  });
});

describe('evaluateCondition', () => {
  const context = {
    task: { status: 'done', title: 'Build API endpoint', progress: 100 },
    run: { output_tokens: 1500 },
    variables: { retryCount: 3 },
  };

  it('should evaluate string equality', () => {
    expect(evaluateCondition("task.status == 'done'", context)).toBe(true);
    expect(evaluateCondition("task.status == 'testing'", context)).toBe(false);
  });

  it('should evaluate string inequality', () => {
    expect(evaluateCondition("task.status != 'testing'", context)).toBe(true);
  });

  it('should evaluate numeric comparisons', () => {
    expect(evaluateCondition("run.output_tokens > 1000", context)).toBe(true);
    expect(evaluateCondition("run.output_tokens < 1000", context)).toBe(false);
    expect(evaluateCondition("variable.retryCount >= 3", context)).toBe(true);
    expect(evaluateCondition("task.progress <= 100", context)).toBe(true);
  });

  it('should evaluate contains', () => {
    expect(evaluateCondition("task.title contains 'API'", context)).toBe(true);
    expect(evaluateCondition("task.title contains 'missing'", context)).toBe(false);
  });

  it('should evaluate startsWith', () => {
    expect(evaluateCondition("task.title startsWith 'Build'", context)).toBe(true);
    expect(evaluateCondition("task.title startsWith 'API'", context)).toBe(false);
  });

  it('should evaluate endsWith', () => {
    expect(evaluateCondition("task.title endsWith 'endpoint'", context)).toBe(true);
  });

  it('should return false for invalid expressions', () => {
    expect(evaluateCondition('gibberish', context)).toBe(false);
  });

  it('should return false for undefined fields', () => {
    expect(evaluateCondition("task.nonexistent == 'value'", context)).toBe(false);
  });
});
