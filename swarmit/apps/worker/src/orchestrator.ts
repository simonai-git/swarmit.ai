import { prisma } from '@swarmit/db';
import { createLLMClient } from '@swarmit/integrations';
import { createSandbox } from '@swarmit/sandbox';
import { createLogger } from '@swarmit/logger';
import { decrypt, isEncrypted } from '@swarmit/shared';
import type { Redis } from 'ioredis';
import type { AgentJobData, LifecycleJobData } from './queues.js';
import { executeAgent } from './executor.js';

const logger = createLogger('orchestrator');

/**
 * Main agent job processor.
 * State machine: CLAIM → LOAD_CONTEXT → CREATE_SANDBOX → EXECUTE_AGENT → POST_EXECUTION
 */
export async function processAgentJob(data: AgentJobData, redis: Redis) {
  const { runId, taskId, userId } = data;

  // ── 1. CLAIM ──────────────────────────────────────────────────
  const run = await prisma.taskRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  await publishLog(redis, taskId, runId, 'system', `Agent run ${runId} started`);

  let sandbox: ReturnType<typeof createSandbox> | null = null;

  try {
    // ── 2. LOAD_CONTEXT ───────────────────────────────────────────
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        comments: { orderBy: { createdAt: 'asc' } },
        assignee: {
          include: {
            specialization: true,
            skills: { include: { skill: true } },
            agentWorkflows: {
              include: {
                workflow: {
                  include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
                },
              },
            },
          },
        },
      },
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (!task.assignee) {
      throw new Error(`Task ${taskId} has no assigned agent`);
    }

    await publishLog(redis, taskId, runId, 'system', `Loaded context for task: ${task.title}`);

    // Get user's API key — prefer OAuth token over manual key
    const anthropicToken = await prisma.integrationToken.findUnique({
      where: { userId_provider: { userId, provider: 'anthropic' } },
      select: { accessToken: true },
    });

    let apiKey: string | undefined;
    if (anthropicToken?.accessToken) {
      apiKey = isEncrypted(anthropicToken.accessToken)
        ? decrypt(anthropicToken.accessToken)
        : anthropicToken.accessToken;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { claudeApiKey: true },
      });
      apiKey = user?.claudeApiKey || process.env.ANTHROPIC_API_KEY;
      if (apiKey && isEncrypted(apiKey)) {
        apiKey = decrypt(apiKey);
      }
    }
    if (!apiKey) {
      throw new Error('No API key configured. Connect Claude via OAuth, set a key in Profile > Integrations, or configure ANTHROPIC_API_KEY.');
    }

    // ── 3. CREATE_SANDBOX ─────────────────────────────────────────
    sandbox = createSandbox({
      dockerImage: task.assignee.specialization?.dockerImage || undefined,
      specialization: task.assignee.specialization?.name || undefined,
    });
    await sandbox.init();

    await publishLog(redis, taskId, runId, 'system', 'Sandbox initialized');

    // ── 4. EXECUTE_AGENT ──────────────────────────────────────────
    const llmClient = createLLMClient(apiKey);

    const { totalTokens, totalCost } = await executeAgent(
      {
        prisma,
        llmClient,
        sandbox,
        redis,
        runId,
        taskId,
        userId,
      },
      { task }
    );

    // ── 5. POST_EXECUTION ─────────────────────────────────────────
    await prisma.taskRun.update({
      where: { id: runId },
      data: {
        status: 'SUCCESS',
        endedAt: new Date(),
        tokens: totalTokens,
        cost: totalCost,
      },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { currentRunId: null },
    });

    await publishLog(redis, taskId, runId, 'system', 'Agent run completed successfully');

    // Notify via Redis for Socket.io broadcast
    await redis.publish('task-updates', JSON.stringify({ taskId, userId }));

    // Publish notification for agent run completion
    await redis.publish('notifications', JSON.stringify({
      userId,
      type: 'AGENT_RUN_COMPLETED',
      title: 'Agent run completed',
      message: `Agent run for task ${taskId} completed successfully`,
      metadata: { taskId, runId },
    }));

  } catch (err) {
    logger.error({ err, runId, taskId }, 'Agent execution failed');

    await prisma.taskRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        endedAt: new Date(),
      },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { currentRunId: null },
    });

    await publishLog(redis, taskId, runId, 'system', `Agent run failed: ${String(err)}`);
    await redis.publish('task-updates', JSON.stringify({ taskId, userId }));

    // Publish notification for agent run failure
    await redis.publish('notifications', JSON.stringify({
      userId,
      type: 'AGENT_RUN_FAILED',
      title: 'Agent run failed',
      message: `Agent run for task ${taskId} failed: ${String(err).slice(0, 200)}`,
      metadata: { taskId, runId },
    }));

    throw err;
  } finally {
    // Always clean up sandbox
    if (sandbox) {
      try {
        await sandbox.destroy();
      } catch (err) {
        logger.error({ err }, 'Failed to destroy sandbox');
      }
    }
  }
}

