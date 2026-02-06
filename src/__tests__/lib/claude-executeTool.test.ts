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

import {
  calculateCost,
  AGENT_PROMPTS,
  buildSystemPrompt,
  buildTaskPrompt,
  getUserClaudeKey,
  AGENT_TOOLS,
  CLAUDE_CODE_TOOLS,
  buildOATSystemPrompt,
  getToolsForMode
} from '@/lib/claude';

const mockContext = {
  task: {
    id: 'task-123',
    title: 'Test Task',
    description: 'Test description',
    status: 'todo' as const,
    priority: 'high' as const,
    assignee: 'Alex',
  },
  project: null,
  recentComments: [],
  agentMemory: 'Previous notes here',
  agentConfig: {
    id: 'config-1',
    name: 'Developer',
    specialization: 'development',
    systemPrompt: 'You are a developer.',
    model: 'claude-sonnet-4-20250514',
    temperature: 0,
    maxTokens: 8000,
  },
};

describe('CLAUDE_CODE_TOOLS', () => {
  it('should have correct number of tools', () => {
    expect(CLAUDE_CODE_TOOLS.length).toBe(9);
  });

  it('should have all tools with PascalCase names except task management tools', () => {
    const toolNames = CLAUDE_CODE_TOOLS.map(t => t.name);
    expect(toolNames).toContain('Bash');
    expect(toolNames).toContain('Read');
    expect(toolNames).toContain('Write');
    expect(toolNames).toContain('Edit');
    expect(toolNames).toContain('Glob');
    expect(toolNames).toContain('Grep');
    expect(toolNames).toContain('update_task');
    expect(toolNames).toContain('add_comment');
    expect(toolNames).toContain('task_complete');
  });

  describe('Bash tool', () => {
    const bashTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'Bash')!;

    it('should have correct name', () => {
      expect(bashTool.name).toBe('Bash');
    });

    it('should have description string', () => {
      expect(typeof bashTool.description).toBe('string');
      expect(bashTool.description.length).toBeGreaterThan(0);
      expect(bashTool.description.toLowerCase()).toMatch(/shell|command|execute/);
    });

    it('should have parameters with type object', () => {
      expect(bashTool.parameters).toBeDefined();
      expect(bashTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(bashTool.parameters.properties).toBeDefined();
      expect(bashTool.parameters.properties.command).toBeDefined();
      expect(bashTool.parameters.properties.command.type).toBe('string');
    });

    it('should have required fields array', () => {
      expect(Array.isArray(bashTool.parameters.required)).toBe(true);
      expect(bashTool.parameters.required).toContain('command');
    });

    it('should have optional description field', () => {
      expect(bashTool.parameters.properties.description).toBeDefined();
    });

    it('should have optional timeout field', () => {
      expect(bashTool.parameters.properties.timeout).toBeDefined();
      expect(bashTool.parameters.properties.timeout.type).toBe('number');
    });
  });

  describe('Read tool', () => {
    const readTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'Read')!;

    it('should have correct name', () => {
      expect(readTool.name).toBe('Read');
    });

    it('should have description string', () => {
      expect(typeof readTool.description).toBe('string');
      expect(readTool.description.length).toBeGreaterThan(0);
      expect(readTool.description.toLowerCase()).toMatch(/read|file/);
    });

    it('should have parameters with type object', () => {
      expect(readTool.parameters).toBeDefined();
      expect(readTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(readTool.parameters.properties).toBeDefined();
      expect(readTool.parameters.properties.file_path).toBeDefined();
      expect(readTool.parameters.properties.file_path.type).toBe('string');
    });

    it('should have required fields array', () => {
      expect(Array.isArray(readTool.parameters.required)).toBe(true);
      expect(readTool.parameters.required).toContain('file_path');
    });

    it('should have optional offset field', () => {
      expect(readTool.parameters.properties.offset).toBeDefined();
      expect(readTool.parameters.properties.offset.type).toBe('number');
    });

    it('should have optional limit field', () => {
      expect(readTool.parameters.properties.limit).toBeDefined();
      expect(readTool.parameters.properties.limit.type).toBe('number');
    });
  });

  describe('Write tool', () => {
    const writeTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'Write')!;

    it('should have correct name', () => {
      expect(writeTool.name).toBe('Write');
    });

    it('should have description string', () => {
      expect(typeof writeTool.description).toBe('string');
      expect(writeTool.description.length).toBeGreaterThan(0);
      expect(writeTool.description.toLowerCase()).toMatch(/write|content|file/);
    });

    it('should have parameters with type object', () => {
      expect(writeTool.parameters).toBeDefined();
      expect(writeTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(writeTool.parameters.properties).toBeDefined();
      expect(writeTool.parameters.properties.file_path).toBeDefined();
      expect(writeTool.parameters.properties.file_path.type).toBe('string');
      expect(writeTool.parameters.properties.content).toBeDefined();
      expect(writeTool.parameters.properties.content.type).toBe('string');
    });

    it('should have required fields array', () => {
      expect(Array.isArray(writeTool.parameters.required)).toBe(true);
      expect(writeTool.parameters.required).toContain('file_path');
      expect(writeTool.parameters.required).toContain('content');
    });
  });

  describe('Edit tool', () => {
    const editTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'Edit')!;

    it('should have correct name', () => {
      expect(editTool.name).toBe('Edit');
    });

    it('should have description string', () => {
      expect(typeof editTool.description).toBe('string');
      expect(editTool.description.length).toBeGreaterThan(0);
      expect(editTool.description.toLowerCase()).toMatch(/edit|replace|string/);
    });

    it('should have parameters with type object', () => {
      expect(editTool.parameters).toBeDefined();
      expect(editTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(editTool.parameters.properties).toBeDefined();
      expect(editTool.parameters.properties.file_path).toBeDefined();
      expect(editTool.parameters.properties.file_path.type).toBe('string');
      expect(editTool.parameters.properties.old_string).toBeDefined();
      expect(editTool.parameters.properties.old_string.type).toBe('string');
      expect(editTool.parameters.properties.new_string).toBeDefined();
      expect(editTool.parameters.properties.new_string.type).toBe('string');
    });

    it('should have required fields array', () => {
      expect(Array.isArray(editTool.parameters.required)).toBe(true);
      expect(editTool.parameters.required).toContain('file_path');
      expect(editTool.parameters.required).toContain('old_string');
      expect(editTool.parameters.required).toContain('new_string');
    });
  });

  describe('Glob tool', () => {
    const globTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'Glob')!;

    it('should have correct name', () => {
      expect(globTool.name).toBe('Glob');
    });

    it('should have description string', () => {
      expect(typeof globTool.description).toBe('string');
      expect(globTool.description.length).toBeGreaterThan(0);
      expect(globTool.description.toLowerCase()).toMatch(/find|file|pattern|glob/);
    });

    it('should have parameters with type object', () => {
      expect(globTool.parameters).toBeDefined();
      expect(globTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(globTool.parameters.properties).toBeDefined();
      expect(globTool.parameters.properties.pattern).toBeDefined();
      expect(globTool.parameters.properties.pattern.type).toBe('string');
    });

    it('should have required fields array', () => {
      expect(Array.isArray(globTool.parameters.required)).toBe(true);
      expect(globTool.parameters.required).toContain('pattern');
    });

    it('should have optional path field', () => {
      expect(globTool.parameters.properties.path).toBeDefined();
      expect(globTool.parameters.properties.path.type).toBe('string');
    });
  });

  describe('Grep tool', () => {
    const grepTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'Grep')!;

    it('should have correct name', () => {
      expect(grepTool.name).toBe('Grep');
    });

    it('should have description string', () => {
      expect(typeof grepTool.description).toBe('string');
      expect(grepTool.description.length).toBeGreaterThan(0);
      expect(grepTool.description.toLowerCase()).toMatch(/search|grep|regex/);
    });

    it('should have parameters with type object', () => {
      expect(grepTool.parameters).toBeDefined();
      expect(grepTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(grepTool.parameters.properties).toBeDefined();
      expect(grepTool.parameters.properties.pattern).toBeDefined();
      expect(grepTool.parameters.properties.pattern.type).toBe('string');
    });

    it('should have required fields array', () => {
      expect(Array.isArray(grepTool.parameters.required)).toBe(true);
      expect(grepTool.parameters.required).toContain('pattern');
    });

    it('should have optional path field', () => {
      expect(grepTool.parameters.properties.path).toBeDefined();
      expect(grepTool.parameters.properties.path.type).toBe('string');
    });

    it('should have optional output_mode field with enum', () => {
      expect(grepTool.parameters.properties.output_mode).toBeDefined();
      expect(grepTool.parameters.properties.output_mode.type).toBe('string');
      expect(grepTool.parameters.properties.output_mode.enum).toEqual(['content', 'files_with_matches', 'count']);
    });
  });

  describe('update_task tool', () => {
    const updateTaskTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'update_task')!;

    it('should have correct name', () => {
      expect(updateTaskTool.name).toBe('update_task');
    });

    it('should have description string', () => {
      expect(typeof updateTaskTool.description).toBe('string');
      expect(updateTaskTool.description.length).toBeGreaterThan(0);
      expect(updateTaskTool.description.toLowerCase()).toMatch(/update|task|status/);
    });

    it('should have parameters with type object', () => {
      expect(updateTaskTool.parameters).toBeDefined();
      expect(updateTaskTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(updateTaskTool.parameters.properties).toBeDefined();
      expect(updateTaskTool.parameters.properties.status).toBeDefined();
      expect(updateTaskTool.parameters.properties.status.type).toBe('string');
      expect(updateTaskTool.parameters.properties.status.enum).toEqual(['in_progress', 'testing', 'in_review', 'done']);
    });

    it('should have required fields array', () => {
      expect(Array.isArray(updateTaskTool.parameters.required)).toBe(true);
    });

    it('should have optional agent_context field', () => {
      expect(updateTaskTool.parameters.properties.agent_context).toBeDefined();
      expect(updateTaskTool.parameters.properties.agent_context.type).toBe('string');
    });
  });

  describe('add_comment tool', () => {
    const addCommentTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'add_comment')!;

    it('should have correct name', () => {
      expect(addCommentTool.name).toBe('add_comment');
    });

    it('should have description string', () => {
      expect(typeof addCommentTool.description).toBe('string');
      expect(addCommentTool.description.length).toBeGreaterThan(0);
      expect(addCommentTool.description.toLowerCase()).toMatch(/add|comment|task/);
    });

    it('should have parameters with type object', () => {
      expect(addCommentTool.parameters).toBeDefined();
      expect(addCommentTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(addCommentTool.parameters.properties).toBeDefined();
      expect(addCommentTool.parameters.properties.content).toBeDefined();
      expect(addCommentTool.parameters.properties.content.type).toBe('string');
    });

    it('should have required fields array', () => {
      expect(Array.isArray(addCommentTool.parameters.required)).toBe(true);
      expect(addCommentTool.parameters.required).toContain('content');
    });
  });

  describe('task_complete tool', () => {
    const taskCompleteTool = CLAUDE_CODE_TOOLS.find(t => t.name === 'task_complete')!;

    it('should have correct name', () => {
      expect(taskCompleteTool.name).toBe('task_complete');
    });

    it('should have description string', () => {
      expect(typeof taskCompleteTool.description).toBe('string');
      expect(taskCompleteTool.description.length).toBeGreaterThan(0);
      expect(taskCompleteTool.description.toLowerCase()).toMatch(/signal|task|complet/);
    });

    it('should have parameters with type object', () => {
      expect(taskCompleteTool.parameters).toBeDefined();
      expect(taskCompleteTool.parameters.type).toBe('object');
    });

    it('should have properties defined', () => {
      expect(taskCompleteTool.parameters.properties).toBeDefined();
      expect(taskCompleteTool.parameters.properties.summary).toBeDefined();
      expect(taskCompleteTool.parameters.properties.summary.type).toBe('string');
      expect(taskCompleteTool.parameters.properties.files_changed).toBeDefined();
      expect(taskCompleteTool.parameters.properties.files_changed.type).toBe('array');
      expect(taskCompleteTool.parameters.properties.next_status).toBeDefined();
      expect(taskCompleteTool.parameters.properties.next_status.type).toBe('string');
      expect(taskCompleteTool.parameters.properties.next_status.enum).toEqual(['testing', 'in_review', 'done']);
    });

    it('should have required fields array', () => {
      expect(Array.isArray(taskCompleteTool.parameters.required)).toBe(true);
      expect(taskCompleteTool.parameters.required).toContain('summary');
      expect(taskCompleteTool.parameters.required).toContain('next_status');
    });
  });

  it('all tools should have valid parameters', () => {
    for (const tool of CLAUDE_CODE_TOOLS) {
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toBeDefined();
      expect(Array.isArray(tool.parameters.required)).toBe(true);
    }
  });
});

