import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for mock functions that need to be available in vi.mock factories
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: {
    query: mockQuery,
  },
  default: {
    query: mockQuery,
  },
  getTask: vi.fn(),
  getProject: vi.fn(),
  getCommentsByTaskId: vi.fn(),
  updateTask: vi.fn(),
  createComment: vi.fn(),
}));

import { getTodaySpend, getSpendByPeriod, saveAgentRun, getAgentRuns, getAgentRun } from '@/lib/agent-queue';

vi.mock('@/lib/claude', () => ({
  runAgent: vi.fn(),
  calculateCost: vi.fn(() => 100),
  AGENT_PROMPTS: {
    developer: 'Test developer prompt',
    qa: 'Test qa prompt',
    reviewer: 'Test reviewer prompt',
  },
  getUserClaudeKey: vi.fn(),
}));

vi.mock('@/lib/sandbox-executor', () => ({
  SandboxToolExecutor: {
    create: vi.fn(() => ({
      getWorkdir: vi.fn(() => '/tmp/sandbox'),
      cleanup: vi.fn(),
    })),
  },
}));

vi.mock('@/lib/redis-queue', () => ({
  getQueue: vi.fn(() => ({
    enqueue: vi.fn(),
    getStatus: vi.fn(() => ({ pending: 0, running: 0, jobs: [] })),
    startProcessing: vi.fn(),
    stopProcessing: vi.fn(),
  })),
}));

describe('agent-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTodaySpend', () => {
    it('should return today total spend', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: 500 }],
      });

      const spend = await getTodaySpend();
      expect(spend).toBe(500);
    });

    it('should return 0 when no spend', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: 0 }],
      });

      const spend = await getTodaySpend();
      expect(spend).toBe(0);
    });

    it('should query for current date', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: 0 }],
      });

      await getTodaySpend();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CURRENT_DATE')
      );
    });
  });

  describe('getSpendByPeriod', () => {
    it('should return spend breakdown', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1000 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { agent_type: 'developer', total: 600 },
          { agent_type: 'qa', total: 400 },
        ],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: new Date('2026-02-04'), total: 500 },
          { date: new Date('2026-02-05'), total: 500 },
        ],
      });

      const startDate = new Date('2026-02-04');
      const endDate = new Date('2026-02-05');
      const result = await getSpendByPeriod(startDate, endDate);

      expect(result.total).toBe(1000);
      expect(result.byAgent.developer).toBe(600);
      expect(result.byAgent.qa).toBe(400);
      expect(result.byDay).toHaveLength(2);
    });
  });

  describe('saveAgentRun', () => {
    it('should insert or update agent run', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const run = {
        id: 'run-123',
        jobId: 'job-123',
        taskId: 'task-123',
        agentType: 'developer',
        status: 'completed' as const,
        startedAt: new Date(),
        completedAt: new Date(),
        inputTokens: 1000,
        outputTokens: 500,
        costCents: 100,
        transcript: [],
      };

      await saveAgentRun(run);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_runs'),
        expect.arrayContaining(['run-123', 'task-123', 'developer'])
      );
    });

    it('should include error in save', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const run = {
        id: 'run-123',
        jobId: 'job-123',
        taskId: 'task-123',
        agentType: 'developer',
        status: 'failed' as const,
        startedAt: new Date(),
        completedAt: new Date(),
        inputTokens: 100,
        outputTokens: 0,
        costCents: 10,
        transcript: [],
        error: 'Something went wrong',
      };

      await saveAgentRun(run);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['Something went wrong'])
      );
    });
  });

  describe('getAgentRuns', () => {
    it('should return runs for a task', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'run-1',
            task_id: 'task-123',
            agent_type: 'developer',
            status: 'completed',
            transcript: [{ role: 'assistant', content: 'Done' }],
          },
          {
            id: 'run-2',
            task_id: 'task-123',
            agent_type: 'qa',
            status: 'completed',
            transcript: null,
          },
        ],
      });

      const runs = await getAgentRuns('task-123');

      expect(runs).toHaveLength(2);
      expect(runs[0].transcript).toHaveLength(1);
      expect(runs[1].transcript).toEqual([]);
    });

    it('should query with correct task id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAgentRuns('specific-task');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('task_id'),
        ['specific-task']
      );
    });
  });

  describe('getAgentRun', () => {
    it('should return a single run', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'run-123',
          task_id: 'task-123',
          agent_type: 'developer',
          status: 'completed',
          transcript: [{ role: 'assistant', content: 'Done' }],
        }],
      });

      const run = await getAgentRun('run-123');

      expect(run).toBeDefined();
      expect(run?.id).toBe('run-123');
    });

    it('should return null for non-existent run', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const run = await getAgentRun('unknown');

      expect(run).toBeNull();
    });

    it('should handle null transcript', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'run-123',
          transcript: null,
        }],
      });

      const run = await getAgentRun('run-123');

      expect(run?.transcript).toEqual([]);
    });
  });

  describe('saveAgentRun with transcript', () => {
    it('should serialize transcript to JSON', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const run = {
        id: 'run-tx',
        jobId: 'job-tx',
        taskId: 'task-tx',
        agentType: 'developer',
        status: 'completed' as const,
        startedAt: new Date(),
        completedAt: new Date(),
        inputTokens: 100,
        outputTokens: 50,
        costCents: 10,
        transcript: [
          { role: 'user', content: 'Hello', timestamp: new Date() },
          { role: 'assistant', content: 'Hi', timestamp: new Date() },
        ],
      };

      await saveAgentRun(run);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_runs'),
        expect.arrayContaining([expect.stringContaining('"role":"user"')])
      );
    });
  });
});
