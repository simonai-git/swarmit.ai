import { v4 as uuidv4 } from 'uuid';
import pool, { getTask, getProject, getCommentsByTaskId, updateTask, updateProject, createTask, createComment, Task, Project, getWorkspaceSnapshot, saveWorkspaceSnapshot, deleteWorkspaceSnapshot, claimTaskRun, releaseTaskRun, getUserGitHubToken, getTaskDependents, recalculateBlockedStatus, completeProject, addTaskDependency, getTasksByProjectId, getAgentByName, getAgentSkillContents } from './db';
import { runAgent, AgentContext, calculateCost, AGENT_PROMPTS, getUserClaudeKey } from './claude';
import { SandboxToolExecutor } from './sandbox-executor';
import { cleanupTaskVolume } from './sandbox';
import { getQueue, QueueJob, RedisQueue } from './redis-queue';
import { taskLogBuffer } from './task-log-buffer';
import { pushToGitHub } from './github';
import { deployToRailway } from './railway-deploy';
import { searchAgentMemory, addAgentMemory } from './supermemory';

/**
 * When an agent succeeds without calling task_complete, determine the
 * default next status based on the agent type and current task status.
 * Returns null if no automatic progression applies.
 */
export function getDefaultNextStatus(agentType: string, currentStatus: string): Task['status'] | null {
  if (agentType === 'qa' && currentStatus === 'testing') return 'in_review';
  if (agentType === 'reviewer' && currentStatus === 'in_review') return 'done';
  if (agentType === 'developer' && ['todo', 'in_progress'].includes(currentStatus)) return 'testing';
  return null;
}

/**
 * Determine the agent type needed for a given task status.
 * Returns null if no agent should be auto-spawned for this status.
 */
function getAgentTypeForNewStatus(status: string): 'developer' | 'qa' | 'reviewer' | null {
  switch (status) {
    case 'testing': return 'qa';
    case 'in_review': return 'reviewer';
    default: return null; // 'done', 'todo', 'in_progress' — no auto-spawn
  }
}

// Legacy interfaces for backward compatibility
export interface AgentJob {
  id: string;
  taskId: string;
  agentType: 'developer' | 'qa' | 'reviewer' | 'pm' | 'devops' | 'product_manager';
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  tenantId?: string; // Tenant/user scope for multi-tenancy
  userEmail?: string; // User email to fetch their Claude API key
}

export interface AgentRun {
  id: string;
  jobId: string;
  taskId: string;
  agentType: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  transcript: Array<{ role: string; content: string; timestamp: Date }>;
  error?: string;
}

// Job timeout for in-memory queue (matches Redis jobTimeoutMs)
const JOB_TIMEOUT_MS = 600000; // 10 minutes

// Queue configuration
const CONFIG = {
  maxConcurrent: 3,
  pollIntervalMs: 5000,
  maxRetries: 3,
  retryDelayMs: 10000,
  dailyBudgetCents: parseInt(process.env.DAILY_BUDGET_CENTS || '1000'),
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
  defaultTenantId: process.env.DEFAULT_TENANT_ID || 'default',
};

// Alert types
type AlertType = 'budget_warning' | 'budget_exceeded' | 'agent_failed' | 'agent_retry';

// Send alert notification
async function sendAlert(type: AlertType, message: string, metadata?: Record<string, unknown>): Promise<void> {
  console.log(`[ALERT] ${type}: ${message}`, metadata);
  
  if (CONFIG.alertWebhookUrl) {
    try {
      await fetch(CONFIG.alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message, metadata, timestamp: new Date().toISOString() }),
      });
    } catch (error) {
      console.error('Failed to send alert webhook:', error);
    }
  }
}

