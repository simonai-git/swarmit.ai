import { streamSimpleAnthropic } from '@mariozechner/pi-ai';
import type { Model, Context, Message, UserMessage, TextContent, ToolCall } from '@mariozechner/pi-ai';
import { Task, Comment, Project, pool } from './db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = any;

// Check if key is an OAT token (OAuth Access Token from Claude Code)
function isOATToken(key: string): boolean {
  return key.startsWith('sk-ant-oat') || key.includes('sk-ant-oat');
}

// Claude Code identity - MUST be first in system prompt for OAT tokens
const CLAUDE_CODE_IDENTITY = `You are Claude Code, Anthropic's official CLI for Claude.`;

// Create a pi-ai compatible model object
function createModel(modelId: string): Model<'anthropic-messages'> {
  return {
    id: modelId,
    name: modelId,
    api: 'anthropic-messages',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    },
    contextWindow: 200000,
    maxTokens: 64000,
  };
}

// Get user's Claude API key from database (decrypted)
export async function getUserClaudeKey(userEmail: string): Promise<string | null> {
  console.log(`[Claude] Looking up API key for user: ${userEmail}`);
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT claude_api_key FROM user_profiles WHERE email = $1',
      [userEmail]
    );
    
    if (result.rows.length === 0) {
      console.log(`[Claude] No user profile found for email: ${userEmail}`);
      return null;
    }
    
    const storedKey = result.rows[0].claude_api_key;
    if (!storedKey) {
      console.log(`[Claude] No Claude API key stored for user: ${userEmail}`);
      return null;
    }
    
    // Decrypt (base64 decode)
    const decoded = Buffer.from(storedKey, 'base64').toString('utf-8');
    console.log(`[Claude] Decoded key for ${userEmail}, starts with: ${decoded.slice(0, 15)}...`);
    return decoded;
  } catch (error) {
    console.error(`[Claude] Error fetching API key for ${userEmail}:`, error);
    return null;
  } finally {
    client.release();
  }
}

// Fallback to env variable if no user key
function getClaudeKey(userApiKey?: string): string {
  if (userApiKey) return userApiKey;
  
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return envKey;
  
  throw new Error('No Claude API key configured. Please add your API key or OAuth token in Profile → Integrations.');
}

// Agent context passed to Claude
export interface AgentContext {
  task: Task;
  project?: Project | null;
  recentComments: Comment[];
  agentMemory: string;
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

// Tool definitions using Claude Code naming conventions for OAT compatibility
// Note: pi-ai converts lowercase names to Claude Code PascalCase (bash -> Bash)
const AGENT_TOOLS: AnyTool[] = [
  {
    name: 'bash', // Will be converted to 'Bash' by pi-ai
    description: 'Execute a shell command',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command']
    }
  },
  {
    name: 'read', // Will be converted to 'Read' by pi-ai
    description: 'Read file contents',
    parameters: {
      type: 'object',
      properties: { 
        file_path: { type: 'string', description: 'Path to the file to read' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write', // Will be converted to 'Write' by pi-ai
    description: 'Write content to file',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to write' },
        content: { type: 'string', description: 'Content to write to the file' }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'glob', // Will be converted to 'Glob' by pi-ai
    description: 'List files in directory matching a pattern',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files' },
      },
      required: ['pattern']
    }
  },
  {
    name: 'git_commit',
    description: 'Commit changes',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } }
      },
      required: ['message']
    }
  },
  {
    name: 'git_push',
    description: 'Push commits',
    parameters: {
      type: 'object',
      properties: { branch: { type: 'string' } },
      required: []
    }
  },
  {
    name: 'update_task',
    description: 'Update task status',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['in_progress', 'testing', 'in_review', 'done'] },
        agent_context: { type: 'string' }
      },
      required: []
    }
  },
  {
    name: 'add_comment',
    description: 'Add comment to task',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content']
    }
  },
  {
    name: 'task_complete',
    description: 'Signal task completion',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        files_changed: { type: 'array', items: { type: 'string' } },
        next_status: { type: 'string', enum: ['testing', 'in_review', 'done'] }
      },
      required: ['summary', 'next_status']
    }
  }
];

