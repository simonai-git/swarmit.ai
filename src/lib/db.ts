import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Initialize database
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        assignee TEXT NOT NULL DEFAULT 'Simon',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
        estimated_hours DECIMAL,
        time_spent DECIMAL DEFAULT 0,
        progress INTEGER DEFAULT 0,
        is_blocked BOOLEAN DEFAULT FALSE,
        blocked_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Add new columns if they don't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time_spent DECIMAL DEFAULT 0;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_context TEXT;
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS worked_by TEXT DEFAULT '[]';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    
    // Make assignee nullable (allow unassigned tasks)
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE tasks ALTER COLUMN assignee DROP NOT NULL;
        ALTER TABLE tasks ALTER COLUMN assignee DROP DEFAULT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        field_changed TEXT,
        old_value TEXT,
        new_value TEXT,
        actor TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS watcher_config (
        id TEXT PRIMARY KEY DEFAULT 'singleton',
        is_running BOOLEAN NOT NULL DEFAULT FALSE,
        last_run TIMESTAMPTZ,
        current_task_id TEXT,
        active_task_ids TEXT DEFAULT '[]',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Add active_task_ids column if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE watcher_config ADD COLUMN IF NOT EXISTS active_task_ids TEXT DEFAULT '[]';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Ensure watcher config row exists
    await client.query(`
      INSERT INTO watcher_config (id, is_running) 
      VALUES ('singleton', FALSE) 
      ON CONFLICT (id) DO NOTHING
    `);
    
    // Create agents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        specialization TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT,
        memory TEXT,
        avatar_emoji TEXT DEFAULT '🤖',
        avatar_color TEXT DEFAULT 'from-blue-500 to-purple-500',
        is_active BOOLEAN DEFAULT TRUE,
        tasks_completed INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Create default Simon agent if not exists
    await client.query(`
      INSERT INTO agents (id, name, specialization, description, system_prompt, avatar_emoji, avatar_color)
      VALUES (
        'agent-simon',
        'Simon',
        'Full Stack Developer',
        'General-purpose AI agent capable of handling various development tasks including frontend, backend, and DevOps.',
        'You are Simon, a skilled full-stack developer. You write clean, efficient code and follow best practices.',
        '🦊',
        'from-orange-500 to-amber-500'
      )
      ON CONFLICT (name) DO NOTHING
    `);
    
    // Create projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'defined',
        owner TEXT NOT NULL DEFAULT 'Bogdan',
        reviewer TEXT NOT NULL DEFAULT 'Bogdan',
        prd TEXT,
        goals TEXT,
        requirements TEXT,
        constraints TEXT,
        tech_stack TEXT,
        timeline TEXT,
        deadline TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        paused_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        canceled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Add project_id to tasks table
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    
    // Add reviewer to projects table (defaults to owner, used for in_review auto-assign)
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS reviewer TEXT DEFAULT 'Bogdan';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    
    // Add product_manager to projects table (PM watches feedback and creates tasks)
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_manager TEXT DEFAULT 'Simon';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    
    // Create project_feedback table for suggestions and improvements
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_feedback (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'suggestion',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_feedback_project_id ON project_feedback(project_id);
    `);
    
    // Add feedback_id to tasks to link back to feedback items
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS feedback_id TEXT REFERENCES project_feedback(id) ON DELETE SET NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    
    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_status_assignee ON tasks(status, assignee);
      CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
      CREATE INDEX IF NOT EXISTS idx_activity_task_id ON activity_log(task_id);
    `);
    
    // Create agent_runs table for tracking LLM agent executions
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        agent_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_cents INTEGER DEFAULT 0,
        error TEXT,
        transcript JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON agent_runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs(started_at DESC);
    `);

    // Create task_logs table for live terminal output from sandbox execution
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_logs (
        id BIGSERIAL PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
        agent_type TEXT,
        stream TEXT NOT NULL DEFAULT 'stdout',
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_logs_task_id_id ON task_logs(task_id, id);
      CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_logs(created_at);
    `);
    
    // Create agent_configs table for customizable agent configurations
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        specialization TEXT NOT NULL,
        system_prompt TEXT,
        model TEXT DEFAULT 'claude-sonnet-4-20250514',
        temperature FLOAT DEFAULT 0,
        max_tokens INTEGER DEFAULT 8000,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Add current_run_id to tasks for tracking active agent runs
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    
    // Create default agent configs if they don't exist
    await client.query(`
      INSERT INTO agent_configs (id, name, specialization, system_prompt)
      VALUES 
        ('config-developer', 'Developer', 'development', 'You are a senior software developer. Write clean, tested code and commit with descriptive messages.'),
        ('config-qa', 'QA', 'testing', 'You are a QA engineer. Test implementations thoroughly and report any issues found.'),
        ('config-reviewer', 'Reviewer', 'review', 'You are a code reviewer. Review changes for quality, correctness, and best practices.')
      ON CONFLICT (name) DO NOTHING
    `);
    
    // ==================== User Profile Tables ====================
    
    // User profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        email TEXT PRIMARY KEY,
        name TEXT,
        company TEXT,
        location TEXT,
        bio TEXT,
        avatar_url TEXT,
        claude_api_key TEXT,
        claude_connected_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Add Claude columns if they don't exist (migration)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'claude_api_key') THEN
          ALTER TABLE user_profiles ADD COLUMN claude_api_key TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'claude_connected_at') THEN
          ALTER TABLE user_profiles ADD COLUMN claude_connected_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);
    
    // User API keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_api_keys_email ON user_api_keys(user_email);
      CREATE INDEX IF NOT EXISTS idx_user_api_keys_hash ON user_api_keys(key_hash);
    `);
    
    // User integrations table (Railway, Claude OAuth, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_integrations (
        user_email TEXT PRIMARY KEY,
        railway_token TEXT,
        railway_projects TEXT,
        railway_selected_project TEXT,
        railway_connected_at TIMESTAMPTZ,
        claude_token TEXT,
        claude_email TEXT,
        claude_connected_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Add GitHub columns to user_integrations
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS github_token TEXT;
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS github_username TEXT;
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS github_connected_at TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Add Railway OAuth columns to user_integrations
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS railway_refresh_token TEXT;
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS railway_token_expires_at TIMESTAMPTZ;
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS railway_auth_method TEXT DEFAULT 'token';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Add GitHub OAuth columns to user_integrations
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS github_refresh_token TEXT;
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS github_token_expires_at TIMESTAMPTZ;
        ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS github_auth_method TEXT DEFAULT 'token';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Add github_repo, deploy_to_railway, push_to_github to projects
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo TEXT;
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS deploy_to_railway BOOLEAN DEFAULT FALSE;
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS push_to_github BOOLEAN DEFAULT FALSE;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Create workspace_snapshots table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_snapshots (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
        run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
        agent_type TEXT,
        snapshot BYTEA NOT NULL,
        file_count INTEGER DEFAULT 0,
        size_bytes INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_task_id ON workspace_snapshots(task_id);
    `);

    // Create task_dependencies table for task dependency tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(task_id, depends_on_id),
        CHECK(task_id != depends_on_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON task_dependencies(depends_on_id);
    `);

    // Add user_email column for multi-tenant task ownership
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_email TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_user_email ON tasks(user_email);
    `);
    // Backfill existing tasks with first API key holder
    await client.query(`
      UPDATE tasks SET user_email = (
        SELECT email FROM user_profiles WHERE claude_api_key IS NOT NULL LIMIT 1
      ) WHERE user_email IS NULL;
    `);

    // Add user_email to agents for multi-tenancy
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_email TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_user_email ON agents(user_email);
    `);

    // Create specializations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS specializations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT,
        icon TEXT DEFAULT '🤖',
        user_email TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(name, user_email)
      )
    `);

    // Create installed_skills table (user-level skill library)
    await client.query(`
      CREATE TABLE IF NOT EXISTS installed_skills (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        skill_description TEXT,
        skill_content TEXT,
        source_url TEXT,
        category TEXT,
        author TEXT,
        user_email TEXT NOT NULL,
        installed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(skill_id, user_email)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_installed_skills_user ON installed_skills(user_email);
    `);

    // Create agent_skills junction table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_skills (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        skill_id TEXT NOT NULL,
        user_email TEXT,
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(agent_id, skill_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
    `);

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// Initialize on module load
initDb().catch(console.error);

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'testing' | 'in_review' | 'done';
  assignee: string | null;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  estimated_hours: number | null;
  time_spent: number;
  progress: number;
  is_blocked: boolean;
  feedback_id: string | null;
  blocked_reason: string | null;
  agent_context: string | null;
  project_id: string | null;
  user_email: string | null;
  current_run_id: string | null;
  worked_by: string; // JSON array of contributors who worked on this task
  created_at: string;
  updated_at: string;
}

export async function getAllTasks(): Promise<Task[]> {
  // Exclude agent_context from list view for performance (can be very large)
  const result = await pool.query(`
    SELECT id, title, description, status, assignee, priority, due_date,
           estimated_hours, time_spent, progress, is_blocked, blocked_reason,
           created_at, updated_at, project_id, user_email, COALESCE(worked_by, '[]') as worked_by,
           CASE WHEN agent_context IS NOT NULL THEN 'has_context' ELSE NULL END as agent_context
    FROM tasks
    ORDER BY updated_at DESC
  `);
  return result.rows;
}

export interface SearchFilters {
  q?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  project_id?: string;
  is_blocked?: string;
  user_email?: string;
}

export async function searchTasks(filters: SearchFilters): Promise<Task[]> {
  const conditions: string[] = [];
  const values: (string | boolean)[] = [];
  let paramIndex = 1;

  if (filters.q) {
    conditions.push(`(LOWER(title) LIKE $${paramIndex} OR LOWER(description) LIKE $${paramIndex} OR LOWER(id) LIKE $${paramIndex})`);
    values.push(`%${filters.q.toLowerCase()}%`);
    paramIndex++;
  }

  if (filters.status) {
    const statuses = filters.status.split(',').map(s => s.trim());
    conditions.push(`status = ANY($${paramIndex})`);
    values.push(statuses as unknown as string);
    paramIndex++;
  }

  if (filters.assignee) {
    if (filters.assignee === 'unassigned') {
      conditions.push(`assignee IS NULL`);
    } else {
      conditions.push(`assignee = $${paramIndex}`);
      values.push(filters.assignee);
      paramIndex++;
    }
  }

  if (filters.priority) {
    conditions.push(`priority = $${paramIndex}`);
    values.push(filters.priority);
    paramIndex++;
  }

  if (filters.project_id) {
    if (filters.project_id === 'none') {
      conditions.push(`project_id IS NULL`);
    } else {
      conditions.push(`project_id = $${paramIndex}`);
      values.push(filters.project_id);
      paramIndex++;
    }
  }

  if (filters.is_blocked === 'true') {
    conditions.push(`is_blocked = TRUE`);
  } else if (filters.is_blocked === 'false') {
    conditions.push(`(is_blocked = FALSE OR is_blocked IS NULL)`);
  }

  if (filters.user_email) {
    conditions.push(`user_email = $${paramIndex}`);
    values.push(filters.user_email);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(`
    SELECT id, title, description, status, assignee, priority, due_date,
           estimated_hours, time_spent, progress, is_blocked, blocked_reason,
           created_at, updated_at, project_id, user_email, COALESCE(worked_by, '[]') as worked_by,
           CASE WHEN agent_context IS NOT NULL THEN 'has_context' ELSE NULL END as agent_context
    FROM tasks
    ${whereClause}
    ORDER BY updated_at DESC
  `, values);
  return result.rows;
}

export async function getTask(id: string): Promise<Task | null> {
  const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getTasksByStatus(status: string): Promise<Task[]> {
  const result = await pool.query('SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC', [status]);
  return result.rows;
}

export async function createTask(task: Partial<Task> & { id: string; title: string }): Promise<Task> {
  const result = await pool.query(
    `INSERT INTO tasks (id, title, description, status, assignee, priority, due_date, estimated_hours, time_spent, progress, is_blocked, blocked_reason, agent_context, project_id, feedback_id, user_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      task.id,
      task.title,
      task.description || null,
      task.status || 'todo',
      task.assignee !== undefined ? task.assignee : null,  // Allow null assignee
      task.priority || 'medium',
      task.due_date || null,
      task.estimated_hours || null,
      task.time_spent || 0,
      task.progress || 0,
      task.is_blocked || false,
      task.blocked_reason || null,
      task.agent_context || null,
      task.project_id || null,
      task.feedback_id || null,
      task.user_email || null
    ]
  );
  return result.rows[0];
}

