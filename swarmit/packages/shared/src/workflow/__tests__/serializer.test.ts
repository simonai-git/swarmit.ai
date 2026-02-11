import { describe, it, expect } from 'vitest';
import { serializeWorkflowToPrompt, parseStepMarkers, STEP_MARKER_PREFIX, STEP_COMPLETE_PREFIX } from '../serializer.js';
import type { WorkflowNode, WorkflowEdge } from '../../types/workflow.js';

function makeNode(id: string, type: WorkflowNode['type'], data: Partial<WorkflowNode['data']> = {}): WorkflowNode {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id, ...data } };
}

describe('serializeWorkflowToPrompt', () => {
  it('serializes a simple workflow', () => {
    const nodes: WorkflowNode[] = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'Write code' }),
      makeNode('e', 'end'),
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 's', target: 'i1' },
      { id: 'e2', source: 'i1', target: 'e' },
    ];

    const result = serializeWorkflowToPrompt({ nodes, edges });
    expect(result).toContain('## Workflow Instructions');
    expect(result).toContain('Step 1: i1');
    expect(result).toContain('Write code');
    expect(result).toContain(STEP_MARKER_PREFIX);
    expect(result).toContain('Workflow Complete');
  });

  it('marks completed steps', () => {
    const nodes: WorkflowNode[] = [
      makeNode('s', 'start'),
      makeNode('i1', 'instruction', { instructions: 'Step one' }),
      makeNode('i2', 'instruction', { instructions: 'Step two' }),
      makeNode('e', 'end'),
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 's', target: 'i1' },
      { id: 'e2', source: 'i1', target: 'i2' },
      { id: 'e3', source: 'i2', target: 'e' },
    ];

    const result = serializeWorkflowToPrompt({ nodes, edges }, ['i1']);
    expect(result).toContain('[COMPLETED]');
    expect(result).toContain('[PENDING]');
  });

  it('returns empty string for empty nodes', () => {
    expect(serializeWorkflowToPrompt({ nodes: [], edges: [] })).toBe('');
  });
});

describe('parseStepMarkers', () => {
  it('parses started markers', () => {
    const output = `Some text\n${STEP_MARKER_PREFIX} node-1\nMore text`;
    const result = parseStepMarkers(output);
    expect(result.started).toEqual(['node-1']);
    expect(result.completed).toEqual([]);
  });

  it('parses completed markers', () => {
    const output = `${STEP_COMPLETE_PREFIX} node-1`;
    const result = parseStepMarkers(output);
    expect(result.completed).toEqual(['node-1']);
  });

  it('parses multiple markers', () => {
    const output = [
      `${STEP_MARKER_PREFIX} a`,
      `${STEP_COMPLETE_PREFIX} a`,
      `${STEP_MARKER_PREFIX} b`,
      `${STEP_COMPLETE_PREFIX} b`,
    ].join('\n');

    const result = parseStepMarkers(output);
    expect(result.started).toEqual(['a', 'b']);
    expect(result.completed).toEqual(['a', 'b']);
  });

  it('handles empty output', () => {
    const result = parseStepMarkers('');
    expect(result.started).toEqual([]);
    expect(result.completed).toEqual([]);
  });
});
