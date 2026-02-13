import { describe, it, expect } from 'vitest';

describe('index.ts re-exports', () => {
  it('exports enums from main index', async () => {
    const mod = await import('../index.js');
    expect(mod.Plan).toBeDefined();
    expect(mod.ProjectStatus).toBeDefined();
    expect(mod.TaskStatus).toBeDefined();
    expect(mod.RunStatus).toBeDefined();
    expect(mod.LogStream).toBeDefined();
    expect(mod.WorkflowExecStatus).toBeDefined();
  });

  it('exports schemas from main index', async () => {
    const mod = await import('../index.js');
    expect(mod.createTaskSchema).toBeDefined();
    expect(mod.updateTaskSchema).toBeDefined();
    expect(mod.paginationSchema).toBeDefined();
    expect(mod.createProjectSchema).toBeDefined();
    expect(mod.createAgentSchema).toBeDefined();
    expect(mod.createWorkflowSchema).toBeDefined();
    expect(mod.taskFilterSchema).toBeDefined();
    expect(mod.createCommentSchema).toBeDefined();
    expect(mod.addDependencySchema).toBeDefined();
    expect(mod.triggerRunSchema).toBeDefined();
    expect(mod.createSpecializationSchema).toBeDefined();
    expect(mod.updateSpecializationSchema).toBeDefined();
    expect(mod.createIntegrationTokenSchema).toBeDefined();
    expect(mod.updateAutomationSettingSchema).toBeDefined();
    expect(mod.updateProfileSchema).toBeDefined();
  });

  it('exports workflow utilities from main index', async () => {
    const mod = await import('../index.js');
    expect(typeof mod.validateWorkflow).toBe('function');
    expect(typeof mod.validateConditionExpression).toBe('function');
    expect(typeof mod.parseConditionExpression).toBe('function');
    expect(typeof mod.evaluateCondition).toBe('function');
    expect(typeof mod.serializeWorkflowToPrompt).toBe('function');
    expect(typeof mod.parseStepMarkers).toBe('function');
    expect(typeof mod.STEP_MARKER_PREFIX).toBe('string');
    expect(typeof mod.STEP_COMPLETE_PREFIX).toBe('string');
  });

  it('exports config from main index', async () => {
    const mod = await import('../index.js');
    expect(mod.flags).toBeDefined();
    expect(typeof mod.flags).toBe('object');
  });

  it('exports crypto utilities from main index', async () => {
    const mod = await import('../index.js');
    expect(typeof mod.encrypt).toBe('function');
    expect(typeof mod.decrypt).toBe('function');
    expect(typeof mod.isEncrypted).toBe('function');
    expect(typeof mod.getEncryptionKey).toBe('function');
  });
});

describe('schemas/index.ts re-exports', () => {
  it('exports all schemas', async () => {
    const mod = await import('../schemas/index.js');
    expect(mod.createTaskSchema).toBeDefined();
    expect(mod.updateTaskSchema).toBeDefined();
    expect(mod.taskFilterSchema).toBeDefined();
    expect(mod.createProjectSchema).toBeDefined();
    expect(mod.updateProjectSchema).toBeDefined();
    expect(mod.createAgentSchema).toBeDefined();
    expect(mod.updateAgentSchema).toBeDefined();
    expect(mod.createWorkflowSchema).toBeDefined();
    expect(mod.updateWorkflowSchema).toBeDefined();
    expect(mod.createCommentSchema).toBeDefined();
    expect(mod.addDependencySchema).toBeDefined();
    expect(mod.triggerRunSchema).toBeDefined();
    expect(mod.createSpecializationSchema).toBeDefined();
    expect(mod.updateSpecializationSchema).toBeDefined();
    expect(mod.updateAutomationSettingSchema).toBeDefined();
    expect(mod.updateProfileSchema).toBeDefined();
    expect(mod.paginationSchema).toBeDefined();
    expect(mod.createIntegrationTokenSchema).toBeDefined();
  });
});

describe('types/index.ts re-exports', () => {
  it('module loads without error', async () => {
    const mod = await import('../types/index.js');
    expect(mod).toBeDefined();
  });
});

describe('workflow/index.ts re-exports', () => {
  it('exports validation utilities', async () => {
    const mod = await import('../workflow/index.js');
    expect(typeof mod.validateWorkflow).toBe('function');
    expect(typeof mod.validateConditionExpression).toBe('function');
    expect(typeof mod.parseConditionExpression).toBe('function');
    expect(typeof mod.evaluateCondition).toBe('function');
  });

  it('exports serializer utilities', async () => {
    const mod = await import('../workflow/index.js');
    expect(typeof mod.serializeWorkflowToPrompt).toBe('function');
    expect(typeof mod.parseStepMarkers).toBe('function');
    expect(typeof mod.STEP_MARKER_PREFIX).toBe('string');
    expect(typeof mod.STEP_COMPLETE_PREFIX).toBe('string');
  });
});

describe('config/index.ts re-exports', () => {
  it('exports flags', async () => {
    const mod = await import('../config/index.js');
    expect(mod.flags).toBeDefined();
    expect(typeof mod.flags).toBe('object');
  });
});
