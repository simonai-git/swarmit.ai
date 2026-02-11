import type { FastifyInstance } from 'fastify';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const [taskCounts, runCounts, projectCounts, recentRuns] = await Promise.all([
      app.prisma.task.groupBy({
        by: ['status'],
        where: { userId: request.userId },
        _count: true,
      }),
      app.prisma.taskRun.aggregate({
        where: { task: { userId: request.userId } },
        _count: true,
        _sum: { tokens: true, cost: true },
      }),
      app.prisma.project.groupBy({
        by: ['status'],
        where: { userId: request.userId },
        _count: true,
      }),
      app.prisma.taskRun.findMany({
        where: { task: { userId: request.userId } },
        include: { task: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      tasks: taskCounts,
      runs: {
        total: runCounts._count,
        totalTokens: runCounts._sum.tokens || 0,
        totalCost: runCounts._sum.cost || 0,
      },
      projects: projectCounts,
      recentRuns,
    };
  });
}
