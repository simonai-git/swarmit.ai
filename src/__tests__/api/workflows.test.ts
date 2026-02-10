import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing the routes
vi.mock('@/lib/db', () => ({
  createWorkflow: vi.fn(),
  getWorkflow: vi.fn(),
  getWorkflowsByUser: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  publishWorkflowVersion: vi.fn(),
  getWorkflowVersions: vi.fn(),
  getAgentsByWorkflow: vi.fn(),
  removeAgentWorkflow: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/workflow-validation', () => ({
  validateWorkflow: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

import { GET as listGET, POST } from '@/app/api/workflows/route';
import { GET as detailGET, PATCH, DELETE } from '@/app/api/workflows/[id]/route';
import {
  createWorkflow,
  getWorkflow,
  getWorkflowsByUser,
  updateWorkflow,
  deleteWorkflow,
  publishWorkflowVersion,
  getWorkflowVersions,
  getAgentsByWorkflow,
  removeAgentWorkflow,
} from '@/lib/db';
import { getServerSession } from 'next-auth';
import { validateWorkflow } from '@/lib/workflow-validation';

describe('API /api/workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_WORKFLOWS = 'true';
  });

  // ── GET /api/workflows ──────────────────────────────────────────────

  describe('GET /api/workflows', () => {
    it('should return 404 when feature flag is disabled', async () => {
      delete process.env.FEATURE_WORKFLOWS;

      const request = new NextRequest('http://localhost/api/workflows');
      const response = await listGET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflows feature is not enabled');
    });

    it('should return 401 when unauthorized', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/workflows');
      const response = await listGET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return list of workflows', async () => {
      const mockWorkflows = [
        { id: 'wf-1', name: 'Workflow 1', user_email: 'test@test.com' },
        { id: 'wf-2', name: 'Workflow 2', user_email: 'test@test.com' },
      ];
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflowsByUser).mockResolvedValue(mockWorkflows as any);

      const request = new NextRequest('http://localhost/api/workflows');
      const response = await listGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data[0].id).toBe('wf-1');
      expect(data[1].id).toBe('wf-2');
      expect(getWorkflowsByUser).toHaveBeenCalledWith('test@test.com');
    });

    it('should return 500 on database error', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflowsByUser).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/workflows');
      const response = await listGET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch workflows');
    });
  });

  // ── POST /api/workflows ─────────────────────────────────────────────

  describe('POST /api/workflows', () => {
    it('should return 404 when feature flag is disabled', async () => {
      delete process.env.FEATURE_WORKFLOWS;

      const request = new NextRequest('http://localhost/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflows feature is not enabled');
    });

    it('should return 401 when unauthorized', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when name is missing', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });

      const request = new NextRequest('http://localhost/api/workflows', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name is required');
    });

    it('should return 400 when name is not a string', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });

      const request = new NextRequest('http://localhost/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ name: 123 }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name is required');
    });

    it('should create workflow successfully', async () => {
      const mockCreated = {
        id: 'test-uuid',
        name: 'My Workflow',
        description: 'A test workflow',
        nodes: [],
        edges: [],
        user_email: 'test@test.com',
      };
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(createWorkflow).mockResolvedValue(mockCreated as any);

      const request = new NextRequest('http://localhost/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ name: 'My Workflow', description: 'A test workflow' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.id).toBe('test-uuid');
      expect(data.name).toBe('My Workflow');
      expect(createWorkflow).toHaveBeenCalledWith({
        id: 'test-uuid',
        name: 'My Workflow',
        description: 'A test workflow',
        nodes: [],
        edges: [],
        user_email: 'test@test.com',
      });
    });

    it('should default description to null and nodes/edges to empty arrays', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(createWorkflow).mockResolvedValue({ id: 'test-uuid', name: 'Minimal' } as any);

      const request = new NextRequest('http://localhost/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ name: 'Minimal' }),
      });
      await POST(request);

      expect(createWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
          nodes: [],
          edges: [],
        })
      );
    });

    it('should return 500 on database error', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(createWorkflow).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create workflow');
    });
  });

  // ── GET /api/workflows/:id ──────────────────────────────────────────

  describe('GET /api/workflows/:id', () => {
    it('should return 404 when feature flag is disabled', async () => {
      delete process.env.FEATURE_WORKFLOWS;

      const request = new NextRequest('http://localhost/api/workflows/workflow-1');
      const response = await detailGET(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflows feature is not enabled');
    });

    it('should return 401 when unauthorized', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1');
      const response = await detailGET(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when workflow not found', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/workflows/nonexistent');
      const response = await detailGET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflow not found');
    });

    it('should return 403 when workflow belongs to another user', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue({
        id: 'workflow-1',
        name: 'Other User Workflow',
        user_email: 'other@test.com',
      } as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1');
      const response = await detailGET(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should return workflow details', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'My Workflow',
        user_email: 'test@test.com',
        nodes: [],
        edges: [],
      };
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1');
      const response = await detailGET(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('workflow-1');
      expect(data.name).toBe('My Workflow');
    });

    it('should include versions and agents when query params are set', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'My Workflow',
        user_email: 'test@test.com',
        nodes: [],
        edges: [],
      };
      const mockVersions = [{ id: 'v-1', version: 1 }];
      const mockAgents = [{ agent_id: 'agent-1', name: 'Agent A' }];

      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(getWorkflowVersions).mockResolvedValue(mockVersions as any);
      vi.mocked(getAgentsByWorkflow).mockResolvedValue(mockAgents as any);

      const request = new NextRequest(
        'http://localhost/api/workflows/workflow-1?include_versions=true&include_agents=true'
      );
      const response = await detailGET(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.versions).toHaveLength(1);
      expect(data.versions[0].id).toBe('v-1');
      expect(data.agents).toHaveLength(1);
      expect(data.agents[0].agent_id).toBe('agent-1');
      expect(getWorkflowVersions).toHaveBeenCalledWith('workflow-1');
      expect(getAgentsByWorkflow).toHaveBeenCalledWith('workflow-1');
    });

    it('should not include versions or agents when query params are absent', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        name: 'My Workflow',
        user_email: 'test@test.com',
      };
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1');
      const response = await detailGET(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.versions).toBeUndefined();
      expect(data.agents).toBeUndefined();
      expect(getWorkflowVersions).not.toHaveBeenCalled();
      expect(getAgentsByWorkflow).not.toHaveBeenCalled();
    });

    it('should return 500 on database error', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/workflows/workflow-1');
      const response = await detailGET(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch workflow');
    });
  });

  // ── PATCH /api/workflows/:id ────────────────────────────────────────

  describe('PATCH /api/workflows/:id', () => {
    const mockWorkflow = {
      id: 'workflow-1',
      name: 'My Workflow',
      user_email: 'test@test.com',
      nodes: [
        { id: 'start-1', type: 'start', data: { label: 'Start' }, position: { x: 0, y: 0 } },
        { id: 'end-1', type: 'end', data: { label: 'End' }, position: { x: 200, y: 0 } },
      ],
      edges: [
        { id: 'e-1', source: 'start-1', target: 'end-1' },
      ],
      lock_version: 1,
    };

    it('should return 404 when feature flag is disabled', async () => {
      delete process.env.FEATURE_WORKFLOWS;

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflows feature is not enabled');
    });

    it('should return 401 when unauthorized', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when workflow not found', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/workflows/nonexistent', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflow not found');
    });

    it('should return 403 when workflow belongs to another user', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue({
        ...mockWorkflow,
        user_email: 'other@test.com',
      } as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    // ── action: publish ─────────────────────────────────────────────

    it('should validate and publish workflow', async () => {
      const mockVersion = { id: 'v-1', version: 1, workflow_id: 'workflow-1' };
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(validateWorkflow).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [{ type: 'warning', message: 'Consider simplifying' }],
      });
      vi.mocked(publishWorkflowVersion).mockResolvedValue(mockVersion as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.version).toEqual(mockVersion);
      expect(data.warnings).toHaveLength(1);
      expect(data.warnings[0].message).toBe('Consider simplifying');
      expect(validateWorkflow).toHaveBeenCalledWith(mockWorkflow.nodes, mockWorkflow.edges);
      expect(publishWorkflowVersion).toHaveBeenCalledWith('workflow-1', 'test@test.com');
    });

    it('should return 400 when publish validation fails', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(validateWorkflow).mockReturnValue({
        valid: false,
        errors: [{ type: 'error', message: 'Workflow must have a start node' }],
        warnings: [],
      });

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Workflow validation failed');
      expect(data.validation.valid).toBe(false);
      expect(data.validation.errors).toHaveLength(1);
      expect(publishWorkflowVersion).not.toHaveBeenCalled();
    });

    it('should return 500 when publishWorkflowVersion returns null', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(validateWorkflow).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });
      vi.mocked(publishWorkflowVersion).mockResolvedValue(null as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to publish workflow');
    });

    // ── action: validate ────────────────────────────────────────────

    it('should return dry-run validation result', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(validateWorkflow).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'validate' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.valid).toBe(true);
      expect(data.errors).toEqual([]);
      expect(data.warnings).toEqual([]);
      expect(validateWorkflow).toHaveBeenCalledWith(mockWorkflow.nodes, mockWorkflow.edges);
      expect(publishWorkflowVersion).not.toHaveBeenCalled();
    });

    it('should validate with provided nodes/edges instead of stored ones', async () => {
      const customNodes = [{ id: 'n-1', type: 'start', data: {}, position: { x: 0, y: 0 } }];
      const customEdges = [{ id: 'e-custom', source: 'n-1', target: 'n-2' }];

      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(validateWorkflow).mockReturnValue({
        valid: false,
        errors: [{ type: 'error', message: 'Missing end node' }],
        warnings: [],
      });

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'validate', nodes: customNodes, edges: customEdges }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.valid).toBe(false);
      expect(validateWorkflow).toHaveBeenCalledWith(customNodes, customEdges);
    });

    // ── regular update ──────────────────────────────────────────────

    it('should return 400 when lock_version is missing for regular update', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('lock_version is required for updates');
    });

    it('should update workflow successfully with lock_version', async () => {
      const updatedWorkflow = {
        ...mockWorkflow,
        name: 'Updated Name',
        lock_version: 2,
      };
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(updateWorkflow).mockResolvedValue(updatedWorkflow as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name', lock_version: 1 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('Updated Name');
      expect(data.lock_version).toBe(2);
      expect(updateWorkflow).toHaveBeenCalledWith(
        'workflow-1',
        { name: 'Updated Name', description: undefined, nodes: undefined, edges: undefined },
        1
      );
    });

    it('should return 409 conflict when lock_version mismatches', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(updateWorkflow).mockResolvedValue(null as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name', lock_version: 0 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain('Conflict');
    });

    it('should return 500 on database error', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update workflow');
    });
  });

  // ── DELETE /api/workflows/:id ───────────────────────────────────────

  describe('DELETE /api/workflows/:id', () => {
    const mockWorkflow = {
      id: 'workflow-1',
      name: 'My Workflow',
      user_email: 'test@test.com',
    };

    it('should return 404 when feature flag is disabled', async () => {
      delete process.env.FEATURE_WORKFLOWS;

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflows feature is not enabled');
    });

    it('should return 401 when unauthorized', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when workflow not found', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/workflows/nonexistent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflow not found');
    });

    it('should return 403 when workflow belongs to another user', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue({
        ...mockWorkflow,
        user_email: 'other@test.com',
      } as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should delete workflow and unassign agents', async () => {
      const mockAgents = [
        { agent_id: 'agent-1', name: 'Agent A' },
        { agent_id: 'agent-2', name: 'Agent B' },
      ];

      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(getAgentsByWorkflow).mockResolvedValue(mockAgents as any);
      vi.mocked(removeAgentWorkflow).mockResolvedValue(true as any);
      vi.mocked(deleteWorkflow).mockResolvedValue(true as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.unassigned_agents).toBe(2);
      expect(removeAgentWorkflow).toHaveBeenCalledTimes(2);
      expect(removeAgentWorkflow).toHaveBeenCalledWith('agent-1');
      expect(removeAgentWorkflow).toHaveBeenCalledWith('agent-2');
      expect(deleteWorkflow).toHaveBeenCalledWith('workflow-1');
    });

    it('should delete workflow with no assigned agents', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(getAgentsByWorkflow).mockResolvedValue([]);
      vi.mocked(deleteWorkflow).mockResolvedValue(true as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.unassigned_agents).toBe(0);
      expect(removeAgentWorkflow).not.toHaveBeenCalled();
    });

    it('should return 500 when deleteWorkflow returns false', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(getAgentsByWorkflow).mockResolvedValue([]);
      vi.mocked(deleteWorkflow).mockResolvedValue(false as any);

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete workflow');
    });

    it('should return 500 on database error', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
      vi.mocked(getWorkflow).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/workflows/workflow-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'workflow-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete workflow');
    });
  });
});
