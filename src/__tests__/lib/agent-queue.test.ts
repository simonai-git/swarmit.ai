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

import { getTodaySpend, getSpendByPeriod, saveAgentRun, getAgentRuns, getAgentRun, getDefaultNextStatus, agentQueue } from '@/lib/agent-queue';

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

  describe('cleanup', () => {
    it('removes completed jobs older than maxAgeMs', async () => {
      // Enqueue a job — it will be pending in the in-memory queue
      const job = await agentQueue.enqueue({
        taskId: 'cleanup-task-1',
        agentType: 'developer',
        priority: 5,
        tenantId: 'default',
      });

      // Manually mutate the job to simulate completion 2 hours ago
      const status = await agentQueue.getStatus();
      const internalJob = status.jobs.find(j => j.id === job.id);
      if (internalJob) {
        internalJob.status = 'completed';
        internalJob.completedAt = new Date(Date.now() - 2 * 3600000);
      }

      // Cleanup with 1 hour max age
      agentQueue.cleanup(3600000);

      const afterStatus = await agentQueue.getStatus();
      expect(afterStatus.jobs.find(j => j.id === job.id)).toBeUndefined();
    });

    it('keeps recent completed jobs within maxAgeMs', async () => {
      const job = await agentQueue.enqueue({
        taskId: 'cleanup-task-2',
        agentType: 'developer',
        priority: 5,
        tenantId: 'default',
      });

      // Simulate completion 10 minutes ago
      const status = await agentQueue.getStatus();
      const internalJob = status.jobs.find(j => j.id === job.id);
      if (internalJob) {
        internalJob.status = 'completed';
        internalJob.completedAt = new Date(Date.now() - 10 * 60000);
      }

      // Cleanup with 1 hour max age — job should survive
      agentQueue.cleanup(3600000);

      const afterStatus = await agentQueue.getStatus();
      expect(afterStatus.jobs.find(j => j.id === job.id)).toBeDefined();
    });

    it('keeps pending and running jobs regardless of age', async () => {
      const job = await agentQueue.enqueue({
        taskId: 'cleanup-task-3',
        agentType: 'qa',
        priority: 5,
        tenantId: 'default',
      });

      // Job is pending — cleanup should not remove it
      agentQueue.cleanup(0); // maxAge = 0 would remove all completed, but not pending

      const afterStatus = await agentQueue.getStatus();
      expect(afterStatus.jobs.find(j => j.id === job.id)).toBeDefined();
    });
  });

  describe('getStatus with tenantId filtering', () => {
    it('returns all jobs when no tenantId provided', async () => {
      await agentQueue.enqueue({ taskId: 'task-a', agentType: 'developer', priority: 5, tenantId: 'alice@test.com' });
      await agentQueue.enqueue({ taskId: 'task-b', agentType: 'qa', priority: 5, tenantId: 'bob@test.com' });

      const status = await agentQueue.getStatus();
      const taskIds = status.jobs.map(j => j.taskId);
      expect(taskIds).toContain('task-a');
      expect(taskIds).toContain('task-b');
    });

    it('filters jobs by tenantId when provided', async () => {
      await agentQueue.enqueue({ taskId: 'task-a', agentType: 'developer', priority: 5, tenantId: 'alice@test.com' });
      await agentQueue.enqueue({ taskId: 'task-b', agentType: 'qa', priority: 5, tenantId: 'bob@test.com' });

      const aliceStatus = await agentQueue.getStatus('alice@test.com');
      const aliceTaskIds = aliceStatus.jobs.map(j => j.taskId);
      expect(aliceTaskIds).toContain('task-a');
      expect(aliceTaskIds).not.toContain('task-b');

      const bobStatus = await agentQueue.getStatus('bob@test.com');
      const bobTaskIds = bobStatus.jobs.map(j => j.taskId);
      expect(bobTaskIds).toContain('task-b');
      expect(bobTaskIds).not.toContain('task-a');
    });

    it('stores tenantId on in-memory jobs', async () => {
      const job = await agentQueue.enqueue({ taskId: 'task-t', agentType: 'developer', priority: 5, tenantId: 'tenant@test.com' });
      expect(job.tenantId).toBe('tenant@test.com');
    });

    it('returns correct counts per tenant', async () => {
      await agentQueue.enqueue({ taskId: 'task-a1', agentType: 'developer', priority: 5, tenantId: 'alice@test.com' });
      await agentQueue.enqueue({ taskId: 'task-a2', agentType: 'qa', priority: 5, tenantId: 'alice@test.com' });
      await agentQueue.enqueue({ taskId: 'task-b1', agentType: 'developer', priority: 5, tenantId: 'bob@test.com' });

      const aliceStatus = await agentQueue.getStatus('alice@test.com');
      expect(aliceStatus.pending).toBe(2);

      const bobStatus = await agentQueue.getStatus('bob@test.com');
      expect(bobStatus.pending).toBe(1);
    });
  });

  describe('getDefaultNextStatus', () => {
    it('qa agent in testing → in_review', () => {
      expect(getDefaultNextStatus('qa', 'testing')).toBe('in_review');
    });

    it('reviewer agent in in_review → done', () => {
      expect(getDefaultNextStatus('reviewer', 'in_review')).toBe('done');
    });

    it('developer agent in todo → testing', () => {
      expect(getDefaultNextStatus('developer', 'todo')).toBe('testing');
    });

    it('developer agent in in_progress → testing', () => {
      expect(getDefaultNextStatus('developer', 'in_progress')).toBe('testing');
    });

    it('returns null for unrecognized combination', () => {
      expect(getDefaultNextStatus('qa', 'in_progress')).toBeNull();
      expect(getDefaultNextStatus('developer', 'testing')).toBeNull();
      expect(getDefaultNextStatus('reviewer', 'todo')).toBeNull();
      expect(getDefaultNextStatus('unknown', 'testing')).toBeNull();
    });

    it('returns null for done status', () => {
      expect(getDefaultNextStatus('developer', 'done')).toBeNull();
      expect(getDefaultNextStatus('qa', 'done')).toBeNull();
      expect(getDefaultNextStatus('reviewer', 'done')).toBeNull();
    });
  });
});
