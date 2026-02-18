import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from '../services/project.service.js';
import { TaskService } from '../services/task.service.js';
import { TaskLifecycleService } from '../services/task-lifecycle.service.js';
import { NotificationService } from '../services/notification.service.js';

// ─── Shared mock factories ─────────────────────────────────────────

function createMockPrisma() {
  return {
    project: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    task: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    taskDependency: {
      findMany: vi.fn(),
    },
    specialization: {
      findMany: vi.fn(),
    },
    agent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    automationSetting: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

// ═══════════════════════════════════════════════════════════════════
// ProjectService
// ═══════════════════════════════════════════════════════════════════

describe('ProjectService', () => {
  let prisma: MockPrisma;
  let service: ProjectService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ProjectService(prisma as any);
  });

  // ─── start ────────────────────────────────────────────────────

  describe('start', () => {
    it('should start a project in PLANNING status', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'PLANNING', userId: 'u1' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });

      const result = await service.start('p1', 'u1');

      expect(result.status).toBe('ACTIVE');
      expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: 'p1', userId: 'u1' } });
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'ACTIVE' } });
    });

    it('should throw if project not found', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.start('nonexistent', 'u1')).rejects.toThrow('Project not found');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should throw if project is not in PLANNING status', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'ACTIVE', userId: 'u1' });

      await expect(service.start('p1', 'u1')).rejects.toThrow('Cannot start project in ACTIVE status');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should throw for COMPLETED status', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'COMPLETED', userId: 'u1' });

      await expect(service.start('p1', 'u1')).rejects.toThrow('Cannot start project in COMPLETED status');
    });

    it('should throw for CANCELLED status', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'CANCELLED', userId: 'u1' });

      await expect(service.start('p1', 'u1')).rejects.toThrow('Cannot start project in CANCELLED status');
    });

    it('should throw for PAUSED status', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'PAUSED', userId: 'u1' });

      await expect(service.start('p1', 'u1')).rejects.toThrow('Cannot start project in PAUSED status');
    });

    it('should start a project in DRAFT status (via PLANNING)', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'DRAFT', userId: 'u1' });
      prisma.project.update
        .mockResolvedValueOnce({ id: 'p1', status: 'PLANNING' })
        .mockResolvedValueOnce({ id: 'p1', status: 'ACTIVE' });

      const result = await service.start('p1', 'u1');

      expect(result.status).toBe('ACTIVE');
      // Should transition DRAFT → PLANNING first
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: 'PLANNING' },
      });
      // Then PLANNING → ACTIVE
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: 'ACTIVE' },
      });
      expect(prisma.project.update).toHaveBeenCalledTimes(2);
    });
  });

  // ─── pause ────────────────────────────────────────────────────

  describe('pause', () => {
    it('should pause an ACTIVE project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'ACTIVE', userId: 'u1' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'PAUSED' });

      const result = await service.pause('p1', 'u1');

      expect(result.status).toBe('PAUSED');
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'PAUSED' } });
    });

    it('should throw if project not found', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.pause('nonexistent', 'u1')).rejects.toThrow('Project not found');
    });

    it('should throw if project is not ACTIVE', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'PLANNING', userId: 'u1' });

      await expect(service.pause('p1', 'u1')).rejects.toThrow('Cannot pause project in PLANNING status');
    });

    it('should throw for PAUSED status (already paused)', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'PAUSED', userId: 'u1' });

      await expect(service.pause('p1', 'u1')).rejects.toThrow('Cannot pause project in PAUSED status');
    });

    it('should throw for COMPLETED status', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'COMPLETED', userId: 'u1' });

      await expect(service.pause('p1', 'u1')).rejects.toThrow('Cannot pause project in COMPLETED status');
    });
  });

  // ─── resume ───────────────────────────────────────────────────

  describe('resume', () => {
    it('should resume a PAUSED project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'PAUSED', userId: 'u1' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });

      const result = await service.resume('p1', 'u1');

      expect(result.status).toBe('ACTIVE');
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'ACTIVE' } });
    });

    it('should throw if project not found', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.resume('nonexistent', 'u1')).rejects.toThrow('Project not found');
    });

    it('should throw if project is not PAUSED', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'ACTIVE', userId: 'u1' });

      await expect(service.resume('p1', 'u1')).rejects.toThrow('Cannot resume project in ACTIVE status');
    });

    it('should throw for PLANNING status', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'PLANNING', userId: 'u1' });

      await expect(service.resume('p1', 'u1')).rejects.toThrow('Cannot resume project in PLANNING status');
    });
  });

  // ─── cancel ───────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel a PLANNING project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'PLANNING', userId: 'u1' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'CANCELLED' });

      const result = await service.cancel('p1', 'u1');

      expect(result.status).toBe('CANCELLED');
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'CANCELLED' } });
    });

    it('should cancel an ACTIVE project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'ACTIVE', userId: 'u1' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'CANCELLED' });

      const result = await service.cancel('p1', 'u1');

      expect(result.status).toBe('CANCELLED');
    });

    it('should cancel a PAUSED project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'PAUSED', userId: 'u1' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'CANCELLED' });

      const result = await service.cancel('p1', 'u1');

      expect(result.status).toBe('CANCELLED');
    });

    it('should throw if project not found', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.cancel('nonexistent', 'u1')).rejects.toThrow('Project not found');
    });

    it('should throw if project is COMPLETED', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'COMPLETED', userId: 'u1' });

      await expect(service.cancel('p1', 'u1')).rejects.toThrow('Cannot cancel project in COMPLETED status');
    });

    it('should throw if project is already CANCELLED', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'CANCELLED', userId: 'u1' });

      await expect(service.cancel('p1', 'u1')).rejects.toThrow('Cannot cancel project in CANCELLED status');
    });

    it('should cancel a DRAFT project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', status: 'DRAFT', userId: 'u1' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'CANCELLED' });

      const result = await service.cancel('p1', 'u1');

      expect(result.status).toBe('CANCELLED');
    });
  });

  // ─── complete ─────────────────────────────────────────────────

  describe('complete', () => {
    it('should complete a project with all tasks DONE', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: 'p1',
        status: 'ACTIVE',
        userId: 'u1',
        tasks: [{ status: 'DONE' }, { status: 'DONE' }],
      });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'COMPLETED' });

      const result = await service.complete('p1', 'u1');

      expect(result.status).toBe('COMPLETED');
      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'COMPLETED' } });
    });

    it('should complete a project even with unfinished tasks (logs warning)', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: 'p1',
        status: 'ACTIVE',
        userId: 'u1',
        tasks: [{ status: 'DONE' }, { status: 'IN_PROGRESS' }],
      });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'COMPLETED' });

      const result = await service.complete('p1', 'u1');

      expect(result.status).toBe('COMPLETED');
    });

    it('should complete a project with no tasks', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: 'p1',
        status: 'ACTIVE',
        userId: 'u1',
        tasks: [],
      });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'COMPLETED' });

      const result = await service.complete('p1', 'u1');

      expect(result.status).toBe('COMPLETED');
    });

    it('should throw if project not found', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.complete('nonexistent', 'u1')).rejects.toThrow('Project not found');
    });

    it('should include tasks in the findFirst query', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: 'p1',
        status: 'ACTIVE',
        userId: 'u1',
        tasks: [],
      });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: 'COMPLETED' });

      await service.complete('p1', 'u1');

      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', userId: 'u1' },
        include: { tasks: { select: { status: true } } },
      });
    });
  });

  // ─── checkCompletion ──────────────────────────────────────────

  describe('checkCompletion', () => {
    it('should return true when all tasks are DONE', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        tasks: [{ status: 'DONE' }, { status: 'DONE' }, { status: 'DONE' }],
      });

      const result = await service.checkCompletion('p1');

      expect(result).toBe(true);
    });

    it('should return false when some tasks are not DONE', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        tasks: [{ status: 'DONE' }, { status: 'IN_PROGRESS' }],
      });

      const result = await service.checkCompletion('p1');

      expect(result).toBe(false);
    });

    it('should return false when project has no tasks', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        tasks: [],
      });

      const result = await service.checkCompletion('p1');

      expect(result).toBe(false);
    });

    it('should return false when project not found', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      const result = await service.checkCompletion('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when all tasks are TODO', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        tasks: [{ status: 'TODO' }, { status: 'TODO' }],
      });

      const result = await service.checkCompletion('p1');

      expect(result).toBe(false);
    });

    it('should use findUnique (not findFirst) without userId', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', tasks: [{ status: 'DONE' }] });

      await service.checkCompletion('p1');

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'p1' },
        include: { tasks: { select: { status: true } } },
      });
    });

    it('should return true with a single DONE task', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        tasks: [{ status: 'DONE' }],
      });

      const result = await service.checkCompletion('p1');

      expect(result).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// TaskService
