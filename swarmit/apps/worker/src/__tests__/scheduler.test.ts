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
    it('disables autoSpawn when budget exceeded', async () => {
      mockPrisma.automationSetting.findMany.mockResolvedValue([
        { userId: 'user-1', dailyBudgetCents: 500 },
      ]);
      mockPrisma.taskRun.aggregate.mockResolvedValue({ _sum: { cost: 6.0 } }); // 600 cents > 500
      mockPrisma.automationSetting.update.mockResolvedValue({});

      await processSchedulerJob({ type: 'check-budget-exceeded' });

      expect(mockPrisma.automationSetting.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { autoSpawn: false },
      });
    });

    it('does not disable when under budget', async () => {
      mockPrisma.automationSetting.findMany.mockResolvedValue([
        { userId: 'user-1', dailyBudgetCents: 1000 },
      ]);
      mockPrisma.taskRun.aggregate.mockResolvedValue({ _sum: { cost: 2.0 } }); // 200 cents < 1000

      await processSchedulerJob({ type: 'check-budget-exceeded' });

      expect(mockPrisma.automationSetting.update).not.toHaveBeenCalled();
    });
  });
});
