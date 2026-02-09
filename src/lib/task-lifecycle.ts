import { Task, updateTask } from './db';
import { agentQueue } from './agent-queue';

// Automation settings (can be configured via API)
interface AutomationSettings {
  enabled: boolean;
  autoAssign: boolean;
  autoSpawnOnCreate: boolean;
  autoSpawnOnTesting: boolean;
  autoSpawnOnReview: boolean;
  autoConvertFeedback: boolean;
}

// Default settings
let settings: AutomationSettings = {
  enabled: true,
  autoAssign: true,
  autoSpawnOnCreate: true,
  autoSpawnOnTesting: true,
  autoSpawnOnReview: true,
  autoConvertFeedback: true,
};

// Get/set automation settings
export function getAutomationSettings(): AutomationSettings {
  return { ...settings };
}

export function setAutomationSettings(newSettings: Partial<AutomationSettings>): AutomationSettings {
  settings = { ...settings, ...newSettings };
  return settings;
}

// Specialization keywords for auto-assignment
const SPECIALIZATION_KEYWORDS: Record<string, string[]> = {
  frontend: ['ui', 'css', 'react', 'component', 'button', 'modal', 'layout', 'style', 'responsive', 'tailwind', 'design', 'animation'],
  backend: ['api', 'database', 'endpoint', 'server', 'query', 'sql', 'postgres', 'auth', 'middleware', 'route'],
  devops: ['deploy', 'docker', 'railway', 'ci', 'cd', 'pipeline', 'kubernetes', 'infrastructure', 'env', 'ssl', 'domain'],
  qa: ['test', 'bug', 'fix', 'verify', 'validate', 'check', 'broken', 'issue', 'error'],
  ai: ['llm', 'claude', 'openai', 'prompt', 'agent', 'ml', 'model', 'embedding', 'vector'],
};

// Agent names by specialization
const AGENT_BY_SPECIALIZATION: Record<string, string> = {
  frontend: 'Alex',
  backend: 'Morgan',
  devops: 'Jordan',
  qa: 'Riley',
  ai: 'Casey',
  pm: 'Sam',
  default: 'Simon',
};

// Detect specialization from task title and description
export function detectSpecialization(task: { title: string; description?: string | null }): string {
  const text = `${task.title} ${task.description || ''}`.toLowerCase();
  
  let bestMatch = 'default';
  let bestScore = 0;
  
  for (const [spec, keywords] of Object.entries(SPECIALIZATION_KEYWORDS)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = spec;
    }
  }
  
  return bestMatch;
}

// Select specialist agent for a task
export function selectSpecialist(task: { title: string; description?: string | null }): string {
  const specialization = detectSpecialization(task);
  return AGENT_BY_SPECIALIZATION[specialization] || AGENT_BY_SPECIALIZATION.default;
}

// Priority mapping
const PRIORITY_MAP: Record<string, number> = {
  high: 10,
  medium: 5,
  low: 1,
};

// Hook: Called when a task is created
export async function onTaskCreated(task: Task, userEmail?: string): Promise<void> {
  if (!settings.enabled) return;

  console.log(`[Lifecycle] Task created: ${task.id} - ${task.title}`);

  // Auto-assign if no assignee
  if (settings.autoAssign && !task.assignee) {
    const assignee = selectSpecialist(task);
    await updateTask(task.id, { assignee });
    console.log(`[Lifecycle] Auto-assigned to ${assignee}`);
  }

  // Auto-spawn agent for new tasks
  if (settings.autoSpawnOnCreate && task.status === 'todo') {
    const priority = PRIORITY_MAP[task.priority] || 5;
    const effectiveUserEmail = userEmail || task.user_email || undefined;
    // Map assignee to agent type for correct prompt selection
    const agentType = task.assignee === 'Sam' ? 'product_manager'
      : task.assignee === 'Taylor' ? 'pm'
      : task.assignee === 'Riley' ? 'qa'
      : task.assignee === 'Simon' ? 'reviewer'
      : task.assignee === 'Jordan' ? 'devops'
      : 'developer';
    await agentQueue.enqueue({
      taskId: task.id,
      agentType,
      priority,
      tenantId: effectiveUserEmail,
      userEmail: effectiveUserEmail,
    });
    console.log(`[Lifecycle] Enqueued ${agentType} agent for task ${task.id}`);
  }
}

// Hook: Called when a task status changes
export async function onTaskStatusChanged(
  task: Task,
  oldStatus: string,
  newStatus: string,
  userEmail?: string
): Promise<void> {
  if (!settings.enabled) return;

  console.log(`[Lifecycle] Task ${task.id} status: ${oldStatus} → ${newStatus}`);

  const priority = PRIORITY_MAP[task.priority] || 5;
  const effectiveUserEmail = userEmail || task.user_email || undefined;

  // Spawn QA when moved to testing
  if (settings.autoSpawnOnTesting && newStatus === 'testing') {
    await agentQueue.enqueue({
      taskId: task.id,
      agentType: 'qa',
      priority,
      tenantId: effectiveUserEmail,
      userEmail: effectiveUserEmail,
    });
    console.log(`[Lifecycle] Enqueued QA agent for task ${task.id}`);
  }

  // Spawn reviewer when moved to in_review
  if (settings.autoSpawnOnReview && newStatus === 'in_review') {
    await agentQueue.enqueue({
      taskId: task.id,
      agentType: 'reviewer',
      priority,
      tenantId: effectiveUserEmail,
      userEmail: effectiveUserEmail,
    });
    console.log(`[Lifecycle] Enqueued reviewer agent for task ${task.id}`);
  }
}

// Hook: Called when feedback is created
export async function onFeedbackCreated(feedback: {
  id: string;
  project_id: string;
  title: string;
  content: string;
  type: string;
}): Promise<void> {
  if (!settings.enabled || !settings.autoConvertFeedback) return;
  
  console.log(`[Lifecycle] Feedback created: ${feedback.id} - ${feedback.title}`);
  
  // Note: The actual conversion to task should be done via the existing
  // /api/projects/:id/feedback/:feedbackId/convert endpoint
  // This hook is for logging/tracking purposes
}

// Hook: Called when a task is assigned to a different agent
export async function onTaskAssigned(
  task: Task,
  oldAssignee: string | null,
  newAssignee: string,
  userEmail?: string
): Promise<void> {
  if (!settings.enabled) return;

  console.log(`[Lifecycle] Task ${task.id} assigned: ${oldAssignee || 'unassigned'} → ${newAssignee}`);

  // If task is in progress and assigned to a new agent, spawn that agent
  if (task.status === 'in_progress') {
    const agentType = newAssignee === 'Sam' ? 'product_manager'
      : newAssignee === 'Taylor' ? 'pm'
      : newAssignee === 'Riley' ? 'qa'
      : newAssignee === 'Simon' ? 'reviewer'
      : newAssignee === 'Jordan' ? 'devops'
      : 'developer';

    const priority = PRIORITY_MAP[task.priority] || 5;
    const effectiveUserEmail = userEmail || task.user_email || undefined;
    await agentQueue.enqueue({
      taskId: task.id,
      agentType,
      priority,
      tenantId: effectiveUserEmail,
      userEmail: effectiveUserEmail,
    });
    console.log(`[Lifecycle] Enqueued ${agentType} agent for reassigned task ${task.id}`);
  }
}

// Utility: Check if automation should trigger for a task
export function shouldAutomate(task: Task): boolean {
  // Don't automate tasks that are already done or cancelled
  if (task.status === 'done') return false;
  
  // Don't automate blocked tasks
  if (task.is_blocked) return false;
  
  return settings.enabled;
}