describe('getToolsForMode', () => {
  it('should return CLAUDE_CODE_TOOLS when usingOAT is true', () => {
    const tools = getToolsForMode(true);
    expect(tools).toBe(CLAUDE_CODE_TOOLS);
    expect(tools.length).toBe(CLAUDE_CODE_TOOLS.length);
  });

  it('should return AGENT_TOOLS when usingOAT is false', () => {
    const tools = getToolsForMode(false);
    expect(tools).toBe(AGENT_TOOLS);
    expect(tools.length).toBe(AGENT_TOOLS.length);
  });

  it('returned tools should have all expected names for OAT mode', () => {
    const tools = getToolsForMode(true);
    const names = tools.map(t => t.name);
    expect(names).toContain('Bash');
    expect(names).toContain('Read');
    expect(names).toContain('Write');
    expect(names).toContain('Edit');
    expect(names).toContain('Glob');
    expect(names).toContain('Grep');
  });

  it('returned tools should have lowercase names for standard mode', () => {
    const tools = getToolsForMode(false);
    const names = tools.map(t => t.name);
    expect(names).toContain('bash');
    expect(names).toContain('read');
    expect(names).toContain('write');
    expect(names).toContain('glob');
  });
});

describe('buildOATSystemPrompt', () => {
  it('should start with Claude Code identity string', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt.startsWith('You are Claude Code')).toBe(true);
  });

  it('should include task id', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt).toContain('task-123');
  });

  it('should include task title', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt).toContain('Test Task');
  });

  it('should include task status', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt).toContain('todo');
  });

  it('should include task description', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt).toContain('Test description');
  });

  it('should include agent memory if present', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt).toContain('Previous notes here');
    expect(prompt).toContain('Previous Notes');
  });

  it('should handle missing agent memory gracefully', () => {
    const contextNoMemory = { ...mockContext, agentMemory: '' };
    const prompt = buildOATSystemPrompt(contextNoMemory as any);
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should include environment info with /workspace', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt).toContain('/workspace');
    expect(prompt.toLowerCase()).toContain('linux');
  });

  it('should handle missing agentConfig gracefully', () => {
    const contextNoConfig = { ...mockContext, agentConfig: undefined };
    const prompt = buildOATSystemPrompt(contextNoConfig as any);
    expect(prompt).toBeDefined();
    expect(prompt.startsWith('You are Claude Code')).toBe(true);
  });

  it('should use agentConfig systemPrompt when provided', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt).toContain('You are a developer.');
  });

  it('should fall back to AGENT_PROMPTS when no agentConfig', () => {
    const contextNoConfig = { ...mockContext, agentConfig: undefined };
    const prompt = buildOATSystemPrompt(contextNoConfig as any);
    expect(prompt).toContain(AGENT_PROMPTS.developer);
  });

  it('should include task_complete instruction', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt.toLowerCase()).toContain('task_complete');
  });

  it('should mention available tools', () => {
    const prompt = buildOATSystemPrompt(mockContext as any);
    expect(prompt).toMatch(/Bash|Read|Write|Edit|Glob|Grep/);
  });

  it('should handle task without description', () => {
    const contextNoDesc = {
      ...mockContext,
      task: { ...mockContext.task, description: undefined }
    };
    const prompt = buildOATSystemPrompt(contextNoDesc as any);
    expect(prompt).toBeDefined();
    expect(prompt).toContain('Test Task');
  });
});

