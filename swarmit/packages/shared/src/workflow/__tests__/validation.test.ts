import { describe, it, expect } from 'vitest';
import { validateWorkflow, validateConditionExpression, parseConditionExpression, evaluateCondition } from '../validation.js';
import type { WorkflowNode, WorkflowEdge } from '../../types/workflow.js';

function makeNode(id: string, type: WorkflowNode['type'], data: Partial<WorkflowNode['data']> = {}): WorkflowNode {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id, ...data } };
}

function makeEdge(source: string, target: string, sourceHandle?: string): WorkflowEdge {
  return { id: `${source}-${target}`, source, target, sourceHandle };
}

describe('validateWorkflow', () => {
  it('validates a simple start → instruction → end workflow', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'Do something' }),
      makeNode('e', 'end'),
    ];
    const edges = [makeEdge('s', 'i1'), makeEdge('i1', 'e')];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects workflow without start node', () => {
    const nodes = [makeNode('i1', 'instruction'), makeNode('e', 'end')];
    const edges = [makeEdge('i1', 'e')];
    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('start node'))).toBe(true);
  });

  it('rejects workflow without end node', () => {
    const nodes = [makeNode('s', 'start'), makeNode('i1', 'instruction')];
    const edges = [makeEdge('s', 'i1')];
    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
  });

  it('detects cycles', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('a', 'instruction', { instructions: 'a' }),
      makeNode('b', 'instruction', { instructions: 'b' }),
      makeNode('e', 'end'),
    ];
    const edges = [makeEdge('s', 'a'), makeEdge('a', 'b'), makeEdge('b', 'a'), makeEdge('b', 'e')];
    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('cycle'))).toBe(true);
  });

  it('validates condition nodes require true/false branches', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('c', 'condition', { condition: "task.status == 'done'" }),
      makeNode('i1', 'instruction', { instructions: 'true path' }),
      makeNode('e', 'end'),
    ];
    const edges = [
      makeEdge('s', 'c'),
      { id: 'c-i1', source: 'c', target: 'i1', sourceHandle: 'true' },
      makeEdge('i1', 'e'),
    ];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('false'))).toBe(true);
  });
});

describe('validateConditionExpression', () => {
  it('accepts valid expression', () => {
    expect(validateConditionExpression("task.status == 'done'")).toHaveLength(0);
  });

  it('rejects empty expression', () => {
    expect(validateConditionExpression('')).toContain('Condition expression is empty');
  });

  it('rejects invalid field prefix', () => {
    const errors = validateConditionExpression("foo.bar == 'test'");
    expect(errors.some(e => e.includes('Invalid field'))).toBe(true);
  });
});

describe('parseConditionExpression', () => {
  it('parses equality', () => {
    const result = parseConditionExpression("task.status == 'done'");
    expect(result).toEqual({ field: 'task.status', operator: '==', value: "'done'" });
  });

  it('parses contains', () => {
    const result = parseConditionExpression("task.title contains 'API'");
    expect(result).toEqual({ field: 'task.title', operator: 'contains', value: "'API'" });
  });

  it('returns null for invalid syntax', () => {
    expect(parseConditionExpression('nonsense')).toBeNull();
  });
});

