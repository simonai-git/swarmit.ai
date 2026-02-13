import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Sandbox } from '@swarmit/sandbox';
import {
  getSandboxTools,
  getTaskStatusTool,
  getPMTools,
  getMemoryTools,
  getGitHubTools,
  getCollaborationTools,
  getRailwayTools,
  getToolsForAgent,
  extractToolCalls,
  executeTool,
} from '../tools.js';

// Hoisted mock variables for use inside vi.mock() factories
const {
  mockAddAgentMemory,
  mockSearchAgentMemory,
  mockCreateSupermemoryClient,
  mockListRepos,
  mockPushFiles,
  mockCreateGitHubClient,
  mockRailwayQuery,
  mockRailwayGetDeployments,
  mockRailwaySetEnvVars,
  mockCreateRailwayClient,
  mockRefreshRailwayOAuthToken,
  mockIsEncrypted,
  mockDecrypt,
  mockEncrypt,
} = vi.hoisted(() => {
  const mockAddAgentMemory = vi.fn().mockResolvedValue(undefined);
  const mockSearchAgentMemory = vi.fn().mockResolvedValue('1. Some memory');
  const mockCreateSupermemoryClient = vi.fn(() => ({
    addAgentMemory: mockAddAgentMemory,
    searchAgentMemory: mockSearchAgentMemory,
  }));
  const mockListRepos = vi.fn().mockResolvedValue([{ full_name: 'user/repo', private: false, html_url: 'https://github.com/user/repo' }]);
  const mockPushFiles = vi.fn().mockResolvedValue({ sha: 'abc123def456' });
  const mockCreateGitHubClient = vi.fn(() => ({
    listRepos: mockListRepos,
    pushFiles: mockPushFiles,
  }));
  const mockRailwayQuery = vi.fn().mockResolvedValue({ project: { services: { edges: [] } } });
  const mockRailwayGetDeployments = vi.fn().mockResolvedValue({ deployments: { edges: [] } });
  const mockRailwaySetEnvVars = vi.fn().mockResolvedValue(undefined);
  const mockCreateRailwayClient = vi.fn(() => ({
    query: mockRailwayQuery,
    getDeployments: mockRailwayGetDeployments,
    setEnvVars: mockRailwaySetEnvVars,
  }));
  const mockRefreshRailwayOAuthToken = vi.fn().mockResolvedValue({
    accessToken: 'refreshed-token',
    refreshToken: 'new-refresh-token',
    expiresIn: 3600,
  });
  const mockIsEncrypted = vi.fn().mockReturnValue(false);
  const mockDecrypt = vi.fn().mockImplementation((val: string) => `decrypted-${val}`);
  const mockEncrypt = vi.fn().mockImplementation((val: string) => `encrypted-${val}`);

  return {
    mockAddAgentMemory,
    mockSearchAgentMemory,
    mockCreateSupermemoryClient,
    mockListRepos,
    mockPushFiles,
    mockCreateGitHubClient,
    mockRailwayQuery,
    mockRailwayGetDeployments,
    mockRailwaySetEnvVars,
    mockCreateRailwayClient,
    mockRefreshRailwayOAuthToken,
    mockIsEncrypted,
    mockDecrypt,
    mockEncrypt,
  };
});

// Mock logger
vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock @swarmit/integrations (dynamic import)
vi.mock('@swarmit/integrations', () => ({
  createSupermemoryClient: mockCreateSupermemoryClient,
  createGitHubClient: mockCreateGitHubClient,
  createRailwayClient: mockCreateRailwayClient,
  refreshRailwayOAuthToken: mockRefreshRailwayOAuthToken,
}));

