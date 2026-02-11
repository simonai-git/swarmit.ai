import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMResponse, LLMContentBlock } from '@swarmit/shared';

// ── Hoisted mocks ───────────────────────────────────────────
const mockInitWorkflow = vi.hoisted(() => vi.fn());
const mockGetWorkflowPrompt = vi.hoisted(() => vi.fn());
const mockProcessWorkflowOutput = vi.hoisted(() => vi.fn());
const mockFinalizeWorkflow = vi.hoisted(() => vi.fn());

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../workflow-runner.js', () => ({
  initWorkflow: mockInitWorkflow,
  getWorkflowPrompt: mockGetWorkflowPrompt,
  processWorkflowOutput: mockProcessWorkflowOutput,
  finalizeWorkflow: mockFinalizeWorkflow,
}));

import { executeAgent } from '../executor.js';

// ── Helpers ─────────────────────────────────────────────────

function createMockLLMClient() {
  return {
    chat: vi.fn<() => Promise<LLMResponse>>(),
  };
}

function createMockSandbox() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    listFiles: vi.fn().mockResolvedValue([]),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockPrisma() {
  return {
    taskLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function createMockRedis() {
  return {
    publish: vi.fn().mockResolvedValue(1),
  };
}

function makeEndTurnResponse(text: string, inputTokens = 100, outputTokens = 50): LLMResponse {
  return {
    id: 'msg-1',
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function makeToolUseResponse(
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  text?: string,
  inputTokens = 200,
  outputTokens = 100
): LLMResponse {
  const content: LLMContentBlock[] = [];
  if (text) {
    content.push({ type: 'text', text });
  }
  for (const tc of toolCalls) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
  }
  return {
    id: 'msg-tool',
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    content,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function makeBaseTaskCtx() {
  return {
    task: {
      id: 'task-1',
      title: 'Implement login',
      description: 'Build login with OAuth',
      status: 'IN_PROGRESS',
      priority: 2,
      project: {
        id: 'proj-1',
        title: 'Test Project',
        description: 'A test project',
        prd: null,
      },
      comments: [] as Array<{ author: string; content: string; createdAt: Date }>,
      assignee: {
        id: 'agent-1',
        name: 'DevBot',
        specialization: 'developer',
        systemPrompt: null,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.7,
        maxTokens: 4096,
        skills: [] as Array<{ skill: { name: string; description: string | null } }>,
        agentWorkflows: [] as Array<{
          workflow: {
            versions: Array<{ id: string; nodes: unknown; edges: unknown }>;
          };
        }>,
      },
    },
  };
}

function makeBaseCtx(overrides: Record<string, unknown> = {}) {
  return {
    prisma: createMockPrisma() as unknown as Parameters<typeof executeAgent>[0]['prisma'],
    llmClient: createMockLLMClient() as unknown as Parameters<typeof executeAgent>[0]['llmClient'],
    sandbox: createMockSandbox() as unknown as Parameters<typeof executeAgent>[0]['sandbox'],
    redis: createMockRedis() as unknown as Parameters<typeof executeAgent>[0]['redis'],
    runId: 'run-1',
    taskId: 'task-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('executeAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitWorkflow.mockResolvedValue(null);
    mockGetWorkflowPrompt.mockReturnValue('');
    mockProcessWorkflowOutput.mockResolvedValue(undefined);
    mockFinalizeWorkflow.mockResolvedValue(undefined);
  });

  it('completes a single-turn (no tools, end_turn) and returns token usage', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();

    const llm = ctx.llmClient as ReturnType<typeof createMockLLMClient>;
    llm.chat.mockResolvedValueOnce(makeEndTurnResponse('Task completed!', 150, 80));

    const result = await executeAgent(ctx, taskCtx);

    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(result.totalTokens).toBe(230); // 150 + 80
    expect(result.totalCost).toBeGreaterThan(0);
  });

  it('runs a multi-turn tool-calling loop', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();
    const sandbox = ctx.sandbox as ReturnType<typeof createMockSandbox>;

    const llm = ctx.llmClient as ReturnType<typeof createMockLLMClient>;

    // Turn 1: tool call
    llm.chat.mockResolvedValueOnce(
      makeToolUseResponse([
        { id: 'tc-1', name: 'read_file', input: { path: '/app/main.ts' } },
      ], 'Let me read the file.', 100, 50)
    );

    // Sandbox returns file content
    sandbox.readFile.mockResolvedValue('export function main() {}');

    // Turn 2: end_turn
    llm.chat.mockResolvedValueOnce(makeEndTurnResponse('I read the file, task done.', 200, 100));

    const result = await executeAgent(ctx, taskCtx);

    expect(llm.chat).toHaveBeenCalledTimes(2);
    expect(sandbox.readFile).toHaveBeenCalledWith('/app/main.ts');
    expect(result.totalTokens).toBe(450); // (100+50) + (200+100)
  });

  it('stops at MAX_TOOL_LOOPS and publishes log about limit', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();

    const llm = ctx.llmClient as ReturnType<typeof createMockLLMClient>;
    const prisma = ctx.prisma as unknown as ReturnType<typeof createMockPrisma>;

    // Always return tool_use — never end_turn
    llm.chat.mockResolvedValue(
      makeToolUseResponse(
        [{ id: 'tc-loop', name: 'execute_command', input: { command: 'echo loop' } }],
        'Looping...',
        10,
        5
      )
    );

    const sandbox = ctx.sandbox as ReturnType<typeof createMockSandbox>;
    sandbox.exec.mockResolvedValue({ stdout: 'loop', stderr: '', exitCode: 0 });

    const result = await executeAgent(ctx, taskCtx);

    // 50 is the MAX_TOOL_LOOPS constant
    expect(llm.chat).toHaveBeenCalledTimes(50);
    expect(result.totalTokens).toBe(50 * 15); // 50 loops * (10+5) tokens each

    // Check that a system log about hitting the limit was created
    const logCalls = prisma.taskLog.create.mock.calls.map(
      (c: Array<{ data: { content: string } }>) => c[0].data.content
    );
    expect(logCalls.some((msg: string) => msg.includes('max tool loop limit'))).toBe(true);
  });

  it('initializes and finalizes workflow when agent has one', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();

    const workflowCtx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [{ id: 'n1', type: 'instruction', position: { x: 0, y: 0 }, data: { label: 'Step 1' } }],
      edges: [],
      executionStateId: 'exec-1',
      completedNodes: [],
    };

    mockInitWorkflow.mockResolvedValue(workflowCtx);
    mockGetWorkflowPrompt.mockReturnValue('## Workflow Instructions\nDo step 1.');

    const llm = ctx.llmClient as ReturnType<typeof createMockLLMClient>;
    llm.chat.mockResolvedValueOnce(
      makeEndTurnResponse('[[WORKFLOW_STEP]] n1\nDone!\n[[WORKFLOW_STEP_COMPLETE]] n1')
    );

    await executeAgent(ctx, taskCtx);

    expect(mockInitWorkflow).toHaveBeenCalledTimes(1);
    expect(mockGetWorkflowPrompt).toHaveBeenCalledWith(workflowCtx);
    expect(mockProcessWorkflowOutput).toHaveBeenCalledTimes(1);
    expect(mockFinalizeWorkflow).toHaveBeenCalledWith(
      ctx.prisma,
      workflowCtx,
      'COMPLETED'
    );
  });

  it('finalizes workflow as FAILED when execution throws', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();

    const workflowCtx = {
      runId: 'run-1',
      workflowVersionId: 'wv-1',
      nodes: [],
      edges: [],
      executionStateId: 'exec-1',
      completedNodes: [],
    };

    mockInitWorkflow.mockResolvedValue(workflowCtx);

    const llm = ctx.llmClient as ReturnType<typeof createMockLLMClient>;
    llm.chat.mockRejectedValueOnce(new Error('LLM API down'));

    await expect(executeAgent(ctx, taskCtx)).rejects.toThrow('LLM API down');

    expect(mockFinalizeWorkflow).toHaveBeenCalledWith(
      ctx.prisma,
      workflowCtx,
      'FAILED'
    );
  });

  it('throws when task has no assignee', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();
    (taskCtx.task as { assignee: unknown }).assignee = null;

    await expect(executeAgent(ctx, taskCtx)).rejects.toThrow('Task has no assigned agent');
  });

  it('publishes logs to prisma and redis for each LLM turn', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();

    const llm = ctx.llmClient as ReturnType<typeof createMockLLMClient>;
    llm.chat.mockResolvedValueOnce(makeEndTurnResponse('All done.', 100, 50));

    const prisma = ctx.prisma as unknown as ReturnType<typeof createMockPrisma>;
    const redis = ctx.redis as unknown as ReturnType<typeof createMockRedis>;

    await executeAgent(ctx, taskCtx);

    // At minimum: "Starting agent" system log + "All done." assistant log + "Agent finished" system log
    expect(prisma.taskLog.create.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(redis.publish.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('handles text blocks alongside tool_use blocks in same response', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();
    const sandbox = ctx.sandbox as ReturnType<typeof createMockSandbox>;

    const llm = ctx.llmClient as ReturnType<typeof createMockLLMClient>;

    // Response with both text and tool_use
    llm.chat.mockResolvedValueOnce(
      makeToolUseResponse(
        [{ id: 'tc-1', name: 'execute_command', input: { command: 'npm test' } }],
        'Running tests now.'
      )
    );

    sandbox.exec.mockResolvedValue({ stdout: 'PASS', stderr: '', exitCode: 0 });

    // Turn 2: end_turn
    llm.chat.mockResolvedValueOnce(makeEndTurnResponse('Tests passed!'));

    const prisma = ctx.prisma as unknown as ReturnType<typeof createMockPrisma>;

    await executeAgent(ctx, taskCtx);

    // Verify the text block was logged as assistant
    const logContents = prisma.taskLog.create.mock.calls.map(
      (c: Array<{ data: { stream: string; content: string } }>) => c[0].data
    );
    const assistantLogs = logContents.filter(
      (l: { stream: string; content: string }) => l.stream === 'assistant'
    );
    expect(assistantLogs.some((l: { content: string }) => l.content === 'Running tests now.')).toBe(true);
  });

  it('does not call workflow functions when no workflow is present', async () => {
    const ctx = makeBaseCtx();
    const taskCtx = makeBaseTaskCtx();

    mockInitWorkflow.mockResolvedValue(null);

    const llm = ctx.llmClient as ReturnType<typeof createMockLLMClient>;
    llm.chat.mockResolvedValueOnce(makeEndTurnResponse('Done.'));

    await executeAgent(ctx, taskCtx);

    expect(mockProcessWorkflowOutput).not.toHaveBeenCalled();
    expect(mockFinalizeWorkflow).not.toHaveBeenCalled();
  });
});
