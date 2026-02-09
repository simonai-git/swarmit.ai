import { streamSimpleAnthropic } from '@mariozechner/pi-ai';
import type { Model, Context, Message, UserMessage, TextContent, ToolCall } from '@mariozechner/pi-ai';
import { Task, Comment, Project, pool } from './db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = any;

// Check if key is an OAT token (OAuth Access Token from Claude Code)
function isOATToken(key: string): boolean {
  return key.startsWith('sk-ant-oat');
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
    name: 'create_task',
    description: 'Create a new task in the current project',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Detailed task description' },
        assignee: { type: 'string', description: 'Agent name to assign (Alex, Morgan, Jordan, Riley, Sam, Taylor, Simon)' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Task priority' },
      },
      required: ['title', 'description', 'assignee']
    }
  },
  {
    name: 'add_dependency',
    description: 'Make one task depend on another (task cannot start until dependency is done)',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task that should wait' },
        depends_on_id: { type: 'string', description: 'The task that must complete first' },
      },
      required: ['task_id', 'depends_on_id']
    }
  },
  {
    name: 'list_project_tasks',
    description: 'List all tasks in the current project with their status',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'save_prd',
    description: 'Save the PRD (Product Requirements Document) to the project',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The full PRD content in markdown format' }
      },
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
  },
  // PM tools - needed for project planning and verification
  {
    name: 'create_task',
    description: 'Create a new task in the current project',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Detailed task description' },
        assignee: { type: 'string', description: 'Agent name to assign (Alex, Morgan, Jordan, Riley, Sam, Taylor, Simon)' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Task priority' },
      },
      required: ['title', 'description', 'assignee']
    }
  },
  {
    name: 'add_dependency',
    description: 'Make one task depend on another (task cannot start until dependency is done)',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task that should wait' },
        depends_on_id: { type: 'string', description: 'The task that must complete first' },
      },
      required: ['task_id', 'depends_on_id']
    }
  },
  {
    name: 'list_project_tasks',
    description: 'List all tasks in the current project with their status',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'save_prd',
    description: 'Save the PRD (Product Requirements Document) to the project',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The full PRD content in markdown format' }
      },
      required: ['content']
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
export const AGENT_PROMPTS: Record<string, string> = {
  developer: `You are a senior software developer. Analyze requirements, write clean code, test changes. You MUST call task_complete with next_status='testing' when done.`,
  qa: `You are a QA engineer. Your job is to verify the implementation works correctly.

## Process (stay under 15 tool calls):
1. Read the main files to understand what was built (2-3 reads)
2. If there's a package.json, verify npm install works and start script exists (1-2 commands)
3. Briefly run the server to verify it starts, then kill it (1-2 commands)
4. Summarize findings and call task_complete IMMEDIATELY

## Critical Rules:
- Do NOT rewrite or fix code. Your job is to TEST only.
- Do NOT exhaustively test every edge case. Focus on: does it work?
- If the implementation generally works, approve it. Minor issues are OK.
- You MUST call task_complete:
  - next_status='in_review' if the implementation is functional
  - next_status='in_progress' if there are critical bugs (add_comment explaining what's broken)`,
  reviewer: `You are a code reviewer. Do a brief review of the implementation.

## Process (stay under 10 tool calls):
1. Read the main files (2-3 reads)
2. Check for security issues, code quality, and completeness
3. Call task_complete IMMEDIATELY after review

## Critical Rules:
- Approve unless there are critical issues. Minor style issues are OK.
- You MUST call task_complete:
  - next_status='done' if approved
  - next_status='in_progress' if critical changes needed (add_comment explaining why)`,
  devops: `You are a DevOps engineer. Your job is to prepare code for deployment.

## Process (stay under 10 tool calls):
1. Read the workspace files to verify project structure
2. Ensure package.json exists with a valid start script
3. Ensure the app listens on the PORT environment variable (or has a static file server)
4. If there's no PORT support, add it (e.g., update serve command to use -l $PORT or 3000)
5. Call task_complete with next_status='testing' when ready

## Critical Rules:
- Your workspace already contains the code from the parent task. DO NOT rebuild from scratch.
- Make minimal changes — only fix deployment-blocking issues.
- You MUST call task_complete within 10 iterations.`,
  product_manager: `You are a Product Manager. Your job is to write a comprehensive PRD (Product Requirements Document) for the project.

## Instructions:
1. Read the project description, goals, requirements, constraints, and tech stack from the context
2. Write a detailed PRD covering:
   - Executive Summary
   - Problem Statement
   - Goals & Success Metrics
   - User Stories / Use Cases
   - Functional Requirements (prioritized as Must-have / Should-have / Nice-to-have)
   - Non-Functional Requirements (performance, security, scalability)
   - Technical Architecture Overview
   - Out of Scope
   - Timeline & Milestones
3. Save the PRD using the save_prd tool
4. Call task_complete with next_status='done'

## Critical Rules:
- Be thorough but practical — focus on actionable requirements
- Prioritize requirements clearly (Must-have / Should-have / Nice-to-have)
- The PRD MUST respect the project constraints and tech_stack. If the project says "no backend" or "static site", do NOT include backend requirements. If the tech_stack is "vanilla JS", do NOT require React or other frameworks.
- You MUST call save_prd before task_complete
- You MUST call task_complete within 20 iterations`,

  pm: `You are a Project Manager. Your job is to analyze the PRD and create a focused task plan.

## When Planning a Project (task title starts with "[PM] Plan:"):
1. Read the PRD in the "Project Context > PRD" section above — this is your primary input. Do NOT look for PRD files on disk; the full PRD is already provided in your system prompt.
2. IMPORTANT — Read the Constraints and Tech Stack sections in the Project Context carefully. Only create tasks that fit within these boundaries:
   - If constraints say "no backend" or "static site" → do NOT create backend/database/API tasks
   - If tech_stack specifies vanilla HTML/CSS/JS → do NOT create React/Vue/framework tasks
   - If "Deploy to Railway" is not listed as "Yes" → do NOT create Railway deployment tasks
   - If "Push to GitHub" is not listed as "Yes" → do NOT create GitHub push tasks
3. Call list_project_tasks FIRST to see what already exists (in case of retry). Do NOT create tasks that already exist — skip them.
4. Create ONLY the necessary tasks (aim for 5-8 tasks for a simple project, 8-12 for complex). Use create_task for each:
   - Design/UI tasks (assign to Alex) — only if visual design work is needed
   - Frontend tasks (assign to Alex) — match the tech_stack (e.g., vanilla JS if specified)
   - Backend tasks (assign to Morgan) — ONLY if the project needs a backend
   - Testing tasks (assign to Riley)
   - Deployment tasks (assign to Jordan) — ONLY if deploy_to_railway or push_to_github is enabled
5. Set up dependencies using add_dependency (e.g., design before frontend, backend before integration, all dev before testing, testing before deployment)
6. Create ONE final verification task: "[PM] Verify: {project title}" assigned to Taylor (yourself) that depends on ALL other tasks
7. Call task_complete with next_status='done'

## When Verifying a Project (task title starts with "[PM] Verify:"):
1. Use list_project_tasks to check all task statuses
2. Review completion status of each task
3. If the project has deploy_to_railway enabled: verify the deployed app works as expected
4. If the project has push_to_github enabled: verify code was pushed to the repository
5. If all tasks are done and quality is acceptable: call task_complete with next_status='done'
6. If issues found: create fix tasks with appropriate assignees and dependencies, then call task_complete with next_status='done'

## Available Agents:
- Alex: Frontend specialist (React, CSS, UI/UX)
- Morgan: Backend specialist (APIs, databases, server logic)
- Jordan: DevOps specialist (deployment, CI/CD, infrastructure)
- Riley: QA specialist (testing, bug verification)
- Taylor: Project Manager (that's you - for verification tasks)
- Sam: Product Manager (PRD creation)
- Simon: General developer (full-stack, default)

## Critical Rules:
- NEVER create tasks that violate the project's constraints or tech_stack
- Keep the total task count reasonable (5-12 tasks). Do not over-engineer.
- Create focused, well-scoped tasks (not too broad, not too granular)
- Always set proper dependencies to ensure correct execution order
- The verification task MUST depend on all other project tasks
- You MUST call task_complete within 20 iterations`,
};

