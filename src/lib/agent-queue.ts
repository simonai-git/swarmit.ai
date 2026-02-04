import { v4 as uuidv4 } from 'uuid';
import pool from './db';

// Agent job in the queue
export interface AgentJob {
  id: string;
  taskId: string;
  agentType: 'developer' | 'qa' | 'reviewer';
  priority: number; // Higher = more urgent
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// Active agent run
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
};

// In-memory queue state (will be moved to DB later)
class AgentQueue {
  private jobs: AgentJob[] = [];
  private running: Map<string, AgentRun> = new Map();
  private isProcessing = false;
  private processInterval: NodeJS.Timeout | null = null;

  // Add a job to the queue
  async enqueue(job: Omit<AgentJob, 'id' | 'status' | 'createdAt'>): Promise<AgentJob> {
    const newJob: AgentJob = {
      ...job,
      id: uuidv4(),
      status: 'pending',
      createdAt: new Date(),
    };

    // Check for duplicate (same task, same agent type, pending/running)
    const existing = this.jobs.find(
      j => j.taskId === job.taskId && 
           j.agentType === job.agentType && 
           ['pending', 'running'].includes(j.status)
    );

    if (existing) {
      console.log(`Job already exists for task ${job.taskId} with agent ${job.agentType}`);
      return existing;
    }

    this.jobs.push(newJob);
    console.log(`Enqueued job ${newJob.id} for task ${newJob.taskId} (${newJob.agentType})`);

    // Start processing if not already
    this.startProcessing();

    return newJob;
  }

  // Get queue status
  getStatus(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    jobs: AgentJob[];
    activeRuns: AgentRun[];
  } {
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
  getJob(jobId: string): AgentJob | undefined {
    return this.jobs.find(j => j.id === jobId);
  }

  // Get run by ID
  getRun(runId: string): AgentRun | undefined {
    return this.running.get(runId);
  }

  // Cancel a job
  async cancel(jobId: string): Promise<boolean> {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return false;

    if (job.status === 'running') {
      // TODO: Implement actual cancellation of running agent
      const run = Array.from(this.running.values()).find(r => r.jobId === jobId);
      if (run) {
        run.status = 'failed';
        run.error = 'Cancelled by user';
        run.completedAt = new Date();
      }
    }

    job.status = 'cancelled';
    return true;
  }

  // Start the processing loop
  startProcessing(): void {
    if (this.processInterval) return;

    this.processInterval = setInterval(() => {
      this.processQueue();
    }, CONFIG.pollIntervalMs);

    // Also process immediately
    this.processQueue();
  }

  // Stop the processing loop
  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  // Process pending jobs
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Check if we can run more jobs
      const runningCount = this.jobs.filter(j => j.status === 'running').length;
      const availableSlots = CONFIG.maxConcurrent - runningCount;

      if (availableSlots <= 0) {
        return;
      }

      // Get pending jobs sorted by priority (highest first), then by creation time
      const pendingJobs = this.jobs
        .filter(j => j.status === 'pending')
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return a.createdAt.getTime() - b.createdAt.getTime();
        })
        .slice(0, availableSlots);

      for (const job of pendingJobs) {
        await this.runJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Run a single job
  private async runJob(job: AgentJob): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date();

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

    console.log(`Starting job ${job.id} (run ${run.id}) for task ${job.taskId}`);

    try {
      // TODO: Actually run the agent here
      // For now, we'll just simulate with a placeholder
      // The actual implementation will call runAgent() from claude.ts
      
      // This will be replaced with actual agent execution
      await this.executeAgent(job, run);

      job.status = 'completed';
      job.completedAt = new Date();
      run.status = 'completed';
      run.completedAt = new Date();

      console.log(`Job ${job.id} completed successfully`);

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      run.status = 'failed';
      run.error = job.error;
      run.completedAt = new Date();

      console.error(`Job ${job.id} failed:`, job.error);
    }

    // Keep run in history for a while, then clean up
    setTimeout(() => {
      this.running.delete(run.id);
    }, 3600000); // Keep for 1 hour
  }

  // Placeholder for actual agent execution
  private async executeAgent(job: AgentJob, run: AgentRun): Promise<void> {
    // This will be implemented to:
    // 1. Load task and project context from DB
    // 2. Create a sandbox environment
    // 3. Call runAgent() from claude.ts
    // 4. Update task status based on result
    // 5. Store transcript and metrics

    // For now, log that we would run the agent
    console.log(`Would execute ${job.agentType} agent for task ${job.taskId}`);
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update run with simulated metrics
    run.inputTokens = 1000;
    run.outputTokens = 500;
    run.costCents = 5;
    run.transcript.push({
      role: 'system',
      content: 'Agent execution placeholder - real implementation pending',
      timestamp: new Date(),
    });
  }

  // Clear completed/failed jobs older than specified age
  cleanup(maxAgeMs: number = 86400000): void {
    const cutoff = Date.now() - maxAgeMs;
    this.jobs = this.jobs.filter(j => {
      if (['pending', 'running'].includes(j.status)) return true;
      return j.completedAt && j.completedAt.getTime() > cutoff;
    });
  }
}

