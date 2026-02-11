import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { workflowRoutes } from '../routes/workflows.js';

describe('workflow routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;

    // The helpers mock for workflowVersion may not include findFirst,
    // but the route uses it. Ensure it exists.
    if (!('findFirst' in prisma.workflowVersion)) {
      (prisma.workflowVersion as Record<string, unknown>).findFirst = vi.fn();
    }

    await app.register(workflowRoutes, { prefix: '/workflows' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Helpers ─────────────────────────────────────────────────────

  /** A minimal valid DAG: start -> instruction -> end */
  function validNodes() {
    return [
      { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: 'instr-1', type: 'instruction', position: { x: 200, y: 0 }, data: { label: 'Do work', instructions: 'Build the thing' } },
      { id: 'end-1', type: 'end', position: { x: 400, y: 0 }, data: { label: 'End' } },
    ];
  }

  function validEdges() {
    return [
      { id: 'e1', source: 'start-1', target: 'instr-1' },
      { id: 'e2', source: 'instr-1', target: 'end-1' },
    ];
  }

  /** Access workflowVersion.findFirst (patched in beforeEach) */
  function getWorkflowVersionFindFirst() {
    return (prisma.workflowVersion as Record<string, ReturnType<typeof vi.fn>>).findFirst;
  }

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /workflows should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/workflows' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /workflows/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/workflows/wf-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /workflows should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/workflows',
        payload: { name: 'Test' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /workflows/:id should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/workflows/wf-1',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /workflows/:id should return 401 without auth', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/workflows/wf-1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /workflows/:id/versions should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/versions',
        payload: { nodes: [], edges: [] },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /workflows/:id/validate should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        payload: { nodes: [], edges: [] },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /workflows/:id/publish should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/publish',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /workflows ────────────────────────────────────────────

  describe('GET /workflows', () => {
    it('should return paginated workflows', async () => {
      const mockWorkflows = [
        { id: 'wf-1', name: 'Deploy Pipeline', isPublished: false, versions: [], _count: { agents: 2 } },
        { id: 'wf-2', name: 'Review Flow', isPublished: true, versions: [], _count: { agents: 0 } },
      ];

      prisma.workflow.findMany.mockResolvedValueOnce(mockWorkflows);
      prisma.workflow.count.mockResolvedValueOnce(2);

      const res = await app.inject({
        method: 'GET',
        url: '/workflows',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.workflows).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('should handle pagination parameters', async () => {
      prisma.workflow.findMany.mockResolvedValueOnce([]);
      prisma.workflow.count.mockResolvedValueOnce(0);

      const res = await app.inject({
        method: 'GET',
        url: '/workflows?page=2&limit=10',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('should scope workflows to authenticated user', async () => {
      prisma.workflow.findMany.mockResolvedValueOnce([]);
      prisma.workflow.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/workflows',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        }),
      );
      expect(prisma.workflow.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        }),
      );
    });

    it('should use default pagination when no params provided', async () => {
      prisma.workflow.findMany.mockResolvedValueOnce([]);
      prisma.workflow.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/workflows',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });

  // ─── GET /workflows/:id ────────────────────────────────────────

  describe('GET /workflows/:id', () => {
    it('should return workflow with versions and agents', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Deploy Pipeline',
        description: 'CI/CD workflow',
        isPublished: true,
        userId: 'test-user-id',
        versions: [
          { id: 'ver-2', version: 2, nodes: validNodes(), edges: validEdges() },
          { id: 'ver-1', version: 1, nodes: [], edges: [] },
        ],
        agents: [
          { agent: { id: 'agent-1', name: 'Builder Bot' } },
        ],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/workflows/wf-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('wf-1');
      expect(body.name).toBe('Deploy Pipeline');
      expect(body.versions).toHaveLength(2);
      expect(body.agents).toHaveLength(1);
      expect(body.agents[0].agent.name).toBe('Builder Bot');
    });

    it('should return 404 for non-existent workflow', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/workflows/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Workflow not found');
    });

    it('should scope query to authenticated user', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: '/workflows/wf-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1', userId: 'test-user-id' },
        }),
      );
    });
  });

  // ─── POST /workflows ───────────────────────────────────────────

  describe('POST /workflows', () => {
    it('should create workflow and return 201', async () => {
      prisma.workflow.create.mockResolvedValueOnce({
        id: 'wf-new',
        name: 'New Workflow',
        description: 'A test workflow',
        isPublished: false,
        userId: 'test-user-id',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'New Workflow', description: 'A test workflow' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('wf-new');
      expect(body.name).toBe('New Workflow');
      expect(body.description).toBe('A test workflow');
    });

    it('should include userId from JWT in created workflow', async () => {
      prisma.workflow.create.mockResolvedValueOnce({
        id: 'wf-new',
        name: 'Test',
        userId: 'test-user-id',
      });

      await app.inject({
        method: 'POST',
        url: '/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Test' },
      });

      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'test-user-id', name: 'Test' }),
        }),
      );
    });

    it('should create workflow without optional description', async () => {
      prisma.workflow.create.mockResolvedValueOnce({
        id: 'wf-new',
        name: 'Minimal',
        userId: 'test-user-id',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Minimal' },
      });

      expect(res.statusCode).toBe(201);
    });

    it('should reject missing name with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { description: 'no name provided' },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject empty name with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/workflows',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: '' },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ─── PATCH /workflows/:id ──────────────────────────────────────

  describe('PATCH /workflows/:id', () => {
    it('should update workflow name and return success', async () => {
      prisma.workflow.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/workflows/wf-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Name' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should update workflow description', async () => {
      prisma.workflow.updateMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'PATCH',
        url: '/workflows/wf-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { description: 'New description' },
      });

      expect(prisma.workflow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1', userId: 'test-user-id' },
          data: { description: 'New description' },
        }),
      );
    });

    it('should update isPublished flag', async () => {
      prisma.workflow.updateMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'PATCH',
        url: '/workflows/wf-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { isPublished: true },
      });

      expect(prisma.workflow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isPublished: true },
        }),
      );
    });

    it('should return 404 for non-existent workflow', async () => {
      prisma.workflow.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'PATCH',
        url: '/workflows/nonexistent',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Workflow not found');
    });
  });

  // ─── DELETE /workflows/:id ─────────────────────────────────────

  describe('DELETE /workflows/:id', () => {
    it('should delete workflow and return success', async () => {
      prisma.workflow.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/workflows/wf-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should scope deletion to authenticated user', async () => {
      prisma.workflow.deleteMany.mockResolvedValueOnce({ count: 1 });

      await app.inject({
        method: 'DELETE',
        url: '/workflows/wf-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.workflow.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1', userId: 'test-user-id' },
        }),
      );
    });

    it('should return 404 for non-existent workflow', async () => {
      prisma.workflow.deleteMany.mockResolvedValueOnce({ count: 0 });

      const res = await app.inject({
        method: 'DELETE',
        url: '/workflows/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Workflow not found');
    });
  });

  // ─── POST /workflows/:id/versions ──────────────────────────────

  describe('POST /workflows/:id/versions', () => {
    it('should create first version with version number 1', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Test Workflow',
        userId: 'test-user-id',
      });
      getWorkflowVersionFindFirst().mockResolvedValueOnce(null); // no existing versions

      const nodes = validNodes();
      const edges = validEdges();
      const createdVersion = {
        id: 'ver-1',
        workflowId: 'wf-1',
        version: 1,
        nodes,
        edges,
      };
      prisma.workflowVersion.create.mockResolvedValueOnce(createdVersion);

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/versions',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('ver-1');
      expect(body.version).toBe(1);
      expect(body.workflowId).toBe('wf-1');
    });

    it('should increment version number from latest existing version', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Test Workflow',
        userId: 'test-user-id',
      });
      getWorkflowVersionFindFirst().mockResolvedValueOnce({
        id: 'ver-3',
        workflowId: 'wf-1',
        version: 3,
      });

      const nodes = validNodes();
      const edges = validEdges();
      prisma.workflowVersion.create.mockResolvedValueOnce({
        id: 'ver-4',
        workflowId: 'wf-1',
        version: 4,
        nodes,
        edges,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/versions',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(201);

      // Verify that create was called with version 4 (3 + 1)
      expect(prisma.workflowVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId: 'wf-1',
            version: 4,
          }),
        }),
      );
    });

    it('should return 404 if workflow does not exist', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/nonexistent/versions',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes: validNodes(), edges: validEdges() },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Workflow not found');
    });

    it('should scope workflow lookup to authenticated user', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/versions',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes: [], edges: [] },
      });

      expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1', userId: 'test-user-id' },
        }),
      );
    });

    it('should store nodes and edges in the created version', async () => {
      const nodes = validNodes();
      const edges = validEdges();

      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Test Workflow',
        userId: 'test-user-id',
      });
      getWorkflowVersionFindFirst().mockResolvedValueOnce(null);
      prisma.workflowVersion.create.mockResolvedValueOnce({
        id: 'ver-1',
        workflowId: 'wf-1',
        version: 1,
        nodes,
        edges,
      });

      await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/versions',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(prisma.workflowVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId: 'wf-1',
            nodes: expect.arrayContaining([
              expect.objectContaining({ id: 'start-1', type: 'start' }),
            ]),
            edges: expect.arrayContaining([
              expect.objectContaining({ id: 'e1', source: 'start-1', target: 'instr-1' }),
            ]),
          }),
        }),
      );
    });
  });

  // ─── POST /workflows/:id/validate ──────────────────────────────

  describe('POST /workflows/:id/validate', () => {
    it('should return valid for a correct DAG', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes: validNodes(), edges: validEdges() },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(true);
      expect(body.errors).toHaveLength(0);
    });

    it('should return invalid when no start node is present', async () => {
      const nodes = [
        { id: 'instr-1', type: 'instruction', position: { x: 0, y: 0 }, data: { label: 'Do work', instructions: 'x' } },
        { id: 'end-1', type: 'end', position: { x: 200, y: 0 }, data: { label: 'End' } },
      ];
      const edges = [{ id: 'e1', source: 'instr-1', target: 'end-1' }];

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors.some((e: { message: string }) => e.message.includes('start node'))).toBe(true);
    });

    it('should return invalid when no end node is present', async () => {
      const nodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'instr-1', type: 'instruction', position: { x: 200, y: 0 }, data: { label: 'Do work', instructions: 'x' } },
      ];
      const edges = [{ id: 'e1', source: 'start-1', target: 'instr-1' }];

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors.some((e: { message: string }) => e.message.includes('end node'))).toBe(true);
    });

    it('should detect cycles in the workflow', async () => {
      const nodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'instr-1', type: 'instruction', position: { x: 200, y: 0 }, data: { label: 'A', instructions: 'x' } },
        { id: 'instr-2', type: 'instruction', position: { x: 400, y: 0 }, data: { label: 'B', instructions: 'y' } },
        { id: 'end-1', type: 'end', position: { x: 600, y: 0 }, data: { label: 'End' } },
      ];
      const edges = [
        { id: 'e1', source: 'start-1', target: 'instr-1' },
        { id: 'e2', source: 'instr-1', target: 'instr-2' },
        { id: 'e3', source: 'instr-2', target: 'instr-1' }, // cycle
        { id: 'e4', source: 'instr-2', target: 'end-1' },
      ];

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors.some((e: { message: string }) => e.message.includes('cycle'))).toBe(true);
    });

    it('should detect dead-end nodes', async () => {
      const nodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'instr-1', type: 'instruction', position: { x: 200, y: 0 }, data: { label: 'Dead end', instructions: 'x' } },
        { id: 'end-1', type: 'end', position: { x: 400, y: 0 }, data: { label: 'End' } },
      ];
      // instr-1 has no outgoing edge and is not an end node
      const edges = [
        { id: 'e1', source: 'start-1', target: 'instr-1' },
        { id: 'e2', source: 'start-1', target: 'end-1' },
      ];

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors.some((e: { message: string }) =>
        e.message.includes('dead end') || e.message.includes('no outgoing edges'),
      )).toBe(true);
    });

    it('should detect missing condition branches', async () => {
      const nodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'cond-1', type: 'condition', position: { x: 200, y: 0 }, data: { label: 'Check', condition: 'task.status == done' } },
        { id: 'end-1', type: 'end', position: { x: 400, y: 0 }, data: { label: 'End' } },
      ];
      // Only a "true" branch, missing "false" branch
      const edges = [
        { id: 'e1', source: 'start-1', target: 'cond-1' },
        { id: 'e2', source: 'cond-1', target: 'end-1', sourceHandle: 'true' },
      ];

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors.some((e: { message: string }) => e.message.includes('"false"'))).toBe(true);
    });

    it('should detect condition node without condition expression', async () => {
      const nodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'cond-1', type: 'condition', position: { x: 200, y: 0 }, data: { label: 'Check' } },
        { id: 'end-1', type: 'end', position: { x: 400, y: 100 }, data: { label: 'End' } },
        { id: 'end-2', type: 'end', position: { x: 400, y: -100 }, data: { label: 'End 2' } },
      ];
      const edges = [
        { id: 'e1', source: 'start-1', target: 'cond-1' },
        { id: 'e2', source: 'cond-1', target: 'end-1', sourceHandle: 'true' },
        { id: 'e3', source: 'cond-1', target: 'end-2', sourceHandle: 'false' },
      ];

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors.some((e: { message: string }) => e.message.includes('no condition expression'))).toBe(true);
    });

    it('should return invalid for empty workflow (no nodes)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes: [], edges: [] },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Empty workflow has no start and no end — should be invalid
      expect(body.valid).toBe(false);
    });

    it('should validate a workflow with condition node and both branches', async () => {
      const nodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'cond-1', type: 'condition', position: { x: 200, y: 0 }, data: { label: 'Check', condition: 'task.status == done' } },
        { id: 'end-1', type: 'end', position: { x: 400, y: 100 }, data: { label: 'End True' } },
        { id: 'end-2', type: 'end', position: { x: 400, y: -100 }, data: { label: 'End False' } },
      ];
      const edges = [
        { id: 'e1', source: 'start-1', target: 'cond-1' },
        { id: 'e2', source: 'cond-1', target: 'end-1', sourceHandle: 'true' },
        { id: 'e3', source: 'cond-1', target: 'end-2', sourceHandle: 'false' },
      ];

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(true);
      expect(body.errors).toHaveLength(0);
    });

    it('should detect edges referencing non-existent nodes', async () => {
      const nodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'end-1', type: 'end', position: { x: 200, y: 0 }, data: { label: 'End' } },
      ];
      const edges = [
        { id: 'e1', source: 'start-1', target: 'end-1' },
        { id: 'e2', source: 'start-1', target: 'ghost-node' },
      ];

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/validate',
        headers: { authorization: `Bearer ${token}` },
        payload: { nodes, edges },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors.some((e: { message: string }) => e.message.includes('non-existent'))).toBe(true);
    });
  });

  // ─── POST /workflows/:id/publish ───────────────────────────────

  describe('POST /workflows/:id/publish', () => {
    it('should publish a valid workflow', async () => {
      const nodes = validNodes();
      const edges = validEdges();

      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Deploy Pipeline',
        isPublished: false,
        userId: 'test-user-id',
        versions: [
          { id: 'ver-1', version: 1, nodes, edges },
        ],
      });

      prisma.workflow.update.mockResolvedValueOnce({
        id: 'wf-1',
        isPublished: true,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/publish',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.versionId).toBe('ver-1');
    });

    it('should set isPublished to true in the database', async () => {
      const nodes = validNodes();
      const edges = validEdges();

      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Deploy Pipeline',
        isPublished: false,
        userId: 'test-user-id',
        versions: [{ id: 'ver-1', version: 1, nodes, edges }],
      });

      prisma.workflow.update.mockResolvedValueOnce({ id: 'wf-1', isPublished: true });

      await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/publish',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1' },
          data: { isPublished: true },
        }),
      );
    });

    it('should return 404 for non-existent workflow', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/nonexistent/publish',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Workflow not found');
    });

    it('should return 400 when workflow has no versions', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Empty Workflow',
        isPublished: false,
        userId: 'test-user-id',
        versions: [],
      });

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/publish',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Workflow has no versions');
    });

    it('should return 400 when latest version fails validation', async () => {
      // Invalid workflow: no end node
      const invalidNodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'instr-1', type: 'instruction', position: { x: 200, y: 0 }, data: { label: 'Do work', instructions: 'x' } },
      ];
      const invalidEdges = [
        { id: 'e1', source: 'start-1', target: 'instr-1' },
      ];

      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Bad Workflow',
        isPublished: false,
        userId: 'test-user-id',
        versions: [
          { id: 'ver-1', version: 1, nodes: invalidNodes, edges: invalidEdges },
        ],
      });

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/publish',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('Workflow validation failed');
      expect(body.details).toBeDefined();
      expect(Array.isArray(body.details)).toBe(true);
      expect(body.details.length).toBeGreaterThan(0);
    });

    it('should not update isPublished when validation fails', async () => {
      const invalidNodes = [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      ];

      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Bad Workflow',
        isPublished: false,
        userId: 'test-user-id',
        versions: [
          { id: 'ver-1', version: 1, nodes: invalidNodes, edges: [] },
        ],
      });

      await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/publish',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('should scope workflow lookup to authenticated user', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce(null);

      await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/publish',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'wf-1', userId: 'test-user-id' }),
        }),
      );
    });

    it('should use latest version (first in desc-ordered array) for validation', async () => {
      const goodNodes = validNodes();
      const goodEdges = validEdges();

      // The route takes versions[0] which is ordered desc, so version 2 is latest
      prisma.workflow.findFirst.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Multi-version Workflow',
        isPublished: false,
        userId: 'test-user-id',
        versions: [
          { id: 'ver-2', version: 2, nodes: goodNodes, edges: goodEdges },
        ],
      });

      prisma.workflow.update.mockResolvedValueOnce({ id: 'wf-1', isPublished: true });

      const res = await app.inject({
        method: 'POST',
        url: '/workflows/wf-1/publish',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().versionId).toBe('ver-2');
    });
  });

  // ─── User isolation ────────────────────────────────────────────

  describe('user isolation', () => {
    it('should use different userId for different tokens', async () => {
      const otherToken = await createTestToken('other-user-id');

      prisma.workflow.findMany.mockResolvedValueOnce([]);
      prisma.workflow.count.mockResolvedValueOnce(0);

      await app.inject({
        method: 'GET',
        url: '/workflows',
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'other-user-id' },
        }),
      );
    });

    it('should not allow user to access another user workflow by id', async () => {
      prisma.workflow.findFirst.mockResolvedValueOnce(null); // scoped query returns null

      const res = await app.inject({
        method: 'GET',
        url: '/workflows/wf-belonging-to-other',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should not allow user to delete another user workflow', async () => {
      prisma.workflow.deleteMany.mockResolvedValueOnce({ count: 0 }); // scoped query matches nothing

      const res = await app.inject({
        method: 'DELETE',
        url: '/workflows/wf-belonging-to-other',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
