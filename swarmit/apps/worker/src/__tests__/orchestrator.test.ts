import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  taskRun: {
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({ id: 'new-run-1' }),
  },
  task: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  },
  taskLog: {
    create: vi.fn().mockResolvedValue({}),
  },
  taskDependency: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  integrationToken: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  project: {
    update: vi.fn().mockResolvedValue({}),
  },
  agent: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
}));

const mockCreateLLMClient = vi.hoisted(() => vi.fn());
const mockCreateSandbox = vi.hoisted(() => vi.fn());
const mockExecuteAgent = vi.hoisted(() => vi.fn());

vi.mock('@swarmit/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('@swarmit/integrations', () => ({
  createLLMClient: mockCreateLLMClient,
}));

vi.mock('@swarmit/sandbox', () => ({
  createSandbox: mockCreateSandbox,
}));

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../executor.js', () => ({
  executeAgent: mockExecuteAgent,
}));

import { processAgentJob, processLifecycleJob } from '../orchestrator.js';
import type { AgentJobData, LifecycleJobData } from '../queues.js';

// ── Helpers ─────────────────────────────────────────────────

function createMockRedis() {
  return {
    publish: vi.fn().mockResolvedValue(1),
  } as unknown as Parameters<typeof processAgentJob>[1];
}

function makeFullTask() {
  return {
    id: 'task-1',
    title: 'Build auth',
    description: 'Implement OAuth',
    status: 'IN_PROGRESS',
    priority: 2,
    projectId: 'proj-1',
    project: { id: 'proj-1', title: 'Project X', description: null, prd: null },
    comments: [],
    assignee: {
      id: 'agent-1',
      name: 'DevBot',
      specialization: {
        id: 'spec-dev',
        name: 'developer',
        keywords: ['dev', 'code'],
        description: null,
        systemPrompt: null,
      },
      systemPrompt: null,
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      maxTokens: 4096,
      skills: [],
      agentWorkflows: [],
    },
  };
}

