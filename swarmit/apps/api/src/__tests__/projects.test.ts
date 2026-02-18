import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { projectRoutes } from '../routes/projects.js';

// Use vi.hoisted to create stable mock functions that persist across vi.mock hoisting
const mockProjectService = vi.hoisted(() => ({
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
  checkCompletion: vi.fn(),
}));

vi.mock('../services/project.service.js', () => ({
  ProjectService: vi.fn().mockImplementation(() => mockProjectService),
}));

describe('project routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;
    await app.register(projectRoutes, { prefix: '/projects' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /projects should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/projects' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /projects/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/projects/proj-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /projects should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { title: 'Test' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /projects/:id should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/projects/proj-1',
        payload: { title: 'Updated' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /projects/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/projects/proj-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /projects/:id/start should return 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/projects/proj-1/start' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /projects/:id/pause should return 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/projects/proj-1/pause' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /projects/:id/resume should return 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/projects/proj-1/resume' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /projects/:id/cancel should return 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/projects/proj-1/cancel' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /projects/:id/complete should return 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/projects/proj-1/complete' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /projects ─────────────────────────────────────────────

  describe('GET /projects', () => {
    it('should return paginated projects', async () => {
      const mockProjects = [
        { id: 'proj-1', title: 'Project A', status: 'PLANNING', _count: { tasks: 3 } },
        { id: 'proj-2', title: 'Project B', status: 'ACTIVE', _count: { tasks: 5 } },
      ];

      prisma.project.findMany.mockResolvedValueOnce(mockProjects);
      prisma.project.count.mockResolvedValueOnce(2);

      const res = await app.inject({
        method: 'GET',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.projects).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('should handle pagination parameters', async () => {
      prisma.project.findMany.mockResolvedValueOnce([]);
      prisma.project.count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/projects?page=3&limit=5',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(3);
      expect(body.limit).toBe(5);

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      );
    });

    it('should scope projects to authenticated user', async () => {
      prisma.project.findMany.mockResolvedValueOnce([]);
      prisma.project.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        })
      );
    });
  });

  // ─── GET /projects/:id ─────────────────────────────────────────

  describe('GET /projects/:id', () => {
    it('should return project with tasks', async () => {
      prisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-1',
        title: 'Project A',
        status: 'ACTIVE',
        userId: 'test-user-id',
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            status: 'TODO',
            assignee: { id: 'agent-1', name: 'Bot' },
            _count: { comments: 2, runs: 1 },
          },
        ],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/projects/proj-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('proj-1');
      expect(body.tasks).toHaveLength(1);
    });

    it('should return 404 for non-existent project', async () => {
      prisma.project.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/projects/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Project not found');
    });
  });

  // ─── POST /projects ────────────────────────────────────────────

  describe('POST /projects', () => {
    it('should create project and return 201', async () => {
      prisma.project.create.mockResolvedValueOnce({
        id: 'proj-new',
        title: 'New Project',
        description: 'A test project',
        status: 'PLANNING',
        userId: 'test-user-id',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'New Project', description: 'A test project' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('proj-new');
      expect(body.title).toBe('New Project');
    });

    it('should include userId from JWT', async () => {
      prisma.project.create.mockResolvedValueOnce({
        id: 'proj-new',
        title: 'Test',
        userId: 'test-user-id',
      });

      await app.inject({
        method: 'POST',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Test' },
      });

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'test-user-id' }),
        })
      );
    });

    it('should emit socket event on project creation', async () => {
      prisma.project.create.mockResolvedValueOnce({
        id: 'proj-emit',
        title: 'Socket Test',
        userId: 'test-user-id',
      });

      await app.inject({
        method: 'POST',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Socket Test' },
      });

      expect(app.io.emit).toHaveBeenCalledWith('project:updated', expect.objectContaining({
        projectId: 'proj-emit',
        userId: 'test-user-id',
      }));
    });

    it('should reject invalid payload (missing title)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: { description: 'no title' },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should create project with DRAFT status when isDraft is true', async () => {
      prisma.project.create.mockResolvedValueOnce({
        id: 'proj-draft',
        title: 'Draft Project',
        status: 'DRAFT',
        userId: 'test-user-id',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Draft Project', isDraft: true },
      });

      expect(res.statusCode).toBe(201);
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT' }),
        })
      );
    });

    it('should create project with PLANNING status when isDraft is false', async () => {
      prisma.project.create.mockResolvedValueOnce({
        id: 'proj-plan',
        title: 'Planning Project',
        status: 'PLANNING',
        userId: 'test-user-id',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Planning Project', isDraft: false },
      });

      expect(res.statusCode).toBe(201);
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PLANNING' }),
        })
      );
    });

    it('should create project with all new fields', async () => {
      prisma.project.create.mockResolvedValueOnce({
        id: 'proj-full',
        title: 'Full Project',
        status: 'PLANNING',
        userId: 'test-user-id',
      });

      const payload = {
        title: 'Full Project',
        projectType: 'web-app',
        goal: 'Build something great',
        targetUsers: 'Developers',
        mustHaves: ['Feature A', 'Feature B'],
        deadline: '2026-06-01T00:00:00.000Z',
        budgetRange: '$500-$1000',
        contactEmail: 'test@example.com',
        niceToHaves: ['Feature C'],
        referenceLinks: ['https://example.com'],
        constraints: 'Must be fast',
        comms: 'Async updates',
        dataSensitivity: 'internal',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
        payload,
      });

      expect(res.statusCode).toBe(201);
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectType: 'web-app',
            goal: 'Build something great',
            targetUsers: 'Developers',
            mustHaves: ['Feature A', 'Feature B'],
            deadline: new Date('2026-06-01T00:00:00.000Z'),
            budgetRange: '$500-$1000',
            contactEmail: 'test@example.com',
            niceToHaves: ['Feature C'],
            referenceLinks: ['https://example.com'],
            constraints: 'Must be fast',
            comms: 'Async updates',
            dataSensitivity: 'internal',
            status: 'PLANNING',
            userId: 'test-user-id',
          }),
        })
      );
    });

    it('should convert deadline string to Date object', async () => {
      prisma.project.create.mockResolvedValueOnce({
        id: 'proj-date',
        title: 'Date Test',
        userId: 'test-user-id',
      });

      await app.inject({
        method: 'POST',
        url: '/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Date Test',
          deadline: '2026-04-01T00:00:00.000Z',
        },
      });

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deadline: new Date('2026-04-01T00:00:00.000Z'),
          }),
        })
      );
    });
  });

  // ─── PATCH /projects/:id ───────────────────────────────────────

  describe('PATCH /projects/:id', () => {
    it('should update project and return success', async () => {
      prisma.project.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/projects/proj-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Updated Title' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should return 404 for non-existent project', async () => {
      prisma.project.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/projects/nonexistent',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Updated' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should convert deadline string to Date when updating', async () => {
      prisma.project.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/projects/proj-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { deadline: '2026-06-01T00:00:00.000Z' },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.project.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deadline: new Date('2026-06-01T00:00:00.000Z'),
          }),
        })
      );
    });

    it('should set deadline to null when null is passed', async () => {
      prisma.project.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/projects/proj-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { deadline: null },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.project.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deadline: null,
          }),
        })
      );
    });

    it('should update project with new fields', async () => {
      prisma.project.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/projects/proj-1',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          projectType: 'api-backend',
          goal: 'New goal',
          mustHaves: ['Feature X'],
          dataSensitivity: 'confidential',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.project.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectType: 'api-backend',
            goal: 'New goal',
            mustHaves: ['Feature X'],
            dataSensitivity: 'confidential',
          }),
        })
      );
    });
  });

  // ─── DELETE /projects/:id ──────────────────────────────────────

  describe('DELETE /projects/:id', () => {
    it('should delete project and return success', async () => {
      prisma.project.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/projects/proj-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should return 404 for non-existent project', async () => {
      prisma.project.deleteMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/projects/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ─── POST /projects/:id/start ─────────────────────────────────

  describe('POST /projects/:id/start', () => {
    it('should start a PLANNING project', async () => {
      mockProjectService.start.mockResolvedValueOnce({
        id: 'proj-1',
        status: 'ACTIVE',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/start',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('ACTIVE');
    });

    it('should return 400 for invalid state transition', async () => {
      mockProjectService.start.mockRejectedValueOnce(
        new Error('Cannot start project in ACTIVE status')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/start',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('Cannot start project');
    });

    it('should return 404 if project not found', async () => {
      mockProjectService.start.mockRejectedValueOnce(new Error('Project not found'));

      const res = await app.inject({
        method: 'POST',
        url: '/projects/nonexistent/start',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Project not found');
    });

    it('should emit socket event on start', async () => {
      mockProjectService.start.mockResolvedValueOnce({
        id: 'proj-1',
        status: 'ACTIVE',
      });

      await app.inject({
        method: 'POST',
        url: '/projects/proj-1/start',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(app.io.emit).toHaveBeenCalledWith('project:updated', expect.objectContaining({
        projectId: 'proj-1',
      }));
    });
  });

  // ─── POST /projects/:id/pause ─────────────────────────────────

  describe('POST /projects/:id/pause', () => {
    it('should pause an ACTIVE project', async () => {
      mockProjectService.pause.mockResolvedValueOnce({
        id: 'proj-1',
        status: 'PAUSED',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/pause',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('PAUSED');
    });

    it('should return 400 for invalid state transition', async () => {
      mockProjectService.pause.mockRejectedValueOnce(
        new Error('Cannot pause project in PLANNING status')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/pause',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('Cannot pause project');
    });
  });

  // ─── POST /projects/:id/resume ────────────────────────────────

  describe('POST /projects/:id/resume', () => {
    it('should resume a PAUSED project', async () => {
      mockProjectService.resume.mockResolvedValueOnce({
        id: 'proj-1',
        status: 'ACTIVE',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/resume',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('ACTIVE');
    });

    it('should return 400 for invalid state transition', async () => {
      mockProjectService.resume.mockRejectedValueOnce(
        new Error('Cannot resume project in ACTIVE status')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/resume',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('Cannot resume project');
    });
  });

  // ─── POST /projects/:id/cancel ────────────────────────────────

  describe('POST /projects/:id/cancel', () => {
    it('should cancel an active project', async () => {
      mockProjectService.cancel.mockResolvedValueOnce({
        id: 'proj-1',
        status: 'CANCELLED',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/cancel',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('CANCELLED');
    });

    it('should return 400 for invalid state transition', async () => {
      mockProjectService.cancel.mockRejectedValueOnce(
        new Error('Cannot cancel project in COMPLETED status')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/cancel',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('Cannot cancel project');
    });
  });

  // ─── POST /projects/:id/complete ──────────────────────────────

  describe('POST /projects/:id/complete', () => {
    it('should complete a project', async () => {
      mockProjectService.complete.mockResolvedValueOnce({
        id: 'proj-1',
        status: 'COMPLETED',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/projects/proj-1/complete',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('COMPLETED');
    });

    it('should return 404 if project not found', async () => {
      mockProjectService.complete.mockRejectedValueOnce(new Error('Project not found'));

      const res = await app.inject({
        method: 'POST',
        url: '/projects/nonexistent/complete',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Project not found');
    });
  });
});