// Claude Code-compatible tool definitions for OAT mode
const CLAUDE_CODE_TOOLS: AnyTool[] = [
  {
    name: 'Bash',
    description: 'Execute a shell command in the sandbox environment',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        description: { type: 'string', description: 'Short description of what this command does' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['command']
    }
  },
  {
    name: 'Read',
    description: 'Read a file from the filesystem',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to read' },
        offset: { type: 'number', description: 'Line number to start reading from' },
        limit: { type: 'number', description: 'Number of lines to read' },
      },
      required: ['file_path']
    }
  },
  {
    name: 'Write',
    description: 'Write content to a file, creating it if necessary',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to write' },
        content: { type: 'string', description: 'The content to write' },
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'Edit',
    description: 'Perform an exact string replacement in a file',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to edit' },
        old_string: { type: 'string', description: 'The exact text to replace' },
        new_string: { type: 'string', description: 'The replacement text' },
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },
  {
    name: 'Glob',
    description: 'Find files matching a glob pattern',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files' },
        path: { type: 'string', description: 'Directory to search in' },
      },
      required: ['pattern']
    }
  },
  {
    name: 'Grep',
    description: 'Search file contents using regex',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in' },
        output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], description: 'Output format' },
      },
      required: ['pattern']
    }
  },
  // Task management tools (same as standard)
  {
    name: 'update_task',
    description: 'Update task status or agent context',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['in_progress', 'testing', 'in_review', 'done'] },
        agent_context: { type: 'string' }
      },
      required: []
    }
  },
  {
    name: 'add_comment',
    description: 'Add comment to the task',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content']
    }
  },
  {
    name: 'task_complete',
    description: 'Signal task completion',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        files_changed: { type: 'array', items: { type: 'string' } },
        next_status: { type: 'string', enum: ['testing', 'in_review', 'done'] }
      },
      required: ['summary', 'next_status']
    }
  }
];

// Returns appropriate tool set based on whether we're using OAT
function getToolsForMode(usingOAT: boolean): AnyTool[] {
  return usingOAT ? CLAUDE_CODE_TOOLS : AGENT_TOOLS;
}