// Mock @swarmit/shared (dynamic import)
vi.mock('@swarmit/shared', () => ({
  isEncrypted: mockIsEncrypted,
  decrypt: mockDecrypt,
  encrypt: mockEncrypt,
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
      update: vi.fn().mockResolvedValue({}),
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

  // ========================================================
  // Memory tools: remember & recall
  // ========================================================
  describe('remember', () => {
    it('stores memory successfully when agentId and API key are set', async () => {
      process.env.SUPERMEMORY_API_KEY = 'test-sm-key';
      const ctxWithAgent = { ...context, agentId: 'agent-42' };
      const result = await executeTool(
        'remember',
        { content: 'Important fact', tags: 'architecture,decision' },
        sandbox,
        ctxWithAgent,
      );
      expect(mockCreateSupermemoryClient).toHaveBeenCalledWith('test-sm-key');
      expect(mockAddAgentMemory).toHaveBeenCalledWith('agent-42', 'Important fact', { tags: 'architecture,decision' });
      expect(result).toBe('Memory stored successfully');
    });

    it('stores memory without tags (metadata is undefined)', async () => {
      process.env.SUPERMEMORY_API_KEY = 'test-sm-key';
      const ctxWithAgent = { ...context, agentId: 'agent-42' };
      const result = await executeTool(
        'remember',
        { content: 'No tags here' },
        sandbox,
        ctxWithAgent,
      );
      expect(mockAddAgentMemory).toHaveBeenCalledWith('agent-42', 'No tags here', undefined);
      expect(result).toBe('Memory stored successfully');
    });

    it('returns not available message when agentId is missing', async () => {
      process.env.SUPERMEMORY_API_KEY = 'test-sm-key';
      const result = await executeTool(
        'remember',
        { content: 'Some content' },
        sandbox,
        context, // no agentId
      );
      expect(result).toBe('Memory tools are not available (missing agent ID or SUPERMEMORY_API_KEY)');
    });

    it('returns not available message when SUPERMEMORY_API_KEY is missing', async () => {
      delete process.env.SUPERMEMORY_API_KEY;
      const ctxWithAgent = { ...context, agentId: 'agent-42' };
      const result = await executeTool(
        'remember',
        { content: 'Some content' },
        sandbox,
        ctxWithAgent,
      );
      expect(result).toBe('Memory tools are not available (missing agent ID or SUPERMEMORY_API_KEY)');
    });

    it('returns error message on supermemory failure', async () => {
      process.env.SUPERMEMORY_API_KEY = 'test-sm-key';
      mockAddAgentMemory.mockRejectedValueOnce(new Error('Supermemory API error: 500'));
      const ctxWithAgent = { ...context, agentId: 'agent-42' };
      const result = await executeTool(
        'remember',
        { content: 'Failing content' },
        sandbox,
        ctxWithAgent,
      );
      expect(result).toContain('Error storing memory');
      expect(result).toContain('500');
    });
  });

  describe('recall', () => {
    it('recalls memory successfully when agentId and API key are set', async () => {
      process.env.SUPERMEMORY_API_KEY = 'test-sm-key';
      mockSearchAgentMemory.mockResolvedValueOnce('1. Previous decision about architecture');
      const ctxWithAgent = { ...context, agentId: 'agent-42' };
      const result = await executeTool(
        'recall',
        { query: 'architecture decisions' },
        sandbox,
        ctxWithAgent,
      );
      expect(mockCreateSupermemoryClient).toHaveBeenCalledWith('test-sm-key');
      expect(mockSearchAgentMemory).toHaveBeenCalledWith('agent-42', 'architecture decisions');
      expect(result).toBe('1. Previous decision about architecture');
    });

    it('returns "No memories found" when search returns empty string', async () => {
      process.env.SUPERMEMORY_API_KEY = 'test-sm-key';
      mockSearchAgentMemory.mockResolvedValueOnce('');
      const ctxWithAgent = { ...context, agentId: 'agent-42' };
      const result = await executeTool(
        'recall',
        { query: 'nonexistent topic' },
        sandbox,
        ctxWithAgent,
      );
      expect(result).toBe('No memories found');
    });

    it('returns not available message when agentId is missing', async () => {
      process.env.SUPERMEMORY_API_KEY = 'test-sm-key';
      const result = await executeTool(
        'recall',
        { query: 'anything' },
        sandbox,
        context, // no agentId
      );
      expect(result).toBe('Memory tools are not available (missing agent ID or SUPERMEMORY_API_KEY)');
    });

    it('returns not available message when SUPERMEMORY_API_KEY is missing', async () => {
      delete process.env.SUPERMEMORY_API_KEY;
      const ctxWithAgent = { ...context, agentId: 'agent-42' };
      const result = await executeTool(
        'recall',
        { query: 'anything' },
        sandbox,
        ctxWithAgent,
      );
      expect(result).toBe('Memory tools are not available (missing agent ID or SUPERMEMORY_API_KEY)');
    });

    it('returns error message on supermemory failure', async () => {
      process.env.SUPERMEMORY_API_KEY = 'test-sm-key';
      mockSearchAgentMemory.mockRejectedValueOnce(new Error('Network error'));
      const ctxWithAgent = { ...context, agentId: 'agent-42' };
      const result = await executeTool(
        'recall',
        { query: 'failing query' },
        sandbox,
        ctxWithAgent,
      );
      expect(result).toContain('Error recalling memory');
      expect(result).toContain('Network error');
    });
  });

  // ========================================================
  // GitHub tools
  // ========================================================
  describe('github_list_repos', () => {
    it('lists repos successfully when GitHub token is available', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token-123' });
      mockIsEncrypted.mockReturnValueOnce(false);
      const repos = [{ full_name: 'user/repo', private: false, html_url: 'https://github.com/user/repo' }];
      mockListRepos.mockResolvedValueOnce(repos);

      const result = await executeTool(
        'github_list_repos',
        { limit: 10 },
        sandbox,
        context,
      );
      expect(mockPrisma.integrationToken.findUnique).toHaveBeenCalledWith({
        where: { userId_provider: { userId: 'user-1', provider: 'github' } },
        select: { accessToken: true },
      });
      expect(mockCreateGitHubClient).toHaveBeenCalledWith('gh-token-123');
      expect(mockListRepos).toHaveBeenCalledWith(10);
      expect(result).toContain('user/repo');
    });

    it('uses default limit of 30 when not specified', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockListRepos.mockResolvedValueOnce([]);
      await executeTool('github_list_repos', {}, sandbox, context);
      expect(mockListRepos).toHaveBeenCalledWith(30);
    });

    it('returns no token message when GitHub token is not configured', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce(null);
      const result = await executeTool('github_list_repos', {}, sandbox, context);
      expect(result).toContain('No GitHub token configured');
    });

    it('returns error message on failure', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockListRepos.mockRejectedValueOnce(new Error('GitHub API error: 403'));
      const result = await executeTool('github_list_repos', {}, sandbox, context);
      expect(result).toContain('Error listing repos');
      expect(result).toContain('403');
    });

    it('decrypts encrypted GitHub token', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'enc:iv:tag:data' });
      mockIsEncrypted.mockReturnValueOnce(true);
      mockDecrypt.mockReturnValueOnce('decrypted-gh-token');
      mockListRepos.mockResolvedValueOnce([]);

      await executeTool('github_list_repos', {}, sandbox, context);
      expect(mockDecrypt).toHaveBeenCalledWith('enc:iv:tag:data');
      expect(mockCreateGitHubClient).toHaveBeenCalledWith('decrypted-gh-token');
    });

    it('uses token as-is when decryption fails', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'plain-token' });
      // Make the dynamic import of @swarmit/shared throw in isEncrypted
      mockIsEncrypted.mockImplementationOnce(() => { throw new Error('No ENCRYPTION_KEY'); });
      mockListRepos.mockResolvedValueOnce([]);

      const result = await executeTool('github_list_repos', {}, sandbox, context);
      expect(mockCreateGitHubClient).toHaveBeenCalledWith('plain-token');
      expect(result).toBe(JSON.stringify([], null, 2));
    });
  });

  describe('github_clone_repo', () => {
    it('clones repo successfully', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);
      vi.mocked(sandbox.exec).mockResolvedValueOnce({ stdout: 'Cloning into...', stderr: '', exitCode: 0 });

      const result = await executeTool(
        'github_clone_repo',
        { repo: 'owner/myrepo', branch: 'develop' },
        sandbox,
        context,
      );
      expect(sandbox.exec).toHaveBeenCalledWith(
        expect.stringContaining('git clone --branch develop --depth 1'),
        60000,
      );
      expect(sandbox.exec).toHaveBeenCalledWith(
        expect.stringContaining('x-access-token:gh-token@github.com/owner/myrepo.git'),
        60000,
      );
      expect(result).toContain('Cloning into');
    });

    it('defaults to main branch', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);
      vi.mocked(sandbox.exec).mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await executeTool(
        'github_clone_repo',
        { repo: 'owner/myrepo' },
        sandbox,
        context,
      );
      expect(sandbox.exec).toHaveBeenCalledWith(
        expect.stringContaining('--branch main'),
        60000,
      );
      expect(result).toBe('Repository cloned successfully');
    });

    it('returns no token message when token not configured', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce(null);
      const result = await executeTool('github_clone_repo', { repo: 'owner/repo' }, sandbox, context);
      expect(result).toBe('No GitHub token configured.');
    });

    it('returns error on clone failure', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);
      vi.mocked(sandbox.exec).mockRejectedValueOnce(new Error('Clone failed'));
      const result = await executeTool('github_clone_repo', { repo: 'owner/repo' }, sandbox, context);
      expect(result).toContain('Error cloning repo');
    });
  });

  describe('github_push_files', () => {
    it('pushes files successfully', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockPushFiles.mockResolvedValueOnce({ sha: 'commit-sha-abc' });

      const result = await executeTool(
        'github_push_files',
        {
          repo: 'owner/myrepo',
          files: [{ path: 'index.ts', content: 'export {}' }],
          message: 'Initial commit',
          branch: 'feature-branch',
        },
        sandbox,
        context,
      );
      expect(mockCreateGitHubClient).toHaveBeenCalledWith('gh-token');
      expect(mockPushFiles).toHaveBeenCalledWith(
        'owner/myrepo',
        [{ path: 'index.ts', content: 'export {}' }],
        'Initial commit',
        'feature-branch',
      );
      expect(result).toContain('Files pushed successfully');
      expect(result).toContain('commit-sha-abc');
    });

    it('defaults branch to main', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockPushFiles.mockResolvedValueOnce({ sha: 'sha123' });

      await executeTool(
        'github_push_files',
        { repo: 'owner/repo', files: [{ path: 'a.ts', content: 'x' }], message: 'msg' },
        sandbox,
        context,
      );
      expect(mockPushFiles).toHaveBeenCalledWith('owner/repo', [{ path: 'a.ts', content: 'x' }], 'msg', 'main');
    });

    it('returns no token message when token not configured', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce(null);
      const result = await executeTool(
        'github_push_files',
        { repo: 'owner/repo', files: [], message: 'msg' },
        sandbox,
        context,
      );
      expect(result).toBe('No GitHub token configured.');
    });

    it('returns error on push failure', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockPushFiles.mockRejectedValueOnce(new Error('Push rejected'));
      const result = await executeTool(
        'github_push_files',
        { repo: 'owner/repo', files: [{ path: 'a.ts', content: 'x' }], message: 'msg' },
        sandbox,
        context,
      );
      expect(result).toContain('Error pushing files');
    });
  });

  describe('github_create_pr', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('creates a PR successfully', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42', number: 42 }),
      }) as unknown as typeof fetch;

      const result = await executeTool(
        'github_create_pr',
        { repo: 'owner/repo', title: 'My PR', body: 'Description', head: 'feature', base: 'develop' },
        sandbox,
        context,
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'My PR', body: 'Description', head: 'feature', base: 'develop' }),
        }),
      );
      expect(result).toContain('Pull request created: #42');
      expect(result).toContain('https://github.com/owner/repo/pull/42');
    });

    it('defaults base to main and body to empty', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ html_url: 'https://github.com/o/r/pull/1', number: 1 }),
      }) as unknown as typeof fetch;

      await executeTool(
        'github_create_pr',
        { repo: 'o/r', title: 'PR', head: 'feat' },
        sandbox,
        context,
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ title: 'PR', body: '', head: 'feat', base: 'main' }),
        }),
      );
    });

    it('returns no token message when token not configured', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce(null);
      const result = await executeTool(
        'github_create_pr',
        { repo: 'owner/repo', title: 'PR', head: 'feat' },
        sandbox,
        context,
      );
      expect(result).toBe('No GitHub token configured.');
    });

    it('returns error when API responds with non-OK status', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => 'Validation Failed',
      }) as unknown as typeof fetch;

      const result = await executeTool(
        'github_create_pr',
        { repo: 'owner/repo', title: 'PR', head: 'feat' },
        sandbox,
        context,
      );
      expect(result).toContain('Error creating PR: 422 Validation Failed');
    });

    it('returns error on fetch failure', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({ accessToken: 'gh-token' });
      mockIsEncrypted.mockReturnValueOnce(false);

      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network failure')) as unknown as typeof fetch;

      const result = await executeTool(
        'github_create_pr',
        { repo: 'owner/repo', title: 'PR', head: 'feat' },
        sandbox,
        context,
      );
      expect(result).toContain('Error creating PR');
      expect(result).toContain('Network failure');
    });
  });

  // ========================================================
  // Railway tools
  // ========================================================
  describe('railway_list_services', () => {
    it('lists services successfully with plaintext token', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'railway-token-plain',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      const serviceData = { project: { services: { edges: [{ node: { id: 's1', name: 'web' } }] } } };
      mockRailwayQuery.mockResolvedValueOnce(serviceData);

      const result = await executeTool(
        'railway_list_services',
        { projectId: 'proj-railway-1' },
        sandbox,
        context,
      );
      expect(mockCreateRailwayClient).toHaveBeenCalledWith('railway-token-plain');
      expect(mockRailwayQuery).toHaveBeenCalledWith(expect.stringContaining('project(id: $projectId)'), { projectId: 'proj-railway-1' });
      const parsed = JSON.parse(result);
      expect(parsed.project.services.edges).toHaveLength(1);
    });

    it('returns no token message when Railway token is not configured', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce(null);
      const result = await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);
      expect(result).toContain('No Railway token configured');
    });

    it('returns error message on failure', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'railway-token',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockRailwayQuery.mockRejectedValueOnce(new Error('Railway GraphQL error'));
      const result = await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);
      expect(result).toContain('Error listing Railway services');
    });
  });

  describe('railway_deploy_service', () => {
    it('triggers redeployment successfully', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'railway-token',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockRailwayQuery.mockResolvedValueOnce({ serviceInstanceRedeploy: true });

      const result = await executeTool(
        'railway_deploy_service',
        { serviceId: 'svc-1', environmentId: 'env-1' },
        sandbox,
        context,
      );
      expect(mockRailwayQuery).toHaveBeenCalledWith(
        expect.stringContaining('serviceInstanceRedeploy'),
        { serviceId: 'svc-1', environmentId: 'env-1' },
      );
      expect(result).toContain('Redeployment triggered');
    });

    it('returns no token message when not configured', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce(null);
      const result = await executeTool(
        'railway_deploy_service',
        { serviceId: 'svc-1', environmentId: 'env-1' },
        sandbox,
        context,
      );
      expect(result).toBe('No Railway token configured.');
    });

    it('returns error on failure', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'railway-token',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockRailwayQuery.mockRejectedValueOnce(new Error('Deploy failed'));
      const result = await executeTool(
        'railway_deploy_service',
        { serviceId: 'svc-1', environmentId: 'env-1' },
        sandbox,
        context,
      );
      expect(result).toContain('Error triggering deployment');
    });
  });

  describe('railway_get_deployments', () => {
    it('gets deployments successfully', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'railway-token',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      const deploys = { deployments: { edges: [{ node: { id: 'd1', status: 'SUCCESS', createdAt: '2025-01-01' } }] } };
      mockRailwayGetDeployments.mockResolvedValueOnce(deploys);

      const result = await executeTool(
        'railway_get_deployments',
        { serviceId: 'svc-1' },
        sandbox,
        context,
      );
      expect(mockRailwayGetDeployments).toHaveBeenCalledWith('svc-1');
      const parsed = JSON.parse(result);
      expect(parsed.deployments.edges).toHaveLength(1);
    });

    it('returns no token message when not configured', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce(null);
      const result = await executeTool('railway_get_deployments', { serviceId: 'svc-1' }, sandbox, context);
      expect(result).toBe('No Railway token configured.');
    });

    it('returns error on failure', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'railway-token',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockRailwayGetDeployments.mockRejectedValueOnce(new Error('Timeout'));
      const result = await executeTool('railway_get_deployments', { serviceId: 'svc-1' }, sandbox, context);
      expect(result).toContain('Error getting deployments');
    });
  });

  describe('railway_set_env_vars', () => {
    it('sets environment variables successfully', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'railway-token',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(false);

      const result = await executeTool(
        'railway_set_env_vars',
        { environmentId: 'env-1', serviceId: 'svc-1', variables: { NODE_ENV: 'production', PORT: '3000' } },
        sandbox,
        context,
      );
      expect(mockRailwaySetEnvVars).toHaveBeenCalledWith('env-1', 'svc-1', { NODE_ENV: 'production', PORT: '3000' });
      expect(result).toContain('Environment variables set');
      expect(result).toContain('NODE_ENV');
      expect(result).toContain('PORT');
    });

    it('returns no token message when not configured', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce(null);
      const result = await executeTool(
        'railway_set_env_vars',
        { environmentId: 'env-1', serviceId: 'svc-1', variables: { A: 'B' } },
        sandbox,
        context,
      );
      expect(result).toBe('No Railway token configured.');
    });

    it('returns error on failure', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'railway-token',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockRailwaySetEnvVars.mockRejectedValueOnce(new Error('Permission denied'));
      const result = await executeTool(
        'railway_set_env_vars',
        { environmentId: 'env-1', serviceId: 'svc-1', variables: { A: 'B' } },
        sandbox,
        context,
      );
      expect(result).toContain('Error setting env vars');
    });
  });

  // ========================================================
  // getRailwayToken helper (tested indirectly through railway_* tools)
  // ========================================================
  describe('getRailwayToken (via railway tools)', () => {
    it('decrypts encrypted railway token', async () => {
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'enc:abc:def:ghi',
        refreshToken: null,
        expiresAt: null,
      });
      mockIsEncrypted.mockReturnValueOnce(true);
      mockDecrypt.mockReturnValueOnce('decrypted-railway-token');
      mockRailwayQuery.mockResolvedValueOnce({ project: {} });

      await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);
      expect(mockDecrypt).toHaveBeenCalledWith('enc:abc:def:ghi');
      expect(mockCreateRailwayClient).toHaveBeenCalledWith('decrypted-railway-token');
    });

    it('refreshes expired token and stores new tokens', async () => {
      const expiredDate = new Date(Date.now() - 60000); // 1 minute ago
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'old-token',
        refreshToken: 'refresh-token-value',
        expiresAt: expiredDate,
      });
      mockIsEncrypted.mockReturnValueOnce(false); // accessToken not encrypted
      mockIsEncrypted.mockReturnValueOnce(false); // refreshToken not encrypted

      process.env.RAILWAY_OAUTH_CLIENT_ID = 'client-id';
      process.env.RAILWAY_OAUTH_CLIENT_SECRET = 'client-secret';
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);

      mockRefreshRailwayOAuthToken.mockResolvedValueOnce({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 7200,
      });
      mockPrisma.integrationToken.update = vi.fn().mockResolvedValueOnce({});
      mockRailwayQuery.mockResolvedValueOnce({ project: {} });

      const result = await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);

      expect(mockRefreshRailwayOAuthToken).toHaveBeenCalledWith('refresh-token-value', 'client-id', 'client-secret');
      expect(mockEncrypt).toHaveBeenCalledWith('new-access-token');
      expect(mockEncrypt).toHaveBeenCalledWith('new-refresh-token');
      expect(mockPrisma.integrationToken.update).toHaveBeenCalledWith({
        where: { userId_provider: { userId: 'user-1', provider: 'railway' } },
        data: expect.objectContaining({
          accessToken: 'encrypted-new-access-token',
          refreshToken: 'encrypted-new-refresh-token',
        }),
      });
      expect(mockCreateRailwayClient).toHaveBeenCalledWith('new-access-token');
      expect(result).not.toContain('Error');

      delete process.env.RAILWAY_OAUTH_CLIENT_ID;
      delete process.env.RAILWAY_OAUTH_CLIENT_SECRET;
      delete process.env.ENCRYPTION_KEY;
    });

    it('refreshes expired token without encryption when ENCRYPTION_KEY not set', async () => {
      const expiredDate = new Date(Date.now() - 60000);
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'old-token',
        refreshToken: 'refresh-token-value',
        expiresAt: expiredDate,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockIsEncrypted.mockReturnValueOnce(false);

      process.env.RAILWAY_OAUTH_CLIENT_ID = 'client-id';
      process.env.RAILWAY_OAUTH_CLIENT_SECRET = 'client-secret';
      delete process.env.ENCRYPTION_KEY;

      mockRefreshRailwayOAuthToken.mockResolvedValueOnce({
        accessToken: 'refreshed-token',
        refreshToken: null,
        expiresIn: 3600,
      });
      mockPrisma.integrationToken.update = vi.fn().mockResolvedValueOnce({});
      mockRailwayQuery.mockResolvedValueOnce({ project: {} });

      await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);

      // Without ENCRYPTION_KEY, token should be stored plaintext
      expect(mockPrisma.integrationToken.update).toHaveBeenCalledWith({
        where: { userId_provider: { userId: 'user-1', provider: 'railway' } },
        data: expect.objectContaining({
          accessToken: 'refreshed-token',
          refreshToken: null,
        }),
      });
      expect(mockCreateRailwayClient).toHaveBeenCalledWith('refreshed-token');

      delete process.env.RAILWAY_OAUTH_CLIENT_ID;
      delete process.env.RAILWAY_OAUTH_CLIENT_SECRET;
    });

    it('falls back to old token when refresh fails', async () => {
      const expiredDate = new Date(Date.now() - 60000);
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'old-token',
        refreshToken: 'refresh-token-value',
        expiresAt: expiredDate,
      });
      mockIsEncrypted.mockReturnValueOnce(false);
      mockIsEncrypted.mockReturnValueOnce(false);

      process.env.RAILWAY_OAUTH_CLIENT_ID = 'client-id';
      process.env.RAILWAY_OAUTH_CLIENT_SECRET = 'client-secret';

      mockRefreshRailwayOAuthToken.mockRejectedValueOnce(new Error('Refresh failed'));
      mockRailwayQuery.mockResolvedValueOnce({ project: {} });

      await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);

      // Should fall back to original (decrypted) token
      expect(mockCreateRailwayClient).toHaveBeenCalledWith('old-token');

      delete process.env.RAILWAY_OAUTH_CLIENT_ID;
      delete process.env.RAILWAY_OAUTH_CLIENT_SECRET;
    });

    it('skips refresh when OAuth client ID/secret are not set', async () => {
      const expiredDate = new Date(Date.now() - 60000);
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'old-token',
        refreshToken: 'refresh-token-value',
        expiresAt: expiredDate,
      });
      mockIsEncrypted.mockReturnValueOnce(false);

      delete process.env.RAILWAY_OAUTH_CLIENT_ID;
      delete process.env.RAILWAY_OAUTH_CLIENT_SECRET;

      mockRailwayQuery.mockResolvedValueOnce({ project: {} });

      await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);

      expect(mockRefreshRailwayOAuthToken).not.toHaveBeenCalled();
      expect(mockCreateRailwayClient).toHaveBeenCalledWith('old-token');
    });

    it('does not refresh when token is not expired', async () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: futureDate,
      });
      mockIsEncrypted.mockReturnValueOnce(false);

      process.env.RAILWAY_OAUTH_CLIENT_ID = 'client-id';
      process.env.RAILWAY_OAUTH_CLIENT_SECRET = 'client-secret';
      mockRailwayQuery.mockResolvedValueOnce({ project: {} });

      await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);

      expect(mockRefreshRailwayOAuthToken).not.toHaveBeenCalled();
      expect(mockCreateRailwayClient).toHaveBeenCalledWith('valid-token');

      delete process.env.RAILWAY_OAUTH_CLIENT_ID;
      delete process.env.RAILWAY_OAUTH_CLIENT_SECRET;
    });

    it('decrypts encrypted refresh token before refreshing', async () => {
      const expiredDate = new Date(Date.now() - 60000);
      mockPrisma.integrationToken.findUnique.mockResolvedValueOnce({
        accessToken: 'plain-access',
        refreshToken: 'enc:rf:tag:data',
        expiresAt: expiredDate,
      });
      mockIsEncrypted.mockReturnValueOnce(false); // accessToken not encrypted
      mockIsEncrypted.mockReturnValueOnce(true);   // refreshToken is encrypted
      mockDecrypt.mockReturnValueOnce('decrypted-refresh-token');

      process.env.RAILWAY_OAUTH_CLIENT_ID = 'client-id';
      process.env.RAILWAY_OAUTH_CLIENT_SECRET = 'client-secret';
      delete process.env.ENCRYPTION_KEY;

      mockRefreshRailwayOAuthToken.mockResolvedValueOnce({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });
      mockPrisma.integrationToken.update = vi.fn().mockResolvedValueOnce({});
      mockRailwayQuery.mockResolvedValueOnce({ project: {} });

      await executeTool('railway_list_services', { projectId: 'p1' }, sandbox, context);

      expect(mockDecrypt).toHaveBeenCalledWith('enc:rf:tag:data');
      expect(mockRefreshRailwayOAuthToken).toHaveBeenCalledWith('decrypted-refresh-token', 'client-id', 'client-secret');

      delete process.env.RAILWAY_OAUTH_CLIENT_ID;
      delete process.env.RAILWAY_OAUTH_CLIENT_SECRET;
    });
  });

  // ========================================================
  // Collaboration tools error cases
  // ========================================================
  describe('handoff_to_agent error', () => {
    it('returns error message when task update fails', async () => {
      mockPrisma.task.update.mockRejectedValueOnce(new Error('Task not found'));
      const result = await executeTool(
        'handoff_to_agent',
        { taskId: 'bad-task', nextStatus: 'TESTING', context: 'Context info' },
        sandbox,
        { ...context, agentName: 'Agent' },
      );
      expect(result).toContain('Error handing off');
      expect(result).toContain('Task not found');
    });

    it('uses default agent name "Agent" when agentName is not set', async () => {
      const result = await executeTool(
        'handoff_to_agent',
        { taskId: 'task-1', nextStatus: 'IN_REVIEW', context: 'Done' },
        sandbox,
        context, // no agentName
      );
      expect(mockPrisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          author: 'Agent',
          content: '[Handoff] Done',
        },
      });
      expect(result).toContain('handed off');
    });
  });

  describe('request_review error', () => {
    it('returns error message when review request fails', async () => {
      mockPrisma.task.update.mockRejectedValueOnce(new Error('DB connection lost'));
      const result = await executeTool(
        'request_review',
        { taskId: 'task-1', summary: 'Summary' },
        sandbox,
        { ...context, agentName: 'QA' },
      );
      expect(result).toContain('Error requesting review');
      expect(result).toContain('DB connection lost');
    });

    it('uses default agent name "Agent" when agentName is not set', async () => {
      await executeTool(
        'request_review',
        { taskId: 'task-1', summary: 'Review this' },
        sandbox,
        context, // no agentName
      );
      expect(mockPrisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          author: 'Agent',
          content: '[Review Request] Review this',
        },
      });
    });
  });

  describe('send_message_to_agent error', () => {
    it('returns error message when sending fails', async () => {
      mockPrisma.taskComment.create.mockRejectedValueOnce(new Error('Cannot create comment'));
      const result = await executeTool(
        'send_message_to_agent',
        { taskId: 'task-1', message: 'Hello' },
        sandbox,
        { ...context, agentName: 'PM' },
      );
      expect(result).toContain('Error sending message');
      expect(result).toContain('Cannot create comment');
    });

    it('uses default agent name "Agent" when agentName is not set', async () => {
      await executeTool(
        'send_message_to_agent',
        { taskId: 'task-1', message: 'Check this' },
        sandbox,
        context, // no agentName
      );
      expect(mockPrisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          author: 'Agent',
          content: 'Check this',
        },
      });
    });
  });
});

