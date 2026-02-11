// Mirror Prisma enums for frontend use (no Prisma dependency needed)

export const Plan = {
  FREE: 'FREE',
  PRO: 'PRO',
  TEAM: 'TEAM',
} as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

export const ProjectStatus = {
  PLANNING: 'PLANNING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  TESTING: 'TESTING',
  IN_REVIEW: 'IN_REVIEW',
  DONE: 'DONE',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const RunStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const LogStream = {
  stdout: 'stdout',
  stderr: 'stderr',
  system: 'system',
  tool: 'tool',
  assistant: 'assistant',
} as const;
export type LogStream = (typeof LogStream)[keyof typeof LogStream];

export const WorkflowExecStatus = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type WorkflowExecStatus =
  (typeof WorkflowExecStatus)[keyof typeof WorkflowExecStatus];