/**
 * Process lifecycle events (post-execution hooks).
 */
export async function processLifecycleJob(data: LifecycleJobData, redis: Redis) {
  const { type, taskId, userId } = data;

  switch (type) {
    case 'unblock-dependents': {
      const dependents = await prisma.taskDependency.findMany({
        where: { dependsOnId: taskId },
        select: { taskId: true },
      });

      for (const dep of dependents) {
        const deps = await prisma.taskDependency.findMany({
          where: { taskId: dep.taskId },
          include: { dependsOn: { select: { status: true } } },
        });

        const isBlocked = deps.some(d => d.dependsOn.status !== 'DONE');
        await prisma.task.update({
          where: { id: dep.taskId },
          data: { isBlocked },
        });

        if (!isBlocked) {
          logger.info({ taskId: dep.taskId, unlockedBy: taskId }, 'Task unblocked');

          await redis.publish('notifications', JSON.stringify({
            userId,
            type: 'TASK_UNBLOCKED',
            title: 'Task unblocked',
            message: `A task dependency has been resolved`,
            metadata: { taskId: dep.taskId, unblockedBy: taskId },
          }));
        }
      }

      await redis.publish('task-updates', JSON.stringify({ taskId, userId }));
      break;
    }

    case 'check-project-completion': {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { projectId: true },
      });

      if (!task?.projectId) break;

      const incompleteTasks = await prisma.task.count({
        where: { projectId: task.projectId, status: { not: 'DONE' } },
      });

      if (incompleteTasks === 0) {
        await prisma.project.update({
          where: { id: task.projectId },
          data: { status: 'COMPLETED' },
        });

        await redis.publish('project-updates', JSON.stringify({ projectId: task.projectId, userId }));

        await redis.publish('notifications', JSON.stringify({
          userId,
          type: 'PROJECT_COMPLETED',
          title: 'Project completed',
          message: 'All tasks in the project are done',
          metadata: { projectId: task.projectId },
        }));

        logger.info({ projectId: task.projectId }, 'Project auto-completed — all tasks done');
      }
      break;
    }

    case 'auto-spawn-agent': {
      const agentId = data.agentId;
      if (!agentId) {
        logger.warn({ userId, taskId }, 'No agentId provided for auto-spawn');
        break;
      }

      const agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
        include: { specialization: true },
      });

      if (!agent) {
        logger.warn({ userId, agentId }, 'No agent found for auto-spawn');
        break;
      }

      // Assign agent and create run
      await prisma.task.update({
        where: { id: taskId },
        data: { assigneeId: agent.id },
      });

      const run = await prisma.taskRun.create({
        data: {
          taskId,
          agentType: agent.specialization?.name || 'general',
          status: 'QUEUED',
        },
      });

      await prisma.task.update({
        where: { id: taskId },
        data: { currentRunId: run.id },
      });

      logger.info({ taskId, agentId: agent.id, runId: run.id }, 'Auto-spawn agent run created');
      break;
    }

    default:
      logger.warn({ type }, 'Unknown lifecycle job type');
  }
}

async function publishLog(
  redis: Redis,
  taskId: string,
  runId: string,
  stream: string,
  content: string
) {
  await prisma.taskLog.create({
    data: { runId, stream: stream as 'stdout' | 'stderr' | 'system' | 'tool' | 'assistant', content },
  });

  await redis.publish(
    'task-logs',
    JSON.stringify({ taskId, runId, stream, content })
  );
}
