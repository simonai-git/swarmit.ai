import { Pool } from 'pg';

const pool = new Pool({
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
  worked_by: string; // JSON array of contributors who worked on this task
  created_at: string;
  updated_at: string;
}

export async function getAllTasks(): Promise<Task[]> {
  // Exclude agent_context from list view for performance (can be very large)
  const result = await pool.query(`
    SELECT id, title, description, status, assignee, priority, due_date, 
           estimated_hours, time_spent, progress, is_blocked, blocked_reason,
           created_at, updated_at, project_id, COALESCE(worked_by, '[]') as worked_by,
           CASE WHEN agent_context IS NOT NULL THEN 'has_context' ELSE NULL END as agent_context
    FROM tasks 
    ORDER BY updated_at DESC
  `);
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
    `INSERT INTO tasks (id, title, description, status, assignee, priority, due_date, estimated_hours, time_spent, progress, is_blocked, blocked_reason, agent_context, project_id, feedback_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      task.feedback_id || null
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
  created_at: string;
  updated_at: string;
}

export async function getAllAgents(): Promise<Agent[]> {
  const result = await pool.query('SELECT * FROM agents ORDER BY created_at DESC');
  return result.rows;
}

export async function getActiveAgents(): Promise<Agent[]> {
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
    `INSERT INTO agents (id, name, specialization, description, system_prompt, memory, avatar_emoji, avatar_color, is_active, tasks_completed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      agent.tasks_completed || 0
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
    `INSERT INTO projects (id, title, description, status, owner, prd, goals, requirements, constraints, tech_stack, timeline, deadline)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      project.id,
      project.title,
      project.description || null,
      project.status || 'defined',
      project.owner || 'Bogdan',
      project.prd || null,
      project.goals || null,
      project.requirements || null,
      project.constraints || null,
      project.tech_stack || null,
      project.timeline || null,
      project.deadline || null
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

export default pool;