export async function getTasksByProjectId(projectId: string): Promise<Task[]> {
  const result = await pool.query(
    'SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at ASC',
    [projectId]
  );
  return result.rows;
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return null;
  
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map(f => updates[f as keyof Task]);
  
  const result = await pool.query(
    `UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  
  return result.rows[0] || null;
}

export async function deleteTask(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// Comments
export interface Comment {
  id: string;
  task_id: string;
  author: string;
  content: string;
  created_at: string;
}

export async function getCommentsByTaskId(taskId: string): Promise<Comment[]> {
  const result = await pool.query(
    'SELECT * FROM comments WHERE task_id = $1 ORDER BY created_at ASC',
    [taskId]
  );
  return result.rows;
}

export async function createComment(comment: Omit<Comment, 'created_at'>): Promise<Comment> {
  const result = await pool.query(
    `INSERT INTO comments (id, task_id, author, content)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [comment.id, comment.task_id, comment.author, comment.content]
  );
  return result.rows[0];
}

export async function deleteComment(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM comments WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// Activity Log
export interface ActivityLog {
  id: string;
  task_id: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  actor: string;
  created_at: string;
}

export async function logActivity(log: Omit<ActivityLog, 'created_at'>): Promise<ActivityLog> {
  const result = await pool.query(
    `INSERT INTO activity_log (id, task_id, action, field_changed, old_value, new_value, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [log.id, log.task_id, log.action, log.field_changed, log.old_value, log.new_value, log.actor]
  );
  return result.rows[0];
}

export async function getActivityByTaskId(taskId: string): Promise<ActivityLog[]> {
  const result = await pool.query(
    'SELECT * FROM activity_log WHERE task_id = $1 ORDER BY created_at DESC',
    [taskId]
  );
  return result.rows;
}

// Watcher Config
export interface WatcherConfig {
  id: string;
  is_running: boolean;
  last_run: string | null;
  current_task_id: string | null;
  active_task_ids: string; // JSON array string e.g. '["task-id-1", "task-id-2"]'
  updated_at: string;
}

export async function getWatcherConfig(): Promise<WatcherConfig> {
  const result = await pool.query('SELECT * FROM watcher_config WHERE id = $1', ['singleton']);
  return result.rows[0];
}

export async function updateWatcherConfig(updates: Partial<WatcherConfig>): Promise<WatcherConfig> {
  const fields = Object.keys(updates).filter(k => k !== 'id');
  if (fields.length === 0) {
    return getWatcherConfig();
  }
  
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map(f => updates[f as keyof WatcherConfig]);
  
  const result = await pool.query(
    `UPDATE watcher_config SET ${setClause}, updated_at = NOW() WHERE id = 'singleton' RETURNING *`,
    values
  );
  
  return result.rows[0];
}

export async function toggleWatcher(): Promise<WatcherConfig> {
  const result = await pool.query(
    `UPDATE watcher_config SET is_running = NOT is_running, updated_at = NOW() WHERE id = 'singleton' RETURNING *`
  );
  return result.rows[0];
}

// Agents
export interface Agent {
  id: string;
  name: string;
  specialization: string;
  description: string | null;
  system_prompt: string | null;
  memory: string | null;
  avatar_emoji: string;
  avatar_color: string;
  is_active: boolean;
  tasks_completed: number;
  user_email: string | null;
  created_at: string;
  updated_at: string;
}

export async function getAllAgents(userEmail?: string): Promise<Agent[]> {
  if (userEmail) {
    const result = await pool.query('SELECT * FROM agents WHERE user_email = $1 ORDER BY created_at DESC', [userEmail]);
    return result.rows;
  }
  const result = await pool.query('SELECT * FROM agents ORDER BY created_at DESC');
  return result.rows;
}

export async function getActiveAgents(userEmail?: string): Promise<Agent[]> {
  if (userEmail) {
    const result = await pool.query('SELECT * FROM agents WHERE is_active = TRUE AND user_email = $1 ORDER BY name ASC', [userEmail]);
    return result.rows;
  }
  const result = await pool.query('SELECT * FROM agents WHERE is_active = TRUE ORDER BY name ASC');
  return result.rows;
}

export async function getAgent(id: string): Promise<Agent | null> {
  const result = await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getAgentByName(name: string): Promise<Agent | null> {
  const result = await pool.query('SELECT * FROM agents WHERE name = $1', [name]);
  return result.rows[0] || null;
}

export async function createAgent(agent: Partial<Agent> & { id: string; name: string; specialization: string }): Promise<Agent> {
  const result = await pool.query(
    `INSERT INTO agents (id, name, specialization, description, system_prompt, memory, avatar_emoji, avatar_color, is_active, tasks_completed, user_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      agent.id,
      agent.name,
      agent.specialization,
      agent.description || null,
      agent.system_prompt || null,
      agent.memory || null,
      agent.avatar_emoji || '🤖',
      agent.avatar_color || 'from-blue-500 to-purple-500',
      agent.is_active !== false,
      agent.tasks_completed || 0,
      agent.user_email || null
    ]
  );
  return result.rows[0];
}

export async function updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | null> {
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return null;
  
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map(f => updates[f as keyof Agent]);
  
  const result = await pool.query(
    `UPDATE agents SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  
  return result.rows[0] || null;
}

export async function deleteAgent(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM agents WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function incrementAgentTasksCompleted(id: string): Promise<Agent | null> {
  const result = await pool.query(
    `UPDATE agents SET tasks_completed = tasks_completed + 1, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

// Projects
export type ProjectStatus = 'defined' | 'in_progress' | 'paused' | 'canceled' | 'completed';

export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  owner: string;
  reviewer: string;  // Who reviews completed tasks (defaults to owner)
  product_manager: string;  // PM watches feedback and creates tasks
  prd: string | null;
  goals: string | null;
  requirements: string | null;
  constraints: string | null;
  tech_stack: string | null;
  timeline: string | null;
  deadline: string | null;
  github_repo: string | null;
  deploy_to_railway: boolean;
  push_to_github: boolean;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStats extends Project {
  task_count: number;
  completed_task_count: number;
}

export async function getAllProjects(): Promise<ProjectWithStats[]> {
  const result = await pool.query(`
    SELECT p.*,
           COALESCE(t.task_count, 0)::int as task_count,
           COALESCE(t.completed_task_count, 0)::int as completed_task_count
    FROM projects p
    LEFT JOIN (
      SELECT project_id, 
             COUNT(*) as task_count,
             COUNT(*) FILTER (WHERE status = 'done') as completed_task_count
      FROM tasks
      WHERE project_id IS NOT NULL
      GROUP BY project_id
    ) t ON p.id = t.project_id
    ORDER BY p.created_at DESC
  `);
  return result.rows;
}

export async function getProject(id: string): Promise<ProjectWithStats | null> {
  const result = await pool.query(`
    SELECT p.*,
           COALESCE(t.task_count, 0)::int as task_count,
           COALESCE(t.completed_task_count, 0)::int as completed_task_count
    FROM projects p
    LEFT JOIN (
      SELECT project_id, 
             COUNT(*) as task_count,
             COUNT(*) FILTER (WHERE status = 'done') as completed_task_count
      FROM tasks
      WHERE project_id IS NOT NULL
      GROUP BY project_id
    ) t ON p.id = t.project_id
    WHERE p.id = $1
  `, [id]);
  return result.rows[0] || null;
}

export async function getProjectsByStatus(status: ProjectStatus): Promise<ProjectWithStats[]> {
  const result = await pool.query(`
    SELECT p.*,
           COALESCE(t.task_count, 0)::int as task_count,
           COALESCE(t.completed_task_count, 0)::int as completed_task_count
    FROM projects p
    LEFT JOIN (
      SELECT project_id, 
             COUNT(*) as task_count,
             COUNT(*) FILTER (WHERE status = 'done') as completed_task_count
      FROM tasks
      WHERE project_id IS NOT NULL
      GROUP BY project_id
    ) t ON p.id = t.project_id
    WHERE p.status = $1
    ORDER BY p.created_at DESC
  `, [status]);
  return result.rows;
}

export async function createProject(project: Partial<Project> & { id: string; title: string }): Promise<Project> {
  const result = await pool.query(
    `INSERT INTO projects (id, title, description, status, owner, reviewer, product_manager, prd, goals, requirements, constraints, tech_stack, timeline, deadline, github_repo, deploy_to_railway, push_to_github)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      project.id,
      project.title,
      project.description || null,
      project.status || 'defined',
      project.owner || 'Bogdan',
      project.reviewer || 'Bogdan',
      project.product_manager || 'Sam',
      project.prd || null,
      project.goals || null,
      project.requirements || null,
      project.constraints || null,
      project.tech_stack || null,
      project.timeline || null,
      project.deadline || null,
      project.github_repo || null,
      project.deploy_to_railway || false,
      project.push_to_github || false,
    ]
  );
  return result.rows[0];
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return null;
  
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map(f => updates[f as keyof Project]);
  
  const result = await pool.query(
    `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  
  return result.rows[0] || null;
}

export async function deleteProject(id: string): Promise<boolean> {
  // First unlink all tasks from this project
  await pool.query('UPDATE tasks SET project_id = NULL WHERE project_id = $1', [id]);
  const result = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// Project lifecycle transitions
export async function startProject(id: string): Promise<Project | null> {
  const result = await pool.query(
    `UPDATE projects SET status = 'in_progress', started_at = NOW(), updated_at = NOW() 
     WHERE id = $1 AND status = 'defined' 
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

export async function pauseProject(id: string): Promise<Project | null> {
  const result = await pool.query(
    `UPDATE projects SET status = 'paused', paused_at = NOW(), updated_at = NOW() 
     WHERE id = $1 AND status = 'in_progress' 
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

export async function resumeProject(id: string): Promise<Project | null> {
  const result = await pool.query(
    `UPDATE projects SET status = 'in_progress', paused_at = NULL, updated_at = NOW() 
     WHERE id = $1 AND status = 'paused' 
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

export async function cancelProject(id: string): Promise<Project | null> {
  const result = await pool.query(
    `UPDATE projects SET status = 'canceled', canceled_at = NOW(), updated_at = NOW() 
     WHERE id = $1 AND status IN ('defined', 'in_progress', 'paused') 
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

export async function completeProject(id: string): Promise<Project | null> {
  const result = await pool.query(
    `UPDATE projects SET status = 'completed', completed_at = NOW(), updated_at = NOW() 
     WHERE id = $1 AND status = 'in_progress' 
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

// Project Feedback
export type FeedbackType = 'suggestion' | 'improvement' | 'bug' | 'feature' | 'question';
export type FeedbackStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'wont_fix';

export interface ProjectFeedback {
  id: string;
  project_id: string;
  author: string;
  type: FeedbackType;
  title: string;
  content: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
}

export async function getProjectFeedback(projectId: string): Promise<ProjectFeedback[]> {
  const result = await pool.query(
    'SELECT * FROM project_feedback WHERE project_id = $1 ORDER BY created_at DESC',
    [projectId]
  );
  return result.rows;
}

export async function createProjectFeedback(feedback: Omit<ProjectFeedback, 'created_at' | 'updated_at'>): Promise<ProjectFeedback> {
  const result = await pool.query(
    `INSERT INTO project_feedback (id, project_id, author, type, title, content, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      feedback.id,
      feedback.project_id,
      feedback.author,
      feedback.type || 'suggestion',
      feedback.title,
      feedback.content,
      feedback.status || 'open'
    ]
  );
  return result.rows[0];
}

export async function updateProjectFeedback(id: string, updates: Partial<ProjectFeedback>): Promise<ProjectFeedback | null> {
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'project_id' && k !== 'created_at');
  if (fields.length === 0) return null;
  
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map(f => updates[f as keyof ProjectFeedback]);
  
  const result = await pool.query(
    `UPDATE project_feedback SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  
  return result.rows[0] || null;
}

export async function deleteProjectFeedback(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM project_feedback WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// ==================== Agent Configs ====================

export interface AgentConfig {
  id: string;
  name: string;
  specialization: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

export async function getAgentConfigs(): Promise<AgentConfig[]> {
  const result = await pool.query(
    'SELECT * FROM agent_configs ORDER BY name'
  );
  return result.rows;
}

export async function getAgentConfig(id: string): Promise<AgentConfig | null> {
  const result = await pool.query(
    'SELECT * FROM agent_configs WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getAgentConfigByName(name: string): Promise<AgentConfig | null> {
  const result = await pool.query(
    'SELECT * FROM agent_configs WHERE name = $1',
    [name]
  );
  return result.rows[0] || null;
}

export async function getAgentConfigBySpecialization(specialization: string): Promise<AgentConfig | null> {
  const result = await pool.query(
    'SELECT * FROM agent_configs WHERE specialization = $1 LIMIT 1',
    [specialization]
  );
  return result.rows[0] || null;
}

export async function createAgentConfig(config: Omit<AgentConfig, 'id' | 'created_at' | 'updated_at'>): Promise<AgentConfig> {
  const result = await pool.query(
    `INSERT INTO agent_configs (name, specialization, system_prompt, model, temperature, max_tokens)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      config.name,
      config.specialization,
      config.system_prompt,
      config.model || 'claude-sonnet-4-20250514',
      config.temperature || 0,
      config.max_tokens || 8000
    ]
  );
  return result.rows[0];
}

export async function updateAgentConfig(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig | null> {
  const fields = Object.keys(updates).filter(k => 
    k !== 'id' && k !== 'created_at' && k !== 'updated_at'
  );
  if (fields.length === 0) return null;
  
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map(f => updates[f as keyof AgentConfig]);
  
  const result = await pool.query(
    `UPDATE agent_configs SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  
  return result.rows[0] || null;
}

export async function deleteAgentConfig(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM agent_configs WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// ==================== Agent Runs ====================

export interface AgentRun {
  id: string;
  task_id: string;
  agent_type: string;
  agent_config_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at?: string;
  completed_at?: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  error?: string;
  transcript: Array<{ role: string; content: string; timestamp: string }>;
  created_at: string;
}

export async function createAgentRun(run: Omit<AgentRun, 'id' | 'created_at'>): Promise<AgentRun> {
  const result = await pool.query(
    `INSERT INTO agent_runs (task_id, agent_type, agent_config_id, status, started_at, 
                            input_tokens, output_tokens, cost_cents, transcript)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      run.task_id,
      run.agent_type,
      run.agent_config_id || null,
      run.status || 'pending',
      run.started_at || null,
      run.input_tokens || 0,
      run.output_tokens || 0,
      run.cost_cents || 0,
      JSON.stringify(run.transcript || [])
    ]
  );
  return {
    ...result.rows[0],
    transcript: result.rows[0].transcript || []
  };
}

export async function getAgentRun(id: string): Promise<AgentRun | null> {
  const result = await pool.query(
    'SELECT * FROM agent_runs WHERE id = $1',
    [id]
  );
  if (result.rows.length === 0) return null;
  return {
    ...result.rows[0],
    transcript: result.rows[0].transcript || []
  };
}

export async function getAgentRunsByTask(taskId: string): Promise<AgentRun[]> {
  const result = await pool.query(
    'SELECT * FROM agent_runs WHERE task_id = $1 ORDER BY created_at DESC',
    [taskId]
  );
  return result.rows.map(row => ({
    ...row,
    transcript: row.transcript || []
  }));
}

export async function getRecentAgentRuns(limit: number = 50): Promise<AgentRun[]> {
  const result = await pool.query(
    'SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows.map(row => ({
    ...row,
    transcript: row.transcript || []
  }));
}

export async function updateAgentRun(id: string, updates: Partial<AgentRun>): Promise<AgentRun | null> {
  const fields = Object.keys(updates).filter(k => 
    k !== 'id' && k !== 'task_id' && k !== 'created_at'
  );
  if (fields.length === 0) return null;
  
  const setClause = fields.map((f, i) => {
    if (f === 'transcript') return `${f} = $${i + 1}::jsonb`;
    return `${f} = $${i + 1}`;
  }).join(', ');
  
  const values = fields.map(f => {
    const val = updates[f as keyof AgentRun];
    if (f === 'transcript') return JSON.stringify(val);
    return val;
  });
  
  const result = await pool.query(
    `UPDATE agent_runs SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  
  if (result.rows.length === 0) return null;
  return {
    ...result.rows[0],
    transcript: result.rows[0].transcript || []
  };
}

export async function completeAgentRun(
  id: string, 
  status: 'completed' | 'failed',
  metrics: { inputTokens: number; outputTokens: number; costCents: number },
  error?: string
): Promise<AgentRun | null> {
  const result = await pool.query(
    `UPDATE agent_runs 
     SET status = $1, completed_at = NOW(), input_tokens = $2, output_tokens = $3, cost_cents = $4, error = $5
     WHERE id = $6
     RETURNING *`,
    [status, metrics.inputTokens, metrics.outputTokens, metrics.costCents, error || null, id]
  );
  
  if (result.rows.length === 0) return null;
  return {
    ...result.rows[0],
    transcript: result.rows[0].transcript || []
  };
}

export async function appendToTranscript(
  id: string, 
  entry: { role: string; content: string; timestamp?: string }
): Promise<void> {
  const timestamp = entry.timestamp || new Date().toISOString();
  await pool.query(
    `UPDATE agent_runs 
     SET transcript = transcript || $1::jsonb
     WHERE id = $2`,
    [JSON.stringify([{ ...entry, timestamp }]), id]
  );
}

// ==================== Cost Tracking ====================

export async function getTodayAgentCost(): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(cost_cents), 0) as total 
     FROM agent_runs 
     WHERE started_at >= CURRENT_DATE`
  );
  return parseInt(result.rows[0].total) || 0;
}

export async function getAgentCostByPeriod(startDate: Date, endDate: Date): Promise<{
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
    total: parseInt(totalResult.rows[0].total) || 0,
    byAgent: Object.fromEntries(
      byAgentResult.rows.map(r => [r.agent_type, parseInt(r.total) || 0])
    ),
    byDay: byDayResult.rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      total: parseInt(r.total) || 0
    }))
  };
}

export async function getAgentRunStats(): Promise<{
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalTokens: number;
  totalCostCents: number;
}> {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total_runs,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_runs,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
      COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_cents), 0) as total_cost_cents
    FROM agent_runs
  `);
  
  return {
    totalRuns: parseInt(result.rows[0].total_runs) || 0,
    completedRuns: parseInt(result.rows[0].completed_runs) || 0,
    failedRuns: parseInt(result.rows[0].failed_runs) || 0,
    totalTokens: parseInt(result.rows[0].total_tokens) || 0,
    totalCostCents: parseInt(result.rows[0].total_cost_cents) || 0
  };
}

// ==================== Task Dependencies ====================

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_id: string;
  created_at: string;
}

export interface TaskDependencyWithTitle extends TaskDependency {
  title: string;
  status: string;
}

export async function getTaskDependencies(taskId: string): Promise<TaskDependencyWithTitle[]> {
  const result = await pool.query(
    `SELECT td.*, t.title, t.status
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_id
     WHERE td.task_id = $1
     ORDER BY td.created_at ASC`,
    [taskId]
  );
  return result.rows;
}

export async function getTaskDependents(taskId: string): Promise<TaskDependencyWithTitle[]> {
  const result = await pool.query(
    `SELECT td.*, t.title, t.status
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.task_id
     WHERE td.depends_on_id = $1
     ORDER BY td.created_at ASC`,
    [taskId]
  );
  return result.rows;
}

// Cycle detection using DFS
async function wouldCreateCycle(taskId: string, dependsOnId: string): Promise<boolean> {
  // Check if adding taskId -> dependsOnId would create a cycle
  // A cycle exists if dependsOnId already transitively depends on taskId
  const visited = new Set<string>();
  const stack = [taskId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === dependsOnId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    // Get all tasks that depend on current (i.e., current is a dependency of others)
    const result = await pool.query(
      `SELECT task_id FROM task_dependencies WHERE depends_on_id = $1`,
      [current]
    );
    for (const row of result.rows) {
      stack.push(row.task_id);
    }
  }
  return false;
}

export async function addTaskDependency(taskId: string, dependsOnId: string): Promise<TaskDependency> {
  // Check for cycle
  const cycleDetected = await wouldCreateCycle(taskId, dependsOnId);
  if (cycleDetected) {
    throw new Error('Adding this dependency would create a circular dependency');
  }

  const id = `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query(
    `INSERT INTO task_dependencies (id, task_id, depends_on_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, taskId, dependsOnId]
  );

  // Recalculate blocked status for the dependent task
  await recalculateBlockedStatus(taskId);

  return result.rows[0];
}

export async function removeTaskDependency(taskId: string, dependsOnId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2`,
    [taskId, dependsOnId]
  );

  // Recalculate blocked status
  await recalculateBlockedStatus(taskId);

  return (result.rowCount ?? 0) > 0;
}

