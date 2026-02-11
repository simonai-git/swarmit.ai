import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  initWorkflow,
  getWorkflowPrompt,
  processWorkflowOutput,
  finalizeWorkflow,
} from '../workflow-runner.js';

// ── Helpers ─────────────────────────────────────────────────

function createMockPrisma() {
  return {
    workflowExecutionState: {
      create: vi.fn().mockResolvedValue({ id: 'exec-state-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    workflowExecutionEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as Parameters<typeof initWorkflow>[0];
}

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    agentWorkflows: [
      {
        workflow: {
          versions: [
            {
              id: 'wv-1',
              nodes: [
                { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
                { id: 'step-1', type: 'instruction', position: { x: 0, y: 100 }, data: { label: 'Build', instructions: 'Build the feature' } },
                { id: 'end-1', type: 'end', position: { x: 0, y: 200 }, data: { label: 'End' } },
              ],
              edges: [
                { id: 'e1', source: 'start-1', target: 'step-1' },
                { id: 'e2', source: 'step-1', target: 'end-1' },
              ],
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe('initWorkflow', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
  });

  it('returns null when agent has no agentWorkflows', async () => {
    const agent = { agentWorkflows: [] };
    const result = await initWorkflow(prisma, 'run-1', agent);
    expect(result).toBeNull();
  });

  it('returns null when workflow has no versions', async () => {
    const agent = {
      agentWorkflows: [{ workflow: { versions: [] } }],
    };
    const result = await initWorkflow(prisma, 'run-1', agent);
    expect(result).toBeNull();
  });

  it('returns null when nodes array is empty', async () => {
    const agent = {
      agentWorkflows: [{
        workflow: {
          versions: [{ id: 'wv-empty', nodes: [], edges: [] }],
        },
      }],
    };
    const result = await initWorkflow(prisma, 'run-1', agent);
    expect(result).toBeNull();
  });

  it('creates execution state and returns workflow context', async () => {
    const agent = makeAgent();
    const result = await initWorkflow(prisma, 'run-1', agent);

    expect(result).not.toBeNull();
    expect(result!.runId).toBe('run-1');
    expect(result!.workflowVersionId).toBe('wv-1');
    expect(result!.nodes).toHaveLength(3);
    expect(result!.edges).toHaveLength(2);
    expect(result!.executionStateId).toBe('exec-state-1');
    expect(result!.completedNodes).toEqual([]);

    const prismaTyped = prisma as unknown as ReturnType<typeof createMockPrisma>;
    expect((prismaTyped as unknown as { workflowExecutionState: { create: ReturnType<typeof vi.fn> } }).workflowExecutionState.create).toHaveBeenCalledWith({
      data: {
        runId: 'run-1',
        workflowVersionId: 'wv-1',
        completedNodes: [],
        variables: {},
        status: 'RUNNING',
      },
    });
  });
});

describe('getWorkflowPrompt', () => {
  it('returns a serialized workflow prompt string', () => {
    const ctx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [
        { id: 'start-1', type: 'start' as const, position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'step-1', type: 'instruction' as const, position: { x: 0, y: 100 }, data: { label: 'Build', instructions: 'Build the feature' } },
        { id: 'end-1', type: 'end' as const, position: { x: 0, y: 200 }, data: { label: 'End' } },
      ],
      edges: [
        { id: 'e1', source: 'start-1', target: 'step-1' },
        { id: 'e2', source: 'step-1', target: 'end-1' },
      ],
      executionStateId: 'exec-1',
      completedNodes: [] as string[],
    };

    const prompt = getWorkflowPrompt(ctx);

    expect(prompt).toContain('Workflow Instructions');
    expect(prompt).toContain('Step 1: Build');
    expect(prompt).toContain('[PENDING]');
    expect(prompt).toContain('Build the feature');
    expect(prompt).toContain('[[WORKFLOW_STEP]]');
    expect(prompt).toContain('[[WORKFLOW_STEP_COMPLETE]]');
  });

  it('marks completed steps appropriately', () => {
    const ctx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [
        { id: 'start-1', type: 'start' as const, position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'step-1', type: 'instruction' as const, position: { x: 0, y: 100 }, data: { label: 'Build' } },
        { id: 'end-1', type: 'end' as const, position: { x: 0, y: 200 }, data: { label: 'End' } },
      ],
      edges: [
        { id: 'e1', source: 'start-1', target: 'step-1' },
        { id: 'e2', source: 'step-1', target: 'end-1' },
      ],
      executionStateId: 'exec-1',
      completedNodes: ['step-1'],
    };

    const prompt = getWorkflowPrompt(ctx);

    expect(prompt).toContain('[COMPLETED]');
    expect(prompt).not.toContain('[PENDING]');
  });
});

describe('processWorkflowOutput', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
  });

  it('parses step markers and creates events', async () => {
    const ctx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [
        { id: 'step-1', type: 'instruction' as const, position: { x: 0, y: 0 }, data: { label: 'Build Feature' } },
      ],
      edges: [],
      executionStateId: 'exec-1',
      completedNodes: [] as string[],
    };

    const output = [
      '[[WORKFLOW_STEP]] step-1',
      'Working on the feature...',
      '[[WORKFLOW_STEP_COMPLETE]] step-1',
    ].join('\n');

    await processWorkflowOutput(prisma, ctx, output);

    const prismaTyped = prisma as unknown as { workflowExecutionEvent: { create: ReturnType<typeof vi.fn> }; workflowExecutionState: { update: ReturnType<typeof vi.fn> } };

    // Should create started event
    expect(prismaTyped.workflowExecutionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionStateId: 'exec-1',
          nodeId: 'step-1',
          type: 'step_started',
          nodeLabel: 'Build Feature',
        }),
      })
    );

    // Should create completed event
    expect(prismaTyped.workflowExecutionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionStateId: 'exec-1',
          nodeId: 'step-1',
          type: 'step_completed',
          nodeLabel: 'Build Feature',
        }),
      })
    );

    // Should update currentNodeId
    expect(prismaTyped.workflowExecutionState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ currentNodeId: 'step-1' }),
      })
    );

    // Should update completedNodes
    expect(prismaTyped.workflowExecutionState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ completedNodes: ['step-1'] }),
      })
    );

    // Should mutate context's completedNodes
    expect(ctx.completedNodes).toEqual(['step-1']);
  });

  it('does nothing when no markers present', async () => {
    const ctx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [
        { id: 'step-1', type: 'instruction' as const, position: { x: 0, y: 0 }, data: { label: 'Build' } },
      ],
      edges: [],
      executionStateId: 'exec-1',
      completedNodes: [] as string[],
    };

    await processWorkflowOutput(prisma, ctx, 'Just regular text, no markers.');

    const prismaTyped = prisma as unknown as { workflowExecutionEvent: { create: ReturnType<typeof vi.fn> }; workflowExecutionState: { update: ReturnType<typeof vi.fn> } };
    expect(prismaTyped.workflowExecutionEvent.create).not.toHaveBeenCalled();
    expect(prismaTyped.workflowExecutionState.update).not.toHaveBeenCalled();
  });

  it('does not add duplicate completedNodes', async () => {
    const ctx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [
        { id: 'step-1', type: 'instruction' as const, position: { x: 0, y: 0 }, data: { label: 'Build' } },
      ],
      edges: [],
      executionStateId: 'exec-1',
      completedNodes: ['step-1'], // already completed
    };

    await processWorkflowOutput(prisma, ctx, '[[WORKFLOW_STEP_COMPLETE]] step-1');

    // Still creates the event but doesn't duplicate in completedNodes
    expect(ctx.completedNodes).toEqual(['step-1']);
    expect(ctx.completedNodes).toHaveLength(1);
  });

  it('handles node not found in nodeMap gracefully (label undefined)', async () => {
    const ctx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [], // empty nodes — nodeId won't be found
      edges: [],
      executionStateId: 'exec-1',
      completedNodes: [] as string[],
    };

    await processWorkflowOutput(prisma, ctx, '[[WORKFLOW_STEP]] unknown-node');

    const prismaTyped = prisma as unknown as { workflowExecutionEvent: { create: ReturnType<typeof vi.fn> } };
    expect(prismaTyped.workflowExecutionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nodeId: 'unknown-node',
          nodeLabel: undefined,
        }),
      })
    );
  });
});

describe('finalizeWorkflow', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
  });

  it('updates execution state to COMPLETED', async () => {
    const ctx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [],
      edges: [],
      executionStateId: 'exec-1',
      completedNodes: ['step-1', 'step-2'],
    };

    await finalizeWorkflow(prisma, ctx, 'COMPLETED');

    const prismaTyped = prisma as unknown as { workflowExecutionState: { update: ReturnType<typeof vi.fn> } };
    expect(prismaTyped.workflowExecutionState.update).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: { status: 'COMPLETED', currentNodeId: null },
    });
  });

  it('updates execution state to FAILED', async () => {
    const ctx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [],
      edges: [],
      executionStateId: 'exec-1',
      completedNodes: [],
    };

    await finalizeWorkflow(prisma, ctx, 'FAILED');

    const prismaTyped = prisma as unknown as { workflowExecutionState: { update: ReturnType<typeof vi.fn> } };
    expect(prismaTyped.workflowExecutionState.update).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: { status: 'FAILED', currentNodeId: null },
    });
  });
});