// ═══════════════════════════════════════════════════════════════════

describe('TaskService', () => {
  let prisma: MockPrisma;
  let service: TaskService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new TaskService(prisma as any);
  });

  // ─── updateStatus ─────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update task status and return updated task', async () => {
      prisma.task.findFirst.mockResolvedValue({ id: 't1', status: 'TODO', userId: 'u1' });
      prisma.task.update.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS', userId: 'u1' });

      const result = await service.updateStatus('t1', 'u1', 'IN_PROGRESS' as any);

      expect(result.status).toBe('IN_PROGRESS');
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('should throw if task not found', async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('nonexistent', 'u1', 'DONE' as any)).rejects.toThrow('Task not found');
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('should scope findFirst by userId for multi-tenancy', async () => {
      prisma.task.findFirst.mockResolvedValue({ id: 't1', status: 'TODO', userId: 'u1' });
      prisma.task.update.mockResolvedValue({ id: 't1', status: 'DONE', userId: 'u1' });

      await service.updateStatus('t1', 'u1', 'DONE' as any);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({ where: { id: 't1', userId: 'u1' } });
    });

    it('should update from TODO to DONE', async () => {
      prisma.task.findFirst.mockResolvedValue({ id: 't1', status: 'TODO', userId: 'u1' });
      prisma.task.update.mockResolvedValue({ id: 't1', status: 'DONE', userId: 'u1' });

      const result = await service.updateStatus('t1', 'u1', 'DONE' as any);

      expect(result.status).toBe('DONE');
    });

    it('should update from IN_PROGRESS to TESTING', async () => {
      prisma.task.findFirst.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS', userId: 'u1' });
      prisma.task.update.mockResolvedValue({ id: 't1', status: 'TESTING', userId: 'u1' });

      const result = await service.updateStatus('t1', 'u1', 'TESTING' as any);

      expect(result.status).toBe('TESTING');
    });
  });

  // ─── recalculateBlocked ───────────────────────────────────────

  describe('recalculateBlocked', () => {
    it('should return false when all dependencies are DONE', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { taskId: 't1', dependsOnId: 't2', dependsOn: { status: 'DONE' } },
        { taskId: 't1', dependsOnId: 't3', dependsOn: { status: 'DONE' } },
      ]);
      prisma.task.update.mockResolvedValue({});

      const result = await service.recalculateBlocked('t1');

      expect(result).toBe(false);
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { isBlocked: false },
      });
    });

    it('should return true when some dependencies are not DONE', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { taskId: 't1', dependsOnId: 't2', dependsOn: { status: 'DONE' } },
        { taskId: 't1', dependsOnId: 't3', dependsOn: { status: 'IN_PROGRESS' } },
      ]);
      prisma.task.update.mockResolvedValue({});

      const result = await service.recalculateBlocked('t1');

      expect(result).toBe(true);
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { isBlocked: true },
      });
    });

    it('should return false when task has no dependencies', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([]);
      prisma.task.update.mockResolvedValue({});

      const result = await service.recalculateBlocked('t1');

      expect(result).toBe(false);
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { isBlocked: false },
      });
    });

    it('should return true when all dependencies are not DONE', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { taskId: 't1', dependsOnId: 't2', dependsOn: { status: 'TODO' } },
        { taskId: 't1', dependsOnId: 't3', dependsOn: { status: 'IN_PROGRESS' } },
      ]);
      prisma.task.update.mockResolvedValue({});

      const result = await service.recalculateBlocked('t1');

      expect(result).toBe(true);
    });

    it('should include dependsOn status in query', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([]);
      prisma.task.update.mockResolvedValue({});

      await service.recalculateBlocked('t1');

      expect(prisma.taskDependency.findMany).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        include: { dependsOn: { select: { status: true } } },
      });
    });
  });

  // ─── unblockDependents ────────────────────────────────────────

  describe('unblockDependents', () => {
    it('should return unblocked task IDs when dependents become unblocked', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { taskId: 'dep-1' },
        { taskId: 'dep-2' },
      ]);

      // Mock recalculateBlocked for each dependent:
      // dep-1 becomes unblocked (all deps done), dep-2 stays blocked
      const recalcSpy = vi.spyOn(service, 'recalculateBlocked');
      recalcSpy.mockResolvedValueOnce(false); // dep-1 unblocked
      recalcSpy.mockResolvedValueOnce(true);  // dep-2 still blocked

      const result = await service.unblockDependents('completed-task');

      expect(result).toEqual(['dep-1']);
      expect(prisma.taskDependency.findMany).toHaveBeenCalledWith({
        where: { dependsOnId: 'completed-task' },
        select: { taskId: true },
      });
    });

    it('should return empty array when no dependents exist', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([]);

      const result = await service.unblockDependents('completed-task');

      expect(result).toEqual([]);
    });

    it('should return empty array when all dependents remain blocked', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { taskId: 'dep-1' },
        { taskId: 'dep-2' },
      ]);

      const recalcSpy = vi.spyOn(service, 'recalculateBlocked');
      recalcSpy.mockResolvedValueOnce(true); // dep-1 still blocked
      recalcSpy.mockResolvedValueOnce(true); // dep-2 still blocked

      const result = await service.unblockDependents('completed-task');

      expect(result).toEqual([]);
    });

    it('should return all dependents when all become unblocked', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { taskId: 'dep-1' },
        { taskId: 'dep-2' },
        { taskId: 'dep-3' },
      ]);

      const recalcSpy = vi.spyOn(service, 'recalculateBlocked');
      recalcSpy.mockResolvedValueOnce(false);
      recalcSpy.mockResolvedValueOnce(false);
      recalcSpy.mockResolvedValueOnce(false);

      const result = await service.unblockDependents('completed-task');

      expect(result).toEqual(['dep-1', 'dep-2', 'dep-3']);
    });
  });

  // ─── getTaskWithFullContext ───────────────────────────────────

  describe('getTaskWithFullContext', () => {
    it('should return task with all relations', async () => {
      const fullTask = {
        id: 't1',
        title: 'Full Task',
        status: 'TODO',
        userId: 'u1',
        assignee: { id: 'a1', name: 'Agent' },
        project: { id: 'p1', name: 'Project' },
        comments: [{ id: 'c1', content: 'hello' }],
        runs: [{ id: 'r1', status: 'COMPLETED' }],
        dependsOn: [],
        dependedOnBy: [],
      };
      prisma.task.findFirst.mockResolvedValue(fullTask);

      const result = await service.getTaskWithFullContext('t1', 'u1');

      expect(result).toEqual(fullTask);
      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 't1', userId: 'u1' },
        include: {
          assignee: true,
          project: true,
          comments: { orderBy: { createdAt: 'asc' } },
          runs: { orderBy: { createdAt: 'desc' }, take: 10 },
          dependsOn: {
            include: { dependsOn: { select: { id: true, title: true, status: true } } },
          },
          dependedOnBy: {
            include: { task: { select: { id: true, title: true, status: true } } },
          },
        },
      });
    });

    it('should return null when task not found', async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      const result = await service.getTaskWithFullContext('nonexistent', 'u1');

      expect(result).toBeNull();
    });

    it('should scope query by userId', async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await service.getTaskWithFullContext('t1', 'specific-user');

      expect(prisma.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1', userId: 'specific-user' } })
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// TaskLifecycleService
// ═══════════════════════════════════════════════════════════════════

describe('TaskLifecycleService', () => {
  let prisma: MockPrisma;
  let service: TaskLifecycleService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new TaskLifecycleService(prisma as any);
  });

  // ─── detectSpecialization ─────────────────────────────────────

  describe('detectSpecialization', () => {
    it('should return specialization ID when keywords match title', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend', 'react', 'css'] },
        { id: 'spec-be', keywords: ['backend', 'api', 'database'] },
      ]);

      const result = await service.detectSpecialization('Build React component', null, 'u1');

      expect(result).toBe('spec-fe');
    });

    it('should return specialization ID when keywords match description', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend', 'react', 'css'] },
        { id: 'spec-be', keywords: ['backend', 'api', 'database'] },
      ]);

      const result = await service.detectSpecialization('Create service', 'build a new api endpoint for database', 'u1');

      expect(result).toBe('spec-be');
    });

    it('should return the specialization with highest keyword score', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend', 'react'] },
        { id: 'spec-fullstack', keywords: ['frontend', 'react', 'api', 'css'] },
      ]);

      const result = await service.detectSpecialization(
        'Build React frontend with CSS',
        null,
        'u1'
      );

      // spec-fullstack matches 3 keywords (frontend, react, css), spec-fe matches 2 (frontend, react)
      expect(result).toBe('spec-fullstack');
    });

    it('should return null when no specializations match', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend', 'react'] },
      ]);

      const result = await service.detectSpecialization('Deploy infrastructure', null, 'u1');

      expect(result).toBeNull();
    });

    it('should return null when user has no specializations', async () => {
      prisma.specialization.findMany.mockResolvedValue([]);

      const result = await service.detectSpecialization('Build something', null, 'u1');

      expect(result).toBeNull();
    });

    it('should handle null description gracefully', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend'] },
      ]);

      const result = await service.detectSpecialization('frontend task', null, 'u1');

      expect(result).toBe('spec-fe');
    });

    it('should handle undefined description gracefully', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend'] },
      ]);

      const result = await service.detectSpecialization('frontend task', undefined, 'u1');

      expect(result).toBe('spec-fe');
    });

    it('should perform case-insensitive matching', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['Frontend', 'REACT'] },
      ]);

      const result = await service.detectSpecialization('frontend REACT component', null, 'u1');

      expect(result).toBe('spec-fe');
    });

    it('should query specializations for the correct userId', async () => {
      prisma.specialization.findMany.mockResolvedValue([]);

      await service.detectSpecialization('task', null, 'user-42');

      expect(prisma.specialization.findMany).toHaveBeenCalledWith({ where: { userId: 'user-42' } });
    });
  });

  // ─── selectAgent ──────────────────────────────────────────────

  describe('selectAgent', () => {
    it('should return agent matching the detected specialization', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend', 'react'] },
      ]);
      prisma.agent.findFirst.mockResolvedValueOnce({ id: 'agent-fe', specializationId: 'spec-fe' });

      const result = await service.selectAgent('Build React page', null, 'u1');

      expect(result).toBe('agent-fe');
      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1', specializationId: 'spec-fe' },
      });
    });

    it('should fall back to any agent when no specialization matches', async () => {
      prisma.specialization.findMany.mockResolvedValue([]);
      prisma.agent.findFirst.mockResolvedValue({ id: 'agent-fallback' });

      const result = await service.selectAgent('Do something', null, 'u1');

      expect(result).toBe('agent-fallback');
      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should fall back to any agent when specialization matches but no agent has it', async () => {
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend'] },
      ]);
      // First call: looking for agent with spec - not found
      prisma.agent.findFirst.mockResolvedValueOnce(null);
      // Second call: fallback to any agent
      prisma.agent.findFirst.mockResolvedValueOnce({ id: 'agent-any' });

      const result = await service.selectAgent('frontend task', null, 'u1');

      expect(result).toBe('agent-any');
    });

    it('should return null when no agents exist at all', async () => {
      prisma.specialization.findMany.mockResolvedValue([]);
      prisma.agent.findFirst.mockResolvedValue(null);

      const result = await service.selectAgent('Do something', null, 'u1');

      expect(result).toBeNull();
    });
  });

  // ─── onTaskCreated ────────────────────────────────────────────

  describe('onTaskCreated', () => {
    const makeTask = (overrides = {}) => ({
      id: 't1',
      title: 'New Task',
      description: null,
      status: 'TODO',
      userId: 'u1',
      assigneeId: null,
      ...overrides,
    });

    it('should auto-assign an agent when autoAssign is enabled', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec-fe', keywords: ['frontend'] },
      ]);
      prisma.agent.findFirst.mockResolvedValue({ id: 'agent-fe' });
      prisma.task.update.mockResolvedValue({});

      const result = await service.onTaskCreated(makeTask({ title: 'frontend work' }) as any);

      expect(result).toEqual({ assigneeId: 'agent-fe' });
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { assigneeId: 'agent-fe' },
      });
    });

    it('should skip assignment when autoAssign is disabled', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: false, autoSpawn: true });

      const result = await service.onTaskCreated(makeTask() as any);

      expect(result).toEqual({});
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('should skip assignment when task already has an assignee', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });

      const result = await service.onTaskCreated(makeTask({ assigneeId: 'existing-agent' }) as any);

      expect(result).toEqual({});
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('should return empty when no agent matches', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.specialization.findMany.mockResolvedValue([]);
      prisma.agent.findFirst.mockResolvedValue(null);

      const result = await service.onTaskCreated(makeTask() as any);

      expect(result).toEqual({});
    });

    it('should default autoAssign to true when no settings exist', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue(null);
      prisma.specialization.findMany.mockResolvedValue([]);
      prisma.agent.findFirst.mockResolvedValue({ id: 'agent-1' });
      prisma.task.update.mockResolvedValue({});

      const result = await service.onTaskCreated(makeTask() as any);

      // autoAssign defaults to true, so it should try to assign
      expect(result).toEqual({ assigneeId: 'agent-1' });
    });
  });

  // ─── onStatusChanged ─────────────────────────────────────────

  describe('onStatusChanged', () => {
    const makeTask = (overrides = {}) => ({
      id: 't1',
      title: 'Task',
      description: null,
      status: 'IN_PROGRESS',
      userId: 'u1',
      assigneeId: null,
      ...overrides,
    });

    it('should spawn QA agent when status changes to TESTING', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-qa',
          specialization: { name: 'QA Engineer', keywords: ['qa', 'test'] },
        },
      ]);

      const result = await service.onStatusChanged(makeTask() as any, 'IN_PROGRESS', 'TESTING');

      expect(result).toEqual({ shouldSpawnAgent: true, agentId: 'agent-qa' });
    });

    it('should spawn reviewer agent when status changes to IN_REVIEW', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-review',
          specialization: { name: 'Code Reviewer', keywords: ['review', 'audit'] },
        },
      ]);

      const result = await service.onStatusChanged(makeTask() as any, 'TESTING', 'IN_REVIEW');

      expect(result).toEqual({ shouldSpawnAgent: true, agentId: 'agent-review' });
    });

    it('should spawn developer agent when status changes to IN_PROGRESS', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-dev',
          specialization: { name: 'Developer', keywords: ['developer', 'frontend'] },
        },
      ]);

      const result = await service.onStatusChanged(makeTask() as any, 'TODO', 'IN_PROGRESS');

      expect(result).toEqual({ shouldSpawnAgent: true, agentId: 'agent-dev' });
    });

    it('should not spawn when autoSpawn is disabled', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: false });

      const result = await service.onStatusChanged(makeTask() as any, 'TODO', 'TESTING');

      expect(result).toEqual({ shouldSpawnAgent: false });
    });

    it('should not spawn for unmapped status (e.g., TODO)', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });

      const result = await service.onStatusChanged(makeTask() as any, 'IN_PROGRESS', 'TODO');

      expect(result).toEqual({ shouldSpawnAgent: false });
    });

    it('should not spawn for DONE status', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });

      const result = await service.onStatusChanged(makeTask() as any, 'TESTING', 'DONE');

      expect(result).toEqual({ shouldSpawnAgent: false });
    });

    it('should not spawn when no agents match the target status', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-devops',
          specialization: { name: 'DevOps', keywords: ['deploy', 'infrastructure'] },
        },
      ]);

      const result = await service.onStatusChanged(makeTask() as any, 'TODO', 'TESTING');

      expect(result).toEqual({ shouldSpawnAgent: false });
    });

    it('should skip agents without a specialization', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.agent.findMany.mockResolvedValue([
        { id: 'agent-no-spec', specialization: null },
        {
          id: 'agent-qa',
          specialization: { name: 'QA', keywords: ['qa', 'test'] },
        },
      ]);

      const result = await service.onStatusChanged(makeTask() as any, 'IN_PROGRESS', 'TESTING');

      expect(result).toEqual({ shouldSpawnAgent: true, agentId: 'agent-qa' });
    });

    it('should match by specialization name', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-qa',
          specialization: { name: 'Quality Assurance', keywords: [] },
        },
      ]);

      // 'quality' is in STATUS_KEYWORDS.TESTING
      const result = await service.onStatusChanged(makeTask() as any, 'IN_PROGRESS', 'TESTING');

      expect(result).toEqual({ shouldSpawnAgent: true, agentId: 'agent-qa' });
    });

    it('should match by specialization keywords', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-test',
          specialization: { name: 'Validator', keywords: ['verification'] },
        },
      ]);

      // 'verification' is in STATUS_KEYWORDS.TESTING
      const result = await service.onStatusChanged(makeTask() as any, 'IN_PROGRESS', 'TESTING');

      expect(result).toEqual({ shouldSpawnAgent: true, agentId: 'agent-test' });
    });

    it('should default autoSpawn to true when no settings exist', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue(null);
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-qa',
          specialization: { name: 'QA', keywords: ['test'] },
        },
      ]);

      const result = await service.onStatusChanged(makeTask() as any, 'IN_PROGRESS', 'TESTING');

      expect(result).toEqual({ shouldSpawnAgent: true, agentId: 'agent-qa' });
    });

    it('should return the first matching agent', async () => {
      prisma.automationSetting.findUnique.mockResolvedValue({ autoAssign: true, autoSpawn: true });
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-qa-1',
          specialization: { name: 'QA Lead', keywords: ['qa'] },
        },
        {
          id: 'agent-qa-2',
          specialization: { name: 'QA Junior', keywords: ['test'] },
        },
      ]);

      const result = await service.onStatusChanged(makeTask() as any, 'IN_PROGRESS', 'TESTING');

      expect(result).toEqual({ shouldSpawnAgent: true, agentId: 'agent-qa-1' });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// NotificationService
