import type { FastifyInstance } from 'fastify';
import { createProjectSchema, updateProjectSchema, paginationSchema } from '@swarmit/shared';
import { ProjectService } from '../services/project.service.js';

export async function projectRoutes(app: FastifyInstance) {
  const projectService = new ProjectService(app.prisma);

  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      app.prisma.project.findMany({
        where: { userId: request.userId },
        include: { _count: { select: { tasks: true } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      app.prisma.project.count({ where: { userId: request.userId } }),
    ]);

    return { projects, total, page, limit };
  });

  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const project = await app.prisma.project.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        tasks: {
          include: {
            assignee: { select: { id: true, name: true } },
            _count: { select: { comments: true, runs: true } },
          },
          orderBy: { priority: 'desc' },
        },
      },
    });
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return project;
  });

  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = createProjectSchema.parse(request.body);
    const project = await app.prisma.project.create({
      data: { ...data, userId: request.userId },
    });
    app.io.emit('project:updated', { projectId: project.id, userId: request.userId });
    return reply.code(201).send(project);
  });

  app.patch<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = updateProjectSchema.parse(request.body);
    const result = await app.prisma.project.updateMany({
      where: { id: request.params.id, userId: request.userId },
      data,
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Project not found' });
    app.io.emit('project:updated', { projectId: request.params.id, userId: request.userId });
    return { success: true };
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await app.prisma.project.deleteMany({
      where: { id: request.params.id, userId: request.userId },
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Project not found' });
    return { success: true };
  });

  // Start project
  app.post<{ Params: { id: string } }>('/:id/start', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const project = await projectService.start(request.params.id, request.userId);
      app.io.emit('project:updated', { projectId: project.id, userId: request.userId });
      return { success: true, status: project.status };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start project';
      const code = message === 'Project not found' ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  // Pause project
  app.post<{ Params: { id: string } }>('/:id/pause', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const project = await projectService.pause(request.params.id, request.userId);
      app.io.emit('project:updated', { projectId: project.id, userId: request.userId });
      return { success: true, status: project.status };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to pause project';
      const code = message === 'Project not found' ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  // Resume project
  app.post<{ Params: { id: string } }>('/:id/resume', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const project = await projectService.resume(request.params.id, request.userId);
      app.io.emit('project:updated', { projectId: project.id, userId: request.userId });
      return { success: true, status: project.status };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resume project';
      const code = message === 'Project not found' ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  // Cancel project
  app.post<{ Params: { id: string } }>('/:id/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const project = await projectService.cancel(request.params.id, request.userId);
      app.io.emit('project:updated', { projectId: project.id, userId: request.userId });
      return { success: true, status: project.status };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel project';
      const code = message === 'Project not found' ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  // Complete project
  app.post<{ Params: { id: string } }>('/:id/complete', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const project = await projectService.complete(request.params.id, request.userId);
      app.io.emit('project:updated', { projectId: project.id, userId: request.userId });
      return { success: true, status: project.status };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete project';
      const code = message === 'Project not found' ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });
}
