import { describe, it, expect } from 'vitest';
import {
  paginationSchema,
  createTaskSchema,
  updateTaskSchema,
  createProjectSchema,
  updateProjectSchema,
  createAgentSchema,
  updateAgentSchema,
  createWorkflowSchema,
  updateWorkflowSchema,
  taskFilterSchema,
  createCommentSchema,
  addDependencySchema,
  triggerRunSchema,
  createSpecializationSchema,
  updateSpecializationSchema,
  createIntegrationTokenSchema,
  updateAutomationSettingSchema,
  updateProfileSchema,
} from '../schemas/api.js';

// ─── paginationSchema ───────────────────────────────────────────────

describe('paginationSchema', () => {
  it('parses with defaults when no values provided', () => {
    const result = paginationSchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it('coerces string values to numbers', () => {
    const result = paginationSchema.parse({ page: '3', limit: '50' });
    expect(result).toEqual({ page: 3, limit: 50 });
  });

  it('accepts valid page and limit', () => {
    const result = paginationSchema.parse({ page: 5, limit: 100 });
    expect(result).toEqual({ page: 5, limit: 100 });
  });

  it('rejects page less than 1', () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
  });

  it('rejects limit less than 1', () => {
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
  });

  it('rejects limit greater than 100', () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });

  it('rejects non-integer page', () => {
    expect(() => paginationSchema.parse({ page: 1.5 })).toThrow();
  });
});

// ─── createTaskSchema ───────────────────────────────────────────────

describe('createTaskSchema', () => {
  it('parses valid task with defaults', () => {
    const result = createTaskSchema.parse({ title: 'My Task' });
    expect(result).toEqual({
      title: 'My Task',
      priority: 0,
      status: 'TODO',
    });
  });

  it('parses all optional fields', () => {
    const result = createTaskSchema.parse({
      title: 'Task',
      description: 'Some description',
      projectId: 'proj-1',
      priority: 3,
      assigneeId: 'agent-1',
      status: 'IN_PROGRESS',
    });
    expect(result.title).toBe('Task');
    expect(result.description).toBe('Some description');
    expect(result.projectId).toBe('proj-1');
    expect(result.priority).toBe(3);
    expect(result.assigneeId).toBe('agent-1');
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('rejects missing title', () => {
    expect(() => createTaskSchema.parse({})).toThrow();
  });

  it('rejects empty title', () => {
    expect(() => createTaskSchema.parse({ title: '' })).toThrow();
  });

  it('rejects title exceeding max length', () => {
    expect(() => createTaskSchema.parse({ title: 'x'.repeat(501) })).toThrow();
  });

  it('rejects description exceeding max length', () => {
    expect(() =>
      createTaskSchema.parse({ title: 'ok', description: 'x'.repeat(10001) })
    ).toThrow();
  });

  it('rejects priority out of range', () => {
    expect(() => createTaskSchema.parse({ title: 'ok', priority: -1 })).toThrow();
    expect(() => createTaskSchema.parse({ title: 'ok', priority: 5 })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => createTaskSchema.parse({ title: 'ok', status: 'INVALID' })).toThrow();
  });

  it('accepts all valid status values', () => {
    for (const status of ['TODO', 'IN_PROGRESS', 'TESTING', 'IN_REVIEW', 'DONE']) {
      const result = createTaskSchema.parse({ title: 'ok', status });
      expect(result.status).toBe(status);
    }
  });
});

// ─── updateTaskSchema ───────────────────────────────────────────────

describe('updateTaskSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = updateTaskSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts partial update', () => {
    const result = updateTaskSchema.parse({ title: 'Updated', status: 'DONE' });
    expect(result.title).toBe('Updated');
    expect(result.status).toBe('DONE');
  });

  it('accepts nullable assigneeId', () => {
    const result = updateTaskSchema.parse({ assigneeId: null });
    expect(result.assigneeId).toBeNull();
  });

  it('accepts nullable projectId', () => {
    const result = updateTaskSchema.parse({ projectId: null });
    expect(result.projectId).toBeNull();
  });

  it('rejects invalid priority', () => {
    expect(() => updateTaskSchema.parse({ priority: 5 })).toThrow();
  });
});

