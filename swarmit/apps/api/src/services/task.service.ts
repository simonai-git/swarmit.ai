import type { PrismaClient, Task, TaskStatus } from '@swarmit/db';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('task-service');

export class TaskService {
  constructor(private prisma: PrismaClient) {}

  async updateStatus(taskId: string, userId: string, newStatus: TaskStatus): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) throw new Error('Task not found');

    const oldStatus = task.status;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus },
    });

    logger.info({ taskId, oldStatus, newStatus }, 'Task status updated');

    return updated;
  }

  async recalculateBlocked(taskId: string): Promise<boolean> {
    const deps = await this.prisma.taskDependency.findMany({
      where: { taskId },
      include: { dependsOn: { select: { status: true } } },
    });

    const isBlocked = deps.some(d => d.dependsOn.status !== 'DONE');

    await this.prisma.task.update({
      where: { id: taskId },
      data: { isBlocked },
    });

    return isBlocked;
  }

  async unblockDependents(completedTaskId: string): Promise<string[]> {
    const dependents = await this.prisma.taskDependency.findMany({
      where: { dependsOnId: completedTaskId },
      select: { taskId: true },
    });

    const unblockedIds: string[] = [];

    for (const dep of dependents) {
      const stillBlocked = await this.recalculateBlocked(dep.taskId);
      if (!stillBlocked) {
        unblockedIds.push(dep.taskId);
        logger.info({ taskId: dep.taskId, unlockedBy: completedTaskId }, 'Task unblocked');
      }
    }

    return unblockedIds;
  }

  async getTaskWithFullContext(taskId: string, userId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, userId },
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
  }
}
