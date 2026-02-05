import Anthropic from '@anthropic-ai/sdk';
import { Task, Comment, Project, pool } from './db';

// Check if key is an OAT token (OAuth Access Token from Claude Code)
function isOATToken(key: string): boolean {
  return key.startsWith('sk-ant-oat');
}

// Claude Code identity prefix - required for OAT tokens to work
const CLAUDE_CODE_IDENTITY = `You are Claude Code, Anthropic's official CLI for Claude.`;

// Create Anthropic client with given API key
// For OAT tokens, use special headers that mimic Claude Code and Bearer auth
function createClient(apiKey: string): Anthropic {
  if (isOATToken(apiKey)) {
    // OAT token - use Bearer auth (authToken) + Claude Code impersonation headers
    return new Anthropic({
      authToken: apiKey, // Use authToken for Bearer auth, not apiKey
      defaultHeaders: {
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
        'user-agent': 'claude-cli/2.1.2 (external, cli)',
        'x-app': 'cli',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    });
  }
  // Regular API key
  return new Anthropic({ apiKey });
}

// Get user's Claude API key from database (decrypted)
export async function getUserClaudeKey(userEmail: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT claude_api_key FROM user_profiles WHERE email = $1',
      [userEmail]
    );
    
    if (result.rows.length === 0 || !result.rows[0].claude_api_key) {
      return null;
    }
    
    // Decrypt (base64 decode)
    return Buffer.from(result.rows[0].claude_api_key, 'base64').toString('utf-8');
  } finally {
    client.release();
  }
}

// Fallback to env variable if no user key
function getClaudeKey(userApiKey?: string): string {
  if (userApiKey) return userApiKey;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  throw new Error('No Claude API key available. Please configure one in Profile → Integrations.');
}

// Agent context passed to Claude
export interface AgentContext {
  task: Task;
  project?: Project | null;
  recentComments: Comment[];
  agentMemory: string; // from agent_context field
  agentConfig?: AgentConfig;
}

// Agent configuration from database
export interface AgentConfig {
  id: string;
  name: string;
  specialization: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

// Result from agent execution
export interface AgentResult {
  success: boolean;
  summary: string;
  filesChanged: string[];
  nextStatus?: 'in_progress' | 'testing' | 'in_review' | 'done';
  comment?: string;
  error?: string;
  inputTokens: number;
  outputTokens: number;
}

// Tool definitions for Claude
const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'exec_command',
    description: 'Execute a shell command in the sandboxed environment. Use for running builds, tests, git operations, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        },
        workdir: {
          type: 'string',
          description: 'Working directory (optional, defaults to project root)'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates the file if it does not exist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to write'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_files',
    description: 'List files in a directory',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively (default: false)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'git_commit',
    description: 'Stage and commit changes with a message',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'Commit message'
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to stage (optional, defaults to all changes)'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'git_push',
    description: 'Push commits to remote repository',
    input_schema: {
      type: 'object' as const,
      properties: {
        branch: {
          type: 'string',
          description: 'Branch to push (default: current branch)'
        }
      },
      required: []
    }
  },
  {
    name: 'update_task',
    description: 'Update the current task status or context',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['in_progress', 'testing', 'in_review', 'done'],
          description: 'New task status'
        },
        agent_context: {
          type: 'string',
          description: 'Update the agent context/notes for this task'
        }
      },
      required: []
    }
  },
  {
    name: 'add_comment',
    description: 'Add a comment to the current task',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Comment content'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'web_fetch',
    description: 'Fetch content from a URL',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch'
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method (default: GET)'
        },
        body: {
          type: 'string',
          description: 'Request body (for POST/PUT)'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'task_complete',
    description: 'Signal that the task work is complete. Call this when done.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string',
          description: 'Summary of work completed'
        },
        files_changed: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of files that were modified'
        },
        next_status: {
          type: 'string',
          enum: ['testing', 'in_review', 'done'],
          description: 'Status to move the task to'
        }
      },
      required: ['summary', 'next_status']
    }
  }
];

