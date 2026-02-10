import { describe, it, expect, vi } from 'vitest';
import {
  serializeWorkflowToPrompt,
  parseStepMarkers,
  STEP_MARKER_PREFIX,
  STEP_COMPLETE_PREFIX,
} from '@/lib/workflow-executor';
import type { WorkflowVersion, WorkflowExecutionState } from '@/lib/db';

// Mock db module
vi.mock('@/lib/db', () => ({
  getWorkflowVersion: vi.fn(),
  getWorkflowExecutionState: vi.fn(),
  createWorkflowExecutionState: vi.fn(),
  updateWorkflowExecutionState: vi.fn(),
  appendWorkflowEvent: vi.fn(),
}));

function makeVersion(nodes: WorkflowVersion['nodes'], edges: WorkflowVersion['edges']): WorkflowVersion {
  return {
    id: 'wfv-1',
    workflow_id: 'wf-1',
    version_number: 1,
    nodes,
    edges,
    published_by: 'user@test.com',
    published_at: '2026-02-01T00:00:00Z',
  };
}

describe('serializeWorkflowToPrompt', () => {
  it('should serialize a simple workflow to prompt instructions', () => {
    const version = makeVersion(
      [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'step-1', type: 'instruction', position: { x: 0, y: 100 }, data: { label: 'Write Tests', instructions: 'Write unit tests for the function' } },
        { id: 'step-2', type: 'instruction', position: { x: 0, y: 200 }, data: { label: 'Run Tests', instructions: 'Execute the test suite' } },
        { id: 'end-1', type: 'end', position: { x: 0, y: 300 }, data: { label: 'End' } },
      ],
      [
        { id: 'e1', source: 'start-1', target: 'step-1' },
        { id: 'e2', source: 'step-1', target: 'step-2' },
        { id: 'e3', source: 'step-2', target: 'end-1' },
      ]
    );

    const prompt = serializeWorkflowToPrompt(version);

    expect(prompt).toContain('## Workflow Instructions');
    expect(prompt).toContain('Step 1: Write Tests');
    expect(prompt).toContain('Write unit tests for the function');
    expect(prompt).toContain('Step 2: Run Tests');
    expect(prompt).toContain('Execute the test suite');
    expect(prompt).toContain(STEP_MARKER_PREFIX);
    expect(prompt).toContain(STEP_COMPLETE_PREFIX);
    expect(prompt).toContain('Workflow Complete');
  });

  it('should mark completed steps', () => {
    const version = makeVersion(
      [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'step-1', type: 'instruction', position: { x: 0, y: 100 }, data: { label: 'Step A' } },
        { id: 'step-2', type: 'instruction', position: { x: 0, y: 200 }, data: { label: 'Step B' } },
        { id: 'end-1', type: 'end', position: { x: 0, y: 300 }, data: { label: 'End' } },
      ],
      [
        { id: 'e1', source: 'start-1', target: 'step-1' },
        { id: 'e2', source: 'step-1', target: 'step-2' },
        { id: 'e3', source: 'step-2', target: 'end-1' },
      ]
    );

    const state: WorkflowExecutionState = {
      id: 'wes-1',
      run_id: 'run-1',
      task_id: 'task-1',
      workflow_version_id: 'wfv-1',
      current_node_id: 'step-2',
      completed_nodes: ['step-1'],
      variables: {},
      status: 'running',
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    };

    const prompt = serializeWorkflowToPrompt(version, state);

    expect(prompt).toContain('Step A [COMPLETED]');
    expect(prompt).toContain('Step B [PENDING]');
  });

  it('should return empty string for empty workflow', () => {
    const version = makeVersion([], []);
    expect(serializeWorkflowToPrompt(version)).toBe('');
  });

  it('should return empty string when no start node', () => {
    const version = makeVersion(
      [{ id: 'end-1', type: 'end', position: { x: 0, y: 0 }, data: { label: 'End' } }],
      []
    );
    expect(serializeWorkflowToPrompt(version)).toBe('');
  });

  it('should include condition nodes as decision points', () => {
    const version = makeVersion(
      [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'cond-1', type: 'condition', position: { x: 0, y: 100 }, data: { label: 'Has Tests?', condition: "task.status == 'testing'" } },
        { id: 'end-1', type: 'end', position: { x: 0, y: 200 }, data: { label: 'End' } },
      ],
      [
        { id: 'e1', source: 'start-1', target: 'cond-1' },
        { id: 'e2', source: 'cond-1', target: 'end-1', sourceHandle: 'true' },
      ]
    );

    const prompt = serializeWorkflowToPrompt(version);
    expect(prompt).toContain('Decision Point: Has Tests?');
    expect(prompt).toContain("task.status == 'testing'");
  });
});

describe('parseStepMarkers', () => {
  it('should parse step start markers', () => {
    const output = `Some text\n${STEP_MARKER_PREFIX} step-1\nMore text`;
    const result = parseStepMarkers(output);
    expect(result.started).toEqual(['step-1']);
    expect(result.completed).toEqual([]);
  });

  it('should parse step complete markers', () => {
    const output = `${STEP_COMPLETE_PREFIX} step-1`;
    const result = parseStepMarkers(output);
    expect(result.started).toEqual([]);
    expect(result.completed).toEqual(['step-1']);
  });

  it('should parse multiple markers', () => {
    const output = [
      `${STEP_MARKER_PREFIX} step-1`,
      'Some work being done...',
      `${STEP_COMPLETE_PREFIX} step-1`,
      `${STEP_MARKER_PREFIX} step-2`,
      'More work...',
      `${STEP_COMPLETE_PREFIX} step-2`,
    ].join('\n');

    const result = parseStepMarkers(output);
    expect(result.started).toEqual(['step-1', 'step-2']);
    expect(result.completed).toEqual(['step-1', 'step-2']);
  });

  it('should handle empty output', () => {
    const result = parseStepMarkers('');
    expect(result.started).toEqual([]);
    expect(result.completed).toEqual([]);
  });

  it('should handle output with no markers', () => {
    const result = parseStepMarkers('Just some regular agent output\nwith multiple lines');
    expect(result.started).toEqual([]);
    expect(result.completed).toEqual([]);
  });
});
