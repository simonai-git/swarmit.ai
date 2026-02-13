import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { specializationRoutes } from '../routes/specializations.js';

describe('specialization routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;

    // Add missing updateMany mock for specialization
    (prisma.specialization as any).updateMany = vi.fn();

    await app.register(specializationRoutes, { prefix: '/specializations' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /specializations should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/specializations' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /specializations should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        payload: { name: 'Frontend', keywords: ['react'], dockerImage: 'node:18' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /specializations/:id should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /specializations/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/specializations/spec-1' });
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/specializations',
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /specializations ─────────────────────────────────────

  describe('GET /specializations', () => {
    it('should return list of specializations', async () => {
      const mockSpecs = [
        {
          id: 'spec-1',
          name: 'Backend',
          keywords: ['node', 'express'],
          description: 'Backend development',
          dockerImage: 'node:18',
          _count: { agents: 3 },
        },
        {
          id: 'spec-2',
          name: 'Frontend',
          keywords: ['react', 'nextjs'],
          description: 'Frontend development',
          dockerImage: 'node:18',
          _count: { agents: 2 },
        },
      ];

      prisma.specialization.findMany.mockResolvedValueOnce(mockSpecs);

      const res = await app.inject({
        method: 'GET',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('Backend');
      expect(body[0]._count.agents).toBe(3);
      expect(body[1].name).toBe('Frontend');
    });

    it('should filter by the authenticated user', async () => {
      prisma.specialization.findMany.mockResolvedValueOnce([]);

      await app.inject({
        method: 'GET',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.specialization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        })
      );
    });

    it('should include agent count', async () => {
      prisma.specialization.findMany.mockResolvedValueOnce([]);

      await app.inject({
        method: 'GET',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.specialization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { _count: { select: { agents: true } } },
        })
      );
    });

    it('should order by name ascending', async () => {
      prisma.specialization.findMany.mockResolvedValueOnce([]);

      await app.inject({
        method: 'GET',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.specialization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        })
      );
    });

    it('should return empty list when no specializations exist', async () => {
      prisma.specialization.findMany.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  // ─── POST /specializations ────────────────────────────────────

  describe('POST /specializations', () => {
    it('should create a specialization and return 201', async () => {
      const mockSpec = {
        id: 'spec-new',
        name: 'DevOps',
        keywords: ['docker', 'kubernetes'],
        description: 'DevOps specialization',
        dockerImage: 'ubuntu:22.04',
        systemPrompt: null,
        userId: 'test-user-id',
      };

      prisma.specialization.create.mockResolvedValueOnce(mockSpec);

      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'DevOps',
          keywords: ['docker', 'kubernetes'],
          description: 'DevOps specialization',
          dockerImage: 'ubuntu:22.04',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('spec-new');
      expect(body.name).toBe('DevOps');
      expect(body.keywords).toEqual(['docker', 'kubernetes']);
    });

    it('should include userId from JWT in creation', async () => {
      prisma.specialization.create.mockResolvedValueOnce({
        id: 'spec-new',
        name: 'QA',
        keywords: ['testing'],
        dockerImage: 'node:18',
        userId: 'test-user-id',
      });

      await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'QA', keywords: ['testing'], dockerImage: 'node:18' },
      });

      expect(prisma.specialization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'test-user-id' }),
        })
      );
    });

    it('should create with minimal required fields', async () => {
      prisma.specialization.create.mockResolvedValueOnce({
        id: 'spec-min',
        name: 'Minimal',
        keywords: ['test'],
        dockerImage: 'node:18',
        description: null,
        systemPrompt: null,
        userId: 'test-user-id',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Minimal', keywords: ['test'], dockerImage: 'node:18' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Minimal');
    });

    it('should create with all optional fields', async () => {
      prisma.specialization.create.mockResolvedValueOnce({
        id: 'spec-full',
        name: 'Full Stack',
        keywords: ['react', 'node'],
        description: 'Full stack developer',
        systemPrompt: 'You are a full stack developer',
        dockerImage: 'node:20',
        userId: 'test-user-id',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Full Stack',
          keywords: ['react', 'node'],
          description: 'Full stack developer',
          systemPrompt: 'You are a full stack developer',
          dockerImage: 'node:20',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Full Stack');
    });

    it('should reject missing name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: { keywords: ['test'], dockerImage: 'node:18' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject missing keywords', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Test', dockerImage: 'node:18' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject empty keywords array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Test', keywords: [], dockerImage: 'node:18' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject missing dockerImage', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Test', keywords: ['test'] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject empty name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: '', keywords: ['test'], dockerImage: 'node:18' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject name exceeding max length', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/specializations',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'a'.repeat(101), keywords: ['test'], dockerImage: 'node:18' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });
  });

  // ─── PATCH /specializations/:id ───────────────────────────────

  describe('PATCH /specializations/:id', () => {
    it('should update specialization name', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Backend' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should scope update by id and userId', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated' },
      });

      expect((prisma.specialization as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'spec-1', userId: 'test-user-id' },
        })
      );
    });

    it('should return 404 when specialization not found', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/nonexistent',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Specialization not found');
    });

    it('should update keywords', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { keywords: ['vue', 'angular', 'svelte'] },
      });

      expect(res.statusCode).toBe(200);
      expect((prisma.specialization as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { keywords: ['vue', 'angular', 'svelte'] },
        })
      );
    });

    it('should update description', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { description: 'Updated description' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should clear description with null', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { description: null },
      });

      expect(res.statusCode).toBe(200);
      expect((prisma.specialization as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { description: null },
        })
      );
    });

    it('should update systemPrompt', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { systemPrompt: 'You are a QA engineer' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should update dockerImage', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { dockerImage: 'python:3.11' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      (prisma.specialization as any).updateMany.mockResolvedValueOnce({ count: 1 });

      const payload = {
        name: 'Full Stack Dev',
        keywords: ['react', 'node', 'postgres'],
        description: 'Full stack developer',
        dockerImage: 'node:20',
      };

      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect((prisma.specialization as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: payload,
        })
      );
    });

    it('should reject empty name', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: '' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject empty keywords array', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { keywords: [] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });
  });

  // ─── DELETE /specializations/:id ──────────────────────────────

  describe('DELETE /specializations/:id', () => {
    it('should delete specialization and return success', async () => {
      prisma.specialization.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should scope delete by id and userId', async () => {
      prisma.specialization.deleteMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'DELETE',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.specialization.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'spec-1', userId: 'test-user-id' },
        })
      );
    });

    it('should return 404 when specialization not found', async () => {
      prisma.specialization.deleteMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/specializations/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Specialization not found');
    });

    it('should not delete another user specialization', async () => {
      const otherToken = await createTestToken('other-user-id');
      prisma.specialization.deleteMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'DELETE',
        url: '/specializations/spec-1',
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(prisma.specialization.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'spec-1', userId: 'other-user-id' },
        })
      );
    });
  });
});