describe('buildSystemPrompt with OAT flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include Claude Code identity when usingOAT is true', () => {
    const prompt = buildSystemPrompt(mockContext as any, true);
    expect(prompt).toContain('You are Claude Code');
    expect(prompt.startsWith('You are Claude Code')).toBe(true);
  });

  it('should not include Claude Code identity when usingOAT is false', () => {
    const prompt = buildSystemPrompt(mockContext as any, false);
    expect(prompt).not.toContain('You are Claude Code');
  });

  it('should include task_complete instruction', () => {
    const prompt = buildSystemPrompt(mockContext as any, false);
    expect(prompt.toLowerCase()).toContain('task_complete');
  });

  it('should include task information', () => {
    const prompt = buildSystemPrompt(mockContext as any, false);
    expect(prompt).toContain('task-123');
    expect(prompt).toContain('Test Task');
    expect(prompt).toContain('todo');
  });

  it('should handle missing description gracefully', () => {
    const contextNoDesc = {
      ...mockContext,
      task: { ...mockContext.task, description: undefined }
    };
    const prompt = buildSystemPrompt(contextNoDesc as any, false);
    expect(prompt).toBeDefined();
    expect(prompt).toContain('Test Task');
  });
});

describe('buildTaskPrompt extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include recent comments (last 3)', () => {
    const contextWithComments = {
      ...mockContext,
      recentComments: [
        { author: 'Alice', content: 'Comment 1' },
        { author: 'Bob', content: 'Comment 2' },
        { author: 'Charlie', content: 'Comment 3' },
        { author: 'Dave', content: 'Comment 4' },
        { author: 'Eve', content: 'Comment 5' },
      ]
    };
    const prompt = buildTaskPrompt(contextWithComments as any);
    expect(prompt).toContain('Comment 3');
    expect(prompt).toContain('Comment 4');
    expect(prompt).toContain('Comment 5');
    expect(prompt).not.toContain('Comment 1');
    expect(prompt).not.toContain('Comment 2');
  });

  it('should handle task with no description', () => {
    const contextNoDesc = {
      ...mockContext,
      task: { ...mockContext.task, description: undefined }
    };
    const prompt = buildTaskPrompt(contextNoDesc as any);
    expect(prompt).toBeDefined();
    expect(prompt).toContain('Test Task');
  });

  it('should include task title in quotes', () => {
    const prompt = buildTaskPrompt(mockContext as any);
    expect(prompt).toContain('"Test Task"');
  });

  it('should handle empty comments array', () => {
    const prompt = buildTaskPrompt(mockContext as any);
    expect(prompt).toBeDefined();
  });

  it('should format comments with author and content', () => {
    const contextWithComment = {
      ...mockContext,
      recentComments: [
        { author: 'Alice', content: 'Please add tests' }
      ]
    };
    const prompt = buildTaskPrompt(contextWithComment as any);
    expect(prompt).toContain('Alice');
    expect(prompt).toContain('Please add tests');
  });
});

