import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { runRoutes } from '../routes/runs.js';

describe('run routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;

    // Add missing mocks for taskRun
    (prisma.taskRun as any).update = vi.fn();
    (prisma.taskRun as any).count = vi.fn();

    await app.register(runRoutes, { prefix: '/runs' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /runs should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/runs' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /runs/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/runs/run-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /runs/:id/cancel should return 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/runs/run-1/cancel' });
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/runs',
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /runs ────────────────────────────────────────────────

  describe('GET /runs', () => {
    it('should return paginated runs', async () => {
      const mockRuns = [
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

      prisma.taskRun.findMany.mockResolvedValueOnce(mockRuns);
      (prisma.taskRun as any).count.mockResolvedValueOnce(2);

      const res = await app.inject({
        method: 'GET',
        url: '/runs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runs).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('should handle custom pagination parameters', async () => {
      prisma.taskRun.findMany.mockResolvedValueOnce([]);
      (prisma.taskRun as any).count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/runs?page=3&limit=10',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(3);
      expect(body.limit).toBe(10);

      // skip = (3-1) * 10 = 20
      expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('should filter runs by the authenticated user', async () => {
      prisma.taskRun.findMany.mockResolvedValueOnce([]);
      (prisma.taskRun as any).count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/runs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { task: { userId: 'test-user-id' } },
        })
      );
      expect((prisma.taskRun as any).count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { task: { userId: 'test-user-id' } },
        })
      );
    });

    it('should order runs by createdAt descending', async () => {
      prisma.taskRun.findMany.mockResolvedValueOnce([]);
      (prisma.taskRun as any).count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/runs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should include task info in runs', async () => {
      prisma.taskRun.findMany.mockResolvedValueOnce([]);
      (prisma.taskRun as any).count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/runs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { task: { select: { id: true, title: true } } },
        })
      );
    });

    it('should return empty list when no runs exist', async () => {
      prisma.taskRun.findMany.mockResolvedValueOnce([]);
      (prisma.taskRun as any).count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/runs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runs).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should default to page 1 and limit 20', async () => {
      prisma.taskRun.findMany.mockResolvedValueOnce([]);
      (prisma.taskRun as any).count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/runs',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 })
      );
    });
  });

  // ─── GET /runs/:id ────────────────────────────────────────────

  describe('GET /runs/:id', () => {
    it('should return run with full details', async () => {
      const mockRun = {
        id: 'run-1',
        taskId: 'task-1',
        status: 'COMPLETED',
        agentType: 'developer',
        tokens: 5000,
        cost: 0.15,
        createdAt: '2024-01-01T00:00:00Z',
        endedAt: '2024-01-01T00:05:00Z',
        task: { id: 'task-1', title: 'Fix login bug' },
        logs: [
          { id: 'log-1', content: 'Starting...', createdAt: '2024-01-01T00:00:00Z' },
          { id: 'log-2', content: 'Completed.', createdAt: '2024-01-01T00:05:00Z' },
        ],
        executionState: {
          id: 'state-1',
          events: [
            { id: 'event-1', type: 'STARTED', createdAt: '2024-01-01T00:00:00Z' },
          ],
        },
      };

      prisma.taskRun.findFirst.mockResolvedValueOnce(mockRun);

      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('run-1');
      expect(body.task.title).toBe('Fix login bug');
      expect(body.logs).toHaveLength(2);
      expect(body.executionState.events).toHaveLength(1);
    });

    it('should return 404 for non-existent run', async () => {
      prisma.taskRun.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/runs/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Run not found');
    });

    it('should scope query by run id and user', async () => {
      prisma.taskRun.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: '/runs/run-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1', task: { userId: 'test-user-id' } },
        })
      );
    });

    it('should include task, logs, and executionState in query', async () => {
      prisma.taskRun.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: '/runs/run-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            task: expect.any(Object),
            logs: expect.any(Object),
            executionState: expect.any(Object),
          }),
        })
      );
    });

    it('should return run with null executionState', async () => {
      const mockRun = {
        id: 'run-2',
        taskId: 'task-1',
        status: 'QUEUED',
        task: { id: 'task-1', title: 'Pending task' },
        logs: [],
        executionState: null,
      };

      prisma.taskRun.findFirst.mockResolvedValueOnce(mockRun);

      const res = await app.inject({
        method: 'GET',
        url: '/runs/run-2',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.executionState).toBeNull();
    });
  });

  // ─── POST /runs/:id/cancel ────────────────────────────────────

  describe('POST /runs/:id/cancel', () => {
    it('should cancel a run and return success', async () => {
      prisma.taskRun.findFirst.mockResolvedValueOnce({
        id: 'run-1',
        taskId: 'task-1',
        status: 'RUNNING',
      });
      (prisma.taskRun as any).update.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'POST',
        url: '/runs/run-1/cancel',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should update run with CANCELLED status and endedAt', async () => {
      prisma.taskRun.findFirst.mockResolvedValueOnce({
        id: 'run-1',
        taskId: 'task-1',
        status: 'RUNNING',
      });
      (prisma.taskRun as any).update.mockResolvedValueOnce({});

      await app.inject({
        method: 'POST',
        url: '/runs/run-1/cancel',
        headers: { authorization: `Bearer ${token}` },
      });

      expect((prisma.taskRun as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({
            status: 'CANCELLED',
            endedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should return 404 for non-existent run', async () => {
      prisma.taskRun.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/runs/nonexistent/cancel',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Run not found');
    });

    it('should scope the find query by run id and user', async () => {
      prisma.taskRun.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'POST',
        url: '/runs/run-1/cancel',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1', task: { userId: 'test-user-id' } },
        })
      );
    });

    it('should not call update when run is not found', async () => {
      prisma.taskRun.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'POST',
        url: '/runs/nonexistent/cancel',
        headers: { authorization: `Bearer ${token}` },
      });

      expect((prisma.taskRun as any).update).not.toHaveBeenCalled();
    });

    it('should work with a different authenticated user', async () => {
      const otherToken = await createTestToken('other-user-id');

      prisma.taskRun.findFirst.mockResolvedValueOnce({
        id: 'run-1',
        taskId: 'task-1',
        status: 'RUNNING',
      });
      (prisma.taskRun as any).update.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'POST',
        url: '/runs/run-1/cancel',
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.taskRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1', task: { userId: 'other-user-id' } },
        })
      );
    });
  });
});