// Singleton queue instance
export const agentQueue = new AgentQueue();

// Database operations for agent runs (for persistence)
export async function saveAgentRun(run: AgentRun): Promise<void> {
  await pool.query(
    `INSERT INTO agent_runs (id, task_id, agent_type, status, started_at, completed_at, 
                             input_tokens, output_tokens, cost_cents, error, transcript)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       status = $4, completed_at = $6, input_tokens = $7, output_tokens = $8,
       cost_cents = $9, error = $10, transcript = $11`,
    [
      run.id,
      run.taskId,
      run.agentType,
      run.status,
      run.startedAt,
      run.completedAt,
      run.inputTokens,
      run.outputTokens,
      run.costCents,
      run.error,
      JSON.stringify(run.transcript),
    ]
  );
}

export async function getAgentRuns(taskId: string): Promise<AgentRun[]> {
  const result = await pool.query(
    `SELECT * FROM agent_runs WHERE task_id = $1 ORDER BY started_at DESC`,
    [taskId]
  );
  return result.rows.map(row => ({
    ...row,
    transcript: row.transcript || [],
  }));
}

export async function getAgentRun(runId: string): Promise<AgentRun | null> {
  const result = await pool.query(
    `SELECT * FROM agent_runs WHERE id = $1`,
    [runId]
  );
  if (result.rows.length === 0) return null;
  return {
    ...result.rows[0],
    transcript: result.rows[0].transcript || [],
  };
}

// Cost tracking
export async function getTodaySpend(): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(cost_cents), 0) as total 
     FROM agent_runs 
     WHERE started_at >= CURRENT_DATE`
  );
  return result.rows[0].total;
}

export async function getSpendByPeriod(startDate: Date, endDate: Date): Promise<{
  total: number;
  byAgent: Record<string, number>;
  byDay: Array<{ date: string; total: number }>;
}> {
  const totalResult = await pool.query(
    `SELECT COALESCE(SUM(cost_cents), 0) as total 
     FROM agent_runs 
     WHERE started_at >= $1 AND started_at < $2`,
    [startDate, endDate]
  );

  const byAgentResult = await pool.query(
    `SELECT agent_type, COALESCE(SUM(cost_cents), 0) as total 
     FROM agent_runs 
     WHERE started_at >= $1 AND started_at < $2
     GROUP BY agent_type`,
    [startDate, endDate]
  );

  const byDayResult = await pool.query(
    `SELECT DATE(started_at) as date, COALESCE(SUM(cost_cents), 0) as total 
     FROM agent_runs 
     WHERE started_at >= $1 AND started_at < $2
     GROUP BY DATE(started_at)
     ORDER BY date`,
    [startDate, endDate]
  );

  return {
    total: totalResult.rows[0].total,
    byAgent: Object.fromEntries(
      byAgentResult.rows.map(r => [r.agent_type, r.total])
    ),
    byDay: byDayResult.rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      total: r.total,
    })),
  };
}