// ─── createProjectSchema ────────────────────────────────────────────

describe('createProjectSchema', () => {
  it('parses valid project', () => {
    const result = createProjectSchema.parse({ title: 'My Project' });
    expect(result.title).toBe('My Project');
  });

  it('accepts optional description and prd', () => {
    const result = createProjectSchema.parse({
      title: 'P',
      description: 'desc',
      prd: 'Product requirements here',
    });
    expect(result.description).toBe('desc');
    expect(result.prd).toBe('Product requirements here');
  });

  it('rejects missing title', () => {
    expect(() => createProjectSchema.parse({})).toThrow();
  });

  it('rejects empty title', () => {
    expect(() => createProjectSchema.parse({ title: '' })).toThrow();
  });

  it('rejects title exceeding max length', () => {
    expect(() => createProjectSchema.parse({ title: 'x'.repeat(501) })).toThrow();
  });

  it('rejects description exceeding max length', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', description: 'x'.repeat(10001) })
    ).toThrow();
  });

  it('rejects prd exceeding max length', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', prd: 'x'.repeat(50001) })
    ).toThrow();
  });

  it('accepts isDraft boolean', () => {
    const result = createProjectSchema.parse({ title: 'Draft', isDraft: true });
    expect(result.isDraft).toBe(true);
  });

  it('accepts all new Step 1 fields', () => {
    const result = createProjectSchema.parse({
      title: 'Full Project',
      projectType: 'web-app',
      goal: 'Build a recipe app',
      targetUsers: 'Home cooks',
      mustHaves: ['Search', 'Recommendations'],
      deadline: '2026-04-01T00:00:00.000Z',
      budgetRange: '$500-$1000',
      contactEmail: 'test@example.com',
    });
    expect(result.projectType).toBe('web-app');
    expect(result.goal).toBe('Build a recipe app');
    expect(result.targetUsers).toBe('Home cooks');
    expect(result.mustHaves).toEqual(['Search', 'Recommendations']);
    expect(result.deadline).toBe('2026-04-01T00:00:00.000Z');
    expect(result.budgetRange).toBe('$500-$1000');
    expect(result.contactEmail).toBe('test@example.com');
  });

  it('accepts all new Step 2 fields', () => {
    const result = createProjectSchema.parse({
      title: 'Full Project',
      niceToHaves: ['Social sharing'],
      referenceLinks: ['https://example.com'],
      constraints: 'Must work offline',
      comms: 'Prefer async',
      dataSensitivity: 'internal',
    });
    expect(result.niceToHaves).toEqual(['Social sharing']);
    expect(result.referenceLinks).toEqual(['https://example.com']);
    expect(result.constraints).toBe('Must work offline');
    expect(result.comms).toBe('Prefer async');
    expect(result.dataSensitivity).toBe('internal');
  });

  it('rejects invalid contactEmail', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', contactEmail: 'not-email' })
    ).toThrow();
  });

  it('rejects invalid deadline (non-datetime)', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', deadline: 'tomorrow' })
    ).toThrow();
  });

  it('rejects invalid referenceLinks (non-URL)', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', referenceLinks: ['not-a-url'] })
    ).toThrow();
  });

  it('rejects mustHaves exceeding max items', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', mustHaves: Array(21).fill('feature') })
    ).toThrow();
  });

  it('rejects referenceLinks exceeding max items', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', referenceLinks: Array(11).fill('https://example.com') })
    ).toThrow();
  });

  it('rejects goal exceeding max length', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', goal: 'x'.repeat(2001) })
    ).toThrow();
  });

  it('rejects constraints exceeding max length', () => {
    expect(() =>
      createProjectSchema.parse({ title: 'ok', constraints: 'x'.repeat(5001) })
    ).toThrow();
  });
});

// ─── updateProjectSchema ────────────────────────────────────────────