describe('evaluateCondition', () => {
  const context = {
    task: { status: 'done', title: 'Fix API bug', metadata: { priority: 'high' } },
    run: { output_tokens: 1500, status: 'SUCCESS' },
    variables: { retryCount: 2, flag: true, name: 'test' },
  };

  it('evaluates equality', () => {
    expect(evaluateCondition("task.status == 'done'", context)).toBe(true);
    expect(evaluateCondition("task.status == 'todo'", context)).toBe(false);
  });

  it('evaluates inequality (!=)', () => {
    expect(evaluateCondition("task.status != 'todo'", context)).toBe(true);
    expect(evaluateCondition("task.status != 'done'", context)).toBe(false);
  });

  it('evaluates numeric comparison >', () => {
    expect(evaluateCondition('run.output_tokens > 1000', context)).toBe(true);
    expect(evaluateCondition('run.output_tokens > 1500', context)).toBe(false);
  });

  it('evaluates numeric comparison <', () => {
    expect(evaluateCondition('run.output_tokens < 2000', context)).toBe(true);
    expect(evaluateCondition('run.output_tokens < 1000', context)).toBe(false);
  });

  it('evaluates numeric comparison >=', () => {
    expect(evaluateCondition('variable.retryCount >= 2', context)).toBe(true);
    expect(evaluateCondition('variable.retryCount >= 3', context)).toBe(false);
  });

  it('evaluates numeric comparison <=', () => {
    expect(evaluateCondition('variable.retryCount <= 2', context)).toBe(true);
    expect(evaluateCondition('variable.retryCount <= 1', context)).toBe(false);
  });

  it('evaluates contains', () => {
    expect(evaluateCondition("task.title contains 'API'", context)).toBe(true);
    expect(evaluateCondition("task.title contains 'missing'", context)).toBe(false);
  });

  it('evaluates startsWith', () => {
    expect(evaluateCondition("task.title startsWith 'Fix'", context)).toBe(true);
    expect(evaluateCondition("task.title startsWith 'Bug'", context)).toBe(false);
  });

  it('evaluates endsWith', () => {
    expect(evaluateCondition("task.title endsWith 'bug'", context)).toBe(true);
    expect(evaluateCondition("task.title endsWith 'fix'", context)).toBe(false);
  });

  it('returns false for contains/startsWith/endsWith when field is non-string', () => {
    expect(evaluateCondition("run.output_tokens contains '15'", context)).toBe(false);
    expect(evaluateCondition("run.output_tokens startsWith '15'", context)).toBe(false);
    expect(evaluateCondition("run.output_tokens endsWith '00'", context)).toBe(false);
  });

  it('returns false for unparseable expression', () => {
    expect(evaluateCondition('this is nonsense', context)).toBe(false);
  });

  it('resolves nested field path (task.metadata.priority)', () => {
    expect(evaluateCondition("task.metadata.priority == 'high'", context)).toBe(true);
    expect(evaluateCondition("task.metadata.priority == 'low'", context)).toBe(false);
  });

  it('resolves unknown prefix returns undefined, compare fails gracefully', () => {
    expect(evaluateCondition("unknown.field == 'value'", context)).toBe(false);
  });

  it('resolves non-existent nested path returns undefined', () => {
    expect(evaluateCondition("task.nonexistent.deep == 'value'", context)).toBe(false);
  });

  it('handles parseValue with double-quoted strings', () => {
    expect(evaluateCondition('task.status == "done"', context)).toBe(true);
  });

  it('handles parseValue with boolean true', () => {
    expect(evaluateCondition('variable.flag == true', context)).toBe(true);
  });

  it('handles parseValue with boolean false', () => {
    expect(evaluateCondition('variable.flag == false', context)).toBe(false);
  });

  it('handles parseValue with null', () => {
    expect(evaluateCondition('task.nonexistent == null', context)).toBe(true);
  });

  it('handles parseValue with unquoted string (treated as number if possible, else string)', () => {
    expect(evaluateCondition('variable.retryCount == 2', context)).toBe(true);
  });

  it('handles parseValue with unquoted non-numeric string', () => {
    expect(evaluateCondition("variable.name == test", context)).toBe(true);
  });

  it('returns false for unknown operator', () => {
    // parseConditionExpression won't match unknown operators, so this returns false
    expect(evaluateCondition('task.status ~= done', context)).toBe(false);
  });
});

describe('parseConditionExpression (additional)', () => {
  it('parses != operator', () => {
    const result = parseConditionExpression("task.status != 'done'");
    expect(result).toEqual({ field: 'task.status', operator: '!=', value: "'done'" });
  });

  it('parses >= operator', () => {
    const result = parseConditionExpression('run.tokens >= 1000');
    expect(result).toEqual({ field: 'run.tokens', operator: '>=', value: '1000' });
  });

  it('parses <= operator', () => {
    const result = parseConditionExpression('run.tokens <= 5000');
    expect(result).toEqual({ field: 'run.tokens', operator: '<=', value: '5000' });
  });

  it('parses > operator', () => {
    const result = parseConditionExpression('run.tokens > 100');
    expect(result).toEqual({ field: 'run.tokens', operator: '>', value: '100' });
  });

  it('parses < operator', () => {
    const result = parseConditionExpression('run.tokens < 100');
    expect(result).toEqual({ field: 'run.tokens', operator: '<', value: '100' });
  });

  it('parses startsWith operator', () => {
    const result = parseConditionExpression("task.title startsWith 'Fix'");
    expect(result).toEqual({ field: 'task.title', operator: 'startsWith', value: "'Fix'" });
  });

  it('parses endsWith operator', () => {
    const result = parseConditionExpression("task.title endsWith 'bug'");
    expect(result).toEqual({ field: 'task.title', operator: 'endsWith', value: "'bug'" });
  });

  it('returns null when field is empty', () => {
    expect(parseConditionExpression(" == 'value'")).toBeNull();
  });

  it('returns null when value is empty', () => {
    expect(parseConditionExpression('task.status == ')).toBeNull();
  });
});