// Check daily budget
async function checkBudget(): Promise<{ allowed: boolean; remaining: number; spent: number }> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(cost_cents), 0) as total FROM agent_runs WHERE started_at >= CURRENT_DATE`
  );
  const spent = parseInt(result.rows[0].total) || 0;
  const remaining = CONFIG.dailyBudgetCents - spent;
  
  if (remaining > 0 && remaining < CONFIG.dailyBudgetCents * 0.2) {
    await sendAlert('budget_warning', `Daily budget 80% used: $${(spent / 100).toFixed(2)} of $${(CONFIG.dailyBudgetCents / 100).toFixed(2)}`, {
      spent, remaining, limit: CONFIG.dailyBudgetCents,
    });
  }
  
  return { allowed: remaining > 0, remaining: Math.max(0, remaining), spent };
}

// Convert QueueJob to legacy AgentJob
function queueJobToAgentJob(qj: QueueJob): AgentJob {
  return {
    id: qj.id,
    taskId: qj.taskId,
    agentType: qj.agentType,
    priority: qj.priority,
    status: qj.status,
    createdAt: new Date(qj.createdAt),
    startedAt: qj.startedAt ? new Date(qj.startedAt) : undefined,
    completedAt: qj.completedAt ? new Date(qj.completedAt) : undefined,
    error: qj.error,
    retryCount: qj.retryCount,
    tenantId: qj.tenantId,
    userEmail: qj.userEmail,
  };
}

// Redis-backed Agent Queue with backward-compatible interface
class AgentQueue {
  private redisQueue: RedisQueue | null = null;
  private jobs: AgentJob[] = [];  // In-memory fallback storage
  private running: Map<string, AgentRun> = new Map();
  private isProcessing = false;
  private processInterval: NodeJS.Timeout | null = null;
  private useRedis: boolean;
  private redisHealthy: boolean = true; // Track Redis health for fallback
  private lastRedisError: number = 0;   // Timestamp of last Redis failure
  private static readonly REDIS_RETRY_INTERVAL_MS = 60000; // Retry Redis after 60s

  constructor() {
    // Use Redis if REDIS_URL is configured
    this.useRedis = !!process.env.REDIS_URL;
    if (this.useRedis) {
      console.log('[AgentQueue] Using Redis-backed queue');
      this.redisQueue = getQueue({
        maxConcurrentPerTenant: CONFIG.maxConcurrent,
        maxConcurrentGlobal: 10,
        jobTimeoutMs: 600000,
        retryDelayMs: CONFIG.retryDelayMs,
      });
    } else {
      console.log('[AgentQueue] Redis not configured, using in-memory queue');
    }
  }

  /**
   * Check if Redis should be attempted. Returns false if Redis recently failed
   * to avoid hammering a dead connection. Periodically retries to detect recovery.
   */
  private shouldUseRedis(): boolean {
    if (!this.useRedis || !this.redisQueue) return false;
    if (this.redisHealthy) return true;

    // Periodically retry to detect Redis recovery
    if (Date.now() - this.lastRedisError > AgentQueue.REDIS_RETRY_INTERVAL_MS) {
      console.log('[AgentQueue] Retrying Redis connection...');
      this.redisHealthy = true;
      return true;
    }

    return false;
  }

  /**
   * Mark Redis as unhealthy after a failure. Subsequent calls will fall back
   * to in-memory until REDIS_RETRY_INTERVAL_MS elapses.
   */
  private markRedisUnhealthy(error: unknown): void {
    if (this.redisHealthy) {
      console.error('[AgentQueue] Redis failed, falling back to in-memory queue:', error instanceof Error ? error.message : String(error));
    }
    this.redisHealthy = false;
    this.lastRedisError = Date.now();
  }

  // Enqueue a job
  async enqueue(job: { taskId: string; agentType: 'developer' | 'qa' | 'reviewer' | 'pm' | 'devops' | 'product_manager'; priority: number; tenantId?: string; userEmail?: string }): Promise<AgentJob> {
    const tenantId = job.tenantId || CONFIG.defaultTenantId;

    if (this.shouldUseRedis()) {
      try {
        const qj = await this.redisQueue!.enqueue({
          tenantId,
          taskId: job.taskId,
          agentType: job.agentType,
          priority: job.priority,
          maxRetries: CONFIG.maxRetries,
          userEmail: job.userEmail,
        });

        // Auto-start processing
        this.startProcessing();

        return queueJobToAgentJob(qj);
      } catch (error) {
        this.markRedisUnhealthy(error);
        // Fall through to in-memory
      }
    }

    // Fallback to in-memory
    // Check for duplicate
    const existing = this.jobs.find(
      j => j.taskId === job.taskId && 
           j.agentType === job.agentType && 
           ['pending', 'running'].includes(j.status)
    );
    if (existing) {
      console.log(`[AgentQueue] Duplicate job exists for task ${job.taskId}`);
      return existing;
    }

    const newJob: AgentJob = {
      id: uuidv4(),
      taskId: job.taskId,
      agentType: job.agentType,
      priority: job.priority,
      status: 'pending',
      createdAt: new Date(),
      retryCount: 0,
      tenantId: job.tenantId || CONFIG.defaultTenantId,
      userEmail: job.userEmail,
    };
    
    this.jobs.push(newJob);
    console.log(`[AgentQueue] Enqueued job ${newJob.id} for task ${job.taskId} (in-memory)`);
    this.startProcessing();
    return newJob;
  }

  // Get queue status, optionally filtered by tenantId
  async getStatus(tenantId?: string): Promise<{
    pending: number;
    running: number;
    completed: number;
    failed: number;
    jobs: AgentJob[];
    activeRuns: AgentRun[];
  }> {
    if (this.shouldUseRedis()) {
      try {
        const status = await this.redisQueue!.getStatus(tenantId);
        return {
          pending: status.pending,
          running: status.running,
          completed: 0, // Redis doesn't track completed count
          failed: 0,
          jobs: status.jobs.map(queueJobToAgentJob),
          activeRuns: Array.from(this.running.values()).filter(r => r.status === 'running'),
        };
      } catch (error) {
        this.markRedisUnhealthy(error);
        // Fall through to in-memory
      }
    }

    // In-memory status, optionally filtered by tenantId
    const filteredJobs = tenantId
      ? this.jobs.filter(j => j.tenantId === tenantId)
      : this.jobs;

    return {
      pending: filteredJobs.filter(j => j.status === 'pending').length,
      running: filteredJobs.filter(j => j.status === 'running').length,
      completed: filteredJobs.filter(j => j.status === 'completed').length,
      failed: filteredJobs.filter(j => j.status === 'failed').length,
      jobs: [...filteredJobs],
      activeRuns: Array.from(this.running.values()).filter(r => r.status === 'running'),
    };
  }

  // Get job by ID
  async getJob(jobId: string): Promise<AgentJob | undefined> {
    if (this.shouldUseRedis()) {
      try {
        const qj = await this.redisQueue!.getJob(jobId);
        return qj ? queueJobToAgentJob(qj) : undefined;
      } catch (error) {
        this.markRedisUnhealthy(error);
      }
    }
    // In-memory fallback: search local jobs
    return this.jobs.find(j => j.id === jobId);
  }

  // Get run by ID
  getRun(runId: string): AgentRun | undefined {
    return this.running.get(runId);
  }

  // Cancel a job
  async cancel(jobId: string): Promise<boolean> {
    if (this.shouldUseRedis()) {
      try {
        return await this.redisQueue!.cancel(jobId);
      } catch (error) {
        this.markRedisUnhealthy(error);
      }
    }
    // In-memory fallback: cancel local job
    const job = this.jobs.find(j => j.id === jobId);
    if (job && ['pending', 'running'].includes(job.status)) {
      job.status = 'cancelled' as AgentJob['status'];
      job.completedAt = new Date();
      return true;
    }
    return false;
  }

  // Start processing loop
  startProcessing(): void {
    if (this.processInterval) return;

    if (this.shouldUseRedis()) {
      try {
        // Use Redis queue's built-in processor
        this.redisQueue!.startProcessing(async (job) => {
          await this.executeJob(job);
        });
      } catch (error) {
        this.markRedisUnhealthy(error);
        // Fall through to in-memory processing below
      }
    }

    // Process in-memory queue
    this.processInterval = setInterval(async () => {
      // Cleanup old completed/failed jobs every poll cycle
      this.cleanup();

      if (this.isProcessing) return;
      if (this.useRedis && this.redisHealthy) return; // Redis handles its own processing when healthy

      this.isProcessing = true;
      try {
        // Get running count
        const runningCount = this.jobs.filter(j => j.status === 'running').length;
        if (runningCount >= CONFIG.maxConcurrent) return;

        // Get next pending job
        const pendingJobs = this.jobs
          .filter(j => j.status === 'pending')
          .sort((a, b) => b.priority - a.priority);

        if (pendingJobs.length === 0) return;

        const job = pendingJobs[0];
        job.status = 'running';
        job.startedAt = new Date();

        console.log(`[AgentQueue] Processing job ${job.id} for task ${job.taskId}`);

        try {
          // Convert to QueueJob format for executeJob
          const queueJob: import('./redis-queue').QueueJob = {
            id: job.id,
            tenantId: job.tenantId || CONFIG.defaultTenantId,
            taskId: job.taskId,
            agentType: job.agentType,
            priority: job.priority,
            status: 'running',
            createdAt: job.createdAt.toISOString(),
            startedAt: job.startedAt?.toISOString(),
            retryCount: job.retryCount,
            maxRetries: CONFIG.maxRetries,
            userEmail: job.userEmail,  // Include userEmail for Claude API key lookup
          };

          await this.executeJob(queueJob);
          job.status = 'completed';
          job.completedAt = new Date();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          job.error = errorMsg;
          
          if (job.retryCount < CONFIG.maxRetries) {
            job.retryCount++;
            job.status = 'pending';
            console.log(`[AgentQueue] Job ${job.id} failed, retry ${job.retryCount}/${CONFIG.maxRetries}`);
          } else {
            job.status = 'failed';
            job.completedAt = new Date();
            console.log(`[AgentQueue] Job ${job.id} failed permanently: ${errorMsg}`);
          }
        }
      } finally {
        this.isProcessing = false;
      }
    }, CONFIG.pollIntervalMs);
  }

  // Stop processing
  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    if (this.useRedis && this.redisQueue) {
      try {
        this.redisQueue.stopProcessing();
      } catch (error) {
        console.error('[AgentQueue] Error stopping Redis processing:', error);
      }
    }
  }

  // Cleanup old completed/failed jobs from in-memory storage
  cleanup(maxAgeMs: number = 3600000): void {
    if (this.useRedis && this.redisHealthy) return; // Redis handles cleanup automatically via TTL

    // Force-fail stale running jobs (no built-in timeout in in-memory queue unlike Redis)
    for (const j of this.jobs) {
      if (j.status === 'running' && j.startedAt) {
        const runningFor = Date.now() - j.startedAt.getTime();
        if (runningFor > JOB_TIMEOUT_MS) {
          console.warn(`[AgentQueue] Force-failing stale job ${j.id} for task ${j.taskId} (running ${Math.round(runningFor / 1000)}s)`);
          j.status = 'failed';
          j.error = 'Job timed out (stale)';
          j.completedAt = new Date();
        }
      }
    }

    const cutoff = Date.now() - maxAgeMs;
    const before = this.jobs.length;
    this.jobs = this.jobs.filter(j => {
      if (['completed', 'failed'].includes(j.status)) {
        const completedTime = j.completedAt?.getTime() ?? 0;
        return completedTime > cutoff;
      }
      return true; // keep pending/running
    });
    const removed = before - this.jobs.length;
    if (removed > 0) {
      console.log(`[AgentQueue] Cleaned up ${removed} old jobs`);
    }
  }

  // Execute a job (called by Redis queue processor)
  private async executeJob(queueJob: QueueJob): Promise<void> {
    const job = queueJobToAgentJob(queueJob);
    
    // Budget check disabled - no daily limit enforced
    // const budget = await checkBudget();
    // if (!budget.allowed) {
    //   await sendAlert('budget_exceeded', `Agent blocked: daily budget exceeded`, {
    //     jobId: job.id, taskId: job.taskId, spent: budget.spent, limit: CONFIG.dailyBudgetCents,
    //   });
    //   throw new Error('Daily budget exceeded');
    // }

    // Create run record
    const run: AgentRun = {
      id: uuidv4(),
      jobId: job.id,
      taskId: job.taskId,
      agentType: job.agentType,
      status: 'running',
      startedAt: new Date(),
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
      transcript: [],
    };
    this.running.set(run.id, run);

    // Persist run record first so FK constraint on tasks.current_run_id is satisfied
    await saveAgentRun(run);

    let executor: SandboxToolExecutor | null = null;

    try {
      // Atomically claim the task — prevents concurrent runs
      const claimed = await claimTaskRun(job.taskId, run.id);
      if (!claimed) {
        run.status = 'failed';
        run.error = 'Task already has an active agent run';
        run.completedAt = new Date();
        await saveAgentRun(run);
        this.running.delete(run.id);
        console.log(`[Agent] Task ${job.taskId.slice(0, 8)} already claimed, skipping run ${run.id}`);
        return;
      }

      // Load task context
      const task = await getTask(job.taskId);
      if (!task) throw new Error('Task not found');

      // Skip blocked tasks — they'll be re-enqueued when unblocked
      if (task.is_blocked) {
        console.log(`[Agent] Task ${job.taskId.slice(0, 8)} is blocked, skipping`);
        // If task was set to in_progress by a previous failed run, revert it
        if (task.status === 'in_progress') {
          await updateTask(job.taskId, { status: 'todo' });
          console.log(`[Agent] Reverted blocked task ${job.taskId.slice(0, 8)} status to 'todo'`);
        }
        run.status = 'cancelled' as AgentRun['status'];
        run.error = 'Task is blocked by dependencies';
        run.completedAt = new Date();
        await releaseTaskRun(job.taskId, run.id);
        await saveAgentRun(run);
        this.running.delete(run.id);
        return;
      }

      const project = task.project_id ? await getProject(task.project_id) : null;
      const comments = await getCommentsByTaskId(job.taskId);

      // Select prompt based on agent type (determined at enqueue time in task-lifecycle.ts)
      const effectivePrompt = AGENT_PROMPTS[job.agentType as keyof typeof AGENT_PROMPTS] || AGENT_PROMPTS.developer;

      // Build agent context
      const context: AgentContext = {
        task: task as Task,
        project,
        recentComments: comments.slice(-10),
        agentMemory: task.agent_context || '',
        agentConfig: {
          id: `config-${job.agentType}`,
          name: job.agentType.charAt(0).toUpperCase() + job.agentType.slice(1),
          specialization: job.agentType,
          systemPrompt: effectivePrompt,
          model: 'claude-sonnet-4-20250514',
          temperature: 0,
          maxTokens: 16000,
        },
      };

      // Inject assigned skill content into agent context
      {
        const agentRecord = task.assignee ? await getAgentByName(task.assignee) : null;
        if (agentRecord) {
          try {
            const skillContents = await getAgentSkillContents(agentRecord.id);
            if (skillContents.length > 0) {
              const skillsSection = skillContents
                .map(s => `### ${s.skill_name}\n${s.skill_content}`)
                .join('\n\n');
              context.agentMemory = (context.agentMemory || '') + '\n\n## Installed Skills\n' + skillsSection;
              console.log(`[Agent] Injected ${skillContents.length} skill(s) for ${task.assignee}`);
            }
          } catch (err) {
            console.warn('[Agent] Failed to load agent skills (non-blocking):', err);
          }

          // Read lessons from Supermemory for this agent
          if (process.env.SUPERMEMORY_API_KEY) {
            try {
              const memories = await searchAgentMemory(agentRecord.id, `${task.title} ${task.description || ''}`);
              if (memories) {
                context.agentMemory = (context.agentMemory || '') + '\n\n## Lessons from Previous Runs\n' + memories;
              }
            } catch (err) {
              console.warn('[Agent] Supermemory read failed (non-blocking):', err);
            }
          }
        }
      }

      // Create onOutput callback that feeds TaskLogBuffer
      const onOutput = (stream: 'stdout' | 'stderr', data: string) => {
        taskLogBuffer.append({
          task_id: job.taskId,
          run_id: run.id,
          agent_type: job.agentType,
          stream,
          content: data,
          timestamp: Date.now(),
        });
      };

      // Emit system lifecycle event
      taskLogBuffer.append({
        task_id: job.taskId,
        run_id: run.id,
        agent_type: job.agentType,
        stream: 'system',
        content: `[${job.agentType}] Agent started — creating sandbox...`,
        timestamp: Date.now(),
      });

      // Create sandbox with agent-specific toolkit
      console.log(`[Agent] Creating sandbox for task ${job.taskId} with ${job.agentType} toolkit`);
      const repoUrl = process.env.DEFAULT_REPO;
      executor = await SandboxToolExecutor.create({
        taskId: job.taskId,
        repo: repoUrl,
        branch: 'main',
        timeoutMs: 120000,
        agentType: job.agentType,
      }, onOutput);

      taskLogBuffer.append({
        task_id: job.taskId,
        run_id: run.id,
        agent_type: job.agentType,
        stream: 'system',
        content: `Sandbox ready at ${executor.getWorkdir()}`,
        timestamp: Date.now(),
      });

      // Verify sandbox has required tools
      const toolCheck = await executor.execCommand('which node && which npm');
      if (toolCheck.exitCode !== 0) {
        taskLogBuffer.append({
          task_id: job.taskId,
          run_id: run.id,
          agent_type: job.agentType,
          stream: 'system',
          content: `Warning: Some tools not found in sandbox PATH. Output: ${toolCheck.stdout || toolCheck.stderr}`,
          timestamp: Date.now(),
        });
      }

      // Restore workspace snapshot if one exists for this task
      const isDockerMode = process.env.SANDBOX_MODE === 'docker';
      // Docker mode uses named volumes for persistence, so snapshots are only needed in subprocess mode
      if (!isDockerMode) {
        try {
          const snapshot = await getWorkspaceSnapshot(job.taskId);
          if (snapshot) {
            taskLogBuffer.append({
              task_id: job.taskId,
              run_id: run.id,
              agent_type: job.agentType,
              stream: 'system',
              content: `Restoring workspace snapshot (${(snapshot.size_bytes / 1024).toFixed(0)}KB, ${snapshot.file_count} files)...`,
              timestamp: Date.now(),
            });
            await executor.getSandbox().restoreSnapshot(snapshot.snapshot);
            taskLogBuffer.append({
              task_id: job.taskId,
              run_id: run.id,
              agent_type: job.agentType,
              stream: 'system',
              content: 'Workspace restored successfully',
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.error('[Agent] Failed to restore workspace snapshot:', err);
          taskLogBuffer.append({
            task_id: job.taskId,
            run_id: run.id,
            agent_type: job.agentType,
            stream: 'system',
            content: `Warning: Failed to restore workspace snapshot: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: Date.now(),
          });
        }
      }

      run.transcript.push({
        role: 'system',
        content: `Sandbox created at ${executor.getWorkdir()}`,
        timestamp: new Date(),
      });

      // Task API
      const taskApi = {
        updateTask: async (taskId: string, updates: Partial<Task>) => {
          await updateTask(taskId, updates);
        },
        addComment: async (taskId: string, author: string, content: string) => {
          await createComment({ id: uuidv4(), task_id: taskId, author, content });
        },
        createTask: async (params: { title: string; description: string; assignee: string; priority: string; projectId: string; userEmail: string | null }) => {
          // Dedup: if a task with the same title already exists in this project, return its ID
          const existing = await getTasksByProjectId(params.projectId);
          const dup = existing.find(t => t.title === params.title);
          if (dup) {
            console.log(`[Agent] PM skipped duplicate task "${params.title}" (exists: ${dup.id.slice(0, 8)})`);
            return { id: dup.id };
          }

          const id = uuidv4();
          await createTask({
            id,
            title: params.title,
            description: params.description,
            assignee: params.assignee,
            priority: (params.priority as 'low' | 'medium' | 'high') || 'medium',
            status: 'todo',
            project_id: params.projectId,
            user_email: params.userEmail,
            is_blocked: true,
            blocked_reason: 'Waiting on: PM plan finalization',
          });
          console.log(`[Agent] PM created task ${id.slice(0, 8)}: "${params.title}" (assigned to ${params.assignee}, blocked until plan finalized)`);
          return { id };
        },
        addDependency: async (taskId: string, dependsOnId: string) => {
          await addTaskDependency(taskId, dependsOnId);
          console.log(`[Agent] PM added dependency: ${taskId.slice(0, 8)} depends on ${dependsOnId.slice(0, 8)}`);
        },
        listProjectTasks: async (projectId: string) => {
          const tasks = await getTasksByProjectId(projectId);
          return tasks.map(t => ({ id: t.id, title: t.title, status: t.status, assignee: t.assignee }));
        },
        updateProject: async (projectId: string, updates: Partial<Project>) => {
          await updateProject(projectId, updates);
        },
      };

      // Get user's Claude API key if available
      let userApiKey: string | undefined;
      if (job.userEmail) {
        userApiKey = await getUserClaudeKey(job.userEmail) || undefined;
        console.log(`[Agent] Using ${userApiKey ? 'user' : 'env'} API key for task ${job.taskId}`);
      }

      // Run agent
      console.log(`[Agent] Running ${job.agentType} agent for task ${job.taskId}`);
      const result = await runAgent(context, executor, taskApi, {
        maxIterations: 75,
        apiKey: userApiKey, // Pass user's API key
        onToolUse: (tool, input) => {
          run.transcript.push({
            role: 'tool',
            content: `${tool}: ${JSON.stringify(input).slice(0, 200)}`,
            timestamp: new Date(),
          });
          taskLogBuffer.append({
            task_id: job.taskId,
            run_id: run.id,
            agent_type: job.agentType,
            stream: 'tool',
            content: `[${tool}] ${JSON.stringify(input).slice(0, 500)}`,
            timestamp: Date.now(),
          });
        },
        onMessage: (content) => {
          run.transcript.push({
            role: 'assistant',
            content: content.slice(0, 500),
            timestamp: new Date(),
          });
          taskLogBuffer.append({
            task_id: job.taskId,
            run_id: run.id,
            agent_type: job.agentType,
            stream: 'assistant',
            content: content.slice(0, 1000),
            timestamp: Date.now(),
          });
        },
      });

      // Update metrics
      run.inputTokens = result.inputTokens;
      run.outputTokens = result.outputTokens;
      run.costCents = calculateCost(result.inputTokens, result.outputTokens, 'claude-sonnet-4-20250514');
      run.status = 'completed';
      run.completedAt = new Date();

      // Determine the new status
      let newStatus: Task['status'] | undefined = result.nextStatus;
      if (result.success && !newStatus) {
        const currentTask = await getTask(job.taskId);
        if (currentTask && currentTask.status === task.status) {
          newStatus = getDefaultNextStatus(job.agentType, task.status) || undefined;
          if (newStatus) {
            console.log(`[Agent] Auto-progressing task ${job.taskId.slice(0, 8)}: ${task.status} → ${newStatus}`);
          }
        }
      }

      // Status progression
      if (result.success && newStatus) {
        await updateTask(job.taskId, { status: newStatus });

        // When task advances (done/testing/in_review), unblock dependent tasks and auto-enqueue agents
        if (newStatus && ['done', 'testing', 'in_review'].includes(newStatus)) {
          try {
            const dependents = await getTaskDependents(job.taskId);
            for (const dep of dependents) {
              await recalculateBlockedStatus(dep.task_id);
              // If the dependent task was just unblocked, enqueue an agent for it
              const depTask = await getTask(dep.task_id);
              if (depTask && !depTask.is_blocked && depTask.status === 'todo') {
                const { onTaskCreated } = await import('./task-lifecycle');
                await onTaskCreated(depTask, job.userEmail);
                console.log(`[Agent] Task ${dep.task_id.slice(0, 8)} unblocked → enqueued agent`);
              }
            }
          } catch (err) {
            console.warn(`[Agent] Failed to recalculate blocked status for dependents:`, err);
          }

          // If this is a PM planning task, validate that tasks were actually created
          if (task.title.startsWith('[PM] Plan:') && task.project_id) {
            try {
              const projectTasks = await getTasksByProjectId(task.project_id);
              // Exclude PM plan and PRD tasks from the count
              const createdTasks = projectTasks.filter(t => t.id !== job.taskId && !t.title.startsWith('[PRD]') && !t.title.startsWith('[PM] Plan:'));
              if (createdTasks.length < 2) {
                console.error(`[Agent] PM plan task completed but only created ${createdTasks.length} tasks (expected >= 2). PM tools may not have been available.`);
                taskLogBuffer.append({
                  task_id: job.taskId,
                  run_id: run.id,
                  agent_type: job.agentType,
                  stream: 'system',
                  content: `WARNING: PM agent completed but only created ${createdTasks.length} tasks. The plan may be incomplete.`,
                  timestamp: Date.now(),
                });
              } else {
                console.log(`[Agent] PM plan created ${createdTasks.length} tasks for project ${task.project_id}`);
              }
              // Validate that a [PM] Verify task was created
              const hasVerifyTask = projectTasks.some(t => t.title.startsWith('[PM] Verify:'));
              if (!hasVerifyTask) {
                console.error(`[Agent] PM plan completed but no [PM] Verify task was created for project ${task.project_id}`);
                taskLogBuffer.append({
                  task_id: job.taskId,
                  run_id: run.id,
                  agent_type: job.agentType,
                  stream: 'system',
                  content: `WARNING: No [PM] Verify task was created. The project will not auto-complete.`,
                  timestamp: Date.now(),
                });
              }

              // Unblock and enqueue root tasks now that PM plan is finalized
              for (const ct of createdTasks) {
                await recalculateBlockedStatus(ct.id);
                const refreshed = await getTask(ct.id);
                if (refreshed && !refreshed.is_blocked && refreshed.status === 'todo') {
                  const { onTaskCreated } = await import('./task-lifecycle');
                  await onTaskCreated(refreshed, job.userEmail);
                  console.log(`[Agent] Root task ${ct.id.slice(0, 8)} unblocked → enqueued agent`);
                }
              }
            } catch (err) {
              console.warn(`[Agent] Failed to validate PM plan task count:`, err);
            }
          }

          // If this is a PM verification task, complete the project
          if (task.title.startsWith('[PM] Verify:') && task.project_id) {
            try {
              // Check if all project tasks are done before completing
              const allProjectTasks = await getTasksByProjectId(task.project_id);
              const incompleteTasks = allProjectTasks.filter(t => t.id !== job.taskId && t.status !== 'done');
              if (incompleteTasks.length > 0) {
                console.warn(`[Agent] Project ${task.project_id} has ${incompleteTasks.length} incomplete tasks, NOT completing: ${incompleteTasks.map(t => t.title).join(', ')}`);
                taskLogBuffer.append({
                  task_id: job.taskId,
                  run_id: run.id,
                  agent_type: job.agentType,
                  stream: 'system',
                  content: `WARNING: ${incompleteTasks.length} tasks still incomplete. Project NOT completed — needs manual review.`,
                  timestamp: Date.now(),
                });
              } else {
                await completeProject(task.project_id);
                console.log(`[Agent] Project ${task.project_id} marked as completed`);
                taskLogBuffer.append({
                  task_id: job.taskId,
                  run_id: run.id,
                  agent_type: job.agentType,
                  stream: 'system',
                  content: `Project completed! All tasks verified.`,
                  timestamp: Date.now(),
                });
              }
            } catch (err) {
              console.warn(`[Agent] Failed to complete project:`, err);
            }
          }

          // If this is a PRD task, auto-create the PM Plan task for the Project Manager
          if (task.title.startsWith('[PRD]') && task.project_id) {
            try {
              const project = await getProject(task.project_id);
              if (project && project.prd) {
                // Dedup: check if PM Plan task already exists for this project
                const existingTasks = await getTasksByProjectId(task.project_id);
                const pmPlanTitle = `[PM] Plan: ${project.title}`;
                const existingPmPlan = existingTasks.find(t => t.title === pmPlanTitle);
                if (existingPmPlan) {
                  console.log(`[Agent] PM Plan task already exists (${existingPmPlan.id.slice(0, 8)}) for project ${task.project_id}, skipping creation`);
                } else {
                  const pmPlanTaskId = uuidv4();
                  const pmPlanTask = await createTask({
                    id: pmPlanTaskId,
                    title: pmPlanTitle,
                    description: `Create all tasks needed to deliver: ${project.title}\n\nRefer to the PRD in the project context for detailed requirements.`,
                    status: 'todo',
                    assignee: project.project_manager || 'Taylor',
                    priority: 'high',
                    project_id: task.project_id,
                    user_email: task.user_email,
                  });
                  // Trigger lifecycle to enqueue PM agent
                  const { onTaskCreated } = await import('./task-lifecycle');
                  await onTaskCreated(pmPlanTask, task.user_email || undefined);
                  console.log(`[Agent] PRD complete → created PM Plan task ${pmPlanTaskId.slice(0, 8)} for project ${task.project_id}`);
                  taskLogBuffer.append({
                    task_id: job.taskId,
                    run_id: run.id,
                    agent_type: job.agentType,
                    stream: 'system',
                    content: `PRD saved. Created PM Plan task for Project Manager (${project.project_manager || 'Taylor'}).`,
                    timestamp: Date.now(),
                  });
                }
              } else {
                console.warn(`[Agent] PRD task completed but no PRD content found in project ${task.project_id}`);
                taskLogBuffer.append({
                  task_id: job.taskId,
                  run_id: run.id,
                  agent_type: job.agentType,
                  stream: 'system',
                  content: `WARNING: PRD task completed but no PRD content was saved to the project.`,
                  timestamp: Date.now(),
                });
              }
            } catch (err) {
              console.warn(`[Agent] Failed to create PM Plan task after PRD:`, err);
            }
          }
        }
      }

      // Safety: warn if agent succeeded but task status didn't change
      if (result.success) {
        const finalTask = await getTask(job.taskId);
        if (finalTask && finalTask.status === task.status) {
          console.warn(`[Agent] WARNING: Task ${job.taskId.slice(0, 8)} status unchanged after successful ${job.agentType} run (still '${task.status}')`);
        }
      }

      // Immediately enqueue the next agent for the new status
      if (result.success) {
        try {
          const updatedTask = await getTask(job.taskId);
          if (updatedTask && updatedTask.status !== task.status) {
            const nextAgentType = getAgentTypeForNewStatus(updatedTask.status);
            if (nextAgentType) {
              const priority = job.priority;
              console.log(`[Agent] Immediately enqueuing ${nextAgentType} agent for task ${job.taskId.slice(0, 8)} (status: ${updatedTask.status})`);
              await this.enqueue({
                taskId: job.taskId,
                agentType: nextAgentType,
                priority,
                tenantId: job.tenantId,
                userEmail: job.userEmail,
              });
            }
          }
        } catch (err) {
          console.error(`[Agent] Failed to enqueue next agent for task ${job.taskId.slice(0, 8)}:`, err);
          // Non-fatal: scheduler will catch it eventually
        }
      }

      // Add completion comment
      if (result.success) {
        await createComment({
          id: uuidv4(),
          task_id: job.taskId,
          author: context.agentConfig?.name || 'Agent',
          content: `✅ ${result.summary}\n\nFiles changed: ${result.filesChanged.join(', ') || 'none'}`,
        });
      }

      // Save lessons to Supermemory
      if (result.success && process.env.SUPERMEMORY_API_KEY) {
        const agentRecord = task.assignee ? await getAgentByName(task.assignee) : null;
        if (agentRecord) {
          try {
            const memContent = [
              `## Run Summary for Task: ${task.title}`,
              `Agent: ${task.assignee} (${job.agentType})`,
              `Result: ${result.summary}`,
              `Files changed: ${result.filesChanged.join(', ') || 'none'}`,
              result.error ? `Error: ${result.error}` : '',
            ].filter(Boolean).join('\n');
            await addAgentMemory(agentRecord.id, memContent, {
              taskId: task.id,
              projectId: task.project_id || '',
              agentType: job.agentType,
            });
          } catch (err) {
            console.warn('[Agent] Supermemory write failed (non-blocking):', err);
          }
        }
      }

      run.transcript.push({
        role: 'system',
        content: `Agent completed: ${result.success ? 'success' : 'failed'} - ${result.summary}`,
        timestamp: new Date(),
      });

      taskLogBuffer.append({
        task_id: job.taskId,
        run_id: run.id,
        agent_type: job.agentType,
        stream: 'system',
        content: `[${job.agentType}] Agent ${result.success ? 'completed successfully' : 'failed: ' + (result.error || 'unknown error')}`,
        timestamp: Date.now(),
      });

      // Save workspace snapshot on ALL runs (not just successful ones)
      // Even failed runs may have created useful files for the next attempt
      // Docker mode uses named volumes for persistence, so snapshots are only needed in subprocess mode
      if (!isDockerMode) {
        try {
          const fileList = await executor.listFiles('.');
          if (fileList.length > 0) {
            const snapshotData = await executor.getSandbox().saveSnapshot();
            if (snapshotData.length <= 10 * 1024 * 1024) {
              await saveWorkspaceSnapshot(job.taskId, run.id, job.agentType, snapshotData, fileList.length, snapshotData.length);
              taskLogBuffer.append({
                task_id: job.taskId,
                run_id: run.id,
                agent_type: job.agentType,
                stream: 'system',
                content: `Workspace snapshot saved (${(snapshotData.length / 1024).toFixed(0)}KB, ${fileList.length} files)`,
                timestamp: Date.now(),
              });
            } else {
              taskLogBuffer.append({
                task_id: job.taskId,
                run_id: run.id,
                agent_type: job.agentType,
                stream: 'system',
                content: `Workspace snapshot too large (${(snapshotData.length / 1024 / 1024).toFixed(1)}MB), skipped`,
                timestamp: Date.now(),
              });
            }
          }
        } catch (err) {
          console.error('[Agent] Failed to save workspace snapshot:', err);
          taskLogBuffer.append({
            task_id: job.taskId,
            run_id: run.id,
            agent_type: job.agentType,
            stream: 'system',
            content: `Warning: Failed to save workspace snapshot: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: Date.now(),
          });
        }
      }

      // Push to GitHub only on success
      let repoName: string | null = null;
      if (result.success) {
        try {
          repoName = await pushToGitHub(job, task, executor);
          if (repoName) {
            taskLogBuffer.append({
              task_id: job.taskId,
              run_id: run.id,
              agent_type: job.agentType,
              stream: 'system',
              content: `Pushed to GitHub: ${repoName}`,
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.error('[Agent] Failed to push to GitHub:', err);
          taskLogBuffer.append({
            task_id: job.taskId,
            run_id: run.id,
            agent_type: job.agentType,
            stream: 'system',
            content: `GitHub push failed: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: Date.now(),
          });
        }
      }

      // Deploy to Railway for devops-assigned tasks after successful GitHub push
      if (result.success && repoName && task.assignee === 'Jordan') {
        try {
          const railwayResult = await deployToRailway(job.userEmail || '', repoName, job.taskId, task.title);
          if (railwayResult) {
            taskLogBuffer.append({
              task_id: job.taskId,
              run_id: run.id,
              agent_type: job.agentType,
              stream: 'system',
              content: `Deployed to Railway: ${railwayResult.url}`,
              timestamp: Date.now(),
            });
            await createComment({ id: uuidv4(), task_id: job.taskId, author: 'system', content: `Railway deployment: ${railwayResult.url}` });
          }
        } catch (err) {
          console.warn('[Agent] Railway deploy failed (non-blocking):', err);
          taskLogBuffer.append({
            task_id: job.taskId,
            run_id: run.id,
            agent_type: job.agentType,
            stream: 'system',
            content: `Railway deploy failed: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: Date.now(),
          });
        }
      }

      if (!result.success) {
        throw new Error(result.error || 'Agent failed');
      }

    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error ? error.message : String(error);
      run.completedAt = new Date();

      // Revert task status to 'todo' if agent changed it during this run
      try {
        const currentTask = await getTask(job.taskId);
        if (currentTask && currentTask.status === 'in_progress') {
          await updateTask(job.taskId, { status: 'todo' });
          console.log(`[Agent] Reverted task ${job.taskId.slice(0, 8)} status to 'todo' after failure`);
        }
      } catch (revertErr) {
        console.warn(`[Agent] Failed to revert task status after failure:`, revertErr);
      }

      taskLogBuffer.append({
        task_id: job.taskId,
        run_id: run.id,
        agent_type: job.agentType,
        stream: 'system',
        content: `[${job.agentType}] Agent error: ${run.error}`,
        timestamp: Date.now(),
      });

      throw error;
    } finally {
      // Release the task claim so other runs can proceed
      await releaseTaskRun(job.taskId, run.id);

      // Cleanup sandbox
      if (executor) {
        await executor.cleanup();
      }

      taskLogBuffer.append({
        task_id: job.taskId,
        run_id: run.id,
        agent_type: job.agentType,
        stream: 'system',
        content: 'Sandbox cleaned up',
        timestamp: Date.now(),
      });
      // Save run to database
      await saveAgentRun(run);
      // Flush all pending logs to DB so they're visible in the modal
      await taskLogBuffer.flushAsync();
      taskLogBuffer.clearTask(job.taskId);
      // Clean up immediately — DB is now the source of truth for active runs
      this.running.delete(run.id);
    }
  }
}

// Singleton
export const agentQueue = new AgentQueue();

// Database operations for agent runs
export async function saveAgentRun(run: AgentRun): Promise<void> {
  await pool.query(
    `INSERT INTO agent_runs (id, task_id, agent_type, status, started_at, completed_at, 
                             input_tokens, output_tokens, cost_cents, error, transcript)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       status = $4, completed_at = $6, input_tokens = $7, output_tokens = $8,
       cost_cents = $9, error = $10, transcript = $11`,
    [run.id, run.taskId, run.agentType, run.status, run.startedAt, run.completedAt,
     run.inputTokens, run.outputTokens, run.costCents, run.error, JSON.stringify(run.transcript)]
  );
}

export async function getAgentRuns(taskId: string): Promise<AgentRun[]> {
  const result = await pool.query(
    `SELECT * FROM agent_runs WHERE task_id = $1 ORDER BY started_at DESC`,
    [taskId]
  );
  return result.rows.map(row => ({ ...row, transcript: row.transcript || [] }));
}

export async function getAgentRun(runId: string): Promise<AgentRun | null> {
  const result = await pool.query(`SELECT * FROM agent_runs WHERE id = $1`, [runId]);
  if (result.rows.length === 0) return null;
  return { ...result.rows[0], transcript: result.rows[0].transcript || [] };
}

// Cost tracking
export async function getTodaySpend(): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(cost_cents), 0) as total FROM agent_runs WHERE started_at >= CURRENT_DATE`
  );
  return result.rows[0].total;
}

export async function getSpendByPeriod(startDate: Date, endDate: Date): Promise<{
  total: number;
  byAgent: Record<string, number>;
  byDay: Array<{ date: string; total: number }>;
}> {
  const [totalResult, byAgentResult, byDayResult] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(cost_cents), 0) as total FROM agent_runs WHERE started_at >= $1 AND started_at < $2`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT agent_type, COALESCE(SUM(cost_cents), 0) as total FROM agent_runs 
       WHERE started_at >= $1 AND started_at < $2 GROUP BY agent_type`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT DATE(started_at) as date, COALESCE(SUM(cost_cents), 0) as total FROM agent_runs 
       WHERE started_at >= $1 AND started_at < $2 GROUP BY DATE(started_at) ORDER BY date`,
      [startDate, endDate]
    ),
  ]);

  return {
    total: totalResult.rows[0].total,
    byAgent: Object.fromEntries(byAgentResult.rows.map(r => [r.agent_type, r.total])),
    byDay: byDayResult.rows.map(r => ({ date: r.date.toISOString().split('T')[0], total: r.total })),
  };
}

/**
 * Clean up all resources associated with a task (volume + snapshot).
 * Call when a task reaches 'done' status or is deleted.
 */
export async function cleanupTaskResources(taskId: string): Promise<void> {
  try {
    await cleanupTaskVolume(taskId);
    await deleteWorkspaceSnapshot(taskId);
    console.log(`[Agent] Cleaned up resources for task ${taskId}`);
  } catch (err) {
    console.error(`[Agent] Failed to cleanup resources for task ${taskId}:`, err);
  }
}

