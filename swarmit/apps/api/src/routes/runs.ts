import type { FastifyInstance } from 'fastify';
import { paginationSchema } from '@swarmit/shared';

export async function runRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      app.prisma.taskRun.findMany({
        where: { task: { userId: request.userId } },
        include: {
          task: { select: { id: true, title: true } },
          executionState: {
            select: { status: true, currentNodeId: true, completedNodes: true, workflowVersionId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      app.prisma.taskRun.count({ where: { task: { userId: request.userId } } }),
    ]);

    return { runs, total, page, limit };
  });

  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const run = await app.prisma.taskRun.findFirst({
      where: { id: request.params.id, task: { userId: request.userId } },
      include: {
        task: { select: { id: true, title: true } },
        logs: { orderBy: { createdAt: 'asc' } },
        executionState: {
          include: {
            events: { orderBy: { createdAt: 'asc' } },
            workflowVersion: { select: { nodes: true, edges: true } },
          },
        },
      },
    });
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    return run;
  });

  // Cancel a run
  app.post<{ Params: { id: string } }>('/:id/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    const run = await app.prisma.taskRun.findFirst({
      where: { id: request.params.id, task: { userId: request.userId } },
    });
    if (!run) return reply.code(404).send({ error: 'Run not found' });

    await app.prisma.taskRun.update({
      where: { id: run.id },
      data: { status: 'CANCELLED', endedAt: new Date() },
    });

    return { success: true };
  });
}
