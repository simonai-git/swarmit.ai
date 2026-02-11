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
    task: { status: 'done', title: 'Fix API bug' },
    run: { output_tokens: 1500 },
    variables: { retryCount: 2 },
  };

  it('evaluates equality', () => {
    expect(evaluateCondition("task.status == 'done'", context)).toBe(true);
    expect(evaluateCondition("task.status == 'todo'", context)).toBe(false);
  });

  it('evaluates numeric comparison', () => {
    expect(evaluateCondition('run.output_tokens > 1000', context)).toBe(true);
    expect(evaluateCondition('run.output_tokens < 1000', context)).toBe(false);
  });

  it('evaluates contains', () => {
    expect(evaluateCondition("task.title contains 'API'", context)).toBe(true);
    expect(evaluateCondition("task.title contains 'missing'", context)).toBe(false);
  });

  it('evaluates variable', () => {
    expect(evaluateCondition('variable.retryCount >= 2', context)).toBe(true);
    expect(evaluateCondition('variable.retryCount >= 3', context)).toBe(false);
  });
});
