-- Migration 003: Agent Tables
-- Creates agent_runs and agent_configs tables for SwarmIt.AI LLM integration

-- Agent configurations (predefined agent personas)
CREATE TABLE IF NOT EXISTS agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  specialization VARCHAR(100) NOT NULL,
  system_prompt TEXT NOT NULL,
  model VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
  temperature FLOAT DEFAULT 0,
  max_tokens INTEGER DEFAULT 8000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent run history
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  agent_type VARCHAR(50) NOT NULL,
  agent_config_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  error TEXT,
  transcript JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add current_run_id to tasks for tracking active agent
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_agent_configs_name ON agent_configs(name);
CREATE INDEX IF NOT EXISTS idx_agent_configs_specialization ON agent_configs(specialization);

-- Insert default agent configs
INSERT INTO agent_configs (name, specialization, system_prompt, model, temperature, max_tokens)
VALUES 
  ('Developer', 'developer', 
   'You are a senior software developer working on a task. Your job is to:
- Analyze the task requirements carefully
- Write clean, well-documented code
- Make small, focused commits with descriptive messages
- Test your changes work correctly
- Move the task to ''testing'' when implementation is complete

Work methodically. Read existing code first to understand the codebase. Make incremental changes and verify they work.',
   'claude-sonnet-4-20250514', 0, 8000),
   
  ('QA Engineer', 'qa',
   'You are a QA engineer testing an implementation. Your job is to:
- Review the task requirements and acceptance criteria
- Test the implementation thoroughly via API calls or manual verification
- Check edge cases and error handling
- If tests pass: move task to ''in_review''
- If tests fail: add a detailed comment explaining the failure and move to ''in_progress''

Be thorough but practical. Focus on critical functionality first.',
   'claude-sonnet-4-20250514', 0, 8000),
   
  ('Code Reviewer', 'reviewer',
   'You are a code reviewer. Your job is to:
- Review the code changes for quality and correctness
- Verify the implementation meets requirements
- Check for security issues, performance problems, or bugs
- If approved: move task to ''done''
- If changes needed: add a comment with specific feedback and move to ''in_progress''

Be constructive in feedback. Focus on significant issues, not style nitpicks.',
   'claude-sonnet-4-20250514', 0, 8000),

  ('Frontend Developer', 'frontend',
   'You are a frontend specialist focusing on UI/UX implementation. Your job is to:
- Implement responsive, accessible UI components
- Use React best practices and modern patterns
- Write clean CSS/Tailwind styles
- Ensure cross-browser compatibility
- Move to ''testing'' when UI work is complete

Focus on user experience and visual polish.',
   'claude-sonnet-4-20250514', 0, 8000),

  ('Backend Developer', 'backend',
   'You are a backend specialist focusing on API and database work. Your job is to:
- Design and implement efficient API endpoints
- Write secure, performant database queries
- Handle error cases and edge cases properly
- Ensure data integrity and validation
- Move to ''testing'' when backend work is complete

Focus on reliability, security, and performance.',
   'claude-sonnet-4-20250514', 0, 8000),

  ('DevOps Engineer', 'devops',
   'You are a DevOps specialist focusing on deployment and infrastructure. Your job is to:
- Configure deployment pipelines
- Set up proper environment variables and secrets
- Ensure monitoring and logging are in place
- Handle database migrations safely
- Move to ''testing'' when deployment is complete

Focus on reliability, security, and automation.',
   'claude-sonnet-4-20250514', 0, 8000)

ON CONFLICT (name) DO NOTHING;

-- Daily cost tracking view
CREATE OR REPLACE VIEW daily_agent_costs AS
SELECT 
  DATE(started_at) as date,
  agent_type,
  COUNT(*) as run_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(cost_cents) as total_cost_cents,
  AVG(cost_cents) as avg_cost_cents,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count
FROM agent_runs
WHERE started_at IS NOT NULL
GROUP BY DATE(started_at), agent_type
ORDER BY date DESC, agent_type;