describe('processAgentJob', () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = createMockRedis();
  });

  it('runs full success flow: claim -> load -> sandbox -> execute -> post', async () => {
    const jobData: AgentJobData = { runId: 'run-1', taskId: 'task-1', userId: 'user-1' };
    const task = makeFullTask();

    mockPrisma.task.findUnique.mockResolvedValue(task);
    mockPrisma.user.findUnique.mockResolvedValue({ claudeApiKey: 'sk-ant-test' });

    const mockSandboxInstance = {
      init: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateSandbox.mockReturnValue(mockSandboxInstance);
    mockCreateLLMClient.mockReturnValue({ chat: vi.fn() });
    mockExecuteAgent.mockResolvedValue({ totalTokens: 500, totalCost: 0.01 });

    await processAgentJob(jobData, redis);

    // 1. Claim run
    expect(mockPrisma.taskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'RUNNING' }),
      })
    );

    // 2. Load context
    expect(mockPrisma.task.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'task-1' } })
    );

    // 3. Sandbox
    expect(mockCreateSandbox).toHaveBeenCalled();
    expect(mockSandboxInstance.init).toHaveBeenCalled();

    // 4. Execute
    expect(mockExecuteAgent).toHaveBeenCalledTimes(1);

    // 5. Post-execution: mark run SUCCESS
    expect(mockPrisma.taskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'SUCCESS', tokens: 500, cost: 0.01 }),
      })
    );

    // Clear currentRunId
    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { currentRunId: null },
    });

    // Sandbox destroyed
    expect(mockSandboxInstance.destroy).toHaveBeenCalled();
  });

  it('throws when task not found', async () => {
    const jobData: AgentJobData = { runId: 'run-2', taskId: 'missing-task', userId: 'user-1' };
    mockPrisma.task.findUnique.mockResolvedValue(null);

    await expect(processAgentJob(jobData, redis)).rejects.toThrow('Task missing-task not found');
  });

  it('throws when task has no assignee', async () => {
    const jobData: AgentJobData = { runId: 'run-3', taskId: 'task-no-agent', userId: 'user-1' };
    mockPrisma.task.findUnique.mockResolvedValue({
      ...makeFullTask(),
      id: 'task-no-agent',
      assignee: null,
    });

    await expect(processAgentJob(jobData, redis)).rejects.toThrow('has no assigned agent');
  });

  it('throws when no API key is configured', async () => {
    const jobData: AgentJobData = { runId: 'run-4', taskId: 'task-1', userId: 'user-1' };
    mockPrisma.task.findUnique.mockResolvedValue(makeFullTask());
    mockPrisma.user.findUnique.mockResolvedValue({ claudeApiKey: null });

    // Also clear env to ensure no fallback
    const origKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(processAgentJob(jobData, redis)).rejects.toThrow('No API key configured');

    if (origKey) {
      process.env.ANTHROPIC_API_KEY = origKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('marks run as FAILED and cleans up sandbox on execution error', async () => {
    const jobData: AgentJobData = { runId: 'run-5', taskId: 'task-1', userId: 'user-1' };
    mockPrisma.task.findUnique.mockResolvedValue(makeFullTask());
    mockPrisma.user.findUnique.mockResolvedValue({ claudeApiKey: 'sk-test' });

    const mockSandboxInstance = {
      init: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateSandbox.mockReturnValue(mockSandboxInstance);
    mockCreateLLMClient.mockReturnValue({ chat: vi.fn() });
    mockExecuteAgent.mockRejectedValue(new Error('LLM error'));

    await expect(processAgentJob(jobData, redis)).rejects.toThrow('LLM error');

    // Run marked FAILED
    expect(mockPrisma.taskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-5' },
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    );

    // currentRunId cleared
    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { currentRunId: null },
    });

    // Sandbox still destroyed
    expect(mockSandboxInstance.destroy).toHaveBeenCalled();
  });

  it('still destroys sandbox even if sandbox.destroy throws', async () => {
    const jobData: AgentJobData = { runId: 'run-6', taskId: 'task-1', userId: 'user-1' };
    mockPrisma.task.findUnique.mockResolvedValue(makeFullTask());
    mockPrisma.user.findUnique.mockResolvedValue({ claudeApiKey: 'sk-test' });

    const mockSandboxInstance = {
      init: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockRejectedValue(new Error('destroy failed')),
    };
    mockCreateSandbox.mockReturnValue(mockSandboxInstance);
    mockCreateLLMClient.mockReturnValue({ chat: vi.fn() });
    mockExecuteAgent.mockResolvedValue({ totalTokens: 10, totalCost: 0.001 });

    // Should NOT throw even though destroy fails
    await processAgentJob(jobData, redis);

    expect(mockSandboxInstance.destroy).toHaveBeenCalled();
  });

  it('falls back to ANTHROPIC_API_KEY env var when user has no key', async () => {
    const jobData: AgentJobData = { runId: 'run-7', taskId: 'task-1', userId: 'user-1' };
    mockPrisma.task.findUnique.mockResolvedValue(makeFullTask());
    mockPrisma.user.findUnique.mockResolvedValue({ claudeApiKey: null });

    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-env-fallback';

    const mockSandboxInstance = {
      init: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateSandbox.mockReturnValue(mockSandboxInstance);
    mockCreateLLMClient.mockReturnValue({ chat: vi.fn() });
    mockExecuteAgent.mockResolvedValue({ totalTokens: 10, totalCost: 0.001 });

    await processAgentJob(jobData, redis);

    expect(mockCreateLLMClient).toHaveBeenCalledWith('sk-env-fallback', { isOAuth: false });

    if (origKey) {
      process.env.ANTHROPIC_API_KEY = origKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});

describe('processLifecycleJob', () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = createMockRedis();
  });

  describe('unblock-dependents', () => {
    it('unblocks dependent tasks when all dependencies are DONE', async () => {
      const jobData: LifecycleJobData = {
        type: 'unblock-dependents',
        taskId: 'completed-task',
        userId: 'user-1',
      };

      // Two dependents
      mockPrisma.taskDependency.findMany
        .mockResolvedValueOnce([
          { taskId: 'dep-task-1' },
          { taskId: 'dep-task-2' },
        ])
        // dep-task-1's dependencies: all DONE
        .mockResolvedValueOnce([
          { taskId: 'dep-task-1', dependsOnId: 'completed-task', dependsOn: { status: 'DONE' } },
        ])
        // dep-task-2's dependencies: one still IN_PROGRESS
        .mockResolvedValueOnce([
          { taskId: 'dep-task-2', dependsOnId: 'completed-task', dependsOn: { status: 'DONE' } },
          { taskId: 'dep-task-2', dependsOnId: 'other-task', dependsOn: { status: 'IN_PROGRESS' } },
        ]);

      await processLifecycleJob(jobData, redis);

      // dep-task-1 should be unblocked (isBlocked = false)
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'dep-task-1' },
        data: { isBlocked: false },
      });

      // dep-task-2 still blocked
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'dep-task-2' },
        data: { isBlocked: true },
      });

      // Publishes update
      expect((redis as unknown as { publish: ReturnType<typeof vi.fn> }).publish).toHaveBeenCalledWith(
        'task-updates',
        expect.any(String)
      );
    });

    it('does nothing when no dependents exist', async () => {
      const jobData: LifecycleJobData = {
        type: 'unblock-dependents',
        taskId: 'leaf-task',
        userId: 'user-1',
      };

      mockPrisma.taskDependency.findMany.mockResolvedValueOnce([]);

      await processLifecycleJob(jobData, redis);

      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('check-project-completion', () => {
    it('marks project COMPLETED when all tasks are DONE', async () => {
      const jobData: LifecycleJobData = {
        type: 'check-project-completion',
        taskId: 'task-1',
        userId: 'user-1',
      };

      mockPrisma.task.findUnique.mockResolvedValue({ projectId: 'proj-1' });
      mockPrisma.task.count.mockResolvedValue(0); // zero incomplete tasks

      await processLifecycleJob(jobData, redis);

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { status: 'COMPLETED' },
      });

      expect((redis as unknown as { publish: ReturnType<typeof vi.fn> }).publish).toHaveBeenCalledWith(
        'project-updates',
        expect.stringContaining('proj-1')
      );
    });

    it('does NOT mark project COMPLETED when tasks remain', async () => {
      const jobData: LifecycleJobData = {
        type: 'check-project-completion',
        taskId: 'task-1',
        userId: 'user-1',
      };

      mockPrisma.task.findUnique.mockResolvedValue({ projectId: 'proj-1' });
      mockPrisma.task.count.mockResolvedValue(3); // 3 incomplete tasks

      await processLifecycleJob(jobData, redis);

      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });

    it('does nothing when task has no projectId', async () => {
      const jobData: LifecycleJobData = {
        type: 'check-project-completion',
        taskId: 'orphan-task',
        userId: 'user-1',
      };

      mockPrisma.task.findUnique.mockResolvedValue({ projectId: null });

      await processLifecycleJob(jobData, redis);

      expect(mockPrisma.task.count).not.toHaveBeenCalled();
      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });

    it('does nothing when task not found', async () => {
      const jobData: LifecycleJobData = {
        type: 'check-project-completion',
        taskId: 'missing',
        userId: 'user-1',
      };

      mockPrisma.task.findUnique.mockResolvedValue(null);

      await processLifecycleJob(jobData, redis);

      expect(mockPrisma.task.count).not.toHaveBeenCalled();
    });
  });

  describe('auto-spawn-agent', () => {
    it('assigns agent and creates run for auto-spawn', async () => {
      const jobData: LifecycleJobData = {
        type: 'auto-spawn-agent',
        taskId: 'task-1',
        userId: 'user-1',
        agentId: 'qa-agent-1',
      };

      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'qa-agent-1',
        specialization: { name: 'qa' },
      });
      mockPrisma.taskRun.create.mockResolvedValue({ id: 'auto-run-1' });

      await processLifecycleJob(jobData, redis);

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'qa-agent-1',
          userId: 'user-1',
        },
        include: { specialization: true },
      });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { assigneeId: 'qa-agent-1' },
      });

      expect(mockPrisma.taskRun.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          agentType: 'qa',
          status: 'QUEUED',
        },
      });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { currentRunId: 'auto-run-1' },
      });
    });

    it('does nothing when no agentId provided', async () => {
      const jobData: LifecycleJobData = {
        type: 'auto-spawn-agent',
        taskId: 'task-1',
        userId: 'user-1',
      };

      await processLifecycleJob(jobData, redis);

      expect(mockPrisma.agent.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
      expect(mockPrisma.taskRun.create).not.toHaveBeenCalled();
    });

    it('does nothing when no matching agent found', async () => {
      const jobData: LifecycleJobData = {
        type: 'auto-spawn-agent',
        taskId: 'task-1',
        userId: 'user-1',
        agentId: 'nonexistent-agent',
      };

      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await processLifecycleJob(jobData, redis);

      expect(mockPrisma.task.update).not.toHaveBeenCalled();
      expect(mockPrisma.taskRun.create).not.toHaveBeenCalled();
    });
  });

  describe('unknown type', () => {
    it('handles unknown lifecycle type gracefully', async () => {
      const jobData = {
        type: 'unknown-action' as LifecycleJobData['type'],
        taskId: 'task-1',
        userId: 'user-1',
      };

      // Should not throw
      await processLifecycleJob(jobData, redis);
    });
  });
});
