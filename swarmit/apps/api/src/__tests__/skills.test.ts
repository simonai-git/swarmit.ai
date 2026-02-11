import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { skillRoutes } from '../routes/skills.js';

describe('skill routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;
    await app.register(skillRoutes, { prefix: '/skills' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /skills should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/skills' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /skills/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/skills/skill-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /skills should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'Test' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /skills/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/skills/skill-1' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /skills/search should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/skills/search?q=test' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /skills ──────────────────────────────────────────────

  describe('GET /skills', () => {
    it('should return paginated skills', async () => {
      const mockSkills = [
        { id: 'skill-1', name: 'Docker', _count: { agents: 3 } },
        { id: 'skill-2', name: 'Kubernetes', _count: { agents: 1 } },
      ];

      prisma.skill.findMany.mockResolvedValueOnce(mockSkills);
      prisma.skill.count.mockResolvedValueOnce(2);

      const res = await app.inject({
        method: 'GET',
        url: '/skills',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.skills).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('should handle pagination parameters', async () => {
      prisma.skill.findMany.mockResolvedValueOnce([]);
      prisma.skill.count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/skills?page=2&limit=5',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(2);
      expect(body.limit).toBe(5);

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 })
      );
    });

    it('should return empty list when no skills exist', async () => {
      prisma.skill.findMany.mockResolvedValueOnce([]);
      prisma.skill.count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/skills',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.skills).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });

  // ─── GET /skills/:id ─────────────────────────────────────────

  describe('GET /skills/:id', () => {
    it('should return skill with agents', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'Docker',
        description: 'Container orchestration',
        agents: [
          { agent: { id: 'agent-1', name: 'DevOps Bot', specialization: 'devops' } },
        ],
      };

      prisma.skill.findUnique.mockResolvedValueOnce(mockSkill);

      const res = await app.inject({
        method: 'GET',
        url: '/skills/skill-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('skill-1');
      expect(body.name).toBe('Docker');
      expect(body.agents).toHaveLength(1);
    });

    it('should return 404 for non-existent skill', async () => {
      prisma.skill.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/skills/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Skill not found');
    });
  });

  // ─── POST /skills ─────────────────────────────────────────────

  describe('POST /skills', () => {
    it('should create a skill and return 201', async () => {
      const mockSkill = {
        id: 'skill-new',
        name: 'Terraform',
        description: 'Infrastructure as Code',
        sourceUrl: 'https://terraform.io',
      };

      prisma.skill.create.mockResolvedValueOnce(mockSkill);

      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Terraform',
          description: 'Infrastructure as Code',
          sourceUrl: 'https://terraform.io',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('skill-new');
      expect(body.name).toBe('Terraform');
    });

    it('should create a skill with name only', async () => {
      prisma.skill.create.mockResolvedValueOnce({
        id: 'skill-min',
        name: 'Git',
        description: null,
        sourceUrl: null,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Git' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Git');
    });
  });

  // ─── DELETE /skills/:id ────────────────────────────────────────

  describe('DELETE /skills/:id', () => {
    it('should delete a skill and return success', async () => {
      prisma.skill.delete.mockResolvedValueOnce({ id: 'skill-1' });

      const res = await app.inject({
        method: 'DELETE',
        url: '/skills/skill-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should return 404 for non-existent skill', async () => {
      prisma.skill.delete.mockRejectedValueOnce(new Error('Record not found'));

      const res = await app.inject({
        method: 'DELETE',
        url: '/skills/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Skill not found');
    });
  });

  // ─── GET /skills/search ───────────────────────────────────────

  describe('GET /skills/search', () => {
    it('should search skills by query term', async () => {
      const mockSkills = [
        { id: 'skill-1', name: 'Docker', description: 'Container tech' },
      ];

      prisma.skill.findMany.mockResolvedValueOnce(mockSkills);

      const res = await app.inject({
        method: 'GET',
        url: '/skills/search?q=docker',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.skills).toHaveLength(1);
      expect(body.skills[0].name).toBe('Docker');
    });

    it('should search with case-insensitive matching', async () => {
      prisma.skill.findMany.mockResolvedValueOnce([]);

      await app.inject({
        method: 'GET',
        url: '/skills/search?q=DOCKER',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'DOCKER', mode: 'insensitive' } },
              { description: { contains: 'DOCKER', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    it('should return empty array when no query provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/skills/search',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().skills).toEqual([]);
      // Should NOT call prisma
      expect(prisma.skill.findMany).not.toHaveBeenCalled();
    });

    it('should limit results to 20', async () => {
      prisma.skill.findMany.mockResolvedValueOnce([]);

      await app.inject({
        method: 'GET',
        url: '/skills/search?q=test',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 })
      );
    });
  });
});