describe('updateProjectSchema', () => {
  it('accepts empty object', () => {
    const result = updateProjectSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts all optional fields', () => {
    const result = updateProjectSchema.parse({
      title: 'Updated',
      description: 'New desc',
      prd: 'New PRD',
      status: 'ACTIVE',
      projectManager: 'pm-1',
    });
    expect(result.status).toBe('ACTIVE');
    expect(result.projectManager).toBe('pm-1');
  });

  it('accepts nullable projectManager', () => {
    const result = updateProjectSchema.parse({ projectManager: null });
    expect(result.projectManager).toBeNull();
  });

  it('rejects invalid status', () => {
    expect(() => updateProjectSchema.parse({ status: 'BOGUS' })).toThrow();
  });

  it('accepts all valid status values including DRAFT', () => {
    for (const status of ['DRAFT', 'PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']) {
      const result = updateProjectSchema.parse({ status });
      expect(result.status).toBe(status);
    }
  });

  it('accepts new project fields as nullable', () => {
    const result = updateProjectSchema.parse({
      projectType: null,
      goal: null,
      targetUsers: null,
      deadline: null,
      budgetRange: null,
      contactEmail: null,
      constraints: null,
      comms: null,
      dataSensitivity: null,
    });
    expect(result.projectType).toBeNull();
    expect(result.goal).toBeNull();
    expect(result.deadline).toBeNull();
  });

  it('accepts new project fields with values', () => {
    const result = updateProjectSchema.parse({
      projectType: 'api-backend',
      goal: 'Updated goal',
      mustHaves: ['Feature A'],
      niceToHaves: ['Feature B'],
      referenceLinks: ['https://example.com'],
    });
    expect(result.projectType).toBe('api-backend');
    expect(result.mustHaves).toEqual(['Feature A']);
  });
});

// ─── createAgentSchema ──────────────────────────────────────────────

