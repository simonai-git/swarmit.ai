import type { Sandbox } from '@swarmit/sandbox';
import type { PrismaClient } from '@swarmit/db';
import type { LLMTool, LLMContentBlock } from '@swarmit/shared';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('tools');

/**
 * Sandbox tools available to all agent types.
 */
export function getSandboxTools(): LLMTool[] {
  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file at the given path.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to read' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file at the given path. Creates the file if it does not exist.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to write to' },
          content: { type: 'string', description: 'The content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'execute_command',
      description: 'Execute a shell command in the sandbox environment. Returns stdout, stderr, and exit code.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        },
        required: ['command'],
      },
    },
    {
      name: 'list_files',
      description: 'List files in a directory.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list (default: workspace root)' },
        },
        required: [],
      },
    },
    {
      name: 'search_files',
      description: 'Search for a pattern in files using grep.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory to search in (default: workspace root)' },
          file_glob: { type: 'string', description: 'File glob pattern (e.g. "*.ts")' },
        },
        required: ['pattern'],
      },
    },
  ];
}

/**
 * Task status tool available to all agents.
 */
export function getTaskStatusTool(): LLMTool {
  return {
    name: 'update_task_status',
    description: 'Update the status of a task.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID' },
        status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'TESTING', 'IN_REVIEW', 'DONE'], description: 'New status' },
      },
      required: ['taskId', 'status'],
    },
  };
}

/**
 * PM-specific tools for task/project management.
 */
export function getPMTools(): LLMTool[] {
  return [
    {
      name: 'create_task',
      description: 'Create a new task in the project.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Detailed task description' },
          priority: { type: 'number', description: 'Priority (0=low, 1=medium, 2=high, 3=critical)' },
        },
        required: ['title'],
      },
    },
    {
      name: 'add_dependency',
      description: 'Add a dependency between two tasks. The first task will be blocked until the second is complete.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task that depends on another' },
          dependsOnId: { type: 'string', description: 'The task that must be completed first' },
        },
        required: ['taskId', 'dependsOnId'],
      },
    },
    {
      name: 'list_project_tasks',
      description: 'List all tasks in the current project.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

/**
 * Memory tools for Supermemory integration (remember/recall).
 */
export function getMemoryTools(): LLMTool[] {
  return [
    {
      name: 'remember',
      description: 'Store information in your long-term memory for later recall. Use this to save important context, decisions, or learnings.',
      input_schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The content to remember' },
          tags: { type: 'string', description: 'Optional comma-separated tags for categorization' },
        },
        required: ['content'],
      },
    },
    {
      name: 'recall',
      description: 'Search your long-term memory for previously stored information.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query to find relevant memories' },
        },
        required: ['query'],
      },
    },
  ];
}

/**
 * Get tools for an agent based on its specialization.
 * All agents get sandbox tools + update_task_status.
 * PM agents additionally get create_task, add_dependency, list_project_tasks.
 * If Supermemory is configured, all agents get memory tools.
 */
export function getToolsForAgent(
  specialization: { name: string; keywords: string[] } | null,
  options?: { hasGitHub?: boolean },
): LLMTool[] {
  const baseTools = [...getSandboxTools(), getTaskStatusTool()];

  const isPM = specialization?.name.toLowerCase().includes('manager')
    || specialization?.keywords.some(kw => ['plan', 'project', 'manage'].includes(kw.toLowerCase()));

  if (isPM) {
    baseTools.push(...getPMTools());
  }

  // Add memory tools if Supermemory is configured
  if (process.env.SUPERMEMORY_API_KEY) {
    baseTools.push(...getMemoryTools());
  }

  // Add GitHub tools if user has GitHub integration
  if (options?.hasGitHub) {
    baseTools.push(...getGitHubTools());
  }

  // Always add collaboration tools
  baseTools.push(...getCollaborationTools());

  return baseTools;
}

/**
 * GitHub tools for repository management.
 */
