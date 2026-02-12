import { z } from 'zod';

// ─── Pagination ──────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Tasks ───────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  projectId: z.string().optional(),
  priority: z.number().int().min(0).max(4).default(0),
  assigneeId: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'TESTING', 'IN_REVIEW', 'DONE']).default('TODO'),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'TESTING', 'IN_REVIEW', 'DONE']).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

// ─── Projects ────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  prd: z.string().max(50000).optional(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  prd: z.string().max(50000).optional(),
  status: z.enum(['PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  projectManager: z.string().nullable().optional(),
});

// ─── Agents ──────────────────────────────────────────────────────

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  specializationId: z.string().optional(),
  systemPrompt: z.string().max(50000).optional(),
  model: z.string().max(100).default('claude-sonnet-4-5-20250929'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(256).max(200000).default(8192),
  dockerImage: z.string().max(500).optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  specializationId: z.string().nullable().optional(),
  systemPrompt: z.string().max(50000).nullable().optional(),
  model: z.string().max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(200000).optional(),
  dockerImage: z.string().max(500).nullable().optional(),
});

// ─── Workflows ───────────────────────────────────────────────────

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  isPublished: z.boolean().optional(),
});

// ─── Task Filters ───────────────────────────────────────────────

export const taskFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'TESTING', 'IN_REVIEW', 'DONE']).optional(),
  assigneeId: z.string().optional(),
  search: z.string().optional(),
});

// ─── Comments ────────────────────────────────────────────────────

export const createCommentSchema = z.object({
  author: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
});

// ─── Dependencies ────────────────────────────────────────────────

export const addDependencySchema = z.object({
  dependsOnId: z.string().min(1),
});

// ─── Runs ────────────────────────────────────────────────────────

export const triggerRunSchema = z.object({
  agentId: z.string().optional(),
});

// ─── Specializations ─────────────────────────────────────────────

export const createSpecializationSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.array(z.string()).min(1),
  description: z.string().max(5000).optional(),
  systemPrompt: z.string().max(50000).optional(),
});

export const updateSpecializationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  keywords: z.array(z.string()).min(1).optional(),
  description: z.string().max(5000).nullable().optional(),
  systemPrompt: z.string().max(50000).nullable().optional(),
});

// ─── Integration Tokens ─────────────────────────────────────

export const createIntegrationTokenSchema = z.object({
  provider: z.string().min(1).max(50),
  accessToken: z.string().min(1).max(2000),
});

// ─── Automation Settings ─────────────────────────────────────────

export const updateAutomationSettingSchema = z.object({
  autoAssign: z.boolean().optional(),
  autoSpawn: z.boolean().optional(),
  defaultModel: z.string().max(100).optional(),
  maxConcurrentAgents: z.number().int().min(1).max(20).optional(),
  dailyBudgetCents: z.number().int().min(0).max(100000).optional(),
});

// ─── Profile ─────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  claudeApiKey: z.string().max(500).nullable().optional(),
});
