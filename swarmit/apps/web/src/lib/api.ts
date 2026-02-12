const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || 'Request failed', body);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Shared Types ──────────────────────────────────────────

// Paginated responses use resource-specific keys (tasks, projects, etc.)

// ─── Tasks ─────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'TESTING' | 'IN_REVIEW' | 'DONE';
  priority: number;
  isBlocked: boolean;
  projectId: string | null;
  assigneeId: string | null;
  currentRunId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; name: string; specialization: { name: string } | null } | null;
  project?: { id: string; title: string } | null;
  dependsOn?: Array<{ dependsOn: { id: string; title: string; status: string } }>;
  _count?: { comments: number; runs: number };
}

export interface TaskComment {
  id: string;
  taskId: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface TaskRun {
  id: string;
  taskId: string;
  agentType: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  tokens: number | null;
  cost: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  task?: { id: string; title: string };
  logs?: TaskLog[];
  executionState?: unknown;
}

export interface TaskLog {
  id: string;
  runId: string;
  stream: 'stdout' | 'stderr' | 'system' | 'tool' | 'assistant';
  content: string;
  createdAt: string;
}

export const tasks = {
  list: (params?: {
    page?: number;
    limit?: number;
    projectId?: string;
    status?: string;
    assigneeId?: string;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.projectId) searchParams.set('projectId', params.projectId);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.assigneeId) searchParams.set('assigneeId', params.assigneeId);
    if (params?.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return request<{ tasks: Task[]; total: number; page: number; limit: number }>(
      `/tasks${qs ? `?${qs}` : ''}`,
    );
  },

  get: (id: string) => request<Task>(`/tasks/${id}`),

  create: (data: {
    title: string;
    description?: string;
    priority?: number;
    projectId?: string;
    assigneeId?: string;
  }) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: number;
    assigneeId?: string | null;
    projectId?: string | null;
  }) => request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  addComment: (taskId: string, data: { author: string; content: string }) =>
    request<TaskComment>(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify(data) }),

  addDependency: (taskId: string, dependsOnId: string) =>
    request<{ id: string }>(`/tasks/${taskId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ dependsOnId }),
    }),

  removeDependency: (taskId: string, depId: string) =>
    request<{ success: boolean }>(`/tasks/${taskId}/dependencies/${depId}`, { method: 'DELETE' }),

  triggerRun: (taskId: string) =>
    request<TaskRun>(`/tasks/${taskId}/run`, { method: 'POST' }),

  getRunLogs: (taskId: string, runId: string) =>
    request<TaskLog[]>(`/tasks/${taskId}/runs/${runId}/logs`),
};

// ─── Projects ──────────────────────────────────────────────

export interface Project {
  id: string;
  title: string;
  description: string | null;
  prd: string | null;
  status: 'PLANNING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  userId: string;
  createdAt: string;
  updatedAt: string;
  tasks?: Task[];
  _count?: { tasks: number };
}

export const projects = {
  list: (page = 1, limit = 20) =>
    request<{ projects: Project[]; total: number; page: number; limit: number }>(
      `/projects?page=${page}&limit=${limit}`,
    ),

  get: (id: string) => request<Project>(`/projects/${id}`),

  create: (data: { title: string; description?: string; prd?: string }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { title?: string; description?: string; prd?: string }) =>
    request<{ success: boolean }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  start: (id: string) => request<{ success: boolean; status: string }>(`/projects/${id}/start`, { method: 'POST' }),
  pause: (id: string) => request<{ success: boolean; status: string }>(`/projects/${id}/pause`, { method: 'POST' }),
  resume: (id: string) => request<{ success: boolean; status: string }>(`/projects/${id}/resume`, { method: 'POST' }),
  cancel: (id: string) => request<{ success: boolean; status: string }>(`/projects/${id}/cancel`, { method: 'POST' }),
  complete: (id: string) => request<{ success: boolean; status: string }>(`/projects/${id}/complete`, { method: 'POST' }),
};

// ─── Agents ────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  specializationId: string | null;
  specialization: Specialization | null;
  systemPrompt: string | null;
  model: string;
  temperature: number;
  maxTokens: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
  skills?: Array<{ skill: { id: string; name: string; description: string | null } }>;
  agentWorkflows?: Array<{ workflow: { id: string; name: string } }>;
  tasks?: Task[];
  _count?: { tasks: number };
}

export const agents = {
  list: (page = 1, limit = 20) =>
    request<{ agents: Agent[]; total: number; page: number; limit: number }>(
      `/agents?page=${page}&limit=${limit}`,
    ),

  get: (id: string) => request<Agent>(`/agents/${id}`),

  create: (data: {
    name: string;
    specializationId: string;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) => request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: {
    name?: string;
    specializationId?: string | null;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) => request<{ success: boolean }>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<{ success: boolean }>(`/agents/${id}`, { method: 'DELETE' }),

  addSkill: (agentId: string, skillId: string) =>
    request<{ success: boolean }>(`/agents/${agentId}/skills`, {
      method: 'POST',
      body: JSON.stringify({ skillId }),
    }),

  removeSkill: (agentId: string, skillId: string) =>
    request<{ success: boolean }>(`/agents/${agentId}/skills/${skillId}`, { method: 'DELETE' }),

  addWorkflow: (agentId: string, workflowId: string) =>
    request<{ success: boolean }>(`/agents/${agentId}/workflows`, {
      method: 'POST',
      body: JSON.stringify({ workflowId }),
    }),

  removeWorkflow: (agentId: string, workflowId: string) =>
    request<{ success: boolean }>(`/agents/${agentId}/workflows/${workflowId}`, { method: 'DELETE' }),
};

// ─── Runs ──────────────────────────────────────────────────

export const runs = {
  list: (page = 1, limit = 20) =>
    request<{ runs: TaskRun[]; total: number; page: number; limit: number }>(
      `/runs?page=${page}&limit=${limit}`,
    ),

  get: (id: string) => request<TaskRun>(`/runs/${id}`),

  cancel: (id: string) => request<{ success: boolean }>(`/runs/${id}/cancel`, { method: 'POST' }),
};

// ─── Costs ─────────────────────────────────────────────────

export interface CostSummary {
  period: string;
  totals: { tokens: number; cost: number; runs: number };
  byAgent: Array<{
    agentType: string;
    _sum: { tokens: number | null; cost: number | null };
    _count: number;
  }>;
  byDay: Array<{ day: string; tokens: number; cost: number; runs: number }>;
  budget: { dailyLimitCents: number; todaySpendCents: number };
}

export const costs = {
  get: (period?: '7d' | '30d' | '90d') =>
    request<CostSummary>(`/costs${period ? `?period=${period}` : ''}`),
};

// ─── Dashboard ─────────────────────────────────────────────

export interface DashboardData {
  tasks: Array<{ status: string; _count: number }>;
  runs: { total: number; totalTokens: number; totalCost: number };
  projects: Array<{ status: string; _count: number }>;
  recentRuns: TaskRun[];
}

export const dashboard = {
  get: () => request<DashboardData>('/dashboard'),
};

// ─── Workflows ─────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
  versions?: WorkflowVersion[];
  agents?: { agent: { id: string; name: string } }[];
  _count?: { agents: number };
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  nodes: unknown;
  edges: unknown;
  createdAt: string;
}

export const workflows = {
  list: (page = 1, limit = 20) =>
    request<{ workflows: Workflow[]; total: number; page: number; limit: number }>(
      `/workflows?page=${page}&limit=${limit}`,
    ),

  get: (id: string) => request<Workflow>(`/workflows/${id}`),

  create: (data: { name: string; description?: string }) =>
    request<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { name?: string; description?: string; isPublished?: boolean }) =>
    request<{ success: boolean }>(`/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<{ success: boolean }>(`/workflows/${id}`, { method: 'DELETE' }),

  saveVersion: (id: string, nodes: unknown[], edges: unknown[]) =>
    request<WorkflowVersion>(`/workflows/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ nodes, edges }),
    }),

  validate: (id: string, nodes: unknown[], edges: unknown[]) =>
    request<{ valid: boolean; errors: Array<{ type: string; message: string; nodeId?: string }>; warnings: Array<{ type: string; message: string; nodeId?: string }> }>(
      `/workflows/${id}/validate`,
      { method: 'POST', body: JSON.stringify({ nodes, edges }) },
    ),

  publish: (id: string) =>
    request<{ success: boolean; versionId: string }>(`/workflows/${id}/publish`, { method: 'POST' }),
};

// ─── Specializations ──────────────────────────────────────

export interface Specialization {
  id: string;
  name: string;
  keywords: string[];
  description: string | null;
  systemPrompt: string | null;
  dockerImage: string | null;
  userId: string;
  _count?: { agents: number };
}

export const specializations = {
  list: () => request<Specialization[]>('/specializations'),
  create: (data: { name: string; keywords: string[]; description?: string; systemPrompt?: string; dockerImage?: string }) =>
    request<Specialization>('/specializations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; keywords?: string[]; description?: string | null; systemPrompt?: string | null; dockerImage?: string | null }) =>
    request<{ success: boolean }>(`/specializations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ success: boolean }>(`/specializations/${id}`, { method: 'DELETE' }),
};

