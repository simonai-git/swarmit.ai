import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing the route
vi.mock('@/lib/db', () => ({
  getAgent: vi.fn(),
  updateAgent: vi.fn(),
  getAgentWorkflow: vi.fn(),
  setAgentWorkflow: vi.fn(),
  removeAgentWorkflow: vi.fn(),
  getWorkflow: vi.fn(),
  getWorkflowVersion: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { GET, PUT, DELETE } from '@/app/api/agents/[id]/workflow/route';
import {
  getAgent,
  updateAgent,
  getAgentWorkflow,
  setAgentWorkflow,
  removeAgentWorkflow,
  getWorkflow,
  getWorkflowVersion,
} from '@/lib/db';
import { getServerSession } from 'next-auth';

const mockAgent = { id: 'agent-123', name: 'TestAgent', requires_workflow: false };
const mockWorkflow = { id: 'wf-1', name: 'Test Workflow', published_version_id: 'wfv-1', user_email: 'test@test.com' };
const mockWorkflowVersion = { id: 'wfv-1', workflow_id: 'wf-1', version_number: 1, nodes: [], edges: [] };
const mockAgentWorkflow = { id: 'aw-1', agent_id: 'agent-123', workflow_id: 'wf-1', workflow_version_id: 'wfv-1' };

describe('API /api/agents/[id]/workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_WORKFLOWS = 'true';
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@test.com' } });
  });

  describe('GET /api/agents/:id/workflow', () => {
    it('should return 404 when feature flag is disabled', async () => {
      delete process.env.FEATURE_WORKFLOWS;

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflows feature is not enabled');
    });

    it('should return 401 when unauthorized', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when agent not found', async () => {
      vi.mocked(getAgent).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Agent not found');
    });

    it('should return null workflow when no workflow is assigned', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(getAgentWorkflow).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.workflow).toBeNull();
      expect(data.requires_workflow).toBe(false);
    });

    it('should return workflow with version details when assigned', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(getAgentWorkflow).mockResolvedValue(mockAgentWorkflow as any);
      vi.mocked(getWorkflowVersion).mockResolvedValue(mockWorkflowVersion as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('aw-1');
      expect(data.agent_id).toBe('agent-123');
      expect(data.workflow_id).toBe('wf-1');
      expect(data.workflow_version_id).toBe('wfv-1');
      expect(data.version).toEqual(mockWorkflowVersion);
      expect(data.requires_workflow).toBe(false);
      expect(getWorkflowVersion).toHaveBeenCalledWith('wfv-1');
    });
  });

  describe('PUT /api/agents/:id/workflow', () => {
    it('should return 404 when feature flag is disabled', async () => {
      delete process.env.FEATURE_WORKFLOWS;

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ workflow_id: 'wf-1' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflows feature is not enabled');
    });

    it('should return 401 when unauthorized', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ workflow_id: 'wf-1' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when agent not found', async () => {
      vi.mocked(getAgent).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ workflow_id: 'wf-1' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Agent not found');
    });

    it('should set requires_workflow flag only when no workflow_id provided', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ requires_workflow: true }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(updateAgent).toHaveBeenCalledWith('agent-123', { requires_workflow: true });
      expect(setAgentWorkflow).not.toHaveBeenCalled();
    });

    it('should return 404 when workflow not found', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(getWorkflow).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ workflow_id: 'wf-nonexistent' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflow not found');
    });

    it('should return 400 when workflow has no published version', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(getWorkflow).mockResolvedValue({
        ...mockWorkflow,
        published_version_id: null,
      } as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ workflow_id: 'wf-1' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Workflow has no published version. Publish the workflow first.');
    });

    it('should return 404 when workflow version not found', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(getWorkflowVersion).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ workflow_id: 'wf-1' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflow version not found');
    });

    it('should assign workflow successfully', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(getWorkflowVersion).mockResolvedValue(mockWorkflowVersion as any);
      vi.mocked(setAgentWorkflow).mockResolvedValue(mockAgentWorkflow as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ workflow_id: 'wf-1' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockAgentWorkflow);
      expect(setAgentWorkflow).toHaveBeenCalledWith('agent-123', 'wf-1', 'wfv-1', 'test@test.com');
    });

    it('should assign workflow with explicit workflow_version_id', async () => {
      const explicitVersionId = 'wfv-2';
      const explicitVersion = { ...mockWorkflowVersion, id: explicitVersionId, version_number: 2 };

      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(getWorkflow).mockResolvedValue(mockWorkflow as any);
      vi.mocked(getWorkflowVersion).mockResolvedValue(explicitVersion as any);
      vi.mocked(setAgentWorkflow).mockResolvedValue({
        ...mockAgentWorkflow,
        workflow_version_id: explicitVersionId,
      } as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'PUT',
        body: JSON.stringify({ workflow_id: 'wf-1', workflow_version_id: explicitVersionId }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.workflow_version_id).toBe(explicitVersionId);
      expect(getWorkflowVersion).toHaveBeenCalledWith(explicitVersionId);
      expect(setAgentWorkflow).toHaveBeenCalledWith('agent-123', 'wf-1', explicitVersionId, 'test@test.com');
    });
  });

  describe('DELETE /api/agents/:id/workflow', () => {
    it('should return 404 when feature flag is disabled', async () => {
      delete process.env.FEATURE_WORKFLOWS;

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Workflows feature is not enabled');
    });

    it('should return 401 when unauthorized', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when agent not found', async () => {
      vi.mocked(getAgent).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Agent not found');
    });

    it('should remove workflow successfully', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(removeAgentWorkflow).mockResolvedValue(undefined as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123/workflow', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(removeAgentWorkflow).toHaveBeenCalledWith('agent-123');
    });
  });
});
