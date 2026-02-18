import type { PrismaClient } from '@swarmit/db';
import type { LLMClient } from '@swarmit/integrations';
import type { Sandbox } from '@swarmit/sandbox';
import type { LLMMessage, LLMContentBlock } from '@swarmit/shared';
import type { Redis } from 'ioredis';
import { createLogger } from '@swarmit/logger';
import { getToolsForAgent, executeTool, extractToolCalls } from './tools.js';
import { initWorkflow, getWorkflowPrompt, processWorkflowOutput, finalizeWorkflow } from './workflow-runner.js';

const logger = createLogger('executor');

const MAX_TOOL_LOOPS = 50;

interface ExecutorContext {
  prisma: PrismaClient;
  llmClient: LLMClient;
  sandbox: Sandbox;
  redis: Redis;
  runId: string;
  taskId: string;
  userId: string;
}

interface TaskContext {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: number;
    project: {
      id: string; title: string; description: string | null; prd: string | null;
      projectType: string | null; goal: string | null; targetUsers: string | null;
      mustHaves: string[]; deadline: Date | null; budgetRange: string | null;
      contactEmail: string | null; niceToHaves: string[]; referenceLinks: string[];
      constraints: string | null; comms: string | null; dataSensitivity: string | null;
    } | null;
    comments: Array<{ author: string; content: string; createdAt: Date }>;
    assignee: {
      id: string;
      name: string;
      specialization: {
        id: string;
        name: string;
        keywords: string[];
        description: string | null;
        systemPrompt: string | null;
      } | null;
      systemPrompt: string | null;
      model: string;
      temperature: number;
      maxTokens: number;
      skills: Array<{ skill: { name: string; description: string | null } }>;
      agentWorkflows: Array<{
        workflow: {
          versions: Array<{ id: string; nodes: unknown; edges: unknown }>;
        };
      }>;
    } | null;
  };
}

/**
 * Execute an agent run: build system prompt, run LLM tool-calling loop, track workflow.
 */
export async function executeAgent(ctx: ExecutorContext, taskCtx: TaskContext): Promise<{
  totalTokens: number;
  totalCost: number;
}> {
  const { task } = taskCtx;
  const agent = task.assignee;
  if (!agent) throw new Error('Task has no assigned agent');

  const specialization = agent.specialization || null;

  // Check if user has GitHub and Railway integrations
  const [hasGitHub, hasRailway] = await Promise.all([
    ctx.prisma.integrationToken.count({
      where: { userId: ctx.userId, provider: 'github' },
    }).then(c => c > 0).catch(() => false),
    ctx.prisma.integrationToken.count({
      where: { userId: ctx.userId, provider: 'railway' },
    }).then(c => c > 0).catch(() => false),
  ]);

  const tools = getToolsForAgent(specialization, { hasGitHub, hasRailway });

  // Initialize workflow if agent has one
  const workflowCtx = await initWorkflow(ctx.prisma, ctx.runId, agent);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(task, agent, workflowCtx);

  await publishLog(ctx, 'system', `Starting agent "${agent.name}" (${specialization?.name || 'general'}) with ${tools.length} tools`);

  // Initialize conversation
  const messages: LLMMessage[] = [
    {
      role: 'user',
      content: buildInitialUserMessage(task),
    },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let loopCount = 0;

  try {
    // Tool-calling loop
    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      const response = await ctx.llmClient.chat({
        model: agent.model,
        systemPrompt,
        messages,
        tools,
        maxTokens: agent.maxTokens,
        temperature: agent.temperature,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Process text blocks in the response
      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          await publishLog(ctx, 'assistant', block.text);

          // Track workflow step markers in the output
          if (workflowCtx) {
            await processWorkflowOutput(ctx.prisma, workflowCtx, block.text);
          }
        }
      }

      // Check if we need to execute tools
      const toolCalls = extractToolCalls(response.content);

      if (response.stop_reason === 'end_turn' || toolCalls.length === 0) {
        // Agent is done
        break;
      }

      // Add assistant message with tool_use blocks
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Execute each tool call and collect results
      const toolResults: LLMContentBlock[] = [];
      for (const toolCall of toolCalls) {
        await publishLog(ctx, 'tool', `Calling tool: ${toolCall.name}(${JSON.stringify(toolCall.input)})`);

        const result = await executeTool(
          toolCall.name,
          toolCall.input,
          ctx.sandbox,
          {
            prisma: ctx.prisma,
            taskId: ctx.taskId,
            projectId: task.project?.id || null,
            userId: ctx.userId,
            agentId: agent.id,
            agentName: agent.name,
          }
        );

        await publishLog(ctx, 'tool', `Tool result (${toolCall.name}): ${result.slice(0, 500)}${result.length > 500 ? '...' : ''}`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result,
        });
      }

      // Add tool results as user message
      messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    if (loopCount >= MAX_TOOL_LOOPS) {
      await publishLog(ctx, 'system', `Agent reached max tool loop limit (${MAX_TOOL_LOOPS})`);
    }

    // Finalize workflow
    if (workflowCtx) {
      await finalizeWorkflow(ctx.prisma, workflowCtx, 'COMPLETED');
    }
  } catch (err) {
    // Finalize workflow on failure
    if (workflowCtx) {
      await finalizeWorkflow(ctx.prisma, workflowCtx, 'FAILED');
    }
    throw err;
  }

  // Calculate cost (rough estimate: $3/MTok input, $15/MTok output for Sonnet)
  const inputCost = (totalInputTokens / 1_000_000) * 3;
  const outputCost = (totalOutputTokens / 1_000_000) * 15;

  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalCost = inputCost + outputCost;

  await publishLog(ctx, 'system', `Agent finished. Tokens: ${totalTokens}, Cost: $${totalCost.toFixed(4)}`);

  return { totalTokens, totalCost };
}

