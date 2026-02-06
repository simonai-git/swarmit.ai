import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScheduler, stopScheduler, getSchedulerStatus, forceSchedulerTick } from '@/lib/scheduler';
import { getUsersWithApiKeys, getTasksByUserEmail, getAgentRunsByTask, updateTask, getOrphanedTasks, assignOrphanedTasks } from '@/lib/db';
import { agentQueue } from '@/lib/agent-queue';
import cron from 'node-cron';

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn(),
    })),
  },
}));

vi.mock('@/lib/db', () => ({
  getUsersWithApiKeys: vi.fn(),
  getTasksByUserEmail: vi.fn(),
  getAgentRunsByTask: vi.fn(),
  updateTask: vi.fn(),
  getOrphanedTasks: vi.fn(),
  assignOrphanedTasks: vi.fn(),
}));

vi.mock('@/lib/agent-queue', () => ({
  agentQueue: {
    enqueue: vi.fn(),
    getStatus: vi.fn(),
  },
}));

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no orphaned tasks
    vi.mocked(getOrphanedTasks).mockResolvedValue([]);
    vi.mocked(assignOrphanedTasks).mockResolvedValue(0);
    vi.mocked(updateTask).mockResolvedValue(null);
  });

  afterEach(() => {
    stopScheduler();
  });

  describe('getSchedulerStatus', () => {
    it('returns isRunning and recentlyEnqueuedCount', () => {
      const status = getSchedulerStatus();
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('recentlyEnqueuedCount');
      expect(typeof status.isRunning).toBe('boolean');
      expect(typeof status.recentlyEnqueuedCount).toBe('number');
    });
  });

  describe('startScheduler', () => {
    it('calls cron.schedule, sets isRunning, runs tick immediately', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      startScheduler();

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/30 * * * * *',
        expect.any(Function)
      );

      const status = getSchedulerStatus();
      expect(status.isRunning).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(getUsersWithApiKeys).toHaveBeenCalled();
    });

    it('does nothing if already running', () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      startScheduler();
      const callCount = vi.mocked(cron.schedule).mock.calls.length;

      startScheduler();

      expect(vi.mocked(cron.schedule).mock.calls.length).toBe(callCount);
    });
  });

  describe('stopScheduler', () => {
    it('stops scheduled task and clears state', () => {
      const mockStop = vi.fn();
      vi.mocked(cron.schedule).mockReturnValue({
        stop: mockStop,
      } as any);
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      startScheduler();
      stopScheduler();

      expect(mockStop).toHaveBeenCalled();
      const status = getSchedulerStatus();
      expect(status.isRunning).toBe(false);
      expect(status.recentlyEnqueuedCount).toBe(0);
    });
  });

  describe('forceSchedulerTick', () => {
    it('executes schedulerTick directly', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(getUsersWithApiKeys).toHaveBeenCalled();
      expect(getTasksByUserEmail).toHaveBeenCalledWith('user@test.com');
    });
  });

  describe('schedulerTick (via forceSchedulerTick)', () => {
    it('skips if no users with API keys found', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(getTasksByUserEmail).not.toHaveBeenCalled();
      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('skips done tasks', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Done Task',
          status: 'done',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('skips tasks without assignee', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Unassigned Task',
          status: 'todo',
          assignee: null,
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('skips tasks already in queue', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Queued Task',
          status: 'todo',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ taskId: 'task-1', status: 'pending' } as any],
        activeRuns: [],
        pending: 1,
        running: 0,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('skips tasks with active agents', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Active Task',
          status: 'in_progress',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [{ taskId: 'task-1' } as any],
        pending: 0,
        running: 1,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('enqueues up to 5 tasks max per user', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        status: 'todo',
        assignee: 'agent@test.com',
        priority: 'medium',
        description: 'Test',
        user_email: 'user@test.com',
        created_at: new Date(),
        updated_at: new Date(),
      }));
      vi.mocked(getTasksByUserEmail).mockResolvedValue(tasks as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledTimes(5);
    });

    it('uses correct agentType: qa for testing', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Testing Task',
          status: 'testing',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledWith({
        taskId: 'task-1',
        agentType: 'qa',
        priority: 10,
        tenantId: 'user@test.com',
        userEmail: 'user@test.com',
      });
    });

    it('uses correct agentType: reviewer for in_review', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Review Task',
          status: 'in_review',
          assignee: 'agent@test.com',
          priority: 'medium',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledWith({
        taskId: 'task-1',
        agentType: 'reviewer',
        priority: 5,
        tenantId: 'user@test.com',
        userEmail: 'user@test.com',
      });
    });

    it('uses correct agentType: developer for others', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Dev Task',
          status: 'todo',
          assignee: 'agent@test.com',
          priority: 'low',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledWith({
        taskId: 'task-1',
        agentType: 'developer',
        priority: 1,
        tenantId: 'user@test.com',
        userEmail: 'user@test.com',
      });
    });

    it('uses correct priority: high=10, medium=5, low=1', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-high',
          title: 'High Priority',
          status: 'todo',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'task-medium',
          title: 'Medium Priority',
          status: 'todo',
          assignee: 'agent@test.com',
          priority: 'medium',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'task-low',
          title: 'Low Priority',
          status: 'todo',
          assignee: 'agent@test.com',
          priority: 'low',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenNthCalledWith(1, expect.objectContaining({
        taskId: 'task-high',
        priority: 10,
      }));
      expect(agentQueue.enqueue).toHaveBeenNthCalledWith(2, expect.objectContaining({
        taskId: 'task-medium',
        priority: 5,
      }));
      expect(agentQueue.enqueue).toHaveBeenNthCalledWith(3, expect.objectContaining({
        taskId: 'task-low',
        priority: 1,
      }));
    });

    it('passes userEmail to enqueue', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Test Task',
          status: 'todo',
          assignee: 'agent@test.com',
          priority: 'medium',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          userEmail: 'user@test.com',
          tenantId: 'user@test.com',
        })
      );
    });

    it('handles enqueue errors gracefully', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Task 1',
          status: 'todo',
          assignee: 'agent@test.com',
          priority: 'medium',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'task-2',
          title: 'Task 2',
          status: 'todo',
          assignee: 'agent@test.com',
          priority: 'medium',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);
      vi.mocked(agentQueue.enqueue)
        .mockRejectedValueOnce(new Error('Enqueue failed'))
        .mockResolvedValueOnce(undefined as any);

      await expect(forceSchedulerTick()).resolves.not.toThrow();

      expect(agentQueue.enqueue).toHaveBeenCalledTimes(2);
    });

    it('marks stuck tasks as blocked and skips them', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'stuck-task',
          title: 'Stuck Task',
          status: 'testing',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          is_blocked: false,
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      // 3 completed runs in the last 30 minutes
      vi.mocked(getAgentRunsByTask).mockResolvedValue([
        { status: 'completed', created_at: new Date().toISOString() },
        { status: 'completed', created_at: new Date().toISOString() },
        { status: 'completed', created_at: new Date().toISOString() },
      ] as any);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
      expect(updateTask).toHaveBeenCalledWith('stuck-task', {
        is_blocked: true,
        blocked_reason: 'Agent ran 3 times in 30 minutes without advancing status. Manual intervention needed.',
      });
    });

    it('skips already blocked tasks without checking runs', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'blocked-task',
          title: 'Blocked Task',
          status: 'testing',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          is_blocked: true,
          blocked_reason: 'Already blocked',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
      // Should not even check runs since task is skipped early
      expect(getAgentRunsByTask).not.toHaveBeenCalled();
      expect(updateTask).not.toHaveBeenCalled();
    });

    it('allows tasks with fewer than 3 recent runs', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'ok-task',
          title: 'OK Task',
          status: 'testing',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      // Only 2 completed runs — under threshold
      vi.mocked(getAgentRunsByTask).mockResolvedValue([
        { status: 'completed', created_at: new Date().toISOString() },
        { status: 'completed', created_at: new Date().toISOString() },
      ] as any);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('does not skip tasks whose only jobs are completed', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Testing Task',
          status: 'testing',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ taskId: 'task-1', status: 'completed' } as any],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 1,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1', agentType: 'qa' })
      );
    });

    it('does not skip tasks whose only jobs are failed', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Failed Task',
          status: 'in_progress',
          assignee: 'agent@test.com',
          priority: 'medium',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ taskId: 'task-1', status: 'failed' } as any],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 1,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1', agentType: 'developer' })
      );
    });

    it('still skips tasks with a running job', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Running Task',
          status: 'in_progress',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ taskId: 'task-1', status: 'running' } as any],
        activeRuns: [],
        pending: 0,
        running: 1,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('marks tasks with 3+ failed runs in 30min as stuck', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'failing-task',
          title: 'Failing Task',
          status: 'testing',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          is_blocked: false,
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      // 3 failed runs in the last 30 minutes
      vi.mocked(getAgentRunsByTask).mockResolvedValue([
        { status: 'failed', created_at: new Date().toISOString() },
        { status: 'failed', created_at: new Date().toISOString() },
        { status: 'failed', created_at: new Date().toISOString() },
      ] as any);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
      expect(updateTask).toHaveBeenCalledWith('failing-task', {
        is_blocked: true,
        blocked_reason: 'Agent ran 3 times in 30 minutes without advancing status. Manual intervention needed.',
      });
    });

    it('counts mixed completed and failed runs for stuck detection', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'mixed-task',
          title: 'Mixed Task',
          status: 'testing',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          is_blocked: false,
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      // Mix of completed and failed runs totaling 3
      vi.mocked(getAgentRunsByTask).mockResolvedValue([
        { status: 'completed', created_at: new Date().toISOString() },
        { status: 'failed', created_at: new Date().toISOString() },
        { status: 'completed', created_at: new Date().toISOString() },
      ] as any);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
      expect(updateTask).toHaveBeenCalledWith('mixed-task', {
        is_blocked: true,
        blocked_reason: 'Agent ran 3 times in 30 minutes without advancing status. Manual intervention needed.',
      });
    });

    it('ignores old completed runs outside 30min window', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([
        {
          id: 'old-runs-task',
          title: 'Old Runs Task',
          status: 'testing',
          assignee: 'agent@test.com',
          priority: 'high',
          description: 'Test',
          user_email: 'user@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      // 3 completed runs but all older than 30 minutes
      const oldDate = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      vi.mocked(getAgentRunsByTask).mockResolvedValue([
        { status: 'completed', created_at: oldDate },
        { status: 'completed', created_at: oldDate },
        { status: 'completed', created_at: oldDate },
      ] as any);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('processes multiple users independently', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([
        { email: 'alice@test.com' },
        { email: 'bob@test.com' },
      ]);
      vi.mocked(getTasksByUserEmail).mockImplementation(async (email: string) => {
        if (email === 'alice@test.com') {
          return [{
            id: 'alice-task',
            title: 'Alice Task',
            status: 'todo',
            assignee: 'Simon',
            priority: 'high',
            description: 'Test',
            user_email: 'alice@test.com',
            created_at: new Date(),
            updated_at: new Date(),
          }] as any;
        }
        return [{
          id: 'bob-task',
          title: 'Bob Task',
          status: 'in_review',
          assignee: 'Simon',
          priority: 'low',
          description: 'Test',
          user_email: 'bob@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        }] as any;
      });
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledTimes(2);
      expect(agentQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'alice-task',
        agentType: 'developer',
        tenantId: 'alice@test.com',
        userEmail: 'alice@test.com',
      }));
      expect(agentQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'bob-task',
        agentType: 'reviewer',
        tenantId: 'bob@test.com',
        userEmail: 'bob@test.com',
      }));
    });

    it('backfills orphaned tasks to first available user', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getOrphanedTasks).mockResolvedValue([
        { id: 'orphan-1', title: 'Orphan', status: 'todo', user_email: null },
      ] as any);

      await forceSchedulerTick();

      expect(assignOrphanedTasks).toHaveBeenCalledWith('user@test.com');
    });

    it('does not backfill orphans when no users have API keys', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(assignOrphanedTasks).not.toHaveBeenCalled();
    });

    it('does not call assignOrphanedTasks when no orphaned tasks exist', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ email: 'user@test.com' }]);
      vi.mocked(getTasksByUserEmail).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getOrphanedTasks).mockResolvedValue([]);

      await forceSchedulerTick();

      expect(assignOrphanedTasks).not.toHaveBeenCalled();
    });

    it('one user error does not affect other users', async () => {
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([
        { email: 'failing@test.com' },
        { email: 'ok@test.com' },
      ]);
      vi.mocked(getTasksByUserEmail).mockImplementation(async (email: string) => {
        if (email === 'failing@test.com') {
          throw new Error('DB error for user');
        }
        return [{
          id: 'ok-task',
          title: 'OK Task',
          status: 'todo',
          assignee: 'Simon',
          priority: 'medium',
          description: 'Test',
          user_email: 'ok@test.com',
          created_at: new Date(),
          updated_at: new Date(),
        }] as any;
      });
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
      vi.mocked(getAgentRunsByTask).mockResolvedValue([]);

      await expect(forceSchedulerTick()).resolves.not.toThrow();

      // ok@test.com's task should still be enqueued
      expect(agentQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(agentQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'ok-task',
        userEmail: 'ok@test.com',
      }));
    });
  });
});
