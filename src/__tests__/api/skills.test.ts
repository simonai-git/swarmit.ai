import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  getInstalledSkills: vi.fn(),
  installSkill: vi.fn(),
  uninstallSkill: vi.fn(),
  getAgentSkills: vi.fn(),
  setAgentSkills: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({
    user: { email: 'test@user.com', name: 'Test User' },
  })),
}));

// Mock fetch for SkillsMP API proxy
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET as GET_INSTALLED, POST as POST_INSTALL, DELETE as DELETE_INSTALLED } from '@/app/api/skills/installed/route';
import { GET as GET_SEARCH } from '@/app/api/skills/search/route';
import { GET as GET_AGENT_SKILLS, PUT as PUT_AGENT_SKILLS } from '@/app/api/agents/[id]/skills/route';
import { getInstalledSkills, installSkill, uninstallSkill, getAgentSkills, setAgentSkills } from '@/lib/db';

describe('Skills API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== /api/skills/installed ====================

  describe('GET /api/skills/installed', () => {
    it('should return installed skills for user', async () => {
      const mockSkills = [
        { id: 'is-1', skill_id: 'sk-1', skill_name: 'Code Review' },
      ];
      vi.mocked(getInstalledSkills).mockResolvedValue(mockSkills as any);

      const response = await GET_INSTALLED();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills).toHaveLength(1);
      expect(getInstalledSkills).toHaveBeenCalledWith('test@user.com');
    });
  });

  describe('POST /api/skills/installed', () => {
    it('should install a skill', async () => {
      const installed = { id: 'is-new', skill_id: 'sk-2', skill_name: 'Testing' };
      vi.mocked(installSkill).mockResolvedValue(installed as any);

      const request = new NextRequest('http://localhost/api/skills/installed', {
        method: 'POST',
        body: JSON.stringify({
          skill_id: 'sk-2',
          skill_name: 'Testing',
          skill_description: 'Write tests',
          skill_content: 'Test carefully',
          category: 'qa',
          author: 'Author',
        }),
      });
      const response = await POST_INSTALL(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.skill_id).toBe('sk-2');
      expect(installSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          skill_id: 'sk-2',
          skill_name: 'Testing',
          skill_content: 'Test carefully',
          user_email: 'test@user.com',
        })
      );
    });

    it('should return 400 when skill_id missing', async () => {
      const request = new NextRequest('http://localhost/api/skills/installed', {
        method: 'POST',
        body: JSON.stringify({ skill_name: 'NoId' }),
      });
      const response = await POST_INSTALL(request);

      expect(response.status).toBe(400);
    });

    it('should return 400 when skill_name missing', async () => {
      const request = new NextRequest('http://localhost/api/skills/installed', {
        method: 'POST',
        body: JSON.stringify({ skill_id: 'sk-1' }),
      });
      const response = await POST_INSTALL(request);

      expect(response.status).toBe(400);
    });

    it('should return 409 for duplicate install', async () => {
      vi.mocked(installSkill).mockRejectedValue({ code: '23505' });

      const request = new NextRequest('http://localhost/api/skills/installed', {
        method: 'POST',
        body: JSON.stringify({ skill_id: 'sk-dup', skill_name: 'Dup' }),
      });
      const response = await POST_INSTALL(request);

      expect(response.status).toBe(409);
    });
  });

  describe('DELETE /api/skills/installed', () => {
    it('should uninstall a skill', async () => {
      vi.mocked(uninstallSkill).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/skills/installed?skill_id=sk-1', {
        method: 'DELETE',
      });
      const response = await DELETE_INSTALLED(request);

      expect(response.status).toBe(200);
      expect(uninstallSkill).toHaveBeenCalledWith('sk-1', 'test@user.com');
    });

    it('should return 400 when skill_id missing', async () => {
      const request = new NextRequest('http://localhost/api/skills/installed', {
        method: 'DELETE',
      });
      const response = await DELETE_INSTALLED(request);

      expect(response.status).toBe(400);
    });

    it('should return 404 when skill not found', async () => {
      vi.mocked(uninstallSkill).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/skills/installed?skill_id=nope', {
        method: 'DELETE',
      });
      const response = await DELETE_INSTALLED(request);

      expect(response.status).toBe(404);
    });
  });

  // ==================== /api/skills/search ====================

  describe('GET /api/skills/search', () => {
    it('should return 400 when q param missing', async () => {
      const request = new NextRequest('http://localhost/api/skills/search');
      const response = await GET_SEARCH(request);

      expect(response.status).toBe(400);
    });

    it('should return 503 when SKILLSMP_API_KEY not configured', async () => {
      delete process.env.SKILLSMP_API_KEY;

      const request = new NextRequest('http://localhost/api/skills/search?q=react');
      const response = await GET_SEARCH(request);

      expect(response.status).toBe(503);
    });

    it('should normalize keyword search response from SkillsMP', async () => {
      process.env.SKILLSMP_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            skills: [{ id: 'sk-1', name: 'React', stars: 100 }],
            pagination: { page: 1, total: 1, hasNext: false },
          },
        }),
      });

      const request = new NextRequest('http://localhost/api/skills/search?q=react');
      const response = await GET_SEARCH(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills).toHaveLength(1);
      expect(data.skills[0].name).toBe('React');
      expect(data.pagination).toEqual({ page: 1, total: 1, hasNext: false });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('skills/search?'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );

      delete process.env.SKILLSMP_API_KEY;
    });

    it('should forward page, limit, sortBy params to SkillsMP', async () => {
      process.env.SKILLSMP_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { skills: [], pagination: {} } }),
      });

      const request = new NextRequest('http://localhost/api/skills/search?q=test&page=2&limit=10&sortBy=stars');
      await GET_SEARCH(request);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('sortBy=stars');

      delete process.env.SKILLSMP_API_KEY;
    });

    it('should normalize AI search response', async () => {
      process.env.SKILLSMP_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            object: 'list',
            search_query: 'testing',
            data: [
              { file_id: 'f1', score: 0.9, skill: { id: 'sk-ai-1', name: 'Testing', author: 'dev', description: 'Test skill', stars: 5 } },
            ],
            has_more: true,
          },
        }),
      });

      const request = new NextRequest('http://localhost/api/skills/search?q=testing&ai=true');
      const response = await GET_SEARCH(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills).toHaveLength(1);
      expect(data.skills[0].name).toBe('Testing');
      expect(data.skills[0].score).toBe(0.9);
      expect(data.pagination.hasMore).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('skills/ai-search'),
        expect.any(Object)
      );

      delete process.env.SKILLSMP_API_KEY;
    });

    it('should use ai-search endpoint when ai=true', async () => {
      process.env.SKILLSMP_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { data: [], has_more: false } }),
      });

      const request = new NextRequest('http://localhost/api/skills/search?q=testing&ai=true');
      await GET_SEARCH(request);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('skills/ai-search'),
        expect.any(Object)
      );

      delete process.env.SKILLSMP_API_KEY;
    });

    it('should forward error status from SkillsMP', async () => {
      process.env.SKILLSMP_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      const request = new NextRequest('http://localhost/api/skills/search?q=test');
      const response = await GET_SEARCH(request);

      expect(response.status).toBe(429);

      delete process.env.SKILLSMP_API_KEY;
    });

    it('should support wildcard search for browsing', async () => {
      process.env.SKILLSMP_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            skills: [{ id: 'sk-pop', name: 'Popular', stars: 50000 }],
            pagination: { total: 5000, hasNext: true },
          },
        }),
      });

      const request = new NextRequest('http://localhost/api/skills/search?q=*&sortBy=stars');
      const response = await GET_SEARCH(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills[0].stars).toBe(50000);
      expect(data.pagination.total).toBe(5000);

      delete process.env.SKILLSMP_API_KEY;
    });
  });

  // ==================== /api/agents/[id]/skills ====================

  describe('GET /api/agents/[id]/skills', () => {
    it('should return skills assigned to agent', async () => {
      const mockSkills = [
        { id: 'as-1', agent_id: 'agent-1', skill_id: 'sk-1', skill_name: 'Review' },
      ];
      vi.mocked(getAgentSkills).mockResolvedValue(mockSkills as any);

      const request = new NextRequest('http://localhost/api/agents/agent-1/skills');
      const response = await GET_AGENT_SKILLS(request, { params: Promise.resolve({ id: 'agent-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills).toHaveLength(1);
      expect(getAgentSkills).toHaveBeenCalledWith('agent-1');
    });
  });

  describe('PUT /api/agents/[id]/skills', () => {
    it('should set skills for an agent', async () => {
      vi.mocked(setAgentSkills).mockResolvedValue(undefined);
      vi.mocked(getAgentSkills).mockResolvedValue([
        { id: 'as-1', agent_id: 'agent-1', skill_id: 'sk-1', skill_name: 'Code Review' },
        { id: 'as-2', agent_id: 'agent-1', skill_id: 'sk-2', skill_name: 'Testing' },
      ] as any);

      const request = new NextRequest('http://localhost/api/agents/agent-1/skills', {
        method: 'PUT',
        body: JSON.stringify({ skill_ids: ['sk-1', 'sk-2'] }),
      });
      const response = await PUT_AGENT_SKILLS(request, { params: Promise.resolve({ id: 'agent-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills).toHaveLength(2);
      expect(setAgentSkills).toHaveBeenCalledWith('agent-1', ['sk-1', 'sk-2'], 'test@user.com');
    });

    it('should return 400 when skill_ids not an array', async () => {
      const request = new NextRequest('http://localhost/api/agents/agent-1/skills', {
        method: 'PUT',
        body: JSON.stringify({ skill_ids: 'not-array' }),
      });
      const response = await PUT_AGENT_SKILLS(request, { params: Promise.resolve({ id: 'agent-1' }) });

      expect(response.status).toBe(400);
    });

    it('should handle empty skill_ids array (clear all)', async () => {
      vi.mocked(setAgentSkills).mockResolvedValue(undefined);
      vi.mocked(getAgentSkills).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/agents/agent-1/skills', {
        method: 'PUT',
        body: JSON.stringify({ skill_ids: [] }),
      });
      const response = await PUT_AGENT_SKILLS(request, { params: Promise.resolve({ id: 'agent-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills).toHaveLength(0);
      expect(setAgentSkills).toHaveBeenCalledWith('agent-1', [], 'test@user.com');
    });
  });
});