function buildSystemPrompt(
  task: TaskContext['task'],
  agent: NonNullable<TaskContext['task']['assignee']>,
  workflowCtx: Awaited<ReturnType<typeof initWorkflow>>
): string {
  const parts: string[] = [];

  // Specialization system prompt (role context)
  if (agent.specialization?.systemPrompt) {
    parts.push(agent.specialization.systemPrompt);
  }

  // Agent-level system prompt (custom instructions)
  if (agent.systemPrompt) {
    parts.push(agent.systemPrompt);
  }

  // Fallback identity if neither specialization nor agent has a system prompt
  if (!agent.specialization?.systemPrompt && !agent.systemPrompt) {
    parts.push(`You are ${agent.name}, a ${agent.specialization?.name || 'general'} AI agent on the Swarmit platform.`);
    parts.push('Complete the assigned task to the best of your ability using the tools provided.');
  }

  // Skills context
  if (agent.skills.length > 0) {
    parts.push('');
    parts.push('## Your Skills');
    for (const { skill } of agent.skills) {
      parts.push(`- **${skill.name}**: ${skill.description || 'No description'}`);
    }
  }

  // Project context
  if (task.project) {
    const p = task.project;
    parts.push('');
    parts.push('## Project Context');
    parts.push(`Project: ${p.title}`);
    if (p.projectType) parts.push(`Type: ${p.projectType}`);
    if (p.goal) parts.push(`Goal: ${p.goal}`);
    if (p.description) parts.push(`Description: ${p.description}`);
    if (p.targetUsers) parts.push(`Target Users: ${p.targetUsers}`);
    if (p.mustHaves.length > 0) parts.push(`Must-Have Features: ${p.mustHaves.join(', ')}`);
    if (p.niceToHaves.length > 0) parts.push(`Nice-to-Have Features: ${p.niceToHaves.join(', ')}`);
    if (p.deadline) parts.push(`Deadline: ${new Date(p.deadline).toLocaleDateString()}`);
    if (p.budgetRange) parts.push(`Budget: ${p.budgetRange}`);
    if (p.constraints) parts.push(`Constraints: ${p.constraints}`);
    if (p.dataSensitivity) parts.push(`Data Sensitivity: ${p.dataSensitivity}`);
    if (p.referenceLinks.length > 0) parts.push(`References: ${p.referenceLinks.join(', ')}`);
    if (p.prd) {
      parts.push('');
      parts.push('### Product Requirements Document');
      parts.push(p.prd);
    }
  }

  // Workflow instructions
  if (workflowCtx) {
    parts.push('');
    parts.push(getWorkflowPrompt(workflowCtx, task.project ? {
      title: task.project.title,
      goal: task.project.goal,
      mustHaves: task.project.mustHaves,
      constraints: task.project.constraints,
      targetUsers: task.project.targetUsers,
    } : undefined));
  }

  return parts.join('\n');
}

function buildInitialUserMessage(task: TaskContext['task']): string {
  const parts: string[] = [];

  parts.push(`## Task: ${task.title}`);
  if (task.description) {
    parts.push('');
    parts.push(task.description);
  }

  parts.push('');
  parts.push(`Priority: ${task.priority}`);
  parts.push(`Status: ${task.status}`);

  // Include recent comments as context
  if (task.comments.length > 0) {
    parts.push('');
    parts.push('## Recent Comments');
    for (const comment of task.comments.slice(-15)) {
      parts.push(`**${comment.author}** (${comment.createdAt.toISOString()}): ${comment.content}`);
    }
  }

  parts.push('');
  parts.push('Please complete this task. Use the available tools to read, write, and execute code in the sandbox.');
  parts.push('');
  parts.push('If your work is complete and the task needs review or further work by another agent, use the handoff_to_agent or request_review tool to pass it along with context about what you did.');

  return parts.join('\n');
}

async function publishLog(ctx: ExecutorContext, stream: string, content: string): Promise<void> {
  await ctx.prisma.taskLog.create({
    data: {
      runId: ctx.runId,
      stream: stream as 'stdout' | 'stderr' | 'system' | 'tool' | 'assistant',
      content,
    },
  });

  await ctx.redis.publish(
    'task-logs',
    JSON.stringify({ taskId: ctx.taskId, runId: ctx.runId, stream, content })
  );
}
