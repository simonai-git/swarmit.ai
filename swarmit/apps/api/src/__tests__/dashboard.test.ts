import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { dashboardRoutes } from '../routes/dashboard.js';

describe('dashboard routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;

    // Add missing groupBy mocks
    (prisma.task as any).groupBy = vi.fn();
    (prisma.project as any).groupBy = vi.fn();

    await app.register(dashboardRoutes, { prefix: '/dashboard' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /dashboard should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/dashboard' });
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /dashboard ────────────────────────────────────────────

  describe('GET /dashboard', () => {
    it('should return dashboard data with all sections', async () => {
      const mockTaskCounts = [
        { status: 'TODO', _count: 5 },
        { status: 'IN_PROGRESS', _count: 3 },
        { status: 'DONE', _count: 10 },
      ];
      const mockRunCounts = {
        _count: 18,
        _sum: { tokens: 50000, cost: 1.25 },
      };
      const mockProjectCounts = [
        { status: 'ACTIVE', _count: 2 },
        { status: 'COMPLETED', _count: 1 },
      ];
      const mockRecentRuns = [
        {
          id: 'run-1',
          taskId: 'task-1',
          status: 'COMPLETED',
          createdAt: '2024-01-01T00:00:00Z',
          task: { id: 'task-1', title: 'Fix bug' },
        },
        {
          id: 'run-2',
          taskId: 'task-2',
          status: 'RUNNING',
          createdAt: '2024-01-02T00:00:00Z',
          task: { id: 'task-2', title: 'Add feature' },
        },
      ];

      (prisma.task as any).groupBy.mockResolvedValueOnce(mockTaskCounts);
      prisma.taskRun.aggregate.mockResolvedValueOnce(mockRunCounts);
      (prisma.project as any).groupBy.mockResolvedValueOnce(mockProjectCounts);
      prisma.taskRun.findMany.mockResolvedValueOnce(mockRecentRuns);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tasks).toEqual(mockTaskCounts);
      expect(body.runs.total).toBe(18);
      expect(body.runs.totalTokens).toBe(50000);
      expect(body.runs.totalCost).toBe(1.25);
      expect(body.projects).toEqual(mockProjectCounts);
      expect(body.recentRuns).toHaveLength(2);
    });

    it('should handle zero tokens and cost with fallback to 0', async () => {
      (prisma.task as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.aggregate.mockResolvedValueOnce({
        _count: 0,
        _sum: { tokens: null, cost: null },
      });
      (prisma.project as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.findMany.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runs.total).toBe(0);
      expect(body.runs.totalTokens).toBe(0);
      expect(body.runs.totalCost).toBe(0);
    });

    it('should return empty data when user has no tasks, runs, or projects', async () => {
      (prisma.task as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.aggregate.mockResolvedValueOnce({
        _count: 0,
        _sum: { tokens: null, cost: null },
      });
      (prisma.project as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.findMany.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tasks).toEqual([]);
      expect(body.projects).toEqual([]);
      expect(body.recentRuns).toEqual([]);
    });

    it('should filter data by the authenticated user', async () => {
      (prisma.task as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.aggregate.mockResolvedValueOnce({
        _count: 0,
        _sum: { tokens: null, cost: null },
      });
      (prisma.project as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.findMany.mockResolvedValueOnce([]);

      await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect((prisma.task as any).groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        })
      );
      expect(prisma.taskRun.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { task: { userId: 'test-user-id' } },
        })
      );
      expect((prisma.project as any).groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        })
      );
      expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { task: { userId: 'test-user-id' } },
        })
      );
    });

    it('should limit recent runs to 5', async () => {
      (prisma.task as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.aggregate.mockResolvedValueOnce({
        _count: 0,
        _sum: { tokens: null, cost: null },
      });
      (prisma.project as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.findMany.mockResolvedValueOnce([]);

      await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should include task info in recent runs', async () => {
      (prisma.task as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.aggregate.mockResolvedValueOnce({
        _count: 0,
        _sum: { tokens: null, cost: null },
      });
      (prisma.project as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.findMany.mockResolvedValueOnce([]);

      await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { task: { select: { id: true, title: true } } },
        })
      );
    });

    it('should work with a different user', async () => {
      const otherToken = await createTestToken('other-user-id');

      (prisma.task as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.aggregate.mockResolvedValueOnce({
        _count: 0,
        _sum: { tokens: null, cost: null },
      });
      (prisma.project as any).groupBy.mockResolvedValueOnce([]);
      prisma.taskRun.findMany.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect((prisma.task as any).groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'other-user-id' },
        })
      );
    });
  });
});