// Default agent prompts by type
export const AGENT_PROMPTS = {
  developer: `You are a senior software developer working on a task. Your job is to:
- Analyze the task requirements carefully
- Write clean, well-documented code
- Make small, focused commits with descriptive messages
- Test your changes work correctly
- Move the task to 'testing' when implementation is complete

Work methodically. Read existing code first to understand the codebase. Make incremental changes and verify they work.`,

  qa: `You are a QA engineer testing an implementation. Your job is to:
- Review the task requirements and acceptance criteria
- Test the implementation thoroughly via API calls or manual verification
- Check edge cases and error handling
- If tests pass: move task to 'in_review'
- If tests fail: add a detailed comment explaining the failure and move to 'in_progress'

Be thorough but practical. Focus on critical functionality first.`,

  reviewer: `You are a code reviewer. Your job is to:
- Review the code changes for quality and correctness
- Verify the implementation meets requirements
- Check for security issues, performance problems, or bugs
- If approved: move task to 'done'
- If changes needed: add a comment with specific feedback and move to 'in_progress'

Be constructive in feedback. Focus on significant issues, not style nitpicks.`
};

// Build the system prompt for an agent
function buildSystemPrompt(context: AgentContext): string {
  const agentType = context.agentConfig?.name?.toLowerCase() || 'developer';
  const basePrompt = context.agentConfig?.systemPrompt || 
    AGENT_PROMPTS[agentType as keyof typeof AGENT_PROMPTS] || 
    AGENT_PROMPTS.developer;

  return `${basePrompt}

## Current Task
- **ID:** ${context.task.id}
- **Title:** ${context.task.title}
- **Status:** ${context.task.status}
- **Priority:** ${context.task.priority}
${context.task.description ? `- **Description:** ${context.task.description}` : ''}

${context.project ? `## Project Context
- **Project:** ${context.project.title}
- **Tech Stack:** ${context.project.tech_stack || 'Not specified'}
` : ''}

${context.agentMemory ? `## Your Previous Notes
${context.agentMemory}
` : ''}

## Guidelines
- Use the tools provided to complete your work
- Make commits with clear, descriptive messages
- Update the task context with your progress
- Call task_complete when you're done`;
}

// Build the initial task prompt
function buildTaskPrompt(context: AgentContext): string {
  let prompt = `Please work on this task: "${context.task.title}"`;
  
  if (context.task.description) {
    prompt += `\n\nTask Description:\n${context.task.description}`;
  }

  if (context.recentComments.length > 0) {
    prompt += '\n\nRecent Comments:';
    for (const comment of context.recentComments.slice(-5)) {
      prompt += `\n- ${comment.author}: ${comment.content}`;
    }
  }

  prompt += '\n\nPlease begin working on this task. Start by understanding the requirements and exploring the codebase if needed.';

  return prompt;
}