describe('validateConditionExpression (additional)', () => {
  it('accepts all valid prefixes', () => {
    expect(validateConditionExpression("task.status == 'done'")).toHaveLength(0);
    expect(validateConditionExpression("run.status == 'SUCCESS'")).toHaveLength(0);
    expect(validateConditionExpression('variable.count > 1')).toHaveLength(0);
  });

  it('rejects invalid operator', () => {
    // Use a valid prefix but an operator that doesn't match any known ops
    // This would cause parseConditionExpression to return null → invalid syntax error
    const errors = validateConditionExpression('task.status === done');
    expect(errors.some(e => e.includes('Invalid condition syntax'))).toBe(true);
  });

  it('rejects whitespace-only expression', () => {
    const errors = validateConditionExpression('   ');
    expect(errors).toContain('Condition expression is empty');
  });
});

describe('validateWorkflow (additional edge cases)', () => {
  it('rejects workflow with multiple start nodes', () => {
    const nodes = [
      makeNode('s1', 'start'),
      makeNode('s2', 'start'),
      makeNode('e', 'end'),
    ];
    const edges = [makeEdge('s1', 'e'), makeEdge('s2', 'e')];
    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('exactly one start node'))).toBe(true);
  });

  it('detects edge referencing non-existent source node', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'step' }),
      makeNode('e', 'end'),
    ];
    const edges = [
      makeEdge('s', 'i1'),
      makeEdge('i1', 'e'),
      { id: 'ghost-e', source: 'ghost', target: 'e' },
    ];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('non-existent source'))).toBe(true);
  });

  it('detects edge referencing non-existent target node', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'step' }),
      makeNode('e', 'end'),
    ];
    const edges = [
      makeEdge('s', 'i1'),
      makeEdge('i1', 'e'),
      { id: 's-ghost', source: 's', target: 'ghost' },
    ];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('non-existent target'))).toBe(true);
  });

  it('warns about unreachable nodes', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'step' }),
      makeNode('orphan', 'instruction', { instructions: 'lonely' }),
      makeNode('e', 'end'),
    ];
    const edges = [makeEdge('s', 'i1'), makeEdge('i1', 'e'), makeEdge('orphan', 'e')];
    const result = validateWorkflow(nodes, edges);
    expect(result.warnings.some(w => w.message.includes('not reachable from start'))).toBe(true);
  });

  it('detects dead-end nodes (non-end node with no outgoing edges)', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'step' }),
      makeNode('e', 'end'),
    ];
    // i1 has no outgoing edge
    const edges = [makeEdge('s', 'i1')];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('no outgoing edges'))).toBe(true);
  });

  it('detects end node with outgoing edges', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'step' }),
      makeNode('e', 'end'),
    ];
    const edges = [makeEdge('s', 'i1'), makeEdge('i1', 'e'), makeEdge('e', 'i1')];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('End node') && e.message.includes('should not have outgoing'))).toBe(true);
  });

  it('detects incoming edges to start node', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'step' }),
      makeNode('e', 'end'),
    ];
    const edges = [makeEdge('s', 'i1'), makeEdge('i1', 'e'), makeEdge('i1', 's')];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('Start node should not have incoming'))).toBe(true);
  });

  it('detects condition node without condition expression', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('c', 'condition', {}),
      makeNode('i1', 'instruction', { instructions: 'true path' }),
      makeNode('i2', 'instruction', { instructions: 'false path' }),
      makeNode('e', 'end'),
    ];
    const edges = [
      makeEdge('s', 'c'),
      { id: 'c-i1', source: 'c', target: 'i1', sourceHandle: 'true' },
      { id: 'c-i2', source: 'c', target: 'i2', sourceHandle: 'false' },
      makeEdge('i1', 'e'),
      makeEdge('i2', 'e'),
    ];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('no condition expression'))).toBe(true);
  });

  it('detects condition node missing true branch', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('c', 'condition', { condition: "task.status == 'done'" }),
      makeNode('i1', 'instruction', { instructions: 'path' }),
      makeNode('e', 'end'),
    ];
    const edges = [
      makeEdge('s', 'c'),
      { id: 'c-i1', source: 'c', target: 'i1', sourceHandle: 'false' },
      makeEdge('i1', 'e'),
    ];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('missing a "true" branch'))).toBe(true);
  });

  it('warns about instruction node with no instructions', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', {}),
      makeNode('e', 'end'),
    ];
    const edges = [makeEdge('s', 'i1'), makeEdge('i1', 'e')];
    const result = validateWorkflow(nodes, edges);
    expect(result.warnings.some(w => w.message.includes('has no instructions'))).toBe(true);
  });

  it('warns about instruction node with empty (whitespace) instructions', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: '   ' }),
      makeNode('e', 'end'),
    ];
    const edges = [makeEdge('s', 'i1'), makeEdge('i1', 'e')];
    const result = validateWorkflow(nodes, edges);
    expect(result.warnings.some(w => w.message.includes('has no instructions'))).toBe(true);
  });

  it('errors when node count exceeds soft limit (51-100)', () => {
    const nodes: WorkflowNode[] = [makeNode('s', 'start')];
    for (let i = 0; i < 50; i++) {
      nodes.push(makeNode(`n${i}`, 'instruction', { instructions: `step ${i}` }));
    }
    nodes.push(makeNode('e', 'end'));
    // Chain edges
    const edges: WorkflowEdge[] = [];
    edges.push(makeEdge('s', 'n0'));
    for (let i = 0; i < 49; i++) {
      edges.push(makeEdge(`n${i}`, `n${i + 1}`));
    }
    edges.push(makeEdge('n49', 'e'));

    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('exceeding the soft limit'))).toBe(true);
    expect(result.warnings.some(w => w.message.includes('Consider simplifying'))).toBe(true);
  });

  it('errors and returns early when node count exceeds hard limit (>100)', () => {
    const nodes: WorkflowNode[] = [];
    for (let i = 0; i < 101; i++) {
      nodes.push(makeNode(`n${i}`, 'instruction', { instructions: `step ${i}` }));
    }
    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('exceeding the hard limit'))).toBe(true);
  });

  it('warns when node count exceeds warn threshold (>30)', () => {
    const nodes: WorkflowNode[] = [makeNode('s', 'start')];
    for (let i = 0; i < 30; i++) {
      nodes.push(makeNode(`n${i}`, 'instruction', { instructions: `step ${i}` }));
    }
    nodes.push(makeNode('e', 'end'));
    const edges: WorkflowEdge[] = [];
    edges.push(makeEdge('s', 'n0'));
    for (let i = 0; i < 29; i++) {
      edges.push(makeEdge(`n${i}`, `n${i + 1}`));
    }
    edges.push(makeEdge('n29', 'e'));

    const result = validateWorkflow(nodes, edges);
    expect(result.warnings.some(w => w.message.includes('Consider simplifying'))).toBe(true);
  });

  it('validates a condition node with invalid condition expression field', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('c', 'condition', { condition: "invalid.field == 'value'" }),
      makeNode('i1', 'instruction', { instructions: 'true path' }),
      makeNode('i2', 'instruction', { instructions: 'false path' }),
      makeNode('e', 'end'),
    ];
    const edges = [
      makeEdge('s', 'c'),
      { id: 'c-i1', source: 'c', target: 'i1', sourceHandle: 'true' },
      { id: 'c-i2', source: 'c', target: 'i2', sourceHandle: 'false' },
      makeEdge('i1', 'e'),
      makeEdge('i2', 'e'),
    ];
    const result = validateWorkflow(nodes, edges);
    expect(result.errors.some(e => e.message.includes('Invalid field'))).toBe(true);
  });
});
