import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  taskRun: {
    findMany: vi.fn(),
    update: vi.fn(),
    aggregate: vi.fn(),
  },
  task: {
    update: vi.fn(),
  },
  taskLog: {
    deleteMany: vi.fn(),
  },
  automationSetting: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  notification: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@swarmit/db', () => ({ prisma: mockPrisma }));
vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { processSchedulerJob } from '../scheduler.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processSchedulerJob', () => {
  describe('check-stalled-runs', () => {
    it('marks stalled runs as FAILED', async () => {
      mockPrisma.taskRun.findMany.mockResolvedValue([
        { id: 'run-1', taskId: 'task-1' },
        { id: 'run-2', taskId: 'task-2' },
      ]);
      mockPrisma.taskRun.update.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({});

      await processSchedulerJob({ type: 'check-stalled-runs' });

      expect(mockPrisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'RUNNING' }),
        })
      );
      expect(mockPrisma.taskRun.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.taskRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
      expect(mockPrisma.task.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { currentRunId: null },
      });
    });

    it('does nothing when no stalled runs', async () => {
      mockPrisma.taskRun.findMany.mockResolvedValue([]);

      await processSchedulerJob({ type: 'check-stalled-runs' });

      expect(mockPrisma.taskRun.update).not.toHaveBeenCalled();
    });
  });

  describe('cleanup-old-logs', () => {
    it('deletes old logs', async () => {
      mockPrisma.taskLog.deleteMany.mockResolvedValue({ count: 42 });

      await processSchedulerJob({ type: 'cleanup-old-logs' });

      expect(mockPrisma.taskLog.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });
    });
  });

  describe('check-budget-exceeded', () => {
    it('disables autoSpawn and creates critical notification when budget exceeded', async () => {
      mockPrisma.automationSetting.findMany.mockResolvedValue([
        { userId: 'user-1', dailyBudgetCents: 500, autoSpawn: true },
      ]);
      mockPrisma.taskRun.aggregate.mockResolvedValue({ _sum: { cost: 6.0 } }); // 600 cents > 500
      mockPrisma.automationSetting.update.mockResolvedValue({});
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({});

      await processSchedulerJob({ type: 'check-budget-exceeded' });

      expect(mockPrisma.automationSetting.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { autoSpawn: false },
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'BUDGET_EXCEEDED',
          metadata: expect.objectContaining({ level: 'critical' }),
        }),
      });
    });

    it('creates warning notification at 80%', async () => {
      mockPrisma.automationSetting.findMany.mockResolvedValue([
        { userId: 'user-1', dailyBudgetCents: 1000, autoSpawn: true },
      ]);
      mockPrisma.taskRun.aggregate.mockResolvedValue({ _sum: { cost: 8.5 } }); // 850 cents = 85% of 1000
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({});

      await processSchedulerJob({ type: 'check-budget-exceeded' });

      expect(mockPrisma.automationSetting.update).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'BUDGET_EXCEEDED',
          metadata: expect.objectContaining({ level: 'warning' }),
        }),
      });
    });

    it('deduplicates notifications (no duplicate per day)', async () => {
      mockPrisma.automationSetting.findMany.mockResolvedValue([
        { userId: 'user-1', dailyBudgetCents: 1000, autoSpawn: true },
      ]);
      mockPrisma.taskRun.aggregate.mockResolvedValue({ _sum: { cost: 8.5 } }); // 85% warning
      mockPrisma.notification.findFirst.mockResolvedValue({ id: 'existing-notif' }); // Already exists

      await processSchedulerJob({ type: 'check-budget-exceeded' });

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('sends warning even when autoSpawn is already false', async () => {
      mockPrisma.automationSetting.findMany.mockResolvedValue([
        { userId: 'user-1', dailyBudgetCents: 1000, autoSpawn: false },
      ]);
      mockPrisma.taskRun.aggregate.mockResolvedValue({ _sum: { cost: 8.5 } }); // 85%
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({});

      await processSchedulerJob({ type: 'check-budget-exceeded' });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'BUDGET_EXCEEDED',
          metadata: expect.objectContaining({ level: 'warning' }),
        }),
      });
    });

    it('does not disable when under budget', async () => {
      mockPrisma.automationSetting.findMany.mockResolvedValue([
        { userId: 'user-1', dailyBudgetCents: 1000, autoSpawn: true },
      ]);
      mockPrisma.taskRun.aggregate.mockResolvedValue({ _sum: { cost: 2.0 } }); // 200 cents < 800 (80%)

      await processSchedulerJob({ type: 'check-budget-exceeded' });

      expect(mockPrisma.automationSetting.update).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });
});
