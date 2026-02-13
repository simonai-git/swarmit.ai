import { describe, it, expect } from 'vitest';
import { Plan, ProjectStatus, TaskStatus, RunStatus, LogStream, WorkflowExecStatus } from '../enums.js';

describe('Plan enum', () => {
  it('has FREE, PRO, and TEAM values', () => {
    expect(Plan.FREE).toBe('FREE');
    expect(Plan.PRO).toBe('PRO');
    expect(Plan.TEAM).toBe('TEAM');
  });

  it('has exactly 3 entries', () => {
    expect(Object.keys(Plan)).toHaveLength(3);
  });
});

describe('ProjectStatus enum', () => {
  it('has all expected values', () => {
    expect(ProjectStatus.PLANNING).toBe('PLANNING');
    expect(ProjectStatus.ACTIVE).toBe('ACTIVE');
    expect(ProjectStatus.PAUSED).toBe('PAUSED');
    expect(ProjectStatus.COMPLETED).toBe('COMPLETED');
    expect(ProjectStatus.CANCELLED).toBe('CANCELLED');
  });

  it('has exactly 5 entries', () => {
    expect(Object.keys(ProjectStatus)).toHaveLength(5);
  });
});

describe('TaskStatus enum', () => {
  it('has all expected values', () => {
    expect(TaskStatus.TODO).toBe('TODO');
    expect(TaskStatus.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(TaskStatus.TESTING).toBe('TESTING');
    expect(TaskStatus.IN_REVIEW).toBe('IN_REVIEW');
    expect(TaskStatus.DONE).toBe('DONE');
  });

  it('has exactly 5 entries', () => {
    expect(Object.keys(TaskStatus)).toHaveLength(5);
  });
});

describe('RunStatus enum', () => {
  it('has all expected values', () => {
    expect(RunStatus.QUEUED).toBe('QUEUED');
    expect(RunStatus.RUNNING).toBe('RUNNING');
    expect(RunStatus.SUCCESS).toBe('SUCCESS');
    expect(RunStatus.FAILED).toBe('FAILED');
    expect(RunStatus.CANCELLED).toBe('CANCELLED');
  });

  it('has exactly 5 entries', () => {
    expect(Object.keys(RunStatus)).toHaveLength(5);
  });
});

describe('LogStream enum', () => {
  it('has all expected values', () => {
    expect(LogStream.stdout).toBe('stdout');
    expect(LogStream.stderr).toBe('stderr');
    expect(LogStream.system).toBe('system');
    expect(LogStream.tool).toBe('tool');
    expect(LogStream.assistant).toBe('assistant');
  });

  it('has exactly 5 entries', () => {
    expect(Object.keys(LogStream)).toHaveLength(5);
  });
});

describe('WorkflowExecStatus enum', () => {
  it('has all expected values', () => {
    expect(WorkflowExecStatus.RUNNING).toBe('RUNNING');
    expect(WorkflowExecStatus.COMPLETED).toBe('COMPLETED');
    expect(WorkflowExecStatus.FAILED).toBe('FAILED');
    expect(WorkflowExecStatus.CANCELLED).toBe('CANCELLED');
  });

  it('has exactly 4 entries', () => {
    expect(Object.keys(WorkflowExecStatus)).toHaveLength(4);
  });
});
