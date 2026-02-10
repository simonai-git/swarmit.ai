import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing the route
vi.mock('@/lib/db', () => ({
  getAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
}));

import { GET, PATCH, DELETE } from '@/app/api/agents/[id]/route';
import { getAgent, updateAgent, deleteAgent } from '@/lib/db';

const mockAgent = {
  id: 'agent-123',
  name: 'TestBot',
  specialization: 'developer',
  description: 'A test agent',
  system_prompt: 'You are a test agent.',
  memory: null,
  avatar_emoji: '🤖',
  avatar_color: '#3B82F6',
  is_active: true,
  tasks_completed: 5,
  user_id: null,
  requires_workflow: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('API /api/agents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET ====================
  describe('GET /api/agents/:id', () => {
    it('should return the agent when found', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('agent-123');
      expect(data.name).toBe('TestBot');
      expect(data.specialization).toBe('developer');
      expect(getAgent).toHaveBeenCalledWith('agent-123');
    });

    it('should return 404 if agent not found', async () => {
      vi.mocked(getAgent).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/nonexistent', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Agent not found');
    });

    it('should handle errors gracefully (500)', async () => {
      vi.mocked(getAgent).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });

  // ==================== PATCH ====================
  describe('PATCH /api/agents/:id', () => {
    it('should update agent and return it', async () => {
      const updatedAgent = { ...mockAgent, name: 'UpdatedBot' };
      vi.mocked(updateAgent).mockResolvedValue(updatedAgent as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'UpdatedBot' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('UpdatedBot');
      expect(updateAgent).toHaveBeenCalledWith('agent-123', { name: 'UpdatedBot' });
    });

    it('should update multiple valid fields at once', async () => {
      const updatedAgent = {
        ...mockAgent,
        name: 'NewName',
        description: 'New description',
        is_active: false,
        requires_workflow: true,
      };
      vi.mocked(updateAgent).mockResolvedValue(updatedAgent as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'NewName',
          description: 'New description',
          is_active: false,
          requires_workflow: true,
        }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(updateAgent).toHaveBeenCalledWith('agent-123', {
        name: 'NewName',
        description: 'New description',
        is_active: false,
        requires_workflow: true,
      });
    });

    it('should return 404 if agent not found', async () => {
      vi.mocked(updateAgent).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/agents/nonexistent', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Agent not found');
    });

    it('should return 409 on duplicate name (error code 23505)', async () => {
      const duplicateError = new Error('duplicate key value violates unique constraint') as any;
      duplicateError.code = '23505';
      vi.mocked(updateAgent).mockRejectedValue(duplicateError);

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'ExistingName' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('An agent with this name already exists');
    });

    it('should filter out unknown fields like skill_ids and NOT pass them to updateAgent', async () => {
      const updatedAgent = { ...mockAgent, name: 'FilteredBot' };
      vi.mocked(updateAgent).mockResolvedValue(updatedAgent as any);

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'FilteredBot',
          skill_ids: ['skill-1', 'skill-2'],
          unknown_field: 'should be stripped',
          id: 'should-not-override',
          created_at: '2020-01-01',
          tasks_completed: 999,
        }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      // Only 'name' should be passed — all other fields are not in the allowedFields list
      expect(updateAgent).toHaveBeenCalledWith('agent-123', { name: 'FilteredBot' });
      // Verify the unknown fields are NOT present in the call
      const passedUpdates = vi.mocked(updateAgent).mock.calls[0][1];
      expect(passedUpdates).not.toHaveProperty('skill_ids');
      expect(passedUpdates).not.toHaveProperty('unknown_field');
      expect(passedUpdates).not.toHaveProperty('id');
      expect(passedUpdates).not.toHaveProperty('created_at');
      expect(passedUpdates).not.toHaveProperty('tasks_completed');
    });

    it('should pass through all valid allowed fields', async () => {
      const updatedAgent = { ...mockAgent };
      vi.mocked(updateAgent).mockResolvedValue(updatedAgent as any);

      const allAllowedFields = {
        name: 'NewName',
        specialization: 'qa',
        description: 'New desc',
        system_prompt: 'New prompt',
        memory: 'Some memory',
        avatar_emoji: '🧪',
        avatar_color: '#FF0000',
        is_active: false,
        requires_workflow: true,
      };

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'PATCH',
        body: JSON.stringify(allAllowedFields),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'agent-123' }) });

      expect(response.status).toBe(200);
      expect(updateAgent).toHaveBeenCalledWith('agent-123', allAllowedFields);
    });

    it('should handle errors gracefully (500)', async () => {
      vi.mocked(updateAgent).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });

  // ==================== DELETE ====================
  describe('DELETE /api/agents/:id', () => {
    it('should delete agent and return success', async () => {
      vi.mocked(deleteAgent).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(deleteAgent).toHaveBeenCalledWith('agent-123');
    });

    it('should return 404 if agent not found', async () => {
      vi.mocked(deleteAgent).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/agents/nonexistent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Agent not found');
    });

    it('should return 403 when trying to delete the default Simon agent', async () => {
      const request = new NextRequest('http://localhost/api/agents/agent-simon', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'agent-simon' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Cannot delete the default Simon agent');
      // Ensure deleteAgent is never called for the protected agent
      expect(deleteAgent).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully (500)', async () => {
      vi.mocked(deleteAgent).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/agents/agent-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'agent-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });
});
