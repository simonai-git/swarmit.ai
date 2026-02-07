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

  describe('cleanup - stale running jobs', () => {
    it('should force-fail jobs running longer than 5 minutes', async () => {
      const job = await agentQueue.enqueue({
        taskId: 'stale-task-1',
        agentType: 'developer',
        priority: 5,
        tenantId: 'default',
      });

      // Simulate job running for 6 minutes
      const status = await agentQueue.getStatus();
      const internalJob = status.jobs.find(j => j.id === job.id);
      if (internalJob) {
        internalJob.status = 'running';
        internalJob.startedAt = new Date(Date.now() - 6 * 60000);
      }

      agentQueue.cleanup();

      const afterStatus = await agentQueue.getStatus();
      const updatedJob = afterStatus.jobs.find(j => j.id === job.id);
      expect(updatedJob?.status).toBe('failed');
      expect(updatedJob?.error).toBe('Job timed out (stale)');
    });

    it('should keep jobs running less than 5 minutes', async () => {
      const job = await agentQueue.enqueue({
        taskId: 'fresh-task-1',
        agentType: 'developer',
        priority: 5,
        tenantId: 'default',
      });

      // Simulate job running for 2 minutes
      const status = await agentQueue.getStatus();
      const internalJob = status.jobs.find(j => j.id === job.id);
      if (internalJob) {
        internalJob.status = 'running';
        internalJob.startedAt = new Date(Date.now() - 2 * 60000);
      }

      agentQueue.cleanup();

      const afterStatus = await agentQueue.getStatus();
      const updatedJob = afterStatus.jobs.find(j => j.id === job.id);
      expect(updatedJob?.status).toBe('running');
    });

    it('should set error message and completedAt on force-failed jobs', async () => {
      const job = await agentQueue.enqueue({
        taskId: 'stale-task-2',
        agentType: 'qa',
        priority: 5,
        tenantId: 'default',
      });

      // Simulate job running for 10 minutes
      const status = await agentQueue.getStatus();
      const internalJob = status.jobs.find(j => j.id === job.id);
      if (internalJob) {
        internalJob.status = 'running';
        internalJob.startedAt = new Date(Date.now() - 10 * 60000);
      }

      agentQueue.cleanup();

      const afterStatus = await agentQueue.getStatus();
      const updatedJob = afterStatus.jobs.find(j => j.id === job.id);
      expect(updatedJob?.error).toBe('Job timed out (stale)');
      expect(updatedJob?.completedAt).toBeDefined();
    });
  });

  describe('getStatus with tenantId filtering', () => {
    it('returns all jobs when no tenantId provided', async () => {
      await agentQueue.enqueue({ taskId: 'all-task-a', agentType: 'developer', priority: 5, tenantId: 'all-alice@test.com' });
      await agentQueue.enqueue({ taskId: 'all-task-b', agentType: 'qa', priority: 5, tenantId: 'all-bob@test.com' });

      const status = await agentQueue.getStatus();
      const taskIds = status.jobs.map(j => j.taskId);
      expect(taskIds).toContain('all-task-a');
      expect(taskIds).toContain('all-task-b');
    });

    it('filters jobs by tenantId when provided', async () => {
      await agentQueue.enqueue({ taskId: 'filt-task-a', agentType: 'developer', priority: 5, tenantId: 'filt-alice@test.com' });
      await agentQueue.enqueue({ taskId: 'filt-task-b', agentType: 'qa', priority: 5, tenantId: 'filt-bob@test.com' });

      const aliceStatus = await agentQueue.getStatus('filt-alice@test.com');
      const aliceTaskIds = aliceStatus.jobs.map(j => j.taskId);
      expect(aliceTaskIds).toContain('filt-task-a');
      expect(aliceTaskIds).not.toContain('filt-task-b');

      const bobStatus = await agentQueue.getStatus('filt-bob@test.com');
      const bobTaskIds = bobStatus.jobs.map(j => j.taskId);
      expect(bobTaskIds).toContain('filt-task-b');
      expect(bobTaskIds).not.toContain('filt-task-a');
    });

    it('stores tenantId on in-memory jobs', async () => {
      const job = await agentQueue.enqueue({ taskId: 'store-task-t', agentType: 'developer', priority: 5, tenantId: 'store-tenant@test.com' });
      expect(job.tenantId).toBe('store-tenant@test.com');
    });

    it('returns correct counts per tenant', async () => {
      await agentQueue.enqueue({ taskId: 'cnt-a1', agentType: 'developer', priority: 5, tenantId: 'cnt-alice@test.com' });
      await agentQueue.enqueue({ taskId: 'cnt-a2', agentType: 'qa', priority: 5, tenantId: 'cnt-alice@test.com' });
      await agentQueue.enqueue({ taskId: 'cnt-b1', agentType: 'developer', priority: 5, tenantId: 'cnt-bob@test.com' });

      const aliceStatus = await agentQueue.getStatus('cnt-alice@test.com');
      expect(aliceStatus.pending).toBe(2);

      const bobStatus = await agentQueue.getStatus('cnt-bob@test.com');
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

  describe('getDefaultNextStatus — pipeline progression', () => {
    // These tests verify the status progression that triggers next-agent enqueuing
    // When developer completes: todo/in_progress → testing → QA agent enqueued
    // When QA completes: testing → in_review → reviewer agent enqueued
    // When reviewer completes: in_review → done → no agent enqueued

    it('developer completing todo → testing (triggers QA)', () => {
      expect(getDefaultNextStatus('developer', 'todo')).toBe('testing');
    });

    it('developer completing in_progress → testing (triggers QA)', () => {
      expect(getDefaultNextStatus('developer', 'in_progress')).toBe('testing');
    });

    it('qa completing testing → in_review (triggers reviewer)', () => {
      expect(getDefaultNextStatus('qa', 'testing')).toBe('in_review');
    });

    it('reviewer completing in_review → done (no next agent)', () => {
      expect(getDefaultNextStatus('reviewer', 'in_review')).toBe('done');
    });
  });

  describe('activeRuns filtering', () => {
    it('getStatus should only return actually running runs, not completed ones', async () => {
      // The running map may contain completed/failed runs that haven't been cleaned up yet
      // getStatus should filter these out so the scheduler doesn't skip tasks
      const status = await agentQueue.getStatus();
      // All activeRuns should have status 'running'
      for (const run of status.activeRuns) {
        expect(run.status).toBe('running');
      }
    });
  });

  describe('in-memory duplicate detection', () => {
    it('should return existing pending job for same task+agentType', async () => {
      const job1 = await agentQueue.enqueue({
        taskId: 'dup-test-task',
        agentType: 'developer',
        priority: 5,
        tenantId: 'dup-tenant',
      });

      const job2 = await agentQueue.enqueue({
        taskId: 'dup-test-task',
        agentType: 'developer',
        priority: 5,
        tenantId: 'dup-tenant',
      });

      expect(job2.id).toBe(job1.id);
    });

    it('should allow different agentType for same task', async () => {
      const job1 = await agentQueue.enqueue({
        taskId: 'dup-test-task-2',
        agentType: 'developer',
        priority: 5,
        tenantId: 'dup-tenant-2',
      });

      const job2 = await agentQueue.enqueue({
        taskId: 'dup-test-task-2',
        agentType: 'qa',
        priority: 5,
        tenantId: 'dup-tenant-2',
      });

      expect(job2.id).not.toBe(job1.id);
    });
  });

  describe('in-memory getJob', () => {
    it('should find a job by id in in-memory storage', async () => {
      const job = await agentQueue.enqueue({
        taskId: 'getjob-task',
        agentType: 'developer',
        priority: 5,
        tenantId: 'getjob-tenant',
      });

      const found = await agentQueue.getJob(job.id);
      expect(found).toBeDefined();
      expect(found?.taskId).toBe('getjob-task');
    });

    it('should return undefined for unknown job id', async () => {
      const found = await agentQueue.getJob('nonexistent-job-id');
      expect(found).toBeUndefined();
    });
  });

  describe('in-memory cancel', () => {
    it('should cancel a pending job', async () => {
      const job = await agentQueue.enqueue({
        taskId: 'cancel-task',
        agentType: 'developer',
        priority: 5,
        tenantId: 'cancel-tenant',
      });

      const cancelled = await agentQueue.cancel(job.id);
      expect(cancelled).toBe(true);
    });

    it('should return false for unknown job id', async () => {
      const cancelled = await agentQueue.cancel('nonexistent-job');
      expect(cancelled).toBe(false);
    });
  });
});
