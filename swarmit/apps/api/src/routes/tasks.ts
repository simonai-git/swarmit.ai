import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@swarmit/db';
import { createTaskSchema, updateTaskSchema, taskFilterSchema, createCommentSchema, addDependencySchema } from '@swarmit/shared';
import { TaskService } from '../services/task.service.js';
import { TaskLifecycleService } from '../services/task-lifecycle.service.js';
import { NotificationService } from '../services/notification.service.js';

export async function taskRoutes(app: FastifyInstance) {
  const taskService = new TaskService(app.prisma);
  const lifecycleService = new TaskLifecycleService(app.prisma);
  const notificationService = new NotificationService();

  // List tasks with filters
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, limit, projectId, status, assigneeId, search } = taskFilterSchema.parse(request.query);
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = { userId: request.userId };
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (assigneeId) where.assigneeId = assigneeId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tasks, total] = await Promise.all([
      app.prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, name: true, specialization: { select: { name: true } } } },
          project: { select: { id: true, title: true } },
          dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
          _count: { select: { comments: true, runs: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      app.prisma.task.count({ where }),
    ]);

    return { tasks, total, page, limit };
  });

  // Get task by ID
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const task = await taskService.getTaskWithFullContext(request.params.id, request.userId);
    if (!task) return reply.code(404).send({ error: 'Task not found' });
    return task;
  });

  // Create task
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = createTaskSchema.parse(request.body);
    const task = await app.prisma.task.create({
      data: { ...data, userId: request.userId },
      include: { assignee: { select: { id: true, name: true } } },
    });

    // Auto-assign if enabled
    const lifecycle = await lifecycleService.onTaskCreated(task);

    // Send notification
    notificationService.sendTaskNotification({
      event: 'task.created',
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        assigneeName: task.assignee?.name,
        priority: task.priority,
      },
    });

    app.io.emit('tasks:updated', { taskId: task.id, userId: request.userId });

    if (lifecycle.assigneeId) {
      // Re-fetch to include updated assignee
      const updated = await app.prisma.task.findUnique({
        where: { id: task.id },
        include: { assignee: { select: { id: true, name: true } } },
      });
      return reply.code(201).send(updated);
    }

    return reply.code(201).send(task);
  });

  // Update task
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = updateTaskSchema.parse(request.body);

    // Fetch old task to detect status change
    const oldTask = await app.prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!oldTask) return reply.code(404).send({ error: 'Task not found' });

    const updated = await app.prisma.task.update({
      where: { id: request.params.id },
      data,
      include: { assignee: { select: { id: true, name: true } } },
    });

    // Status change hooks
    if (data.status && data.status !== oldTask.status) {
      const statusResult = await lifecycleService.onStatusChanged(updated, oldTask.status, data.status);

      // Unblock dependents when task is done
      if (data.status === 'DONE') {
        await taskService.unblockDependents(updated.id);
      }

      // Auto-recalculate blocked status
      await taskService.recalculateBlocked(updated.id);

      // Enqueue auto-spawned agent via lifecycle queue
      if (statusResult.shouldSpawnAgent && statusResult.agentId) {
        await app.lifecycleQueue.add('auto-spawn-agent', {
          type: 'auto-spawn-agent',
          taskId: updated.id,
          userId: request.userId,
          agentId: statusResult.agentId,
        });
      }
    }

    // Send notification
    const event = data.status === 'DONE' ? 'task.completed' as const : 'task.updated' as const;
    notificationService.sendTaskNotification({
      event,
      task: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        status: updated.status,
        assigneeName: updated.assignee?.name,
        priority: updated.priority,
      },
    });

    app.io.emit('tasks:updated', { taskId: request.params.id, userId: request.userId });
    return updated;
  });

  // Delete task
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const task = await app.prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    await app.prisma.task.delete({ where: { id: request.params.id } });

    notificationService.sendTaskNotification({
      event: 'task.deleted',
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
      },
    });

    app.io.emit('tasks:updated', { taskId: request.params.id, userId: request.userId });
    return { success: true };
  });

  // Add comment
  app.post<{ Params: { id: string } }>('/:id/comments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { author, content } = createCommentSchema.parse(request.body);
    const task = await app.prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    const comment = await app.prisma.taskComment.create({
      data: { taskId: request.params.id, author, content },
    });

    notificationService.sendCommentNotification({
      task: { id: task.id, title: task.title, status: task.status },
      comment: { author, content },
    });

    return reply.code(201).send(comment);
  });

  // Add dependency
  app.post<{ Params: { id: string } }>('/:id/dependencies', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { dependsOnId } = addDependencySchema.parse(request.body);
    const task = await app.prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    // Cycle detection via recursive CTE
    const cycles = await app.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE dep_chain AS (
        SELECT depends_on_id AS id FROM task_dependencies WHERE task_id = ${dependsOnId}
        UNION
        SELECT td.depends_on_id FROM task_dependencies td
        JOIN dep_chain dc ON td.task_id = dc.id
      )
      SELECT id FROM dep_chain WHERE id = ${request.params.id}
      LIMIT 1
    `;

    if (cycles.length > 0) {
      return reply.code(400).send({ error: 'Adding this dependency would create a cycle' });
    }

    const dep = await app.prisma.taskDependency.create({
      data: { taskId: request.params.id, dependsOnId },
    });

    // Recalculate blocked status
    await taskService.recalculateBlocked(request.params.id);

    return reply.code(201).send(dep);
  });

  // Remove dependency
  app.delete<{ Params: { id: string; depId: string } }>('/:id/dependencies/:depId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await app.prisma.taskDependency.deleteMany({
      where: { id: request.params.depId, taskId: request.params.id },
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Dependency not found' });

    // Recalculate blocked status after removal
    await taskService.recalculateBlocked(request.params.id);

    return { success: true };
  });

  // Trigger run
  app.post<{ Params: { id: string } }>('/:id/run', { preHandler: [app.authenticate] }, async (request, reply) => {
    const task = await app.prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: { assignee: { include: { specialization: true } } },
    });
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    const run = await app.prisma.taskRun.create({
      data: {
        taskId: task.id,
        agentType: task.assignee?.specialization?.name || 'general',
        status: 'QUEUED',
      },
    });

    await app.prisma.task.update({
      where: { id: task.id },
      data: { currentRunId: run.id, status: 'IN_PROGRESS' },
    });

    // Enqueue BullMQ agent execution job
    await app.agentQueue.add('agent-execution', {
      runId: run.id,
      taskId: task.id,
      userId: request.userId,
    });

    app.io.emit('tasks:updated', { taskId: task.id, userId: request.userId });
    return reply.code(201).send(run);
  });

  // Get run logs
  app.get<{ Params: { id: string; runId: string } }>('/:id/runs/:runId/logs', { preHandler: [app.authenticate] }, async (request) => {
    const logs = await app.prisma.taskLog.findMany({
      where: { runId: request.params.runId },
      orderBy: { createdAt: 'asc' },
    });
    return logs;
  });
}