// Build system prompt
function buildSystemPrompt(context: AgentContext, usingOAT: boolean): string {
  const agentType = context.agentConfig?.name?.toLowerCase() || 'developer';
  const basePrompt = context.agentConfig?.systemPrompt || 
    AGENT_PROMPTS[agentType as keyof typeof AGENT_PROMPTS] || 
    AGENT_PROMPTS.developer;

  const identityPrefix = usingOAT ? `${CLAUDE_CODE_IDENTITY}\n\n` : '';

  let projectSection = '';
  if (context.project) {
    const p = context.project;
    projectSection = `\n## Project Context
- **Project:** ${p.title}
- **Status:** ${p.status}
${p.description ? `- **Description:** ${p.description}` : ''}
${p.prd ? `\n### PRD\n${p.prd}` : ''}
${p.goals ? `\n### Goals\n${p.goals}` : ''}
${p.requirements ? `\n### Requirements\n${p.requirements}` : ''}
${p.constraints ? `\n### Constraints\n${p.constraints}` : ''}
${p.tech_stack ? `\n### Tech Stack\n${p.tech_stack}` : ''}
${p.timeline ? `\n### Timeline\n${p.timeline}` : ''}
${p.github_repo ? `- **GitHub Repo:** ${p.github_repo}` : ''}
${p.deploy_to_railway ? `- **Deploy to Railway:** Yes` : ''}
${p.push_to_github ? `- **Push to GitHub:** Yes` : ''}
`;
  }

  return `${identityPrefix}${basePrompt}

## Current Task
- **ID:** ${context.task.id}
- **Title:** ${context.task.title}
- **Status:** ${context.task.status}
${context.task.description ? `- **Description:** ${context.task.description}` : ''}
${projectSection}
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
  createTask?(task: { title: string; description: string; assignee: string; priority: string; projectId: string; userEmail: string | null }): Promise<{ id: string }>;
  addDependency?(taskId: string, dependsOnId: string): Promise<void>;
  listProjectTasks?(projectId: string): Promise<Array<{ id: string; title: string; status: string; assignee: string | null }>>;
  updateProject?(projectId: string, updates: Partial<Project>): Promise<void>;
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
        // Escape all shell-special characters to prevent command injection
        const escapedPattern = grepPattern.replace(/[\\`$"!{}();&|<>]/g, '\\$&');
        const escapedDir = dir.replace(/[\\`$"!{}();&|<>]/g, '\\$&');
        const r = await executor.execCommand(
          `grep -r${mode === 'files_with_matches' ? 'l' : mode === 'count' ? 'c' : 'n'} "${escapedPattern}" "${escapedDir}" 2>/dev/null | head -100`
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
      case 'create_task': {
        if (!taskApi.createTask) return 'Error: create_task not available';
        const projectId = context.project?.id || context.task.project_id;
        if (!projectId) return 'Error: No project context — create_task requires a project';
        const created = await taskApi.createTask({
          title: toolInput.title as string,
          description: toolInput.description as string,
          assignee: toolInput.assignee as string,
          priority: (toolInput.priority as string) || 'medium',
          projectId,
          userEmail: context.task.user_email,
        });
        return `Task created: ${created.id} — "${toolInput.title}"`;
      }
      case 'add_dependency': {
        if (!taskApi.addDependency) return 'Error: add_dependency not available';
        await taskApi.addDependency(toolInput.task_id as string, toolInput.depends_on_id as string);
        return `Dependency added: ${toolInput.task_id} depends on ${toolInput.depends_on_id}`;
      }
      case 'list_project_tasks': {
        if (!taskApi.listProjectTasks) return 'Error: list_project_tasks not available';
        const projectId = context.project?.id || context.task.project_id;
        if (!projectId) return 'Error: No project context';
        const tasks = await taskApi.listProjectTasks(projectId);
        return JSON.stringify(tasks, null, 2);
      }
      case 'save_prd': {
        if (!taskApi.updateProject) return 'Error: save_prd not available';
        const projectId = context.project?.id || context.task.project_id;
        if (!projectId) return 'Error: No project context — save_prd requires a project';
        await taskApi.updateProject(projectId, { prd: toolInput.content as string });
        return 'PRD saved successfully to project';
      }
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
  const maxTokens = context.agentConfig?.maxTokens || 16000;

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
  let consecutiveStops = 0;

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

      const streamStartTime = Date.now();
      let eventCount = 0;
      let lastEventTime = streamStartTime;
      console.log(`[Claude] Stream started for iteration ${iteration}`);

      for await (const event of stream) {
        eventCount++;
        const now = Date.now();
        const gap = now - lastEventTime;
        // Log slow events (>5s gap) and periodic updates
        if (gap > 5000 || eventCount % 50 === 0) {
          console.log(`[Claude] Event #${eventCount} type=${event.type} gap=${gap}ms total=${now - streamStartTime}ms`);
        }
        lastEventTime = now;

        if (event.type === 'text_delta') {
          responseText += event.delta;
          onMessage?.(event.delta);
        } else if (event.type === 'toolcall_end') {
          toolCalls.push(event.toolCall);
          const argLen = JSON.stringify(event.toolCall.arguments).length;
          console.log(`[Claude] Tool call complete: ${event.toolCall.name} (${argLen} chars args) at ${now - streamStartTime}ms`);
          onToolUse?.(event.toolCall.name, event.toolCall.arguments);
        } else if (event.type === 'done') {
          stopReason = event.reason;
          usage = event.message.usage;
          console.log(`[Claude] Stream done: ${eventCount} events in ${now - streamStartTime}ms, tokens=${usage.input}/${usage.output}, reason=${stopReason}`);
        } else if (event.type === 'error') {
          console.error(`[Claude] Stream error at ${now - streamStartTime}ms: ${event.error?.errorMessage}`);
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
          const execStart = Date.now();
          console.log(`[Claude] Executing tool: ${tc.name} (iteration ${iteration})`);
          const result = await executeTool(tc.name, tc.arguments, context, executor, taskApi);
          console.log(`[Claude] Tool executed: ${tc.name} in ${Date.now() - execStart}ms (result: ${result.length} chars)`);

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

      // Exit when the model stops without tool calls, or after 3 consecutive
      // "stop" responses (prevents infinite loops when the agent calls tools
      // but never invokes task_complete).
      if (stopReason === 'stop') {
        consecutiveStops++;
        if (consecutiveStops >= 3 || toolCalls.length === 0) {
          return {
            success: true,
            summary: responseText || 'Task completed',
            filesChanged,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens
          };
        }
      } else {
        consecutiveStops = 0;
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
