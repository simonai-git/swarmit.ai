import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScheduler, stopScheduler, getSchedulerStatus, forceSchedulerTick } from '@/lib/scheduler';
import { getAllTasks, getAutomationUserEmail } from '@/lib/db';
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
  getAllTasks: vi.fn(),
  getAutomationUserEmail: vi.fn(),
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
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([]);
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
      expect(getAutomationUserEmail).toHaveBeenCalled();
    });

    it('does nothing if already running', () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([]);
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
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([]);
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
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(getAutomationUserEmail).toHaveBeenCalled();
      expect(getAllTasks).toHaveBeenCalled();
    });
  });

  describe('schedulerTick (via forceSchedulerTick)', () => {
    it('skips if no automation user email found', async () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue(undefined);

      await forceSchedulerTick();

      expect(getAllTasks).not.toHaveBeenCalled();
      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('skips done tasks', async () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Done Task',
          status: 'done',
          assignee: 'user@test.com',
          priority: 'high',
          description: 'Test',
          tenant_id: 'default',
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
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Unassigned Task',
          status: 'todo',
          assignee: null,
          priority: 'high',
          description: 'Test',
          tenant_id: 'default',
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
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Queued Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'high',
          description: 'Test',
          tenant_id: 'default',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ taskId: 'task-1' } as any],
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
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Active Task',
          status: 'in_progress',
          assignee: 'user@test.com',
          priority: 'high',
          description: 'Test',
          tenant_id: 'default',
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

    it('enqueues up to 5 tasks max', async () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        status: 'todo',
        assignee: 'user@test.com',
        priority: 'medium',
        description: 'Test',
        tenant_id: 'default',
        created_at: new Date(),
        updated_at: new Date(),
      }));
      vi.mocked(getAllTasks).mockResolvedValue(tasks as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      await forceSchedulerTick();

      expect(agentQueue.enqueue).toHaveBeenCalledTimes(5);
    });

    it('uses correct agentType: qa for testing', async () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Testing Task',
          status: 'testing',
          assignee: 'user@test.com',
          priority: 'high',
          description: 'Test',
          tenant_id: 'default',
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

      expect(agentQueue.enqueue).toHaveBeenCalledWith({
        taskId: 'task-1',
        agentType: 'qa',
        priority: 10,
        tenantId: 'default',
        userEmail: 'automation@test.com',
      });
    });

    it('uses correct agentType: reviewer for in_review', async () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Review Task',
          status: 'in_review',
          assignee: 'user@test.com',
          priority: 'medium',
          description: 'Test',
          tenant_id: 'default',
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

      expect(agentQueue.enqueue).toHaveBeenCalledWith({
        taskId: 'task-1',
        agentType: 'reviewer',
        priority: 5,
        tenantId: 'default',
        userEmail: 'automation@test.com',
      });
    });

    it('uses correct agentType: developer for others', async () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Dev Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'low',
          description: 'Test',
          tenant_id: 'default',
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

      expect(agentQueue.enqueue).toHaveBeenCalledWith({
        taskId: 'task-1',
        agentType: 'developer',
        priority: 1,
        tenantId: 'default',
        userEmail: 'automation@test.com',
      });
    });

    it('uses correct priority: high=10, medium=5, low=1', async () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-high',
          title: 'High Priority',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'high',
          description: 'Test',
          tenant_id: 'default',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'task-medium',
          title: 'Medium Priority',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
          description: 'Test',
          tenant_id: 'default',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'task-low',
          title: 'Low Priority',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'low',
          description: 'Test',
          tenant_id: 'default',
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
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Test Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
          description: 'Test',
          tenant_id: 'default',
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

      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          userEmail: 'automation@test.com',
        })
      );
    });

    it('handles enqueue errors gracefully', async () => {
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@test.com');
      vi.mocked(getAllTasks).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Task 1',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
          description: 'Test',
          tenant_id: 'default',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'task-2',
          title: 'Task 2',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
          description: 'Test',
          tenant_id: 'default',
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
      vi.mocked(agentQueue.enqueue)
        .mockRejectedValueOnce(new Error('Enqueue failed'))
        .mockResolvedValueOnce(undefined as any);

      await expect(forceSchedulerTick()).resolves.not.toThrow();

      expect(agentQueue.enqueue).toHaveBeenCalledTimes(2);
    });
  });
});
