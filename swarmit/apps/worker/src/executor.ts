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
    project: { id: string; title: string; description: string | null; prd: string | null } | null;
    comments: Array<{ author: string; content: string; createdAt: Date }>;
    assignee: {
      id: string;
      name: string;
      specialization: string | null;
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
  const tools = getToolsForAgent(specialization);

  // Initialize workflow if agent has one
  const workflowCtx = await initWorkflow(ctx.prisma, ctx.runId, agent);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(task, agent, workflowCtx);

  await publishLog(ctx, 'system', `Starting agent "${agent.name}" (${specialization || 'general'}) with ${tools.length} tools`);

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

  // Agent identity
  if (agent.systemPrompt) {
    parts.push(agent.systemPrompt);
  } else {
    parts.push(`You are ${agent.name}, a ${agent.specialization || 'general'} AI agent on the Swarmit platform.`);
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
    parts.push('');
    parts.push('## Project Context');
    parts.push(`Project: ${task.project.title}`);
    if (task.project.description) parts.push(`Description: ${task.project.description}`);
    if (task.project.prd) {
      parts.push('');
      parts.push('### Product Requirements Document');
      parts.push(task.project.prd);
    }
  }

  // Workflow instructions
  if (workflowCtx) {
    parts.push('');
    parts.push(getWorkflowPrompt(workflowCtx));
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
    for (const comment of task.comments.slice(-10)) {
      parts.push(`**${comment.author}** (${comment.createdAt.toISOString()}): ${comment.content}`);
    }
  }

  parts.push('');
  parts.push('Please complete this task. Use the available tools to read, write, and execute code in the sandbox.');

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
