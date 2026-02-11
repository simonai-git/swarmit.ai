import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { taskRoutes } from '../routes/tasks.js';

// Use vi.hoisted to create stable mock references
const mockTaskService = vi.hoisted(() => ({
  getTaskWithFullContext: vi.fn(),
  recalculateBlocked: vi.fn(),
  unblockDependents: vi.fn().mockResolvedValue([]),
  updateStatus: vi.fn(),
}));

const mockLifecycleService = vi.hoisted(() => ({
  onTaskCreated: vi.fn().mockResolvedValue({}),
  onStatusChanged: vi.fn().mockResolvedValue({ shouldSpawnAgent: false }),
  detectSpecialization: vi.fn(),
  selectAgent: vi.fn(),
}));

const mockNotificationService = vi.hoisted(() => ({
  sendTaskNotification: vi.fn(),
  sendCommentNotification: vi.fn(),
}));

vi.mock('../services/task.service.js', () => ({
  TaskService: vi.fn().mockImplementation(() => mockTaskService),
}));

vi.mock('../services/task-lifecycle.service.js', () => ({
  TaskLifecycleService: vi.fn().mockImplementation(() => mockLifecycleService),
}));

vi.mock('../services/notification.service.js', () => ({
  NotificationService: vi.fn().mockImplementation(() => mockNotificationService),
}));