export async function recalculateBlockedStatus(taskId: string): Promise<void> {
  // Get all incomplete dependencies for this task
  const result = await pool.query(
    `SELECT t.title FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_id
     WHERE td.task_id = $1 AND t.status != 'done'`,
    [taskId]
  );

  if (result.rows.length > 0) {
    const blockers = result.rows.map(r => r.title).join(', ');
    await pool.query(
      `UPDATE tasks SET is_blocked = TRUE, blocked_reason = $1, updated_at = NOW() WHERE id = $2`,
      [`Waiting on: ${blockers}`, taskId]
    );
  } else {
    // Check if task was auto-blocked by dependencies (not manually blocked)
    const task = await getTask(taskId);
    if (task?.blocked_reason?.startsWith('Waiting on:')) {
      await pool.query(
        `UPDATE tasks SET is_blocked = FALSE, blocked_reason = NULL, updated_at = NOW() WHERE id = $1`,
        [taskId]
      );
    }
  }
}

export async function getTaskDependencyCount(taskId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM task_dependencies WHERE task_id = $1`,
    [taskId]
  );
  return parseInt(result.rows[0].count) || 0;
}

export async function getAllTaskDependencyCounts(): Promise<Record<string, number>> {
  const result = await pool.query(
    `SELECT task_id, COUNT(*) as count FROM task_dependencies GROUP BY task_id`
  );
  return Object.fromEntries(result.rows.map(r => [r.task_id, parseInt(r.count)]));
}

// Get automation user email (first user with a Claude API key)
export async function getAutomationUserEmail(): Promise<string | undefined> {
  try {
    const result = await pool.query(
      'SELECT email FROM user_profiles WHERE claude_api_key IS NOT NULL LIMIT 1'
    );
    return result.rows[0]?.email;
  } catch (error) {
    console.error('[DB] Failed to get automation user:', error);
    return undefined;
  }
}

// Get all users with Claude API keys (for multi-tenant scheduler)
export async function getUsersWithApiKeys(): Promise<Array<{ email: string }>> {
  const result = await pool.query(
    'SELECT email FROM user_profiles WHERE claude_api_key IS NOT NULL'
  );
  return result.rows;
}

// Get tasks owned by a specific user
export async function getTasksByUserEmail(userEmail: string): Promise<Task[]> {
  const result = await pool.query(`
    SELECT id, title, description, status, assignee, priority, due_date,
           estimated_hours, time_spent, progress, is_blocked, blocked_reason,
           created_at, updated_at, project_id, user_email, current_run_id,
           COALESCE(worked_by, '[]') as worked_by,
           CASE WHEN agent_context IS NOT NULL THEN 'has_context' ELSE NULL END as agent_context
    FROM tasks
    WHERE user_email = $1
    ORDER BY updated_at DESC
  `, [userEmail]);
  return result.rows;
}

// Get tasks with no user_email (orphaned)
export async function getOrphanedTasks(): Promise<Task[]> {
  const result = await pool.query(
    `SELECT * FROM tasks WHERE user_email IS NULL AND status != 'done' LIMIT 50`
  );
  return result.rows;
}

// Assign orphaned tasks to a specific user
export async function assignOrphanedTasks(userEmail: string): Promise<number> {
  const result = await pool.query(
    `UPDATE tasks SET user_email = $1 WHERE user_email IS NULL RETURNING id`,
    [userEmail]
  );
  return result.rowCount || 0;
}

// ==================== Task Logs ====================

export interface TaskLog {
  id: number;
  task_id: string;
  run_id: string | null;
  agent_type: string | null;
  stream: string;
  content: string;
  created_at: string;
}

export async function appendTaskLogBatch(logs: Array<Omit<TaskLog, 'id' | 'created_at'>>): Promise<void> {
  if (logs.length === 0) return;
  const values: (string | null)[] = [];
  const placeholders: string[] = [];
  let idx = 1;
  for (const log of logs) {
    const content = log.content.length > 4096 ? log.content.slice(0, 4096) : log.content;
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
    values.push(log.task_id, log.run_id, log.agent_type, log.stream, content);
    idx += 5;
  }
  await pool.query(
    `INSERT INTO task_logs (task_id, run_id, agent_type, stream, content) VALUES ${placeholders.join(', ')}`,
    values
  );
}

export async function getTaskLogs(
  taskId: string,
  opts: { afterId?: number; limit?: number; runId?: string } = {}
): Promise<TaskLog[]> {
  const conditions = ['task_id = $1'];
  const values: (string | number)[] = [taskId];
  let idx = 2;

  if (opts.afterId != null) {
    conditions.push(`id > $${idx}`);
    values.push(opts.afterId);
    idx++;
  }
  if (opts.runId) {
    conditions.push(`run_id = $${idx}`);
    values.push(opts.runId);
    idx++;
  }

  const limit = opts.limit || 500;
  const result = await pool.query(
    `SELECT * FROM task_logs WHERE ${conditions.join(' AND ')} ORDER BY id ASC LIMIT $${idx}`,
    [...values, limit]
  );
  return result.rows;
}

export async function getTaskLogCount(taskId: string): Promise<number> {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM task_logs WHERE task_id = $1',
    [taskId]
  );
  return parseInt(result.rows[0].count) || 0;
}

export async function cleanupOldTaskLogs(retentionDays: number = 7): Promise<number> {
  const result = await pool.query(
    `DELETE FROM task_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [retentionDays]
  );
  return result.rowCount || 0;
}

