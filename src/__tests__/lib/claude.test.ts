import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must define mock functions before vi.mock (hoisting)
const mockQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock('@/lib/db', () => ({
  pool: {
    connect: () => Promise.resolve({
      query: mockQuery,
      release: mockRelease,
    }),
  },
}));

vi.mock('@mariozechner/pi-ai', () => ({
  streamSimpleAnthropic: vi.fn(),
}));

import { calculateCost, AGENT_PROMPTS, buildSystemPrompt, buildTaskPrompt, getUserClaudeKey, AGENT_TOOLS } from '@/lib/claude';

describe('claude utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateCost', () => {
    it('should calculate cost for claude-sonnet-4', () => {
      const cost = calculateCost(1000000, 1000000, 'claude-sonnet-4-20250514');
      // Pricing: 300 cents input, 1500 cents output per 1M, then *100
      expect(cost).toBe(180000);
    });

    it('should calculate cost for claude-3-opus', () => {
      const cost = calculateCost(1000000, 1000000, 'claude-3-opus-20240229');
      // Pricing: 1500 cents input, 7500 cents output per 1M, then *100
      expect(cost).toBe(900000);
    });

    it('should calculate cost for claude-3-haiku', () => {
      const cost = calculateCost(1000000, 1000000, 'claude-3-haiku-20240307');
      // Pricing: 25 cents input, 125 cents output per 1M, then *100
      expect(cost).toBe(15000);
    });

    it('should calculate cost for claude-3-5-sonnet', () => {
      const cost = calculateCost(1000000, 1000000, 'claude-3-5-sonnet-20241022');
      expect(cost).toBe(180000);
    });

    it('should calculate cost for small token counts', () => {
      const cost = calculateCost(1000, 500, 'claude-sonnet-4-20250514');
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1000);
    });

    it('should return 0 for zero tokens', () => {
      const cost = calculateCost(0, 0, 'claude-sonnet-4-20250514');
      expect(cost).toBe(0);
    });

    it('should handle unknown models with default pricing', () => {
      const cost = calculateCost(1000, 1000, 'unknown-model');
      expect(cost).toBeGreaterThanOrEqual(0);
    });

    it('should ceil the result', () => {
      // Small values should be ceiled to at least 1
      const cost = calculateCost(1, 1, 'claude-sonnet-4-20250514');
      expect(cost).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(cost)).toBe(true);
    });

    it('should handle only input tokens', () => {
      const cost = calculateCost(100000, 0, 'claude-sonnet-4-20250514');
      expect(cost).toBeGreaterThan(0);
    });

    it('should handle only output tokens', () => {
      const cost = calculateCost(0, 100000, 'claude-sonnet-4-20250514');
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('AGENT_PROMPTS', () => {
    it('should have developer prompt', () => {
      expect(AGENT_PROMPTS.developer).toBeDefined();
      expect(typeof AGENT_PROMPTS.developer).toBe('string');
      expect(AGENT_PROMPTS.developer.length).toBeGreaterThan(50);
    });

    it('should have qa prompt', () => {
      expect(AGENT_PROMPTS.qa).toBeDefined();
      expect(typeof AGENT_PROMPTS.qa).toBe('string');
      expect(AGENT_PROMPTS.qa.toLowerCase()).toContain('test');
    });

    it('should have reviewer prompt', () => {
      expect(AGENT_PROMPTS.reviewer).toBeDefined();
      expect(typeof AGENT_PROMPTS.reviewer).toBe('string');
      expect(AGENT_PROMPTS.reviewer.toLowerCase()).toContain('review');
    });

    it('developer prompt should mention code implementation', () => {
      expect(AGENT_PROMPTS.developer.toLowerCase()).toMatch(/implement|code|develop/);
    });

    it('qa prompt should mention quality or testing', () => {
      expect(AGENT_PROMPTS.qa.toLowerCase()).toMatch(/quality|test|verify|bug/);
    });

    it('reviewer prompt should mention code review', () => {
      expect(AGENT_PROMPTS.reviewer.toLowerCase()).toMatch(/review|approve|feedback/);
    });

    it('all prompts should require calling task_complete', () => {
      expect(AGENT_PROMPTS.developer).toContain('MUST call task_complete');
      expect(AGENT_PROMPTS.qa).toContain('MUST call task_complete');
      expect(AGENT_PROMPTS.reviewer).toContain('MUST call task_complete');
    });

    it('developer prompt should specify next_status=testing', () => {
      expect(AGENT_PROMPTS.developer).toContain("next_status='testing'");
    });

    it('qa prompt should specify next_status options', () => {
      expect(AGENT_PROMPTS.qa).toContain("next_status='in_review'");
      expect(AGENT_PROMPTS.qa).toContain("next_status='in_progress'");
    });

    it('reviewer prompt should specify next_status options', () => {
      expect(AGENT_PROMPTS.reviewer).toContain("next_status='done'");
      expect(AGENT_PROMPTS.reviewer).toContain("next_status='in_progress'");
    });
  });

  describe('AGENT_TOOLS', () => {
    it('should have bash tool', () => {
      const bashTool = AGENT_TOOLS.find(t => t.name === 'bash');
      expect(bashTool).toBeDefined();
      expect(bashTool?.description).toContain('shell');
    });

    it('should have read tool', () => {
      const readTool = AGENT_TOOLS.find(t => t.name === 'read');
      expect(readTool).toBeDefined();
    });

    it('should have write tool', () => {
      const writeTool = AGENT_TOOLS.find(t => t.name === 'write');
      expect(writeTool).toBeDefined();
    });

    it('should have glob tool', () => {
      const globTool = AGENT_TOOLS.find(t => t.name === 'glob');
      expect(globTool).toBeDefined();
    });

    it('should have git_commit tool', () => {
      const gitTool = AGENT_TOOLS.find(t => t.name === 'git_commit');
      expect(gitTool).toBeDefined();
    });

    it('should have update_task tool', () => {
      const updateTool = AGENT_TOOLS.find(t => t.name === 'update_task');
      expect(updateTool).toBeDefined();
    });

    it('should have add_comment tool', () => {
      const commentTool = AGENT_TOOLS.find(t => t.name === 'add_comment');
      expect(commentTool).toBeDefined();
    });

    it('should have task_complete tool', () => {
      const completeTool = AGENT_TOOLS.find(t => t.name === 'task_complete');
      expect(completeTool).toBeDefined();
    });

    it('all tools should have valid parameters', () => {
      for (const tool of AGENT_TOOLS) {
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('object');
      }
    });
  });

  describe('buildSystemPrompt', () => {
    const mockContext = {
      task: {
        id: 'task-123',
        title: 'Test Task',
        description: 'Test description',
        status: 'todo',
        priority: 'high',
        assignee: 'Alex',
      },
      project: {
        id: 'proj-1',
        name: 'Test Project',
        description: 'Project description',
        tech_stack: 'React, Node.js',
      },
      recentComments: [],
      agentMemory: '',
      agentConfig: {
        id: 'config-1',
        name: 'Developer',
        specialization: 'frontend',
        systemPrompt: 'You are a frontend developer.',
        model: 'claude-sonnet-4-20250514',
        temperature: 0,
        maxTokens: 8000,
      },
    };

    it('should return a string', () => {
      const prompt = buildSystemPrompt(mockContext as any, false);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should handle missing project', () => {
      const contextNoProject = { ...mockContext, project: null };
      const prompt = buildSystemPrompt(contextNoProject as any, false);
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle missing agent config', () => {
      const contextNoConfig = { ...mockContext, agentConfig: undefined };
      const prompt = buildSystemPrompt(contextNoConfig as any, false);
      expect(prompt).toBeDefined();
    });

    it('should prepend Claude Code identity when using OAT', () => {
      const prompt = buildSystemPrompt(mockContext as any, true);
      expect(prompt).toContain('Claude Code');
    });
  });

  describe('buildTaskPrompt', () => {
    const mockContext = {
      task: {
        id: 'task-123',
        title: 'Fix Button Styling',
        description: 'The button needs to be blue',
        status: 'in_progress',
        priority: 'high',
        assignee: 'Alex',
      },
      project: null,
      recentComments: [
        { author: 'Bogdan', content: 'Please make it darker blue' },
      ],
      agentMemory: 'Previous attempt used Tailwind',
    };

    it('should include task title', () => {
      const prompt = buildTaskPrompt(mockContext as any);
      expect(prompt).toContain('Fix Button Styling');
    });

    it('should include task description', () => {
      const prompt = buildTaskPrompt(mockContext as any);
      expect(prompt).toContain('button needs to be blue');
    });

    it('should return a string prompt', () => {
      const prompt = buildTaskPrompt(mockContext as any);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(50);
    });

    it('should handle empty comments', () => {
      const contextNoComments = { ...mockContext, recentComments: [] };
      const prompt = buildTaskPrompt(contextNoComments as any);
      expect(prompt).toBeDefined();
    });

    it('should handle empty agent memory', () => {
      const contextNoMemory = { ...mockContext, agentMemory: '' };
      const prompt = buildTaskPrompt(contextNoMemory as any);
      expect(prompt).toBeDefined();
    });
  });

  describe('getUserClaudeKey', () => {
    it('should return decrypted key when found', async () => {
      const encodedKey = Buffer.from('sk-ant-test-key').toString('base64');
      mockQuery.mockResolvedValueOnce({
        rows: [{ claude_api_key: encodedKey }],
      });

      const key = await getUserClaudeKey('test@example.com');
      expect(key).toBe('sk-ant-test-key');
    });

    it('should return null when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const key = await getUserClaudeKey('unknown@example.com');
      expect(key).toBeNull();
    });

    it('should return null when key is not set', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ claude_api_key: null }],
      });

      const key = await getUserClaudeKey('test@example.com');
      expect(key).toBeNull();
    });

    it('should query with correct email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getUserClaudeKey('specific@example.com');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('email'),
        ['specific@example.com']
      );
    });
  });
});