export function getGitHubTools(): LLMTool[] {
  return [
    {
      name: 'github_list_repos',
      description: 'List your GitHub repositories.',
      input_schema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max repos to return (default 30)' },
        },
        required: [],
      },
    },
    {
      name: 'github_clone_repo',
      description: 'Clone a GitHub repository into the sandbox workspace.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Full repo name (owner/repo)' },
          branch: { type: 'string', description: 'Branch to clone (default: main)' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'github_push_files',
      description: 'Push files from the sandbox to a GitHub repository.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Full repo name (owner/repo)' },
          files: {
            type: 'array',
            description: 'Files to push',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path in repo' },
                content: { type: 'string', description: 'File content' },
              },
              required: ['path', 'content'],
            },
          },
          message: { type: 'string', description: 'Commit message' },
          branch: { type: 'string', description: 'Target branch (default: main)' },
        },
        required: ['repo', 'files', 'message'],
      },
    },
    {
      name: 'github_create_pr',
      description: 'Create a pull request on GitHub. Push files to a new branch first.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Full repo name (owner/repo)' },
          title: { type: 'string', description: 'PR title' },
          body: { type: 'string', description: 'PR description' },
          head: { type: 'string', description: 'Source branch' },
          base: { type: 'string', description: 'Target branch (default: main)' },
        },
        required: ['repo', 'title', 'head'],
      },
    },
  ];
}

/**
 * Collaboration tools for agent handoff and communication.
 */
export function getCollaborationTools(): LLMTool[] {
  return [
    {
      name: 'handoff_to_agent',
      description: 'Hand off the current task to the next agent by marking it ready for the next stage. Add context for the receiving agent.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to hand off' },
          nextStatus: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'TESTING', 'IN_REVIEW', 'DONE'], description: 'Status to set for the next agent' },
          context: { type: 'string', description: 'Context/instructions for the receiving agent' },
        },
        required: ['taskId', 'nextStatus', 'context'],
      },
    },
    {
      name: 'request_review',
      description: 'Request a review of the current task by setting it to IN_REVIEW and adding a summary.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID' },
          summary: { type: 'string', description: 'Summary of work done for the reviewer' },
        },
        required: ['taskId', 'summary'],
      },
    },
    {
      name: 'send_message_to_agent',
      description: 'Send a message (as a comment) to the agent working on a task.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to comment on' },
          message: { type: 'string', description: 'The message content' },
        },
        required: ['taskId', 'message'],
      },
    },
  ];
}