// ==================== Workspace Snapshots ====================

export interface WorkspaceSnapshot {
  id: string;
  task_id: string;
  run_id: string | null;
  agent_type: string | null;
  snapshot: Buffer;
  file_count: number;
  size_bytes: number;
  created_at: string;
}

export async function saveWorkspaceSnapshot(
  taskId: string,
  runId: string,
  agentType: string,
  data: Buffer,
  fileCount: number,
  sizeBytes: number
): Promise<void> {
  const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Upsert: one snapshot per task (latest wins)
  await pool.query(
    `INSERT INTO workspace_snapshots (id, task_id, run_id, agent_type, snapshot, file_count, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (task_id) DO UPDATE SET
       id = $1, run_id = $3, agent_type = $4, snapshot = $5, file_count = $6, size_bytes = $7, created_at = NOW()`,
    [id, taskId, runId, agentType, data, fileCount, sizeBytes]
  );
}

export async function getWorkspaceSnapshot(taskId: string): Promise<WorkspaceSnapshot | null> {
  const result = await pool.query(
    'SELECT * FROM workspace_snapshots WHERE task_id = $1',
    [taskId]
  );
  return result.rows[0] || null;
}

// ==================== Task Run Claim/Release ====================

/**
 * Atomically claim a task for a specific run. Uses compare-and-swap
 * (current_run_id IS NULL) to prevent concurrent runs on the same task.
 * Returns true if the claim was successful, false if another run already owns it.
 */