// Build OAT-specific system prompt with Claude Code formatting
function buildOATSystemPrompt(context: AgentContext): string {
  const agentType = context.agentConfig?.name?.toLowerCase() || 'developer';
  const basePrompt = context.agentConfig?.systemPrompt ||
    AGENT_PROMPTS[agentType as keyof typeof AGENT_PROMPTS] ||
    AGENT_PROMPTS.developer;

  return `${CLAUDE_CODE_IDENTITY}

${basePrompt}

# Environment
- Working directory: /workspace
- Platform: linux
- You have access to Bash, Read, Write, Edit, Glob, and Grep tools

# Current Task
- **ID:** ${context.task.id}
- **Title:** ${context.task.title}
- **Status:** ${context.task.status}
${context.task.description ? `- **Description:** ${context.task.description}` : ''}

${context.agentMemory ? `# Previous Notes\n${context.agentMemory}\n` : ''}

# Instructions
- Use Read to examine files before editing
- Use Edit for precise string replacements in existing files
- Use Write only for new files
- Use Glob to find files by pattern
- Use Grep to search file contents
- Use Bash for running commands, tests, and git operations
- Call task_complete when done`;
}

// Default agent prompts
export const AGENT_PROMPTS = {
  developer: `You are a senior software developer. Analyze requirements, write clean code, test changes, move task to 'testing' when done.`,
  qa: `You are a QA engineer. Test implementations, check edge cases. If pass: move to 'in_review'. If fail: add comment and move to 'in_progress'.`,
  reviewer: `You are a code reviewer. Check quality, security, bugs. If approved: move to 'done'. If changes needed: add comment and move to 'in_progress'.`
};

// Build system prompt
function buildSystemPrompt(context: AgentContext, usingOAT: boolean): string {
  const agentType = context.agentConfig?.name?.toLowerCase() || 'developer';
  const basePrompt = context.agentConfig?.systemPrompt || 
    AGENT_PROMPTS[agentType as keyof typeof AGENT_PROMPTS] || 
    AGENT_PROMPTS.developer;

  const identityPrefix = usingOAT ? `${CLAUDE_CODE_IDENTITY}\n\n` : '';

  return `${identityPrefix}${basePrompt}

## Current Task
- **ID:** ${context.task.id}
- **Title:** ${context.task.title}
- **Status:** ${context.task.status}
${context.task.description ? `- **Description:** ${context.task.description}` : ''}

${context.agentMemory ? `## Previous Notes\n${context.agentMemory}\n` : ''}

Call task_complete when done.`;
}

// Build task prompt
function buildTaskPrompt(context: AgentContext): string {
  let prompt = `Work on: "${context.task.title}"`;
  if (context.task.description) {
    prompt += `\n\nDescription: ${context.task.description}`;
  }
  if (context.recentComments.length > 0) {
    prompt += '\n\nComments:';
    for (const c of context.recentComments.slice(-3)) {
      prompt += `\n- ${c.author}: ${c.content}`;
    }
  }
  return prompt;
}

// Tool executor interface
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

// Execute tool (handles both standard and Claude Code tool names)
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: AgentContext,
  executor: ToolExecutor,
  taskApi: TaskAPI
): Promise<string> {
  try {
    switch (toolName) {
      // Claude Code compatible tools (OAT requires these names)
      case 'bash': {
        const r = await executor.execCommand(toolInput.command as string, undefined);
        return `Exit: ${r.exitCode}\n${r.stdout}\n${r.stderr}`;
      }
      case 'read':
        return await executor.readFile(toolInput.file_path as string);
      case 'write':
        await executor.writeFile(toolInput.file_path as string, toolInput.content as string);
        return `Written: ${toolInput.file_path}`;
      case 'glob': {
        // Use pattern as a directory path for listing
        const files = await executor.listFiles(toolInput.pattern as string, true);
        return files.join('\n');
      }
      // Legacy tool names (for backward compatibility)
      case 'exec_command': {
        const r = await executor.execCommand(toolInput.command as string, toolInput.workdir as string);
        return `Exit: ${r.exitCode}\n${r.stdout}\n${r.stderr}`;
      }
      case 'read_file':
        return await executor.readFile(toolInput.path as string);
      case 'write_file':
        await executor.writeFile(toolInput.path as string, toolInput.content as string);
        return `Written: ${toolInput.path}`;
      case 'list_files': {
        const files = await executor.listFiles(toolInput.path as string, toolInput.recursive as boolean);
        return files.join('\n');
      }
      // Custom task tools
      case 'git_commit': {
        const sha = await executor.gitCommit(toolInput.message as string, toolInput.files as string[]);
        return `Committed: ${sha}`;
      }
      case 'git_push':
        await executor.gitPush(toolInput.branch as string);
        return 'Pushed';

      // Claude Code-compatible tools
      case 'Bash': {
        const r = await executor.execCommand(toolInput.command as string);
        return `Exit: ${r.exitCode}\n${r.stdout}\n${r.stderr}`;
      }
      case 'Read': {
        return await executor.readFile(toolInput.file_path as string);
      }
      case 'Write': {
        await executor.writeFile(toolInput.file_path as string, toolInput.content as string);
        return `Written: ${toolInput.file_path}`;
      }
      case 'Edit': {
        // Read-modify-write for precise edits
        const filePath = toolInput.file_path as string;
        const oldStr = toolInput.old_string as string;
        const newStr = toolInput.new_string as string;
        const content = await executor.readFile(filePath);
        if (!content.includes(oldStr)) {
          return `Error: old_string not found in ${filePath}`;
        }
        const updated = content.replace(oldStr, newStr);
        await executor.writeFile(filePath, updated);
        return `Edited: ${filePath}`;
      }
      case 'Glob': {
        const dir = (toolInput.path as string) || '.';
        const files = await executor.listFiles(dir, true);
        const pattern = toolInput.pattern as string;
        // Simple glob matching: convert glob to regex
        const regex = new RegExp(
          pattern.replace(/\*\*/g, '___DOUBLESTAR___')
            .replace(/\*/g, '[^/]*')
            .replace(/___DOUBLESTAR___/g, '.*')
            .replace(/\?/g, '.')
        );
        const matched = files.filter(f => regex.test(f));
        return matched.join('\n') || 'No files matched';
      }
      case 'Grep': {
        const dir = (toolInput.path as string) || '.';
        const grepPattern = toolInput.pattern as string;
        const mode = (toolInput.output_mode as string) || 'content';
        const r = await executor.execCommand(
          `grep -r${mode === 'files_with_matches' ? 'l' : mode === 'count' ? 'c' : 'n'} "${grepPattern.replace(/"/g, '\\"')}" "${dir}" 2>/dev/null | head -100`
        );
        return r.stdout || 'No matches found';
      }

      // Task management tools (shared)
      case 'update_task': {
        const updates: Partial<Task> = {};
        if (toolInput.status) updates.status = toolInput.status as Task['status'];
        if (toolInput.agent_context) updates.agent_context = toolInput.agent_context as string;
        await taskApi.updateTask(context.task.id, updates);
        return `Updated: ${JSON.stringify(updates)}`;
      }
      case 'add_comment':
        await taskApi.addComment(context.task.id, context.agentConfig?.name || 'Agent', toolInput.content as string);
        return 'Comment added';
      case 'task_complete':
        return JSON.stringify({ summary: toolInput.summary, files_changed: toolInput.files_changed, next_status: toolInput.next_status });
      default:
        return `Unknown: ${toolName}`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// Main agent runner using pi-ai