// ═══════════════════════════════════════════════════════════════════

describe('NotificationService', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  // ─── constructor behavior ─────────────────────────────────────

  describe('constructor', () => {
    it('should work with no arguments', () => {
      const service = new NotificationService();

      expect(service).toBeDefined();
    });

    it('should work with prisma only', () => {
      const service = new NotificationService(prisma as any);

      expect(service).toBeDefined();
    });

    it('should work with prisma and io', () => {
      const mockIo = { to: vi.fn().mockReturnThis(), emit: vi.fn() };
      const service = new NotificationService(prisma as any, mockIo as any);

      expect(service).toBeDefined();
    });
  });

  // ─── createNotification ───────────────────────────────────────

  describe('createNotification', () => {
    it('should create notification in DB when prisma is provided', async () => {
      const mockNotification = { id: 'n1', userId: 'u1', type: 'TASK_STATUS_CHANGED', title: 'Test', message: 'msg' };
      prisma.notification.create.mockResolvedValue(mockNotification);
      const service = new NotificationService(prisma as any);

      const result = await service.createNotification('u1', 'TASK_STATUS_CHANGED', 'Test', 'msg');

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          type: 'TASK_STATUS_CHANGED',
          title: 'Test',
          message: 'msg',
          metadata: undefined,
        },
      });
    });

    it('should include metadata when provided', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n1' });
      const service = new NotificationService(prisma as any);

      await service.createNotification('u1', 'TASK_STATUS_CHANGED', 'Test', 'msg', { taskId: 't1' });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { taskId: 't1' },
        }),
      });
    });

    it('should emit via Socket.io when io is provided', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockIo = { to: mockTo } as any;
      const service = new NotificationService(undefined, mockIo);

      await service.createNotification('u1', 'TASK_STATUS_CHANGED', 'Test', 'msg');

      expect(mockTo).toHaveBeenCalledWith('user:u1');
      expect(mockEmit).toHaveBeenCalledWith('notification:new', expect.objectContaining({
        type: 'TASK_STATUS_CHANGED',
        title: 'Test',
        message: 'msg',
      }));
    });

    it('should not emit via Socket.io when io is not provided', async () => {
      const service = new NotificationService(prisma as any);
      prisma.notification.create.mockResolvedValue({ id: 'n1' });

      // Should not throw
      await service.createNotification('u1', 'TASK_STATUS_CHANGED', 'Test', 'msg');
    });

    it('should return null when prisma is not provided', async () => {
      const service = new NotificationService();

      const result = await service.createNotification('u1', 'TASK_STATUS_CHANGED', 'Test', 'msg');

      expect(result).toBeNull();
    });

    it('should send via ntfy.sh when NTFY_TOPIC is set', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.createNotification('u1', 'TASK_STATUS_CHANGED', 'Test', 'msg');

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: { 'Title': 'Test', 'Priority': '3', 'Tags': 'bell' },
        body: 'msg',
      });

      vi.unstubAllEnvs();
    });

    it('should not send via ntfy.sh when NTFY_TOPIC is not set', async () => {
      vi.stubEnv('NTFY_TOPIC', '');
      const service = new NotificationService();

      await service.createNotification('u1', 'TASK_STATUS_CHANGED', 'Test', 'msg');

      expect(fetch).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
    });

    it('should handle ntfy.sh fetch errors gracefully', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
      const service = new NotificationService();

      // Should not throw despite fetch failure
      await expect(
        service.createNotification('u1', 'TASK_STATUS_CHANGED', 'Test', 'msg')
      ).resolves.toBeNull();

      vi.unstubAllEnvs();
    });
  });

  // ─── getNotifications ─────────────────────────────────────────

  describe('getNotifications', () => {
    it('should return paginated notifications', async () => {
      const mockNotifs = [
        { id: 'n1', title: 'Title 1', message: 'msg1' },
        { id: 'n2', title: 'Title 2', message: 'msg2' },
      ];
      prisma.notification.findMany.mockResolvedValue(mockNotifs);
      prisma.notification.count.mockResolvedValue(10);
      const service = new NotificationService(prisma as any);

      const result = await service.getNotifications('u1', 1, 2);

      expect(result).toEqual({ notifications: mockNotifs, total: 10 });
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 2,
      });
    });

    it('should calculate correct skip for page 3 with limit 5', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);
      const service = new NotificationService(prisma as any);

      await service.getNotifications('u1', 3, 5);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      );
    });

    it('should filter unread only when unreadOnly is true', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);
      const service = new NotificationService(prisma as any);

      await service.getNotifications('u1', 1, 10, true);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', isRead: false } })
      );
      expect(prisma.notification.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', isRead: false } })
      );
    });

    it('should not filter by isRead when unreadOnly is false', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);
      const service = new NotificationService(prisma as any);

      await service.getNotifications('u1', 1, 10, false);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } })
      );
    });

    it('should return empty result when prisma is not provided', async () => {
      const service = new NotificationService();

      const result = await service.getNotifications('u1', 1, 10);

      expect(result).toEqual({ notifications: [], total: 0 });
    });
  });

  // ─── getUnreadCount ───────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      prisma.notification.count.mockResolvedValue(7);
      const service = new NotificationService(prisma as any);

      const result = await service.getUnreadCount('u1');

      expect(result).toBe(7);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
      });
    });

    it('should return 0 when no unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(0);
      const service = new NotificationService(prisma as any);

      const result = await service.getUnreadCount('u1');

      expect(result).toBe(0);
    });

    it('should return 0 when prisma is not provided', async () => {
      const service = new NotificationService();

      const result = await service.getUnreadCount('u1');

      expect(result).toBe(0);
    });
  });

  // ─── markAsRead ───────────────────────────────────────────────

  describe('markAsRead', () => {
    it('should mark a single notification as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      const service = new NotificationService(prisma as any);

      await service.markAsRead('n1', 'u1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: 'u1' },
        data: { isRead: true },
      });
    });

    it('should scope by userId for multi-tenancy', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      const service = new NotificationService(prisma as any);

      await service.markAsRead('n1', 'specific-user');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: 'specific-user' },
        data: { isRead: true },
      });
    });

    it('should do nothing when prisma is not provided', async () => {
      const service = new NotificationService();

      // Should not throw
      await service.markAsRead('n1', 'u1');
    });
  });

  // ─── markAllAsRead ────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read for the user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });
      const service = new NotificationService(prisma as any);

      await service.markAllAsRead('u1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
        data: { isRead: true },
      });
    });

    it('should do nothing when prisma is not provided', async () => {
      const service = new NotificationService();

      // Should not throw
      await service.markAllAsRead('u1');
    });
  });

  // ─── sendTaskNotification ─────────────────────────────────────

  describe('sendTaskNotification', () => {
    it('should send notification via ntfy.sh for task.created', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.created',
        task: { id: 't1', title: 'New Feature', status: 'TODO', priority: 1 },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.objectContaining({ 'Title': 'New Task: New Feature' }),
        body: expect.any(String),
      });

      vi.unstubAllEnvs();
    });

    it('should send notification via ntfy.sh for task.completed', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.completed',
        task: { id: 't1', title: 'Done Task', status: 'DONE', priority: 1 },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.objectContaining({
          'Title': 'Completed: Done Task',
          'Tags': 'tada',
        }),
        body: expect.any(String),
      });

      vi.unstubAllEnvs();
    });

    it('should set high priority for tasks with priority >= 3', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.created',
        task: { id: 't1', title: 'Urgent', status: 'TODO', priority: 3 },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.objectContaining({ 'Priority': '5' }),
        body: expect.any(String),
      });

      vi.unstubAllEnvs();
    });

    it('should set medium priority for tasks with priority 2', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.created',
        task: { id: 't1', title: 'Medium', status: 'TODO', priority: 2 },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.objectContaining({ 'Priority': '3' }),
        body: expect.any(String),
      });

      vi.unstubAllEnvs();
    });

    it('should set low priority for tasks with priority < 2', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.created',
        task: { id: 't1', title: 'Low', status: 'TODO', priority: 1 },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.objectContaining({ 'Priority': '2' }),
        body: expect.any(String),
      });

      vi.unstubAllEnvs();
    });

    it('should include assignee name in body when provided', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.created',
        task: { id: 't1', title: 'Task', status: 'TODO', priority: 1, assigneeName: 'Riley' },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.any(Object),
        body: expect.stringContaining('Assignee: Riley'),
      });

      vi.unstubAllEnvs();
    });

    it('should show Unassigned when no assignee name', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.created',
        task: { id: 't1', title: 'Task', status: 'TODO', priority: 1 },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.any(Object),
        body: expect.stringContaining('Unassigned'),
      });

      vi.unstubAllEnvs();
    });

    it('should not send when NTFY_TOPIC is not set', async () => {
      vi.stubEnv('NTFY_TOPIC', '');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.created',
        task: { id: 't1', title: 'Task', status: 'TODO', priority: 1 },
      });

      expect(fetch).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
    });

    it('should handle fetch errors gracefully', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
      const service = new NotificationService();

      // Should not throw
      await expect(
        service.sendTaskNotification({
          event: 'task.created',
          task: { id: 't1', title: 'Task', status: 'TODO', priority: 1 },
        })
      ).resolves.toBeUndefined();

      vi.unstubAllEnvs();
    });

    it('should use "Updated" label for unknown events', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendTaskNotification({
        event: 'task.unknown_event',
        task: { id: 't1', title: 'Task', status: 'TODO', priority: 1 },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.objectContaining({ 'Title': 'Updated: Task' }),
        body: expect.any(String),
      });

      vi.unstubAllEnvs();
    });
  });

  // ─── sendCommentNotification ──────────────────────────────────

  describe('sendCommentNotification', () => {
    it('should send comment notification via ntfy.sh', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendCommentNotification({
        task: { id: 't1', title: 'My Task', status: 'IN_PROGRESS' },
        comment: { author: 'Alice', content: 'Looking good!' },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: {
          'Title': 'Comment on: My Task',
          'Priority': '4',
          'Tags': 'speech_balloon',
        },
        body: expect.stringContaining('From: Alice'),
      });

      vi.unstubAllEnvs();
    });

    it('should include comment content and task status in body', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      const service = new NotificationService();

      await service.sendCommentNotification({
        task: { id: 't1', title: 'Task', status: 'TESTING' },
        comment: { author: 'Bob', content: 'Please fix the tests' },
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.any(Object),
        body: expect.stringContaining('Please fix the tests'),
      });

      expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/test-topic', {
        method: 'POST',
        headers: expect.any(Object),
        body: expect.stringContaining('Task Status: TESTING'),
      });

      vi.unstubAllEnvs();
    });

    it('should not send when NTFY_TOPIC is not set', async () => {
      vi.stubEnv('NTFY_TOPIC', '');
      const service = new NotificationService();

      await service.sendCommentNotification({
        task: { id: 't1', title: 'Task', status: 'TODO' },
        comment: { author: 'Alice', content: 'Hello' },
      });

      expect(fetch).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
    });

    it('should handle fetch errors gracefully', async () => {
      vi.stubEnv('NTFY_TOPIC', 'test-topic');
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
      const service = new NotificationService();

      await expect(
        service.sendCommentNotification({
          task: { id: 't1', title: 'Task', status: 'TODO' },
          comment: { author: 'Alice', content: 'Hello' },
        })
      ).resolves.toBeUndefined();

      vi.unstubAllEnvs();
    });
  });
});
