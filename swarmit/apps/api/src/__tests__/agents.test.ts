import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { agentRoutes } from '../routes/agents.js';

describe('agent routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;
    await app.register(agentRoutes, { prefix: '/agents' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /agents should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/agents' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /agents/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/agents/agent-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /agents should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Test Agent' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /agents/:id should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/agents/agent-1',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /agents/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/agents/agent-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /agents/:id/skills should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/agents/agent-1/skills',
        payload: { skillId: 'skill-1' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /agents/:id/skills/:skillId should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1/skills/skill-1',
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /agents/:id/workflows should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/agents/agent-1/workflows',
        payload: { workflowId: 'wf-1' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /agents/:id/workflows/:workflowId should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1/workflows/wf-1',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /agents ──────────────────────────────────────────────

  describe('GET /agents', () => {
    it('should return paginated agents with defaults', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Dev Bot',
          specializationId: 'spec-1',
          specialization: { id: 'spec-1', name: 'developer' },
          skills: [],
          agentWorkflows: [],
          _count: { tasks: 5 },
        },
        {
          id: 'agent-2',
          name: 'QA Bot',
          specializationId: 'spec-2',
          specialization: { id: 'spec-2', name: 'qa' },
          skills: [],
          agentWorkflows: [],
          _count: { tasks: 2 },
        },
      ];

      prisma.agent.findMany.mockResolvedValueOnce(mockAgents);
      prisma.agent.count.mockResolvedValueOnce(2);

      const res = await app.inject({
        method: 'GET',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agents).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('should handle pagination parameters', async () => {
      prisma.agent.findMany.mockResolvedValueOnce([]);
      prisma.agent.count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/agents?page=3&limit=10',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(3);
      expect(body.limit).toBe(10);

      expect(prisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should return empty list when no agents exist', async () => {
      prisma.agent.findMany.mockResolvedValueOnce([]);
      prisma.agent.count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agents).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('should scope agents to the authenticated user', async () => {
      prisma.agent.findMany.mockResolvedValueOnce([]);
      prisma.agent.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        }),
      );
      expect(prisma.agent.count).toHaveBeenCalledWith({
        where: { userId: 'test-user-id' },
      });
    });

    it('should include skills, agentWorkflows, and task count', async () => {
      prisma.agent.findMany.mockResolvedValueOnce([]);
      prisma.agent.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            specialization: true,
            skills: { include: { skill: true } },
            agentWorkflows: { include: { workflow: { select: { id: true, name: true } } } },
            _count: { select: { tasks: true } },
          },
        }),
      );
    });
  });

  // ─── GET /agents/:id ─────────────────────────────────────────

  describe('GET /agents/:id', () => {
    it('should return agent with includes when found', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Dev Bot',
        specializationId: 'spec-1',
        specialization: { id: 'spec-1', name: 'developer' },
        systemPrompt: 'You are a developer.',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.7,
        maxTokens: 4096,
        userId: 'test-user-id',
        skills: [
          { skill: { id: 'skill-1', name: 'Docker' } },
        ],
        agentWorkflows: [
          { workflow: { id: 'wf-1', name: 'CI Pipeline' } },
        ],
        tasks: [
          { id: 'task-1', title: 'Fix bug', status: 'done' },
        ],
      };

      prisma.agent.findFirst.mockResolvedValueOnce(mockAgent);

      const res = await app.inject({
        method: 'GET',
        url: '/agents/agent-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('agent-1');
      expect(body.name).toBe('Dev Bot');
      expect(body.skills).toHaveLength(1);
      expect(body.agentWorkflows).toHaveLength(1);
      expect(body.tasks).toHaveLength(1);
    });

    it('should return 404 when agent not found', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/agents/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Agent not found');
    });

    it('should scope lookup to the authenticated user', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: '/agents/agent-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.agent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1', userId: 'test-user-id' },
        }),
      );
    });

    it('should include tasks limited to 10 ordered by updatedAt desc', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: '/agents/agent-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.agent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            specialization: true,
            tasks: { take: 10, orderBy: { updatedAt: 'desc' } },
          }),
        }),
      );
    });
  });

  // ─── POST /agents ─────────────────────────────────────────────

  describe('POST /agents', () => {
    it('should create an agent with name and specializationId and return 201', async () => {
      const mockAgent = {
        id: 'agent-new',
        name: 'New Agent',
        specializationId: 'spec-1',
        specialization: { id: 'spec-1', name: 'developer' },
        systemPrompt: null,
        model: 'claude-sonnet-4-5-20250929',
        temperature: 0.7,
        maxTokens: 8192,
        userId: 'test-user-id',
      };

      prisma.agent.create.mockResolvedValueOnce(mockAgent);

      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'New Agent', specializationId: 'spec-1' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('agent-new');
      expect(body.name).toBe('New Agent');
      expect(body.specializationId).toBe('spec-1');
    });

    it('should reject creation without specializationId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'New Agent' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should create an agent with all fields and return 201', async () => {
      const fullPayload = {
        name: 'Full Agent',
        specializationId: 'spec-dev-1',
        systemPrompt: 'You are an expert developer.',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.5,
        maxTokens: 8192,
      };

      const mockAgent = {
        id: 'agent-full',
        ...fullPayload,
        userId: 'test-user-id',
      };

      prisma.agent.create.mockResolvedValueOnce(mockAgent);

      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
        payload: fullPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('agent-full');
      expect(body.name).toBe('Full Agent');
      expect(body.specializationId).toBe('spec-dev-1');
      expect(body.systemPrompt).toBe('You are an expert developer.');
      expect(body.model).toBe('claude-sonnet-4-20250514');
      expect(body.temperature).toBe(0.5);
      expect(body.maxTokens).toBe(8192);
    });

    it('should pass userId from auth into create data', async () => {
      prisma.agent.create.mockResolvedValueOnce({ id: 'agent-x', name: 'X' });

      await app.inject({
        method: 'POST',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'X', specializationId: 'spec-1' },
      });

      expect(prisma.agent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'test-user-id', specializationId: 'spec-1' }),
        }),
      );
    });
  });

  // ─── PATCH /agents/:id ────────────────────────────────────────

  describe('PATCH /agents/:id', () => {
    it('should update an agent and return success', async () => {
      prisma.agent.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/agents/agent-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Name', temperature: 0.9 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should scope update to authenticated user', async () => {
      prisma.agent.updateMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'PATCH',
        url: '/agents/agent-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated' },
      });

      expect(prisma.agent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1', userId: 'test-user-id' },
        }),
      );
    });

    it('should return 404 when agent not found', async () => {
      prisma.agent.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/agents/nonexistent',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Nope' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Agent not found');
    });
  });

  // ─── DELETE /agents/:id ───────────────────────────────────────

  describe('DELETE /agents/:id', () => {
    it('should delete an agent and return success', async () => {
      prisma.agent.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should scope delete to authenticated user', async () => {
      prisma.agent.deleteMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.agent.deleteMany).toHaveBeenCalledWith({
        where: { id: 'agent-1', userId: 'test-user-id' },
      });
    });

    it('should return 404 when agent not found', async () => {
      prisma.agent.deleteMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/agents/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Agent not found');
    });
  });

  // ─── POST /agents/:id/skills ──────────────────────────────────

  describe('POST /agents/:id/skills', () => {
    it('should add a skill to an agent and return 201', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce({
        id: 'agent-1',
        name: 'Dev Bot',
        userId: 'test-user-id',
      });
      prisma.agentSkill.create.mockResolvedValueOnce({
        agentId: 'agent-1',
        skillId: 'skill-1',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/agents/agent-1/skills',
        headers: { authorization: `Bearer ${token}` },
        payload: { skillId: 'skill-1' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
    });

    it('should verify agent ownership before adding skill', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce({
        id: 'agent-1',
        userId: 'test-user-id',
      });
      prisma.agentSkill.create.mockResolvedValueOnce({});

      await app.inject({
        method: 'POST',
        url: '/agents/agent-1/skills',
        headers: { authorization: `Bearer ${token}` },
        payload: { skillId: 'skill-1' },
      });

      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: { id: 'agent-1', userId: 'test-user-id' },
      });
    });

    it('should return 404 when agent not found', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/agents/nonexistent/skills',
        headers: { authorization: `Bearer ${token}` },
        payload: { skillId: 'skill-1' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Agent not found');
      // Should not attempt to create the skill association
      expect(prisma.agentSkill.create).not.toHaveBeenCalled();
    });
  });

  // ─── DELETE /agents/:id/skills/:skillId ───────────────────────

  describe('DELETE /agents/:id/skills/:skillId', () => {
    it('should remove a skill from an agent', async () => {
      prisma.agentSkill.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1/skills/skill-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should call deleteMany with correct agentId and skillId', async () => {
      prisma.agentSkill.deleteMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1/skills/skill-42',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.agentSkill.deleteMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-1', skillId: 'skill-42' },
      });
    });

    it('should succeed even if no matching record exists (idempotent)', async () => {
      prisma.agentSkill.deleteMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1/skills/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });
  });

  // ─── POST /agents/:id/workflows ──────────────────────────────

  describe('POST /agents/:id/workflows', () => {
    it('should assign a workflow to an agent and return 201', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce({
        id: 'agent-1',
        name: 'Dev Bot',
        userId: 'test-user-id',
      });
      prisma.agentWorkflow.create.mockResolvedValueOnce({
        agentId: 'agent-1',
        workflowId: 'wf-1',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/agents/agent-1/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { workflowId: 'wf-1' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
    });

    it('should verify agent ownership before assigning workflow', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce({
        id: 'agent-1',
        userId: 'test-user-id',
      });
      prisma.agentWorkflow.create.mockResolvedValueOnce({});

      await app.inject({
        method: 'POST',
        url: '/agents/agent-1/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { workflowId: 'wf-1' },
      });

      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: { id: 'agent-1', userId: 'test-user-id' },
      });
    });

    it('should create agentWorkflow with correct IDs', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce({
        id: 'agent-1',
        userId: 'test-user-id',
      });
      prisma.agentWorkflow.create.mockResolvedValueOnce({});

      await app.inject({
        method: 'POST',
        url: '/agents/agent-1/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { workflowId: 'wf-99' },
      });

      expect(prisma.agentWorkflow.create).toHaveBeenCalledWith({
        data: { agentId: 'agent-1', workflowId: 'wf-99' },
      });
    });

    it('should return 404 when agent not found', async () => {
      prisma.agent.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/agents/nonexistent/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { workflowId: 'wf-1' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Agent not found');
      // Should not attempt to create the workflow association
      expect(prisma.agentWorkflow.create).not.toHaveBeenCalled();
    });
  });

  // ─── DELETE /agents/:id/workflows/:workflowId ─────────────────

  describe('DELETE /agents/:id/workflows/:workflowId', () => {
    it('should remove a workflow from an agent', async () => {
      prisma.agentWorkflow.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1/workflows/wf-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should call deleteMany with correct agentId and workflowId', async () => {
      prisma.agentWorkflow.deleteMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1/workflows/wf-42',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.agentWorkflow.deleteMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-1', workflowId: 'wf-42' },
      });
    });

    it('should succeed even if no matching record exists (idempotent)', async () => {
      prisma.agentWorkflow.deleteMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/agents/agent-1/workflows/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });
  });
});