describe('calculateCost extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate cost for various token counts with claude-sonnet-4', () => {
    const testCases = [
      { input: 1000000, output: 1000000, expected: 180000 },
      { input: 500000, output: 250000, expected: 52500 },
      { input: 100000, output: 50000, expected: 10500 },
    ];

    for (const { input, output, expected } of testCases) {
      const cost = calculateCost(input, output, 'claude-sonnet-4-20250514');
      expect(cost).toBe(expected);
    }
  });

  it('should calculate cost for various token counts with claude-3-opus', () => {
    const testCases = [
      { input: 1000000, output: 1000000, expected: 900000 },
      { input: 500000, output: 250000, expected: 262500 },
    ];

    for (const { input, output, expected } of testCases) {
      const cost = calculateCost(input, output, 'claude-3-opus-20240229');
      expect(cost).toBe(expected);
    }
  });

  it('should calculate cost for various token counts with claude-3-haiku', () => {
    const testCases = [
      { input: 1000000, output: 1000000, expected: 15000 },
      { input: 500000, output: 250000, expected: 4375 },
    ];

    for (const { input, output, expected } of testCases) {
      const cost = calculateCost(input, output, 'claude-3-haiku-20240307');
      expect(cost).toBe(expected);
    }
  });

  it('should use default pricing for unknown models', () => {
    const cost1 = calculateCost(1000000, 1000000, 'claude-sonnet-4-20250514');
    const cost2 = calculateCost(1000000, 1000000, 'unknown-model-xyz');
    expect(cost1).toBe(cost2);
  });

  it('should handle edge case with 1 token', () => {
    const cost = calculateCost(1, 1, 'claude-sonnet-4-20250514');
    expect(cost).toBeGreaterThan(0);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it('should handle large token counts', () => {
    const cost = calculateCost(10000000, 5000000, 'claude-sonnet-4-20250514');
    expect(cost).toBeGreaterThan(0);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it('should always return integers (ceiled)', () => {
    const testCases = [
      { input: 1, output: 1 },
      { input: 100, output: 50 },
      { input: 1000, output: 500 },
      { input: 999999, output: 123456 },
    ];

    for (const { input, output } of testCases) {
      const cost = calculateCost(input, output, 'claude-sonnet-4-20250514');
      expect(Number.isInteger(cost)).toBe(true);
    }
  });
});

describe('AGENT_TOOLS validation', () => {
  it('should have task management tools matching CLAUDE_CODE_TOOLS', () => {
    const agentTaskTools = AGENT_TOOLS.filter(t =>
      t.name === 'update_task' || t.name === 'add_comment' || t.name === 'task_complete'
    );
    const claudeCodeTaskTools = CLAUDE_CODE_TOOLS.filter(t =>
      t.name === 'update_task' || t.name === 'add_comment' || t.name === 'task_complete'
    );

    expect(agentTaskTools.length).toBe(3);
    expect(claudeCodeTaskTools.length).toBe(3);
  });

  it('should have correct tool count', () => {
    expect(AGENT_TOOLS.length).toBeGreaterThan(5);
  });

  it('all AGENT_TOOLS should have valid structure', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toBeDefined();
      expect(Array.isArray(tool.parameters.required)).toBe(true);
    }
  });
});

describe('getUserClaudeKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should decode base64 encoded key', async () => {
    const originalKey = 'sk-ant-api-key-12345';
    const encodedKey = Buffer.from(originalKey).toString('base64');
    mockQuery.mockResolvedValueOnce({
      rows: [{ claude_api_key: encodedKey }],
    });

    const key = await getUserClaudeKey('test@example.com');
    expect(key).toBe(originalKey);
  });

  it('should handle database errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

    const key = await getUserClaudeKey('test@example.com');
    expect(key).toBeNull();
  });

  it('should release database connection on success', async () => {
    const encodedKey = Buffer.from('sk-ant-test').toString('base64');
    mockQuery.mockResolvedValueOnce({
      rows: [{ claude_api_key: encodedKey }],
    });

    await getUserClaudeKey('test@example.com');
    expect(mockRelease).toHaveBeenCalled();
  });

  it('should release database connection on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database error'));

    await getUserClaudeKey('test@example.com');
    expect(mockRelease).toHaveBeenCalled();
  });
});