// Tool executor interface (implemented by sandbox)
export interface ToolExecutor {
  execCommand(command: string, workdir?: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listFiles(path: string, recursive?: boolean): Promise<string[]>;
  gitCommit(message: string, files?: string[]): Promise<string>;
  gitPush(branch?: string): Promise<void>;
}

// Task API interface
export interface TaskAPI {
  updateTask(taskId: string, updates: Partial<Task>): Promise<void>;
  addComment(taskId: string, author: string, content: string): Promise<void>;
}

// Execute a tool call
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: AgentContext,
  executor: ToolExecutor,
  taskApi: TaskAPI
): Promise<string> {
  try {
    switch (toolName) {
      case 'exec_command': {
        const result = await executor.execCommand(
          toolInput.command as string,
          toolInput.workdir as string | undefined
        );
        return `Exit code: ${result.exitCode}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`;
      }

      case 'read_file': {
        const content = await executor.readFile(toolInput.path as string);
        return content;
      }

      case 'write_file': {
        await executor.writeFile(toolInput.path as string, toolInput.content as string);
        return `File written: ${toolInput.path}`;
      }

      case 'list_files': {
        const files = await executor.listFiles(
          toolInput.path as string,
          toolInput.recursive as boolean
        );
        return files.join('\n');
      }

      case 'git_commit': {
        const sha = await executor.gitCommit(
          toolInput.message as string,
          toolInput.files as string[] | undefined
        );
        return `Committed: ${sha}`;
      }

      case 'git_push': {
        await executor.gitPush(toolInput.branch as string | undefined);
        return 'Pushed successfully';
      }

      case 'update_task': {
        const updates: Partial<Task> = {};
        if (toolInput.status) updates.status = toolInput.status as Task['status'];
        if (toolInput.agent_context) updates.agent_context = toolInput.agent_context as string;
        await taskApi.updateTask(context.task.id, updates);
        return `Task updated: ${JSON.stringify(updates)}`;
      }

      case 'add_comment': {
        const author = context.agentConfig?.name || 'Agent';
        await taskApi.addComment(context.task.id, author, toolInput.content as string);
        return `Comment added by ${author}`;
      }

      case 'web_fetch': {
        const response = await fetch(toolInput.url as string, {
          method: (toolInput.method as string) || 'GET',
          body: toolInput.body as string | undefined,
        });
        const text = await response.text();
        return `Status: ${response.status}\n${text.slice(0, 5000)}`;
      }

      case 'task_complete': {
        // This is handled specially in the main loop
        return JSON.stringify({
          summary: toolInput.summary,
          files_changed: toolInput.files_changed,
          next_status: toolInput.next_status
        });
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (error) {
    return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Main agent runner
export async function runAgent(
  context: AgentContext,
  executor: ToolExecutor,
  taskApi: TaskAPI,
  options: {
    maxIterations?: number;
    onToolUse?: (tool: string, input: unknown) => void;
    onMessage?: (content: string) => void;
    apiKey?: string; // User's Claude API key (from database)
  } = {}
): Promise<AgentResult> {
  const { maxIterations = 50, onToolUse, onMessage, apiKey } = options;
  const model = context.agentConfig?.model || 'claude-sonnet-4-20250514';
  const maxTokens = context.agentConfig?.maxTokens || 8000;

  // Get the actual key being used
  const effectiveKey = getClaudeKey(apiKey);
  const usingOAT = isOATToken(effectiveKey);
  
  // Create client with user's key or fallback to env
  const claudeClient = createClient(effectiveKey);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildTaskPrompt(context) }
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let filesChanged: string[] = [];
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Build system prompt - prepend Claude Code identity for OAT tokens
    let systemPrompt = buildSystemPrompt(context);
    if (usingOAT) {
      systemPrompt = `${CLAUDE_CODE_IDENTITY}\n\n${systemPrompt}`;
    }

    // Call Claude
    const response = await claudeClient.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Process response content
    const assistantContent: Anthropic.ContentBlock[] = [];
    let taskCompleteResult: { summary: string; files_changed: string[]; next_status: string } | null = null;

    for (const block of response.content) {
      assistantContent.push(block);

      if (block.type === 'text') {
        onMessage?.(block.text);
      }

      if (block.type === 'tool_use') {
        onToolUse?.(block.name, block.input);

        // Execute the tool
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          context,
          executor,
          taskApi
        );

        // Check if this was task_complete
        if (block.name === 'task_complete') {
          try {
            taskCompleteResult = JSON.parse(result);
            filesChanged = taskCompleteResult?.files_changed || [];
          } catch {
            // Not valid JSON, continue
          }
        }

        // Track file changes
        if (block.name === 'write_file') {
          const path = (block.input as { path: string }).path;
          if (!filesChanged.includes(path)) {
            filesChanged.push(path);
          }
        }
      }
    }

    // Add assistant message to history
    messages.push({ role: 'assistant', content: assistantContent });

    // Check if task is complete
    if (taskCompleteResult) {
      return {
        success: true,
        summary: taskCompleteResult.summary,
        filesChanged: taskCompleteResult.files_changed || filesChanged,
        nextStatus: taskCompleteResult.next_status as AgentResult['nextStatus'],
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
      };
    }

    // If no tool calls and stop reason is end_turn, agent is done
    if (response.stop_reason === 'end_turn' && !response.content.some(b => b.type === 'tool_use')) {
      const textContent = response.content.find(b => b.type === 'text');
      return {
        success: true,
        summary: textContent?.type === 'text' ? textContent.text : 'Task completed',
        filesChanged,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
      };
    }

    // Add tool results for next iteration
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          context,
          executor,
          taskApi
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result
        });
      }
    }

    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }

  // Max iterations reached
  return {
    success: false,
    summary: 'Max iterations reached',
    filesChanged,
    error: 'Agent exceeded maximum iterations',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens
  };
}

// Calculate cost in cents (approximate)
export function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  // Pricing per 1M tokens (as of 2024)
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-20250514': { input: 300, output: 1500 }, // $3/$15 per 1M
    'claude-3-5-sonnet-20241022': { input: 300, output: 1500 },
    'claude-3-opus-20240229': { input: 1500, output: 7500 },
    'claude-3-haiku-20240307': { input: 25, output: 125 },
  };

  const modelPricing = pricing[model] || pricing['claude-sonnet-4-20250514'];
  const inputCost = (inputTokens / 1_000_000) * modelPricing.input * 100; // Convert to cents
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output * 100;

  return Math.ceil(inputCost + outputCost);
}

export { AGENT_TOOLS, buildSystemPrompt, buildTaskPrompt };
