import type { FastifyInstance } from 'fastify';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const [taskCounts, runCounts, projectCounts, recentRuns, activeProjects, agentActivity, costTasks] = await Promise.all([
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
        include: {
          task: {
            select: { id: true, title: true, assignee: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      app.prisma.project.findMany({
        where: { userId: request.userId, status: 'ACTIVE' },
        select: {
          id: true, title: true,
          tasks: { select: { status: true } },
        },
      }),
      app.prisma.taskRun.groupBy({
        by: ['agentType'],
        where: { task: { userId: request.userId } },
        _count: true,
        _sum: { tokens: true, cost: true },
      }),
      app.prisma.task.findMany({
        where: { userId: request.userId, projectId: { not: null } },
        select: {
          project: { select: { id: true, title: true } },
          runs: { select: { cost: true } },
        },
      }),
    ]);

    // Compute project progress
    const projectProgress = activeProjects.map((p) => {
      const total = p.tasks.length;
      const done = p.tasks.filter((t) => t.status === 'DONE').length;
      return { id: p.id, title: p.title, total, done };
    });

    // Compute cost by project
    const costMap = new Map<string, { id: string; title: string; totalCost: number }>();
    for (const task of costTasks) {
      if (!task.project) continue;
      const key = task.project.id;
      if (!costMap.has(key)) {
        costMap.set(key, { id: key, title: task.project.title, totalCost: 0 });
      }
      const entry = costMap.get(key)!;
      for (const run of task.runs) {
        entry.totalCost += run.cost ?? 0;
      }
    }
    const costByProject = Array.from(costMap.values()).sort((a, b) => b.totalCost - a.totalCost);

    return {
      tasks: taskCounts,
      runs: {
        total: runCounts._count,
        totalTokens: runCounts._sum.tokens || 0,
        totalCost: runCounts._sum.cost || 0,
      },
      projects: projectCounts,
      recentRuns,
      projectProgress,
      agentActivity,
      costByProject,
    };
  });
}