export async function claimTaskRun(taskId: string, runId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE tasks SET current_run_id = $2, updated_at = NOW()
     WHERE id = $1 AND current_run_id IS NULL
     RETURNING id`,
    [taskId, runId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Release a task run claim. Only releases if the caller owns the claim
 * (current_run_id matches), preventing stale runs from releasing another run's claim.
 */
export async function releaseTaskRun(taskId: string, runId: string): Promise<void> {
  await pool.query(
    `UPDATE tasks SET current_run_id = NULL, updated_at = NOW()
     WHERE id = $1 AND current_run_id = $2`,
    [taskId, runId]
  );
}

export async function deleteWorkspaceSnapshot(taskId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM workspace_snapshots WHERE task_id = $1',
    [taskId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ==================== GitHub Integration ====================

export async function getUserGitHubToken(userEmail: string): Promise<{
  token: string;
  username: string;
  authMethod: string;
  refreshToken: string | null;
  expiresAt: Date | null;
} | null> {
  const result = await pool.query(
    `SELECT github_token, github_username, github_auth_method, github_refresh_token, github_token_expires_at
     FROM user_integrations WHERE user_email = $1 AND github_token IS NOT NULL`,
    [userEmail]
  );
  if (result.rows.length === 0 || !result.rows[0].github_token) return null;
  return {
    token: result.rows[0].github_token,
    username: result.rows[0].github_username,
    authMethod: result.rows[0].github_auth_method || 'token',
    refreshToken: result.rows[0].github_refresh_token || null,
    expiresAt: result.rows[0].github_token_expires_at ? new Date(result.rows[0].github_token_expires_at) : null,
  };
}

export async function setUserGitHubIntegration(
  userEmail: string,
  token: string,
  username: string,
  authMethod: string = 'token',
  refreshToken?: string | null,
  expiresAt?: Date | null
): Promise<void> {
  await pool.query(
    `INSERT INTO user_integrations (user_email, github_token, github_username, github_connected_at, github_auth_method, github_refresh_token, github_token_expires_at)
     VALUES ($1, $2, $3, NOW(), $4, $5, $6)
     ON CONFLICT (user_email) DO UPDATE SET
       github_token = $2, github_username = $3, github_connected_at = NOW(),
       github_auth_method = $4, github_refresh_token = $5, github_token_expires_at = $6, updated_at = NOW()`,
    [userEmail, token, username, authMethod, refreshToken || null, expiresAt || null]
  );
}

export async function clearUserGitHubIntegration(userEmail: string): Promise<void> {
  await pool.query(
    `UPDATE user_integrations SET github_token = NULL, github_username = NULL, github_connected_at = NULL,
       github_refresh_token = NULL, github_token_expires_at = NULL, github_auth_method = NULL, updated_at = NOW()
     WHERE user_email = $1`,
    [userEmail]
  );
}

// ==================== Railway Integration ====================

export async function getUserRailwayToken(userEmail: string): Promise<{
  token: string;
  authMethod: string;
  refreshToken: string | null;
  expiresAt: Date | null;
} | null> {
  const result = await pool.query(
    `SELECT railway_token, railway_auth_method, railway_refresh_token, railway_token_expires_at
     FROM user_integrations WHERE user_email = $1 AND railway_token IS NOT NULL`,
    [userEmail]
  );
  if (result.rows.length === 0 || !result.rows[0].railway_token) return null;
  return {
    token: result.rows[0].railway_token,
    authMethod: result.rows[0].railway_auth_method || 'token',
    refreshToken: result.rows[0].railway_refresh_token || null,
    expiresAt: result.rows[0].railway_token_expires_at ? new Date(result.rows[0].railway_token_expires_at) : null,
  };
}

export async function updateUserRailwayToken(
  userEmail: string,
  token: string,
  refreshToken: string | null,
  expiresAt: Date | null
): Promise<void> {
  await pool.query(
    `UPDATE user_integrations
     SET railway_token = $2, railway_refresh_token = $3, railway_token_expires_at = $4, updated_at = NOW()
     WHERE user_email = $1`,
    [userEmail, token, refreshToken, expiresAt]
  );
}

// ==================== Specializations ====================

export interface Specialization {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  icon: string;
  user_email: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SPECIALIZATIONS = [
  { name: 'Full Stack Developer', icon: '🚀', description: 'General-purpose developer handling frontend, backend, and infrastructure' },
  { name: 'Frontend/UI Developer', icon: '🎨', description: 'Specialist in user interfaces, React, CSS, and design systems' },
  { name: 'Backend Developer', icon: '⚙️', description: 'Focused on APIs, databases, and server-side architecture' },
  { name: 'DevOps Engineer', icon: '🔧', description: 'Infrastructure, CI/CD, deployments, and monitoring' },
  { name: 'AI/ML Engineer', icon: '🤖', description: 'Machine learning, LLM integrations, and data pipelines' },
  { name: 'Graphic Designer', icon: '✨', description: 'Visual design, branding, and creative assets' },
  { name: 'QA/Test Engineer', icon: '🧪', description: 'Quality assurance, test automation, and bug hunting' },
  { name: 'Data Engineer', icon: '📊', description: 'Data pipelines, ETL, warehousing, and analytics' },
  { name: 'Security Engineer', icon: '🔒', description: 'Security audits, vulnerability testing, and hardening' },
  { name: 'Mobile Developer', icon: '📱', description: 'iOS, Android, and cross-platform mobile development' },
  { name: 'Technical Writer', icon: '📝', description: 'Documentation, API references, and knowledge bases' },
  { name: 'Project Manager', icon: '📋', description: 'Planning, coordination, task breakdown, and delivery oversight' },
];

export async function seedDefaultSpecializations(userEmail: string): Promise<void> {
  for (const spec of DEFAULT_SPECIALIZATIONS) {
    const id = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO specializations (id, name, description, icon, user_email, is_default)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (name, user_email) DO NOTHING`,
      [id, spec.name, spec.description, spec.icon, userEmail]
    );
  }
}