// ========================================================
// getRailwayTools function
// ========================================================
describe('getRailwayTools', () => {
  it('returns 4 Railway tools with correct names', () => {
    const tools = getRailwayTools();
    expect(tools).toHaveLength(4);
    expect(tools.map(t => t.name)).toEqual([
      'railway_list_services',
      'railway_deploy_service',
      'railway_get_deployments',
      'railway_set_env_vars',
    ]);
  });

  it('each tool has name, description, and input_schema', () => {
    const tools = getRailwayTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

// ========================================================
// getToolsForAgent with Railway option
// ========================================================
describe('getToolsForAgent with Railway', () => {
  it('includes Railway tools when hasRailway option is true', () => {
    const tools = getToolsForAgent(null, { hasRailway: true });
    expect(tools).toHaveLength(13); // 9 base + 4 railway
    const names = tools.map(t => t.name);
    expect(names).toContain('railway_list_services');
    expect(names).toContain('railway_deploy_service');
    expect(names).toContain('railway_get_deployments');
    expect(names).toContain('railway_set_env_vars');
  });

  it('includes both GitHub and Railway tools when both options are true', () => {
    const tools = getToolsForAgent(null, { hasGitHub: true, hasRailway: true });
    // 9 base + 4 github + 4 railway = 17
    expect(tools).toHaveLength(17);
    const names = tools.map(t => t.name);
    expect(names).toContain('github_list_repos');
    expect(names).toContain('railway_list_services');
  });
});