describe('task routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-set default return values after clearAllMocks
    mockLifecycleService.onTaskCreated.mockResolvedValue({});
    mockLifecycleService.onStatusChanged.mockResolvedValue({ shouldSpawnAgent: false });
    mockTaskService.unblockDependents.mockResolvedValue([]);
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;
    await app.register(taskRoutes, { prefix: '/tasks' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /tasks should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/tasks' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /tasks/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/tasks/task-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /tasks should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tasks',
        payload: { title: 'Test' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /tasks/:id should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/tasks/task-1',
        payload: { title: 'Updated' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /tasks/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/tasks/task-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /tasks/:id/comments should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/comments',
        payload: { author: 'test', content: 'hello' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /tasks/:id/dependencies should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/dependencies',
        payload: { dependsOnId: 'task-2' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /tasks/:id/run should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/run',
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tasks',
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /tasks ────────────────────────────────────────────────

  describe('GET /tasks', () => {
    it('should return paginated tasks', async () => {
      const mockTasks = [
        { id: 'task-1', title: 'Task 1', status: 'TODO', priority: 1 },
        { id: 'task-2', title: 'Task 2', status: 'IN_PROGRESS', priority: 2 },
      ];

      prisma.task.findMany.mockResolvedValueOnce(mockTasks);
      prisma.task.count.mockResolvedValueOnce(2);

      const res = await app.inject({
        method: 'GET',
        url: '/tasks',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tasks).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('should pass page and limit query params', async () => {
      prisma.task.findMany.mockResolvedValueOnce([]);
      prisma.task.count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/tasks?page=2&limit=10',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);

      // Verify skip is (page-1)*limit = 10
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });

    it('should filter by projectId', async () => {
      prisma.task.findMany.mockResolvedValueOnce([]);
      prisma.task.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/tasks?projectId=proj-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: 'proj-1' }),
        })
      );
    });

    it('should filter by status', async () => {
      prisma.task.findMany.mockResolvedValueOnce([]);
      prisma.task.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/tasks?status=DONE',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'DONE' }),
        })
      );
    });

    it('should filter by assigneeId', async () => {
      prisma.task.findMany.mockResolvedValueOnce([]);
      prisma.task.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/tasks?assigneeId=agent-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assigneeId: 'agent-1' }),
        })
      );
    });

    it('should filter by search term', async () => {
      prisma.task.findMany.mockResolvedValueOnce([]);
      prisma.task.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/tasks?search=deploy',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'deploy', mode: 'insensitive' } },
              { description: { contains: 'deploy', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });
  });

  // ─── GET /tasks/:id ───────────────────────────────────────────

  describe('GET /tasks/:id', () => {
    it('should return task with full context', async () => {
      mockTaskService.getTaskWithFullContext.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Test Task',
        status: 'TODO',
        priority: 1,
        userId: 'test-user-id',
        comments: [],
        runs: [],
        dependsOn: [],
        dependedOnBy: [],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/tasks/task-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('task-1');
      expect(body.title).toBe('Test Task');
    });

    it('should return 404 for non-existent task', async () => {
      mockTaskService.getTaskWithFullContext.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/tasks/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Task not found');
    });
  });

  // ─── POST /tasks ──────────────────────────────────────────────

  describe('POST /tasks', () => {
    it('should create a task and return 201', async () => {
      const mockTask = {
        id: 'task-new',
        title: 'New Task',
        description: 'Test description',
        status: 'TODO',
        priority: 1,
        userId: 'test-user-id',
        assignee: null,
        assigneeId: null,
      };

      prisma.task.create.mockResolvedValueOnce(mockTask);

      const res = await app.inject({
        method: 'POST',
        url: '/tasks',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'New Task',
          description: 'Test description',
          priority: 1,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('task-new');
      expect(body.title).toBe('New Task');
    });

    it('should include userId from JWT in task creation', async () => {
      const mockTask = {
        id: 'task-new',
        title: 'My Task',
        status: 'TODO',
        priority: 0,
        userId: 'test-user-id',
        assignee: null,
        assigneeId: null,
      };

      prisma.task.create.mockResolvedValueOnce(mockTask);

      await app.inject({
        method: 'POST',
        url: '/tasks',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'My Task' },
      });

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'test-user-id' }),
        })
      );
    });

    it('should emit socket event on task creation', async () => {
      prisma.task.create.mockResolvedValueOnce({
        id: 'task-emit',
        title: 'Socket Test',
        status: 'TODO',
        priority: 0,
        userId: 'test-user-id',
        assignee: null,
        assigneeId: null,
      });

      await app.inject({
        method: 'POST',
        url: '/tasks',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Socket Test' },
      });

      expect(app.io.emit).toHaveBeenCalledWith('tasks:updated', expect.objectContaining({
        taskId: 'task-emit',
        userId: 'test-user-id',
      }));
    });

    it('should reject invalid payload (missing title)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tasks',
        headers: { authorization: `Bearer ${token}` },
        payload: { description: 'no title' },
      });

      // Zod will throw, Fastify returns 500 for unhandled errors
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ─── PATCH /tasks/:id ──────────────────────────────────────────

  describe('PATCH /tasks/:id', () => {
    it('should update task', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Old Title',
        status: 'TODO',
        userId: 'test-user-id',
      });

      prisma.task.update.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Updated Title',
        status: 'TODO',
        priority: 1,
        userId: 'test-user-id',
        assignee: null,
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/tasks/task-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Updated Title' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe('Updated Title');
    });

    it('should return 404 for non-existent task', async () => {
      prisma.task.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'PATCH',
        url: '/tasks/nonexistent',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Updated' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Task not found');
    });

    it('should handle status change lifecycle hooks', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task',
        status: 'TODO',
        userId: 'test-user-id',
      });

      prisma.task.update.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task',
        status: 'IN_PROGRESS',
        priority: 1,
        userId: 'test-user-id',
        assignee: null,
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/tasks/task-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'IN_PROGRESS' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('IN_PROGRESS');
    });

    it('should emit socket event on update', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task',
        status: 'TODO',
        userId: 'test-user-id',
      });

      prisma.task.update.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task',
        status: 'TODO',
        priority: 1,
        userId: 'test-user-id',
        assignee: null,
      });

      await app.inject({
        method: 'PATCH',
        url: '/tasks/task-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Task' },
      });

      expect(app.io.emit).toHaveBeenCalledWith('tasks:updated', expect.objectContaining({
        taskId: 'task-1',
      }));
    });
  });

  // ─── DELETE /tasks/:id ─────────────────────────────────────────

  describe('DELETE /tasks/:id', () => {
    it('should delete task and return success', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task to Delete',
        status: 'TODO',
        priority: 0,
        description: null,
        userId: 'test-user-id',
      });
      prisma.task.delete.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'DELETE',
        url: '/tasks/task-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should return 404 for non-existent task', async () => {
      prisma.task.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'DELETE',
        url: '/tasks/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Task not found');
    });

    it('should emit socket event on deletion', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-del',
        title: 'Deleted',
        status: 'TODO',
        priority: 0,
        description: null,
        userId: 'test-user-id',
      });
      prisma.task.delete.mockResolvedValueOnce({});

      await app.inject({
        method: 'DELETE',
        url: '/tasks/task-del',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(app.io.emit).toHaveBeenCalledWith('tasks:updated', expect.objectContaining({
        taskId: 'task-del',
      }));
    });
  });

  // ─── POST /tasks/:id/comments ─────────────────────────────────

  describe('POST /tasks/:id/comments', () => {
    it('should add comment and return 201', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task',
        status: 'TODO',
        userId: 'test-user-id',
      });

      const mockComment = {
        id: 'comment-1',
        taskId: 'task-1',
        author: 'Alice',
        content: 'Looks good!',
        createdAt: new Date().toISOString(),
      };
      prisma.taskComment.create.mockResolvedValueOnce(mockComment);

      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/comments',
        headers: { authorization: `Bearer ${token}` },
        payload: { author: 'Alice', content: 'Looks good!' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.author).toBe('Alice');
      expect(body.content).toBe('Looks good!');
    });

    it('should return 404 if task not found', async () => {
      prisma.task.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/tasks/nonexistent/comments',
        headers: { authorization: `Bearer ${token}` },
        payload: { author: 'Alice', content: 'Hello' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Task not found');
    });

    it('should reject invalid comment payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/comments',
        headers: { authorization: `Bearer ${token}` },
        payload: { content: 'Missing author' },
      });

      // Zod validation should fail
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ─── POST /tasks/:id/dependencies ─────────────────────────────

  describe('POST /tasks/:id/dependencies', () => {
    it('should add dependency and return 201', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task 1',
        status: 'TODO',
        userId: 'test-user-id',
      });

      // No cycles detected
      prisma.$queryRaw.mockResolvedValueOnce([]);

      const mockDep = {
        id: 'dep-1',
        taskId: 'task-1',
        dependsOnId: 'task-2',
      };
      prisma.taskDependency.create.mockResolvedValueOnce(mockDep);

      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/dependencies',
        headers: { authorization: `Bearer ${token}` },
        payload: { dependsOnId: 'task-2' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.taskId).toBe('task-1');
      expect(body.dependsOnId).toBe('task-2');
    });

    it('should reject dependency that creates a cycle', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task 1',
        status: 'TODO',
        userId: 'test-user-id',
      });

      // Cycle detected — returns a row
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 'task-1' }]);

      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/dependencies',
        headers: { authorization: `Bearer ${token}` },
        payload: { dependsOnId: 'task-3' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('cycle');
    });

    it('should return 404 if task not found', async () => {
      prisma.task.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/tasks/nonexistent/dependencies',
        headers: { authorization: `Bearer ${token}` },
        payload: { dependsOnId: 'task-2' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Task not found');
    });
  });

  // ─── POST /tasks/:id/run ──────────────────────────────────────

  describe('POST /tasks/:id/run', () => {
    it('should trigger a run and return 201', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task 1',
        status: 'TODO',
        userId: 'test-user-id',
        assignee: { id: 'agent-1', specialization: 'frontend' },
        assigneeId: 'agent-1',
      });

      const mockRun = {
        id: 'run-1',
        taskId: 'task-1',
        agentType: 'frontend',
        status: 'QUEUED',
        createdAt: new Date().toISOString(),
      };
      prisma.taskRun.create.mockResolvedValueOnce(mockRun);
      prisma.task.update.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/run',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('run-1');
      expect(body.status).toBe('QUEUED');
      expect(body.agentType).toBe('frontend');
    });

    it('should default to developer agentType if no assignee', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task 1',
        status: 'TODO',
        userId: 'test-user-id',
        assignee: null,
        assigneeId: null,
      });

      const mockRun = {
        id: 'run-2',
        taskId: 'task-1',
        agentType: 'developer',
        status: 'QUEUED',
      };
      prisma.taskRun.create.mockResolvedValueOnce(mockRun);
      prisma.task.update.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'POST',
        url: '/tasks/task-1/run',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(201);
      expect(prisma.taskRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentType: 'developer' }),
        })
      );
    });

    it('should return 404 if task not found', async () => {
      prisma.task.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/tasks/nonexistent/run',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Task not found');
    });

    it('should update task status to IN_PROGRESS on run trigger', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task',
        status: 'TODO',
        userId: 'test-user-id',
        assignee: null,
        assigneeId: null,
      });

      prisma.taskRun.create.mockResolvedValueOnce({
        id: 'run-3',
        taskId: 'task-1',
        agentType: 'developer',
        status: 'QUEUED',
      });
      prisma.task.update.mockResolvedValueOnce({});

      await app.inject({
        method: 'POST',
        url: '/tasks/task-1/run',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        })
      );
    });
  });

  // ─── GET /tasks/:id/runs/:runId/logs ──────────────────────────

  describe('GET /tasks/:id/runs/:runId/logs', () => {
    it('should return run logs', async () => {
      const mockLogs = [
        { id: 'log-1', runId: 'run-1', content: 'Starting...', createdAt: new Date().toISOString() },
        { id: 'log-2', runId: 'run-1', content: 'Done.', createdAt: new Date().toISOString() },
      ];
      prisma.taskLog.findMany.mockResolvedValueOnce(mockLogs);

      const res = await app.inject({
        method: 'GET',
        url: '/tasks/task-1/runs/run-1/logs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      expect(body[0].content).toBe('Starting...');
    });
  });

  // ─── DELETE /tasks/:id/dependencies/:depId ─────────────────────

  describe('DELETE /tasks/:id/dependencies/:depId', () => {
    it('should remove dependency and return success', async () => {
      prisma.taskDependency.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/tasks/task-1/dependencies/dep-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should return 404 for non-existent dependency', async () => {
      prisma.taskDependency.deleteMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/tasks/task-1/dependencies/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Dependency not found');
    });
  });
});