export async function getSpecializations(userEmail: string): Promise<Specialization[]> {
  const result = await pool.query(
    'SELECT * FROM specializations WHERE user_email = $1 ORDER BY is_default DESC, name ASC',
    [userEmail]
  );
  return result.rows;
}

export async function getSpecialization(id: string): Promise<Specialization | null> {
  const result = await pool.query('SELECT * FROM specializations WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createSpecialization(spec: Omit<Specialization, 'id' | 'created_at' | 'updated_at' | 'is_default'>): Promise<Specialization> {
  const id = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query(
    `INSERT INTO specializations (id, name, description, system_prompt, icon, user_email, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE)
     RETURNING *`,
    [id, spec.name, spec.description || null, spec.system_prompt || null, spec.icon || '🤖', spec.user_email]
  );
  return result.rows[0];
}

export async function updateSpecialization(id: string, updates: Partial<Specialization>): Promise<Specialization | null> {
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at' && k !== 'user_email');
  if (fields.length === 0) return null;

  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map(f => updates[f as keyof Specialization]);

  const result = await pool.query(
    `UPDATE specializations SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0] || null;
}

export async function deleteSpecialization(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM specializations WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getSpecializationAgentCount(specName: string, userEmail: string): Promise<number> {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM agents WHERE specialization = $1 AND (user_email = $2 OR user_email IS NULL)',
    [specName, userEmail]
  );
  return parseInt(result.rows[0].count) || 0;
}

// ==================== Installed Skills ====================

export interface InstalledSkill {
  id: string;
  skill_id: string;
  skill_name: string;
  skill_description: string | null;
  skill_content: string | null;
  source_url: string | null;
  category: string | null;
  author: string | null;
  user_email: string;
  installed_at: string;
}

export async function getInstalledSkills(userEmail: string): Promise<InstalledSkill[]> {
  const result = await pool.query(
    'SELECT * FROM installed_skills WHERE user_email = $1 ORDER BY installed_at DESC',
    [userEmail]
  );
  return result.rows;
}

export async function installSkill(skill: Omit<InstalledSkill, 'id' | 'installed_at'>): Promise<InstalledSkill> {
  const id = `iskill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query(
    `INSERT INTO installed_skills (id, skill_id, skill_name, skill_description, skill_content, source_url, category, author, user_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (skill_id, user_email) DO NOTHING
     RETURNING *`,
    [id, skill.skill_id, skill.skill_name, skill.skill_description || null, skill.skill_content || null, skill.source_url || null, skill.category || null, skill.author || null, skill.user_email]
  );
  return result.rows[0];
}

export async function uninstallSkill(skillId: string, userEmail: string): Promise<boolean> {
  // Also remove from any agent_skills
  await pool.query('DELETE FROM agent_skills WHERE skill_id = $1 AND user_email = $2', [skillId, userEmail]);
  const result = await pool.query('DELETE FROM installed_skills WHERE skill_id = $1 AND user_email = $2', [skillId, userEmail]);
  return (result.rowCount ?? 0) > 0;
}

// ==================== Agent Skills ====================

export interface AgentSkill {
  id: string;
  agent_id: string;
  skill_id: string;
  user_email: string | null;
  assigned_at: string;
}

export async function getAgentSkills(agentId: string): Promise<(AgentSkill & { skill_name: string })[]> {
  const result = await pool.query(
    `SELECT ags.*, COALESCE(isk.skill_name, ags.skill_id) as skill_name
     FROM agent_skills ags
     LEFT JOIN installed_skills isk ON isk.skill_id = ags.skill_id AND isk.user_email = ags.user_email
     WHERE ags.agent_id = $1
     ORDER BY ags.assigned_at ASC`,
    [agentId]
  );
  return result.rows;
}

/**
 * Get the content of all skills assigned to an agent.
 * Returns an array of { skill_name, skill_content } for skills that have content.
 */
export async function getAgentSkillContents(agentId: string): Promise<Array<{ skill_name: string; skill_content: string }>> {
  const result = await pool.query(
    `SELECT isk.skill_name, isk.skill_content
     FROM agent_skills ags
     JOIN installed_skills isk ON isk.skill_id = ags.skill_id AND isk.user_email = ags.user_email
     WHERE ags.agent_id = $1 AND isk.skill_content IS NOT NULL AND isk.skill_content != ''
     ORDER BY ags.assigned_at ASC`,
    [agentId]
  );
  return result.rows;
}

export async function setAgentSkills(agentId: string, skillIds: string[], userEmail: string): Promise<void> {
  // Remove old skills
  await pool.query('DELETE FROM agent_skills WHERE agent_id = $1', [agentId]);
  // Insert new
  for (const skillId of skillIds) {
    const id = `as-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO agent_skills (id, agent_id, skill_id, user_email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, skill_id) DO NOTHING`,
      [id, agentId, skillId, userEmail]
    );
  }
}

// ==================== Default Agent Seeding ====================

const DEFAULT_AGENTS = [
  { name: 'Simon', specialization: 'Full Stack Developer', description: 'General-purpose AI agent capable of handling various development tasks.', emoji: '🦊', color: 'from-orange-500 to-amber-500' },
  { name: 'Alex', specialization: 'Frontend/UI Developer', description: 'Frontend specialist focusing on React, CSS, and user experience.', emoji: '🎨', color: 'from-pink-500 to-rose-500' },
  { name: 'Morgan', specialization: 'Backend Developer', description: 'Backend expert handling APIs, databases, and server architecture.', emoji: '⚙️', color: 'from-cyan-500 to-blue-500' },
  { name: 'Riley', specialization: 'QA/Test Engineer', description: 'Quality assurance specialist for testing and bug detection.', emoji: '🧪', color: 'from-emerald-500 to-teal-500' },
  { name: 'Jordan', specialization: 'DevOps Engineer', description: 'Infrastructure and deployment specialist.', emoji: '🔧', color: 'from-violet-500 to-purple-500' },
  { name: 'Casey', specialization: 'AI/ML Engineer', description: 'AI and machine learning integration specialist.', emoji: '🤖', color: 'from-blue-500 to-purple-500' },
  { name: 'Sam', specialization: 'Project Manager', description: 'Project planning, task breakdown, and delivery coordination.', emoji: '📋', color: 'from-lime-500 to-green-500' },
];

export async function seedDefaultAgents(userEmail: string): Promise<void> {
  for (const agent of DEFAULT_AGENTS) {
    const id = `agent-${agent.name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO agents (id, name, specialization, description, avatar_emoji, avatar_color, user_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO NOTHING`,
      [id, agent.name, agent.specialization, agent.description, agent.emoji, agent.color, userEmail]
    );
  }
}

export default pool;