describe('createAgentSchema', () => {
  it('parses valid agent with defaults', () => {
    const result = createAgentSchema.parse({ name: 'Agent1', specializationId: 'spec-1' });
    expect(result.name).toBe('Agent1');
    expect(result.specializationId).toBe('spec-1');
    expect(result.model).toBe('claude-sonnet-4-5-20250929');
    expect(result.temperature).toBe(0.7);
    expect(result.maxTokens).toBe(8192);
  });

  it('accepts custom values', () => {
    const result = createAgentSchema.parse({
      name: 'Agent2',
      specializationId: 'spec-2',
      systemPrompt: 'You are helpful',
      model: 'custom-model',
      temperature: 1.5,
      maxTokens: 4096,
    });
    expect(result.systemPrompt).toBe('You are helpful');
    expect(result.model).toBe('custom-model');
    expect(result.temperature).toBe(1.5);
    expect(result.maxTokens).toBe(4096);
  });

  it('rejects missing name', () => {
    expect(() => createAgentSchema.parse({ specializationId: 'spec-1' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createAgentSchema.parse({ name: '', specializationId: 'spec-1' })).toThrow();
  });

  it('rejects missing specializationId', () => {
    expect(() => createAgentSchema.parse({ name: 'Agent' })).toThrow();
  });

  it('rejects empty specializationId', () => {
    expect(() => createAgentSchema.parse({ name: 'Agent', specializationId: '' })).toThrow();
  });

  it('rejects temperature out of range', () => {
    expect(() =>
      createAgentSchema.parse({ name: 'A', specializationId: 's', temperature: -0.1 })
    ).toThrow();
    expect(() =>
      createAgentSchema.parse({ name: 'A', specializationId: 's', temperature: 2.1 })
    ).toThrow();
  });

  it('rejects maxTokens out of range', () => {
    expect(() =>
      createAgentSchema.parse({ name: 'A', specializationId: 's', maxTokens: 255 })
    ).toThrow();
    expect(() =>
      createAgentSchema.parse({ name: 'A', specializationId: 's', maxTokens: 200001 })
    ).toThrow();
  });

  it('rejects name exceeding max length', () => {
    expect(() =>
      createAgentSchema.parse({ name: 'x'.repeat(101), specializationId: 's' })
    ).toThrow();
  });
});

// ─── updateAgentSchema ──────────────────────────────────────────────

describe('updateAgentSchema', () => {
  it('accepts empty object', () => {
    const result = updateAgentSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts partial update', () => {
    const result = updateAgentSchema.parse({ name: 'NewName', temperature: 0.5 });
    expect(result.name).toBe('NewName');
    expect(result.temperature).toBe(0.5);
  });

  it('accepts nullable specializationId and systemPrompt', () => {
    const result = updateAgentSchema.parse({ specializationId: null, systemPrompt: null });
    expect(result.specializationId).toBeNull();
    expect(result.systemPrompt).toBeNull();
  });
});

// ─── createWorkflowSchema ───────────────────────────────────────────

describe('createWorkflowSchema', () => {
  it('parses valid workflow', () => {
    const result = createWorkflowSchema.parse({ name: 'My Workflow' });
    expect(result.name).toBe('My Workflow');
  });

  it('accepts optional description', () => {
    const result = createWorkflowSchema.parse({ name: 'W', description: 'Desc' });
    expect(result.description).toBe('Desc');
  });

  it('rejects missing name', () => {
    expect(() => createWorkflowSchema.parse({})).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createWorkflowSchema.parse({ name: '' })).toThrow();
  });

  it('rejects name exceeding max length', () => {
    expect(() => createWorkflowSchema.parse({ name: 'x'.repeat(201) })).toThrow();
  });

  it('rejects description exceeding max length', () => {
    expect(() =>
      createWorkflowSchema.parse({ name: 'ok', description: 'x'.repeat(5001) })
    ).toThrow();
  });
});

// ─── updateWorkflowSchema ───────────────────────────────────────────

describe('updateWorkflowSchema', () => {
  it('accepts empty object', () => {
    const result = updateWorkflowSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts optional fields', () => {
    const result = updateWorkflowSchema.parse({
      name: 'Updated',
      description: 'New desc',
      isPublished: true,
    });
    expect(result.name).toBe('Updated');
    expect(result.isPublished).toBe(true);
  });

  it('rejects non-boolean isPublished', () => {
    expect(() => updateWorkflowSchema.parse({ isPublished: 'yes' })).toThrow();
  });
});

// ─── taskFilterSchema ───────────────────────────────────────────────

describe('taskFilterSchema', () => {
  it('parses with defaults', () => {
    const result = taskFilterSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('accepts all filter fields', () => {
    const result = taskFilterSchema.parse({
      page: 2,
      limit: 50,
      projectId: 'proj-1',
      status: 'IN_PROGRESS',
      assigneeId: 'agent-1',
      search: 'bug fix',
    });
    expect(result.projectId).toBe('proj-1');
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.assigneeId).toBe('agent-1');
    expect(result.search).toBe('bug fix');
  });

  it('rejects invalid status', () => {
    expect(() => taskFilterSchema.parse({ status: 'INVALID' })).toThrow();
  });

  it('coerces page and limit from strings', () => {
    const result = taskFilterSchema.parse({ page: '3', limit: '10' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });
});

// ─── createCommentSchema ────────────────────────────────────────────

describe('createCommentSchema', () => {
  it('parses valid comment', () => {
    const result = createCommentSchema.parse({ author: 'Alice', content: 'Looks good!' });
    expect(result.author).toBe('Alice');
    expect(result.content).toBe('Looks good!');
  });

  it('rejects missing author', () => {
    expect(() => createCommentSchema.parse({ content: 'hi' })).toThrow();
  });

  it('rejects missing content', () => {
    expect(() => createCommentSchema.parse({ author: 'Bob' })).toThrow();
  });

  it('rejects empty author', () => {
    expect(() => createCommentSchema.parse({ author: '', content: 'hi' })).toThrow();
  });

  it('rejects empty content', () => {
    expect(() => createCommentSchema.parse({ author: 'Bob', content: '' })).toThrow();
  });

  it('rejects author exceeding max length', () => {
    expect(() =>
      createCommentSchema.parse({ author: 'x'.repeat(101), content: 'hi' })
    ).toThrow();
  });

  it('rejects content exceeding max length', () => {
    expect(() =>
      createCommentSchema.parse({ author: 'Bob', content: 'x'.repeat(10001) })
    ).toThrow();
  });
});

// ─── addDependencySchema ────────────────────────────────────────────

describe('addDependencySchema', () => {
  it('parses valid dependency', () => {
    const result = addDependencySchema.parse({ dependsOnId: 'task-123' });
    expect(result.dependsOnId).toBe('task-123');
  });

  it('rejects missing dependsOnId', () => {
    expect(() => addDependencySchema.parse({})).toThrow();
  });

  it('rejects empty dependsOnId', () => {
    expect(() => addDependencySchema.parse({ dependsOnId: '' })).toThrow();
  });
});

// ─── triggerRunSchema ───────────────────────────────────────────────

describe('triggerRunSchema', () => {
  it('parses with optional agentId', () => {
    const result = triggerRunSchema.parse({});
    expect(result.agentId).toBeUndefined();
  });

  it('accepts agentId', () => {
    const result = triggerRunSchema.parse({ agentId: 'agent-1' });
    expect(result.agentId).toBe('agent-1');
  });
});

// ─── createSpecializationSchema ─────────────────────────────────────

describe('createSpecializationSchema', () => {
  it('parses valid specialization', () => {
    const result = createSpecializationSchema.parse({
      name: 'Frontend',
      keywords: ['react', 'css'],
      dockerImage: 'swarmitai/node:latest',
    });
    expect(result.name).toBe('Frontend');
    expect(result.keywords).toEqual(['react', 'css']);
    expect(result.dockerImage).toBe('swarmitai/node:latest');
  });

  it('accepts optional fields', () => {
    const result = createSpecializationSchema.parse({
      name: 'Backend',
      keywords: ['python'],
      dockerImage: 'swarmitai/python:latest',
      description: 'Backend dev',
      systemPrompt: 'You are a backend developer',
    });
    expect(result.description).toBe('Backend dev');
    expect(result.systemPrompt).toBe('You are a backend developer');
  });

  it('rejects missing name', () => {
    expect(() =>
      createSpecializationSchema.parse({ keywords: ['a'], dockerImage: 'img' })
    ).toThrow();
  });

  it('rejects empty keywords array', () => {
    expect(() =>
      createSpecializationSchema.parse({ name: 'S', keywords: [], dockerImage: 'img' })
    ).toThrow();
  });

  it('rejects missing dockerImage', () => {
    expect(() =>
      createSpecializationSchema.parse({ name: 'S', keywords: ['a'] })
    ).toThrow();
  });

  it('rejects empty dockerImage', () => {
    expect(() =>
      createSpecializationSchema.parse({ name: 'S', keywords: ['a'], dockerImage: '' })
    ).toThrow();
  });

  it('rejects name exceeding max length', () => {
    expect(() =>
      createSpecializationSchema.parse({
        name: 'x'.repeat(101),
        keywords: ['a'],
        dockerImage: 'img',
      })
    ).toThrow();
  });
});

// ─── updateSpecializationSchema ─────────────────────────────────────

describe('updateSpecializationSchema', () => {
  it('accepts empty object', () => {
    const result = updateSpecializationSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts partial update', () => {
    const result = updateSpecializationSchema.parse({ name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('accepts nullable description, systemPrompt, dockerImage', () => {
    const result = updateSpecializationSchema.parse({
      description: null,
      systemPrompt: null,
      dockerImage: null,
    });
    expect(result.description).toBeNull();
    expect(result.systemPrompt).toBeNull();
    expect(result.dockerImage).toBeNull();
  });

  it('rejects keywords with empty array', () => {
    expect(() => updateSpecializationSchema.parse({ keywords: [] })).toThrow();
  });
});

// ─── createIntegrationTokenSchema ───────────────────────────────────

describe('createIntegrationTokenSchema', () => {
  it('parses valid token', () => {
    const result = createIntegrationTokenSchema.parse({
      provider: 'github',
      accessToken: 'ghp_abc123',
    });
    expect(result.provider).toBe('github');
    expect(result.accessToken).toBe('ghp_abc123');
  });

  it('accepts optional refreshToken and expiresAt', () => {
    const result = createIntegrationTokenSchema.parse({
      provider: 'github',
      accessToken: 'token',
      refreshToken: 'refresh-token',
      expiresAt: '2025-12-31T23:59:59Z',
    });
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.expiresAt).toBe('2025-12-31T23:59:59Z');
  });

  it('rejects missing provider', () => {
    expect(() =>
      createIntegrationTokenSchema.parse({ accessToken: 'token' })
    ).toThrow();
  });

  it('rejects missing accessToken', () => {
    expect(() =>
      createIntegrationTokenSchema.parse({ provider: 'github' })
    ).toThrow();
  });

  it('rejects empty provider', () => {
    expect(() =>
      createIntegrationTokenSchema.parse({ provider: '', accessToken: 'token' })
    ).toThrow();
  });

  it('rejects empty accessToken', () => {
    expect(() =>
      createIntegrationTokenSchema.parse({ provider: 'github', accessToken: '' })
    ).toThrow();
  });

  it('rejects invalid expiresAt format', () => {
    expect(() =>
      createIntegrationTokenSchema.parse({
        provider: 'github',
        accessToken: 'token',
        expiresAt: 'not-a-date',
      })
    ).toThrow();
  });
});

// ─── updateAutomationSettingSchema ──────────────────────────────────

describe('updateAutomationSettingSchema', () => {
  it('accepts empty object', () => {
    const result = updateAutomationSettingSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts all optional fields', () => {
    const result = updateAutomationSettingSchema.parse({
      autoAssign: true,
      autoSpawn: false,
      defaultModel: 'claude-sonnet-4-5-20250929',
      maxConcurrentAgents: 5,
      dailyBudgetCents: 1000,
    });
    expect(result.autoAssign).toBe(true);
    expect(result.autoSpawn).toBe(false);
    expect(result.defaultModel).toBe('claude-sonnet-4-5-20250929');
    expect(result.maxConcurrentAgents).toBe(5);
    expect(result.dailyBudgetCents).toBe(1000);
  });

  it('rejects maxConcurrentAgents less than 1', () => {
    expect(() => updateAutomationSettingSchema.parse({ maxConcurrentAgents: 0 })).toThrow();
  });

  it('rejects maxConcurrentAgents greater than 20', () => {
    expect(() => updateAutomationSettingSchema.parse({ maxConcurrentAgents: 21 })).toThrow();
  });

  it('rejects negative dailyBudgetCents', () => {
    expect(() => updateAutomationSettingSchema.parse({ dailyBudgetCents: -1 })).toThrow();
  });

  it('rejects dailyBudgetCents greater than 100000', () => {
    expect(() => updateAutomationSettingSchema.parse({ dailyBudgetCents: 100001 })).toThrow();
  });
});

// ─── updateProfileSchema ────────────────────────────────────────────

describe('updateProfileSchema', () => {
  it('accepts empty object', () => {
    const result = updateProfileSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts name', () => {
    const result = updateProfileSchema.parse({ name: 'Bogdan' });
    expect(result.name).toBe('Bogdan');
  });

  it('accepts nullable claudeApiKey', () => {
    const result = updateProfileSchema.parse({ claudeApiKey: null });
    expect(result.claudeApiKey).toBeNull();
  });

  it('accepts claudeApiKey string', () => {
    const result = updateProfileSchema.parse({ claudeApiKey: 'sk-ant-...' });
    expect(result.claudeApiKey).toBe('sk-ant-...');
  });

  it('rejects empty name', () => {
    expect(() => updateProfileSchema.parse({ name: '' })).toThrow();
  });

  it('rejects name exceeding max length', () => {
    expect(() => updateProfileSchema.parse({ name: 'x'.repeat(101) })).toThrow();
  });
});
