import type { FastifyInstance } from 'fastify';

export async function costRoutes(app: FastifyInstance) {
  // Get cost summary
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { period } = request.query as { period?: string };

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [totals, byAgent, byDay, budget] = await Promise.all([
      // Total costs
      app.prisma.taskRun.aggregate({
        where: {
          task: { userId: request.userId },
          createdAt: { gte: startDate },
          status: { in: ['SUCCESS', 'FAILED'] },
        },
        _sum: { tokens: true, cost: true },
        _count: true,
      }),

      // Costs by agent type
      app.prisma.taskRun.groupBy({
        by: ['agentType'],
        where: {
          task: { userId: request.userId },
          createdAt: { gte: startDate },
          status: { in: ['SUCCESS', 'FAILED'] },
        },
        _sum: { tokens: true, cost: true },
        _count: true,
      }),

      // Daily costs (last 30 days)
      app.prisma.$queryRaw<{ day: string; tokens: number; cost: number; runs: number }[]>`
        SELECT
          DATE(tr.created_at) as day,
          COALESCE(SUM(tr.tokens), 0)::int as tokens,
          COALESCE(SUM(tr.cost), 0)::float as cost,
          COUNT(*)::int as runs
        FROM task_runs tr
        JOIN tasks t ON tr.task_id = t.id
        WHERE t.user_id = ${request.userId}
          AND tr.created_at >= ${startDate}
          AND tr.status IN ('SUCCESS', 'FAILED')
        GROUP BY DATE(tr.created_at)
        ORDER BY day DESC
        LIMIT 30
      `,

      // User's daily budget
      app.prisma.automationSetting.findUnique({
        where: { userId: request.userId },
        select: { dailyBudgetCents: true },
      }),
    ]);

    // Today's spend
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todaySpend = await app.prisma.taskRun.aggregate({
      where: {
        task: { userId: request.userId },
        createdAt: { gte: todayStart },
        status: { in: ['SUCCESS', 'FAILED'] },
      },
      _sum: { cost: true },
    });

    return {
      period: period || '30d',
      totals: {
        tokens: totals._sum.tokens || 0,
        cost: totals._sum.cost || 0,
        runs: totals._count,
      },
      byAgent,
      byDay,
      budget: {
        dailyLimitCents: budget?.dailyBudgetCents || 1000,
        todaySpendCents: Math.round((todaySpend._sum.cost || 0) * 100),
      },
    };
  });
}
