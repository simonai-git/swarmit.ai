import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Sandbox } from '@swarmit/sandbox';
import {
  getSandboxTools,
  getTaskStatusTool,
  getPMTools,
  getMemoryTools,
  getGitHubTools,
  getCollaborationTools,
  getToolsForAgent,
  extractToolCalls,
  executeTool,
} from '../tools.js';

// Mock logger
vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function createMockSandbox(): Sandbox {
  return {
    init: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    exec: vi.fn<(command: string, timeout?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>>().mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    }),
    writeFile: vi.fn<(path: string, content: string) => Promise<void>>().mockResolvedValue(undefined),
    readFile: vi.fn<(path: string) => Promise<string>>().mockResolvedValue('file content'),
    listFiles: vi.fn<(dir?: string, recursive?: boolean) => Promise<string[]>>().mockResolvedValue([]),
    destroy: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

function createMockPrisma() {
  return {
    task: {
      create: vi.fn().mockResolvedValue({ id: 'task-1', title: 'Test Task' }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    taskDependency: {
      create: vi.fn().mockResolvedValue({}),
    },
    taskComment: {
      create: vi.fn().mockResolvedValue({}),
    },
    integrationToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

// Ensure env vars are clean for deterministic tests
const originalSupermemoryKey = process.env.SUPERMEMORY_API_KEY;
beforeEach(() => {
  delete process.env.SUPERMEMORY_API_KEY;
});
afterEach(() => {
  if (originalSupermemoryKey) {
    process.env.SUPERMEMORY_API_KEY = originalSupermemoryKey;
  }
});

describe('getSandboxTools', () => {
  it('returns five sandbox tools', () => {
    const tools = getSandboxTools();
    expect(tools).toHaveLength(5);
    const names = tools.map(t => t.name);
    expect(names).toEqual([
      'read_file',
      'write_file',
      'execute_command',
      'list_files',
      'search_files',
    ]);
  });

  it('each tool has name, description, and input_schema', () => {
    const tools = getSandboxTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

describe('getPMTools', () => {
  it('returns three PM tools', () => {
    const tools = getPMTools();
    expect(tools).toHaveLength(3);
    const names = tools.map(t => t.name);
    expect(names).toEqual([
      'create_task',
      'add_dependency',
      'list_project_tasks',
    ]);
  });
});

describe('getMemoryTools', () => {
  it('returns 2 memory tools', () => {
    const tools = getMemoryTools();
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(['remember', 'recall']);
  });
});

describe('getGitHubTools', () => {
  it('returns 4 GitHub tools', () => {
    const tools = getGitHubTools();
    expect(tools).toHaveLength(4);
    expect(tools.map(t => t.name)).toEqual([
      'github_list_repos',
      'github_clone_repo',
      'github_push_files',
      'github_create_pr',
    ]);
  });
});

describe('getCollaborationTools', () => {
  it('returns 3 collaboration tools', () => {
    const tools = getCollaborationTools();
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name)).toEqual([
      'handoff_to_agent',
      'request_review',
      'send_message_to_agent',
    ]);
  });
});

describe('getToolsForAgent', () => {
  // Base: 5 sandbox + 1 status + 3 collaboration = 9
  it('returns sandbox + status + collaboration tools for a developer agent', () => {
    const tools = getToolsForAgent({ name: 'developer', keywords: ['dev', 'code'] });
    expect(tools).toHaveLength(9);
    const names = tools.map(t => t.name);
    expect(names).toContain('update_task_status');
    expect(names).toContain('handoff_to_agent');
    expect(names).not.toContain('create_task');
  });

  it('returns 9 tools for a qa agent', () => {
    const tools = getToolsForAgent({ name: 'qa', keywords: ['test', 'quality'] });
    expect(tools).toHaveLength(9);
  });

  it('returns 9 tools for null specialization', () => {
    const tools = getToolsForAgent(null);
    expect(tools).toHaveLength(9);
  });

  // PM: 9 + 3 PM tools = 12
  it('returns sandbox + PM + collaboration tools for project-manager', () => {
    const tools = getToolsForAgent({ name: 'project-manager', keywords: ['plan', 'project'] });
    expect(tools).toHaveLength(12);
    const names = tools.map(t => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('create_task');
    expect(names).toContain('add_dependency');
    expect(names).toContain('list_project_tasks');
    expect(names).toContain('update_task_status');
    expect(names).toContain('handoff_to_agent');
  });

  it('returns 12 tools for product-manager', () => {
    const tools = getToolsForAgent({ name: 'product-manager', keywords: ['manage'] });
    expect(tools).toHaveLength(12);
    const names = tools.map(t => t.name);
    expect(names).toContain('create_task');
  });

  it('includes memory tools when SUPERMEMORY_API_KEY is set', () => {
    process.env.SUPERMEMORY_API_KEY = 'test-key';
    const tools = getToolsForAgent(null);
    expect(tools).toHaveLength(11); // 9 base + 2 memory
    const names = tools.map(t => t.name);
    expect(names).toContain('remember');
    expect(names).toContain('recall');
  });

  it('includes GitHub tools when hasGitHub option is true', () => {
    const tools = getToolsForAgent(null, { hasGitHub: true });
    expect(tools).toHaveLength(13); // 9 base + 4 github
    const names = tools.map(t => t.name);
    expect(names).toContain('github_list_repos');
    expect(names).toContain('github_push_files');
  });

  it('includes all tools when both supermemory and github are enabled', () => {
    process.env.SUPERMEMORY_API_KEY = 'test-key';
    const tools = getToolsForAgent({ name: 'project-manager', keywords: ['plan'] }, { hasGitHub: true });
    // 5 sandbox + 1 status + 3 PM + 2 memory + 4 github + 3 collab = 18
    expect(tools).toHaveLength(18);
  });
});


describe('getTaskStatusTool', () => {
  it('returns a single update_task_status tool', () => {
    const tool = getTaskStatusTool();
    expect(tool.name).toBe('update_task_status');
    expect(tool.description).toBeTruthy();
    expect(tool.input_schema.type).toBe('object');
    expect(tool.input_schema.required).toEqual(['taskId', 'status']);
  });
});

describe('extractToolCalls', () => {
  it('extracts tool_use blocks from content', () => {
    const content = [
      { type: 'text' as const, text: 'Let me read the file.' },
      {
        type: 'tool_use' as const,
        id: 'tc-1',
        name: 'read_file',
        input: { path: '/app/main.ts' },
      },
    ];
    const calls = extractToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      id: 'tc-1',
      name: 'read_file',
      input: { path: '/app/main.ts' },
    });
  });

  it('returns empty array when no tool_use blocks', () => {
    const content = [
      { type: 'text' as const, text: 'All done.' },
    ];
    const calls = extractToolCalls(content);
    expect(calls).toHaveLength(0);
  });

  it('skips tool_use blocks without id or name', () => {
    const content = [
      { type: 'tool_use' as const, id: undefined, name: 'read_file', input: {} },
      { type: 'tool_use' as const, id: 'tc-2', name: undefined, input: {} },
      { type: 'tool_use' as const, id: 'tc-3', name: 'write_file', input: { path: 'a.txt', content: 'b' } },
    ];
    const calls = extractToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('tc-3');
  });

  it('extracts multiple tool calls', () => {
    const content = [
      { type: 'tool_use' as const, id: 'tc-1', name: 'read_file', input: { path: 'a.ts' } },
      { type: 'text' as const, text: 'middle text' },
      { type: 'tool_use' as const, id: 'tc-2', name: 'write_file', input: { path: 'b.ts', content: 'x' } },
    ];
    const calls = extractToolCalls(content);
    expect(calls).toHaveLength(2);
  });

  it('defaults input to empty object when input is undefined', () => {
    const content = [
      { type: 'tool_use' as const, id: 'tc-1', name: 'list_project_tasks' },
    ];
    const calls = extractToolCalls(content);
    expect(calls[0].input).toEqual({});
  });
});

describe('executeTool', () => {
  let sandbox: Sandbox;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let context: Parameters<typeof executeTool>[3];

  beforeEach(() => {
    vi.clearAllMocks();
    sandbox = createMockSandbox();
    mockPrisma = createMockPrisma();
    context = {
      prisma: mockPrisma as unknown as Parameters<typeof executeTool>[3]['prisma'],
      taskId: 'task-1',
      projectId: 'proj-1',
      userId: 'user-1',
    };
  });

  describe('read_file', () => {
    it('reads a file via sandbox', async () => {
      vi.mocked(sandbox.readFile).mockResolvedValue('hello world');
      const result = await executeTool('read_file', { path: '/app/test.ts' }, sandbox, context);
      expect(sandbox.readFile).toHaveBeenCalledWith('/app/test.ts');
      expect(result).toBe('hello world');
    });

    it('returns error message on failure', async () => {
      vi.mocked(sandbox.readFile).mockRejectedValue(new Error('ENOENT'));
      const result = await executeTool('read_file', { path: '/missing.ts' }, sandbox, context);
      expect(result).toContain('Error reading file');
      expect(result).toContain('ENOENT');
    });
  });

  describe('write_file', () => {
    it('writes a file via sandbox', async () => {
      const result = await executeTool(
        'write_file',
        { path: '/app/new.ts', content: 'export const x = 1;' },
        sandbox,
        context
      );
      expect(sandbox.writeFile).toHaveBeenCalledWith('/app/new.ts', 'export const x = 1;');
      expect(result).toBe('File written: /app/new.ts');
    });

    it('returns error message on failure', async () => {
      vi.mocked(sandbox.writeFile).mockRejectedValue(new Error('Permission denied'));
      const result = await executeTool('write_file', { path: '/root/f.ts', content: '' }, sandbox, context);
      expect(result).toContain('Error writing file');
    });
  });

  describe('execute_command', () => {
    it('executes a command and returns formatted output', async () => {
      vi.mocked(sandbox.exec).mockResolvedValue({
        stdout: 'compiled ok',
        stderr: '',
        exitCode: 0,
      });
      const result = await executeTool('execute_command', { command: 'tsc' }, sandbox, context);
      expect(sandbox.exec).toHaveBeenCalledWith('tsc', 30000);
      expect(result).toContain('stdout:\ncompiled ok');
      expect(result).toContain('exit code: 0');
    });

    it('uses custom timeout when provided', async () => {
      vi.mocked(sandbox.exec).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await executeTool('execute_command', { command: 'npm test', timeout: 60000 }, sandbox, context);
      expect(sandbox.exec).toHaveBeenCalledWith('npm test', 60000);
    });

    it('includes stderr when present', async () => {
      vi.mocked(sandbox.exec).mockResolvedValue({
        stdout: '',
        stderr: 'warning: unused var',
        exitCode: 0,
      });
      const result = await executeTool('execute_command', { command: 'tsc' }, sandbox, context);
      expect(result).toContain('stderr:\nwarning: unused var');
    });

    it('returns error message on failure', async () => {
      vi.mocked(sandbox.exec).mockRejectedValue(new Error('Timeout'));
      const result = await executeTool('execute_command', { command: 'sleep 999' }, sandbox, context);
      expect(result).toContain('Error executing command');
    });
  });

  describe('list_files', () => {
    it('lists files via sandbox.listFiles', async () => {
      vi.mocked(sandbox.listFiles).mockResolvedValue(['main.ts', 'package.json', 'README.md']);
      const result = await executeTool('list_files', { path: '/app' }, sandbox, context);
      expect(sandbox.listFiles).toHaveBeenCalledWith('/app', false);
      expect(result).toContain('main.ts');
      expect(result).toContain('package.json');
    });

    it('defaults to current directory when no path given', async () => {
      vi.mocked(sandbox.listFiles).mockResolvedValue(['index.ts']);
      await executeTool('list_files', {}, sandbox, context);
      expect(sandbox.listFiles).toHaveBeenCalledWith('.', false);
    });

    it('returns empty directory message when no files found', async () => {
      vi.mocked(sandbox.listFiles).mockResolvedValue([]);
      const result = await executeTool('list_files', { path: '/empty' }, sandbox, context);
      expect(result).toBe('(empty directory)');
    });

    it('supports recursive listing', async () => {
      vi.mocked(sandbox.listFiles).mockResolvedValue(['src/index.ts', 'src/lib/utils.ts']);
      const result = await executeTool('list_files', { path: '.', recursive: true }, sandbox, context);
      expect(sandbox.listFiles).toHaveBeenCalledWith('.', true);
      expect(result).toContain('src/index.ts');
    });
  });

  describe('search_files', () => {
    it('searches with grep via sandbox exec', async () => {
      vi.mocked(sandbox.exec).mockResolvedValue({
        stdout: 'main.ts:1:import { foo }',
        stderr: '',
        exitCode: 0,
      });
      const result = await executeTool('search_files', { pattern: 'import' }, sandbox, context);
      expect(sandbox.exec).toHaveBeenCalledWith('grep -rn "import" .');
      expect(result).toContain('main.ts:1:import { foo }');
    });

    it('uses file_glob when provided', async () => {
      vi.mocked(sandbox.exec).mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });
      await executeTool(
        'search_files',
        { pattern: 'TODO', path: '/src', file_glob: '*.ts' },
        sandbox,
        context
      );
      expect(sandbox.exec).toHaveBeenCalledWith('grep -rn --include="*.ts" "TODO" /src');
    });

    it('returns "No matches found." when stdout and stderr are empty', async () => {
      vi.mocked(sandbox.exec).mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });
      const result = await executeTool('search_files', { pattern: 'xyz' }, sandbox, context);
      expect(result).toBe('No matches found.');
    });
  });

  describe('create_task', () => {
    it('creates a task via prisma', async () => {
      mockPrisma.task.create.mockResolvedValue({ id: 'new-task-1', title: 'Build API' });
      const result = await executeTool(
        'create_task',
        { title: 'Build API', description: 'Implement REST endpoints', priority: 2 },
        sandbox,
        context
      );
      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          projectId: 'proj-1',
          title: 'Build API',
          description: 'Implement REST endpoints',
          priority: 2,
        },
      });
      expect(result).toContain('Task created: new-task-1');
      expect(result).toContain('Build API');
    });

    it('defaults description and priority', async () => {
      mockPrisma.task.create.mockResolvedValue({ id: 't-2', title: 'Simple task' });
      await executeTool('create_task', { title: 'Simple task' }, sandbox, context);
      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          projectId: 'proj-1',
          title: 'Simple task',
          description: '',
          priority: 0,
        },
      });
    });

    it('returns error message on failure', async () => {
      mockPrisma.task.create.mockRejectedValue(new Error('DB error'));
      const result = await executeTool('create_task', { title: 'Bad' }, sandbox, context);
      expect(result).toContain('Error creating task');
    });
  });

  describe('add_dependency', () => {
    it('creates a task dependency', async () => {
      const result = await executeTool(
        'add_dependency',
        { taskId: 'task-2', dependsOnId: 'task-1' },
        sandbox,
        context
      );
      expect(mockPrisma.taskDependency.create).toHaveBeenCalledWith({
        data: { taskId: 'task-2', dependsOnId: 'task-1' },
      });
      expect(result).toBe('Dependency added: task-2 depends on task-1');
    });

    it('returns error message on failure', async () => {
      mockPrisma.taskDependency.create.mockRejectedValue(new Error('Duplicate'));
      const result = await executeTool(
        'add_dependency',
        { taskId: 'task-2', dependsOnId: 'task-1' },
        sandbox,
        context
      );
      expect(result).toContain('Error adding dependency');
    });
  });

  describe('list_project_tasks', () => {
    it('returns JSON list of tasks', async () => {
      const tasks = [
        { id: 't-1', title: 'Task 1', status: 'TODO', priority: 2, assigneeId: null, isBlocked: false },
        { id: 't-2', title: 'Task 2', status: 'IN_PROGRESS', priority: 1, assigneeId: 'agent-1', isBlocked: false },
      ];
      mockPrisma.task.findMany.mockResolvedValue(tasks);
      const result = await executeTool('list_project_tasks', {}, sandbox, context);
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', userId: 'user-1' },
        select: { id: true, title: true, status: true, priority: true, assigneeId: true, isBlocked: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('t-1');
    });

    it('returns error message on failure', async () => {
      mockPrisma.task.findMany.mockRejectedValue(new Error('Connection lost'));
      const result = await executeTool('list_project_tasks', {}, sandbox, context);
      expect(result).toContain('Error listing tasks');
    });
  });

  describe('update_task_status', () => {
    it('updates task status via prisma', async () => {
      const result = await executeTool(
        'update_task_status',
        { taskId: 'task-1', status: 'DONE' },
        sandbox,
        context
      );
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'DONE' },
      });
      expect(result).toBe('Task task-1 status updated to DONE');
    });

    it('returns error message on failure', async () => {
      mockPrisma.task.update.mockRejectedValue(new Error('Not found'));
      const result = await executeTool(
        'update_task_status',
        { taskId: 'bad-id', status: 'DONE' },
        sandbox,
        context
      );
      expect(result).toContain('Error updating task');
    });
  });

  describe('unknown tool', () => {
    it('returns unknown tool message', async () => {
      const result = await executeTool('nonexistent_tool', {}, sandbox, context);
      expect(result).toBe('Unknown tool: nonexistent_tool');
    });
  });

  describe('handoff_to_agent', () => {
    it('updates task status and creates comment', async () => {
      const result = await executeTool(
        'handoff_to_agent',
        { taskId: 'task-1', nextStatus: 'TESTING', context: 'Dev work complete, needs QA' },
        sandbox,
        { ...context, agentName: 'DevBot' }
      );
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'TESTING' },
      });
      expect(mockPrisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          author: 'DevBot',
          content: '[Handoff] Dev work complete, needs QA',
        },
      });
      expect(result).toContain('handed off');
    });
  });

  describe('request_review', () => {
    it('sets task to IN_REVIEW and creates comment', async () => {
      const result = await executeTool(
        'request_review',
        { taskId: 'task-1', summary: 'All tests pass, ready for review' },
        sandbox,
        { ...context, agentName: 'QABot' }
      );
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'IN_REVIEW' },
      });
      expect(mockPrisma.taskComment.create).toHaveBeenCalled();
      expect(result).toContain('IN_REVIEW');
    });
  });

  describe('send_message_to_agent', () => {
    it('creates a comment on the task', async () => {
      const result = await executeTool(
        'send_message_to_agent',
        { taskId: 'task-1', message: 'Please check the API response format' },
        sandbox,
        { ...context, agentName: 'PMBot' }
      );
      expect(mockPrisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          author: 'PMBot',
          content: 'Please check the API response format',
        },
      });
      expect(result).toContain('Message sent');
    });
  });

  describe('toSnakeCase conversion (via executeTool)', () => {
    it('converts PascalCase ReadFile to read_file', async () => {
      vi.mocked(sandbox.readFile).mockResolvedValue('content');
      const result = await executeTool('ReadFile', { path: '/test.ts' }, sandbox, context);
      expect(sandbox.readFile).toHaveBeenCalledWith('/test.ts');
      expect(result).toBe('content');
    });

    it('converts PascalCase WriteFile to write_file', async () => {
      const result = await executeTool('WriteFile', { path: '/a.ts', content: 'x' }, sandbox, context);
      expect(sandbox.writeFile).toHaveBeenCalledWith('/a.ts', 'x');
      expect(result).toBe('File written: /a.ts');
    });

    it('converts PascalCase ExecuteCommand to execute_command', async () => {
      vi.mocked(sandbox.exec).mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
      const result = await executeTool('ExecuteCommand', { command: 'echo hi' }, sandbox, context);
      expect(sandbox.exec).toHaveBeenCalledWith('echo hi', 30000);
      expect(result).toContain('ok');
    });

    it('converts PascalCase CreateTask to create_task', async () => {
      mockPrisma.task.create.mockResolvedValue({ id: 't-pascal', title: 'From Pascal' });
      const result = await executeTool('CreateTask', { title: 'From Pascal' }, sandbox, context);
      expect(mockPrisma.task.create).toHaveBeenCalled();
      expect(result).toContain('Task created');
    });

    it('converts camelCase listFiles to list_files', async () => {
      vi.mocked(sandbox.listFiles).mockResolvedValue(['file1.ts', 'file2.ts']);
      const result = await executeTool('listFiles', { path: '.' }, sandbox, context);
      expect(sandbox.listFiles).toHaveBeenCalledWith('.', false);
      expect(result).toContain('file1.ts');
    });
  });
});