/**
 * Execute a tool call using the sandbox or Prisma.
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  sandbox: Sandbox,
  context: {
    prisma: PrismaClient;
    taskId: string;
    projectId: string | null;
    userId: string;
    agentId?: string;
    agentName?: string;
  }
): Promise<string> {
  // Normalize PascalCase tool names (from OAT) to snake_case
  const name = toSnakeCase(toolName);

  switch (name) {
    case 'read_file': {
      const path = toolInput.path as string;
      try {
        const content = await sandbox.readFile(path);
        return content;
      } catch (err) {
        return `Error reading file: ${String(err)}`;
      }
    }

    case 'write_file': {
      const path = toolInput.path as string;
      const content = toolInput.content as string;
      try {
        await sandbox.writeFile(path, content);
        return `File written: ${path}`;
      } catch (err) {
        return `Error writing file: ${String(err)}`;
      }
    }

    case 'execute_command': {
      const command = toolInput.command as string;
      const timeout = (toolInput.timeout as number) || 30000;
      try {
        const result = await sandbox.exec(command, timeout);
        const output = [
          result.stdout ? `stdout:\n${result.stdout}` : '',
          result.stderr ? `stderr:\n${result.stderr}` : '',
          `exit code: ${result.exitCode}`,
        ].filter(Boolean).join('\n');
        return output;
      } catch (err) {
        return `Error executing command: ${String(err)}`;
      }
    }

    case 'list_files': {
      const path = (toolInput.path as string) || '.';
      const recursive = (toolInput.recursive as boolean) || false;
      try {
        const files = await sandbox.listFiles(path, recursive);
        return files.join('\n') || '(empty directory)';
      } catch (err) {
        return `Error listing files: ${String(err)}`;
      }
    }

    case 'search_files': {
      const pattern = toolInput.pattern as string;
      const path = (toolInput.path as string) || '.';
      const glob = toolInput.file_glob as string | undefined;
      const cmd = glob
        ? `grep -rn --include="${glob}" "${pattern}" ${path}`
        : `grep -rn "${pattern}" ${path}`;
      try {
        const result = await sandbox.exec(cmd);
        return result.stdout || result.stderr || 'No matches found.';
      } catch (err) {
        return `Error searching: ${String(err)}`;
      }
    }

    // PM tools
    case 'create_task': {
      const title = toolInput.title as string;
      const description = (toolInput.description as string) || '';
      const priority = (toolInput.priority as number) || 0;
      try {
        const task = await context.prisma.task.create({
          data: {
            userId: context.userId,
            projectId: context.projectId,
            title,
            description,
            priority,
          },
        });
        return `Task created: ${task.id} — "${task.title}"`;
      } catch (err) {
        return `Error creating task: ${String(err)}`;
      }
    }

    case 'add_dependency': {
      const taskId = toolInput.taskId as string;
      const dependsOnId = toolInput.dependsOnId as string;
      try {
        await context.prisma.taskDependency.create({
          data: { taskId, dependsOnId },
        });
        return `Dependency added: ${taskId} depends on ${dependsOnId}`;
      } catch (err) {
        return `Error adding dependency: ${String(err)}`;
      }
    }

    case 'list_project_tasks': {
      try {
        const tasks = await context.prisma.task.findMany({
          where: { projectId: context.projectId, userId: context.userId },
          select: { id: true, title: true, status: true, priority: true, assigneeId: true, isBlocked: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });
        return JSON.stringify(tasks, null, 2);
      } catch (err) {
        return `Error listing tasks: ${String(err)}`;
      }
    }

    case 'update_task_status': {
      const taskId = toolInput.taskId as string;
      const status = toolInput.status as string;
      try {
        await context.prisma.task.update({
          where: { id: taskId },
          data: { status: status as 'TODO' | 'IN_PROGRESS' | 'TESTING' | 'IN_REVIEW' | 'DONE' },
        });
        return `Task ${taskId} status updated to ${status}`;
      } catch (err) {
        return `Error updating task: ${String(err)}`;
      }
    }

    // Memory tools
    case 'remember': {
      const content = toolInput.content as string;
      const tags = (toolInput.tags as string) || '';
      const agentId = context.agentId;
      if (!agentId || !process.env.SUPERMEMORY_API_KEY) {
        return 'Memory tools are not available (missing agent ID or SUPERMEMORY_API_KEY)';
      }
      try {
        const { createSupermemoryClient } = await import('@swarmit/integrations');
        const client = createSupermemoryClient(process.env.SUPERMEMORY_API_KEY);
        const metadata = tags ? { tags } : undefined;
        await client.addAgentMemory(agentId, content, metadata);
        return 'Memory stored successfully';
      } catch (err) {
        return `Error storing memory: ${String(err)}`;
      }
    }

    case 'recall': {
      const query = toolInput.query as string;
      const agentId = context.agentId;
      if (!agentId || !process.env.SUPERMEMORY_API_KEY) {
        return 'Memory tools are not available (missing agent ID or SUPERMEMORY_API_KEY)';
      }
      try {
        const { createSupermemoryClient } = await import('@swarmit/integrations');
        const client = createSupermemoryClient(process.env.SUPERMEMORY_API_KEY);
        const results = await client.searchAgentMemory(agentId, query);
        return results || 'No memories found';
      } catch (err) {
        return `Error recalling memory: ${String(err)}`;
      }
    }

    // GitHub tools
    case 'github_list_repos': {
      try {
        const token = await getGitHubToken(context.prisma, context.userId);
        if (!token) return 'No GitHub token configured. Add one in Settings > Integrations.';
        const { createGitHubClient } = await import('@swarmit/integrations');
        const client = createGitHubClient(token);
        const repos = await client.listRepos((toolInput.limit as number) || 30);
        return JSON.stringify(repos, null, 2);
      } catch (err) {
        return `Error listing repos: ${String(err)}`;
      }
    }

    case 'github_clone_repo': {
      const repo = toolInput.repo as string;
      const branch = (toolInput.branch as string) || 'main';
      try {
        const token = await getGitHubToken(context.prisma, context.userId);
        if (!token) return 'No GitHub token configured.';
        const cloneUrl = `https://x-access-token:${token}@github.com/${repo}.git`;
        const result = await sandbox.exec(`git clone --branch ${branch} --depth 1 ${cloneUrl} /workspace/${repo.split('/')[1]}`, 60000);
        return result.stdout || result.stderr || 'Repository cloned successfully';
      } catch (err) {
        return `Error cloning repo: ${String(err)}`;
      }
    }

    case 'github_push_files': {
      const repo = toolInput.repo as string;
      const files = toolInput.files as Array<{ path: string; content: string }>;
      const message = toolInput.message as string;
      const branch = (toolInput.branch as string) || 'main';
      try {
        const token = await getGitHubToken(context.prisma, context.userId);
        if (!token) return 'No GitHub token configured.';
        const { createGitHubClient } = await import('@swarmit/integrations');
        const client = createGitHubClient(token);
        const result = await client.pushFiles(repo, files, message, branch);
        return `Files pushed successfully. Commit SHA: ${result.sha}`;
      } catch (err) {
        return `Error pushing files: ${String(err)}`;
      }
    }

    case 'github_create_pr': {
      const repo = toolInput.repo as string;
      const title = toolInput.title as string;
      const body = (toolInput.body as string) || '';
      const head = toolInput.head as string;
      const base = (toolInput.base as string) || 'main';
      try {
        const token = await getGitHubToken(context.prisma, context.userId);
        if (!token) return 'No GitHub token configured.';
        const response = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, body, head, base }),
        });
        if (!response.ok) {
          const text = await response.text();
          return `Error creating PR: ${response.status} ${text}`;
        }
        const pr = await response.json() as { html_url: string; number: number };
        return `Pull request created: #${pr.number} — ${pr.html_url}`;
      } catch (err) {
        return `Error creating PR: ${String(err)}`;
      }
    }

    // Collaboration tools
    case 'handoff_to_agent': {
      const taskId = toolInput.taskId as string;
      const nextStatus = toolInput.nextStatus as string;
      const handoffContext = toolInput.context as string;
      try {
        await context.prisma.task.update({
          where: { id: taskId },
          data: { status: nextStatus as 'TODO' | 'IN_PROGRESS' | 'TESTING' | 'IN_REVIEW' | 'DONE' },
        });
        await context.prisma.taskComment.create({
          data: {
            taskId,
            author: context.agentName || 'Agent',
            content: `[Handoff] ${handoffContext}`,
          },
        });
        return `Task ${taskId} handed off with status ${nextStatus}`;
      } catch (err) {
        return `Error handing off: ${String(err)}`;
      }
    }

    case 'request_review': {
      const taskId = toolInput.taskId as string;
      const summary = toolInput.summary as string;
      try {
        await context.prisma.task.update({
          where: { id: taskId },
          data: { status: 'IN_REVIEW' },
        });
        await context.prisma.taskComment.create({
          data: {
            taskId,
            author: context.agentName || 'Agent',
            content: `[Review Request] ${summary}`,
          },
        });
        return `Task ${taskId} set to IN_REVIEW`;
      } catch (err) {
        return `Error requesting review: ${String(err)}`;
      }
    }

    case 'send_message_to_agent': {
      const taskId = toolInput.taskId as string;
      const message = toolInput.message as string;
      try {
        await context.prisma.taskComment.create({
          data: {
            taskId,
            author: context.agentName || 'Agent',
            content: message,
          },
        });
        return `Message sent on task ${taskId}`;
      } catch (err) {
        return `Error sending message: ${String(err)}`;
      }
    }

    default:
      logger.warn({ toolName: name }, 'Unknown tool called');
      return `Unknown tool: ${name}`;
  }
}

/**
 * Get the user's GitHub token from integration_tokens, decrypted.
 */
async function getGitHubToken(prisma: PrismaClient, userId: string): Promise<string | null> {
  const token = await prisma.integrationToken.findUnique({
    where: { userId_provider: { userId, provider: 'github' } },
    select: { accessToken: true },
  });
  if (!token) return null;

  // Decrypt if encrypted
  try {
    const { isEncrypted, decrypt } = await import('@swarmit/shared');
    if (isEncrypted(token.accessToken)) {
      return decrypt(token.accessToken);
    }
  } catch {
    // If decryption fails, try using as-is
  }
  return token.accessToken;
}

/**
 * Extract tool_use blocks from LLM response content.
 */
export function extractToolCalls(content: LLMContentBlock[]): Array<{
  id: string;
  name: string;
  input: Record<string, unknown>;
}> {
  return content
    .filter(block => block.type === 'tool_use' && block.id && block.name)
    .map(block => ({
      id: block.id!,
      name: block.name!,
      input: (block.input || {}) as Record<string, unknown>,
    }));
}

function toSnakeCase(name: string): string {
  // Convert PascalCase/camelCase to snake_case
  return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}
