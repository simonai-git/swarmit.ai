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
    {
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
    },
  ];
}

/**
 * Get tools for an agent based on its specialization.
 */
export function getToolsForAgent(specialization: string | null): LLMTool[] {
  const isPM = specialization === 'project-manager' || specialization === 'product-manager';

  if (isPM) {
    return [...getSandboxTools(), ...getPMTools()];
  }

  return getSandboxTools();
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

    default:
      logger.warn({ toolName: name }, 'Unknown tool called');
      return `Unknown tool: ${name}`;
  }
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