export async function runAgent(
  context: AgentContext,
  executor: ToolExecutor,
  taskApi: TaskAPI,
  options: {
    maxIterations?: number;
    onToolUse?: (tool: string, input: unknown) => void;
    onMessage?: (content: string) => void;
    apiKey?: string;
  } = {}
): Promise<AgentResult> {
  const { maxIterations = 50, onToolUse, onMessage, apiKey } = options;
  const modelId = context.agentConfig?.model || 'claude-sonnet-4-20250514';
  const maxTokens = context.agentConfig?.maxTokens || 8000;

  const effectiveKey = getClaudeKey(apiKey);
  const usingOAT = isOATToken(effectiveKey);
  
  console.log(`[Claude] runAgent called with apiKey param: ${apiKey ? apiKey.slice(0, 20) + '...' : 'undefined'}`);
  console.log(`[Claude] effectiveKey: ${effectiveKey.slice(0, 20)}...`);
  console.log(`[Claude] Using pi-ai with ${usingOAT ? 'OAT token' : 'regular API key'}`);
  
  const model = createModel(modelId);
  const systemPrompt = usingOAT
    ? buildOATSystemPrompt(context)
    : buildSystemPrompt(context, false);
  const tools = getToolsForMode(usingOAT);

  // Build messages in pi-ai format
  const messages: Message[] = [
    {
      role: 'user',
      content: buildTaskPrompt(context),
      timestamp: Date.now()
    } as UserMessage
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let filesChanged: string[] = [];
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Use any to avoid type issues that might affect runtime behavior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamContext: any = {
      systemPrompt,
      messages,
      tools,
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = streamSimpleAnthropic(model as any, streamContext, {
        apiKey: effectiveKey,
        maxTokens,
      });
      
      let responseText = '';
      const toolCalls: ToolCall[] = [];
      let usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
      let stopReason = 'stop';
      
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          responseText += event.delta;
          onMessage?.(event.delta);
        } else if (event.type === 'toolcall_end') {
          toolCalls.push(event.toolCall);
          onToolUse?.(event.toolCall.name, event.toolCall.arguments);
        } else if (event.type === 'done') {
          stopReason = event.reason;
          usage = event.message.usage;
        } else if (event.type === 'error') {
          throw new Error(event.error.errorMessage || 'Stream error');
        }
      }

      totalInputTokens += usage.input;
      totalOutputTokens += usage.output;

      // Build assistant message content
      const assistantContent: (TextContent | ToolCall)[] = [];
      if (responseText) {
        assistantContent.push({ type: 'text', text: responseText });
      }
      assistantContent.push(...toolCalls);
      
      messages.push({
        role: 'assistant',
        content: assistantContent,
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: modelId,
        usage,
        stopReason: stopReason as 'stop' | 'toolUse',
        timestamp: Date.now()
      });

      // Check for task_complete
      let taskCompleteResult: { summary: string; files_changed: string[]; next_status: string } | null = null;
      
      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const result = await executeTool(tc.name, tc.arguments, context, executor, taskApi);
          
          messages.push({
            role: 'toolResult',
            toolCallId: tc.id,
            toolName: tc.name,
            content: [{ type: 'text', text: result }],
            isError: false,
            timestamp: Date.now()
          });
          
          if (tc.name === 'task_complete') {
            try { taskCompleteResult = JSON.parse(result); } catch {}
          }
          if (tc.name === 'write_file' && tc.arguments.path) {
            filesChanged.push(tc.arguments.path as string);
          }
          if ((tc.name === 'Write' || tc.name === 'Edit') && tc.arguments.file_path) {
            filesChanged.push(tc.arguments.file_path as string);
          }
        }
      }

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

      if (stopReason === 'stop' && toolCalls.length === 0) {
        return {
          success: true,
          summary: responseText || 'Task completed',
          filesChanged,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens
        };
      }

    } catch (error) {
      console.error('[Claude] Error:', error);
      return {
        success: false,
        summary: 'Error during execution',
        filesChanged,
        error: error instanceof Error ? error.message : String(error),
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
      };
    }
  }

  return {
    success: false,
    summary: 'Max iterations reached',
    filesChanged,
    error: 'Agent exceeded maximum iterations',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens
  };
}

// Calculate cost in cents
export function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-20250514': { input: 300, output: 1500 },
    'claude-3-5-sonnet-20241022': { input: 300, output: 1500 },
    'claude-3-opus-20240229': { input: 1500, output: 7500 },
    'claude-3-haiku-20240307': { input: 25, output: 125 },
  };
  const p = pricing[model] || pricing['claude-sonnet-4-20250514'];
  return Math.ceil((inputTokens / 1_000_000) * p.input * 100 + (outputTokens / 1_000_000) * p.output * 100);
}

export { AGENT_TOOLS, CLAUDE_CODE_TOOLS, buildSystemPrompt, buildTaskPrompt, buildOATSystemPrompt, getToolsForMode };
