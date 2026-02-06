import { v4 as uuidv4 } from 'uuid';
import pool, { getTask, getProject, getCommentsByTaskId, updateTask, createComment, Task } from './db';
import { runAgent, AgentContext, calculateCost, AGENT_PROMPTS, getUserClaudeKey } from './claude';
import { SandboxToolExecutor } from './sandbox-executor';
import { getQueue, QueueJob, RedisQueue } from './redis-queue';

// Legacy interfaces for backward compatibility
export interface AgentJob {
  id: string;
  taskId: string;
  agentType: 'developer' | 'qa' | 'reviewer';
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
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
    userEmail: qj.userEmail,  // Include userEmail for Claude API key lookup
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

  constructor() {
    // Use Redis if REDIS_URL is configured
    this.useRedis = !!process.env.REDIS_URL;
    if (this.useRedis) {
      console.log('[AgentQueue] Using Redis-backed queue');
      this.redisQueue = getQueue({
        maxConcurrentPerTenant: CONFIG.maxConcurrent,
        maxConcurrentGlobal: 10,
        jobTimeoutMs: 300000,
        retryDelayMs: CONFIG.retryDelayMs,
      });
    } else {
      console.log('[AgentQueue] Redis not configured, using in-memory queue');
    }
  }

  // Enqueue a job
  async enqueue(job: { taskId: string; agentType: 'developer' | 'qa' | 'reviewer'; priority: number; tenantId?: string; userEmail?: string }): Promise<AgentJob> {
    const tenantId = job.tenantId || CONFIG.defaultTenantId;

    if (this.useRedis && this.redisQueue) {
      const qj = await this.redisQueue.enqueue({
        tenantId,
        taskId: job.taskId,
        agentType: job.agentType,
        priority: job.priority,
        maxRetries: CONFIG.maxRetries,
      });
      
      // Auto-start processing
      this.startProcessing();
      
      return queueJobToAgentJob(qj);
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
      userEmail: job.userEmail,
    };
    
    this.jobs.push(newJob);
    console.log(`[AgentQueue] Enqueued job ${newJob.id} for task ${job.taskId} (in-memory)`);
    this.startProcessing();
    return newJob;
  }

  // Get queue status
  async getStatus(): Promise<{
    pending: number;
    running: number;
    completed: number;
    failed: number;
    jobs: AgentJob[];
    activeRuns: AgentRun[];
  }> {
    if (this.useRedis && this.redisQueue) {
      const status = await this.redisQueue.getStatus();
      return {
        pending: status.pending,
        running: status.running,
        completed: 0, // Redis doesn't track completed count
        failed: 0,
        jobs: status.jobs.map(queueJobToAgentJob),
        activeRuns: Array.from(this.running.values()),
      };
    }

    // In-memory status
    return {
      pending: this.jobs.filter(j => j.status === 'pending').length,
      running: this.jobs.filter(j => j.status === 'running').length,
      completed: this.jobs.filter(j => j.status === 'completed').length,
      failed: this.jobs.filter(j => j.status === 'failed').length,
      jobs: [...this.jobs],
      activeRuns: Array.from(this.running.values()),
    };
  }

  // Get job by ID
  async getJob(jobId: string): Promise<AgentJob | undefined> {
    if (this.useRedis && this.redisQueue) {
      const qj = await this.redisQueue.getJob(jobId);
      return qj ? queueJobToAgentJob(qj) : undefined;
    }
    return undefined;
  }

  // Get run by ID
  getRun(runId: string): AgentRun | undefined {
    return this.running.get(runId);
  }

  // Cancel a job
  async cancel(jobId: string): Promise<boolean> {
    if (this.useRedis && this.redisQueue) {
      return this.redisQueue.cancel(jobId);
    }
    return false;
  }

  // Start processing loop
  startProcessing(): void {
    if (this.processInterval) return;

    if (this.useRedis && this.redisQueue) {
      // Use Redis queue's built-in processor
      this.redisQueue.startProcessing(async (job) => {
        await this.executeJob(job);
      });
    }

    // Process in-memory queue
    this.processInterval = setInterval(async () => {
      if (this.isProcessing) return;
      if (this.useRedis) return; // Redis handles its own processing
      
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
            tenantId: 'default',
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
      this.redisQueue.stopProcessing();
    }
  }

  // Cleanup old jobs
  cleanup(maxAgeMs: number = 86400000): void {
    // Redis handles cleanup automatically via TTL
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

    let executor: SandboxToolExecutor | null = null;

    try {
      // Load task context
      const task = await getTask(job.taskId);
      if (!task) throw new Error('Task not found');

      const project = task.project_id ? await getProject(task.project_id) : null;
      const comments = await getCommentsByTaskId(job.taskId);

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
          systemPrompt: AGENT_PROMPTS[job.agentType as keyof typeof AGENT_PROMPTS] || AGENT_PROMPTS.developer,
          model: 'claude-sonnet-4-20250514',
          temperature: 0,
          maxTokens: 8000,
        },
      };

      // Create sandbox with agent-specific toolkit
      console.log(`[Agent] Creating sandbox for task ${job.taskId} with ${job.agentType} toolkit`);
      const repoUrl = process.env.DEFAULT_REPO;
      executor = await SandboxToolExecutor.create({
        taskId: job.taskId,
        repo: repoUrl,
        branch: 'main',
        timeoutMs: 120000,
        agentType: job.agentType,
      });

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
        maxIterations: 30,
        apiKey: userApiKey, // Pass user's API key
        onToolUse: (tool, input) => {
          run.transcript.push({
            role: 'tool',
            content: `${tool}: ${JSON.stringify(input).slice(0, 200)}`,
            timestamp: new Date(),
          });
        },
        onMessage: (content) => {
          run.transcript.push({
            role: 'assistant',
            content: content.slice(0, 500),
            timestamp: new Date(),
          });
        },
      });

      // Update metrics
      run.inputTokens = result.inputTokens;
      run.outputTokens = result.outputTokens;
      run.costCents = calculateCost(result.inputTokens, result.outputTokens, 'claude-sonnet-4-20250514');
      run.status = 'completed';
      run.completedAt = new Date();

      // Update task status if specified
      if (result.success && result.nextStatus) {
        await updateTask(job.taskId, { status: result.nextStatus });
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

      run.transcript.push({
        role: 'system',
        content: `Agent completed: ${result.success ? 'success' : 'failed'} - ${result.summary}`,
        timestamp: new Date(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Agent failed');
      }

    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error ? error.message : String(error);
      run.completedAt = new Date();
      throw error;
    } finally {
      // Cleanup sandbox
      if (executor) {
        await executor.cleanup();
      }
      // Save run to database
      await saveAgentRun(run);
      // Keep in memory briefly, then cleanup
      setTimeout(() => this.running.delete(run.id), 3600000);
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