// ─── Skills ────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  _count?: { agents: number };
}

export const skills = {
  list: (page = 1, limit = 20) =>
    request<{ skills: Skill[]; total: number; page: number; limit: number }>(
      `/skills?page=${page}&limit=${limit}`,
    ),
  get: (id: string) => request<Skill>(`/skills/${id}`),
  create: (data: { name: string; description?: string; sourceUrl?: string }) =>
    request<Skill>('/skills', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ success: boolean }>(`/skills/${id}`, { method: 'DELETE' }),
  search: (q: string) => request<{ skills: Skill[] }>(`/skills/search?q=${encodeURIComponent(q)}`),
};

// ─── Profile ───────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  plan: string;
  claudeApiKey: string | null;
  createdAt: string;
}

export interface AutomationSettings {
  id: string;
  userId: string;
  autoAssign: boolean;
  autoSpawn: boolean;
  defaultModel: string;
  maxConcurrentAgents: number;
  dailyBudgetCents: number;
}

export const profile = {
  get: () => request<UserProfile>('/profile'),
  update: (data: { name?: string; claudeApiKey?: string | null }) =>
    request<{ success: boolean }>('/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  getAutomation: () => request<AutomationSettings>('/profile/automation'),
  updateAutomation: (data: Partial<Omit<AutomationSettings, 'id' | 'userId'>>) =>
    request<{ success: boolean }>('/profile/automation', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── Integrations ──────────────────────────────────────────

export interface IntegrationToken {
  id: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

export const integrations = {
  listTokens: () => request<{ tokens: IntegrationToken[] }>('/integrations/tokens'),

  upsertToken: (provider: string, accessToken: string) =>
    request<IntegrationToken>('/integrations/tokens', {
      method: 'POST',
      body: JSON.stringify({ provider, accessToken }),
    }),

  deleteToken: (provider: string) =>
    request<{ success: boolean }>(`/integrations/tokens/${provider}`, { method: 'DELETE' }),
};

// ─── Notifications ──────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export const notifications = {
  list: (params?: { page?: number; limit?: number; unreadOnly?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.unreadOnly) searchParams.set('unreadOnly', 'true');
    const qs = searchParams.toString();
    return request<{ notifications: Notification[]; total: number; page: number; limit: number }>(
      `/notifications${qs ? `?${qs}` : ''}`,
    );
  },

  unreadCount: () => request<{ count: number }>('/notifications/unread-count'),

  markAsRead: (id: string) =>
    request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),

  markAllAsRead: () =>
    request<{ success: boolean }>('/notifications/read-all', { method: 'POST' }),
};

// ─── Export ────────────────────────────────────────────────

export const api = {
  tasks,
  projects,
  agents,
  runs,
  costs,
  dashboard,
  workflows,
  specializations,
  skills,
  profile,
  notifications,
  integrations,
};
