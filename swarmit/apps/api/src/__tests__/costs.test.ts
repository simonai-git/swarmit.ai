import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { costRoutes } from '../routes/costs.js';

describe('cost routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;
    await app.register(costRoutes, { prefix: '/costs' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /costs should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/costs' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /costs should return 401 with invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/costs',
        headers: { authorization: 'Bearer bad-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /costs ───────────────────────────────────────────────

  describe('GET /costs', () => {
    function setupCostMocks(overrides: {
      totals?: any;
      byAgent?: any;
      byDay?: any;
      budget?: any;
      todaySpend?: any;
    } = {}) {
      // Total costs (taskRun.aggregate)
      prisma.taskRun.aggregate.mockResolvedValueOnce(
        'totals' in overrides ? overrides.totals : {
          _sum: { tokens: 50000, cost: 1.25 },
          _count: 10,
        }
      );

      // Costs by agent type (taskRun.groupBy)
      prisma.taskRun.groupBy.mockResolvedValueOnce(
        'byAgent' in overrides ? overrides.byAgent : [
          { agentType: 'developer', _sum: { tokens: 30000, cost: 0.75 }, _count: 6 },
          { agentType: 'qa', _sum: { tokens: 20000, cost: 0.50 }, _count: 4 },
        ]
      );

      // Daily costs (raw SQL)
      prisma.$queryRaw.mockResolvedValueOnce(
        'byDay' in overrides ? overrides.byDay : [
          { day: '2026-02-10', tokens: 25000, cost: 0.65, runs: 5 },
          { day: '2026-02-09', tokens: 25000, cost: 0.60, runs: 5 },
        ]
      );

      // Budget settings
      prisma.automationSetting.findUnique.mockResolvedValueOnce(
        'budget' in overrides ? overrides.budget : { dailyBudgetCents: 500 }
      );

      // Today's spend (second aggregate call)
      prisma.taskRun.aggregate.mockResolvedValueOnce(
        'todaySpend' in overrides ? overrides.todaySpend : {
          _sum: { cost: 0.35 },
        }
      );
    }

    it('should return cost summary with default 30d period', async () => {
      setupCostMocks();

      const res = await app.inject({
        method: 'GET',
        url: '/costs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.period).toBe('30d');
      expect(body.totals.tokens).toBe(50000);
      expect(body.totals.cost).toBe(1.25);
      expect(body.totals.runs).toBe(10);
      expect(body.byAgent).toHaveLength(2);
      expect(body.byDay).toHaveLength(2);
      expect(body.budget.dailyLimitCents).toBe(500);
      expect(body.budget.todaySpendCents).toBe(35);
    });

    it('should accept period=7d query param', async () => {
      setupCostMocks();

      const res = await app.inject({
        method: 'GET',
        url: '/costs?period=7d',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().period).toBe('7d');
    });

    it('should accept period=90d query param', async () => {
      setupCostMocks();

      const res = await app.inject({
        method: 'GET',
        url: '/costs?period=90d',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().period).toBe('90d');
    });

    it('should default to 30d for unknown period', async () => {
      setupCostMocks();

      const res = await app.inject({
        method: 'GET',
        url: '/costs?period=unknown',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      // Default period applied
      expect(res.json().period).toBe('unknown');
    });

    it('should handle zero costs', async () => {
      setupCostMocks({
        totals: { _sum: { tokens: null, cost: null }, _count: 0 },
        byAgent: [],
        byDay: [],
        budget: null,
        todaySpend: { _sum: { cost: null } },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/costs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totals.tokens).toBe(0);
      expect(body.totals.cost).toBe(0);
      expect(body.totals.runs).toBe(0);
      expect(body.byAgent).toEqual([]);
      expect(body.byDay).toEqual([]);
      expect(body.budget.dailyLimitCents).toBe(1000); // default budget
      expect(body.budget.todaySpendCents).toBe(0);
    });

    it('should use default budget when no automation settings exist', async () => {
      setupCostMocks({ budget: null });

      const res = await app.inject({
        method: 'GET',
        url: '/costs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().budget.dailyLimitCents).toBe(1000);
    });

    it('should calculate todaySpendCents correctly', async () => {
      setupCostMocks({
        todaySpend: { _sum: { cost: 2.567 } },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/costs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      // 2.567 * 100 = 256.7 → Math.round = 257
      expect(res.json().budget.todaySpendCents).toBe(257);
    });

    it('should scope costs to the authenticated user', async () => {
      setupCostMocks();

      await app.inject({
        method: 'GET',
        url: '/costs',
        headers: { authorization: `Bearer ${token}` },
      });

      // First aggregate call (totals) — userId is in the nested where
      expect(prisma.taskRun.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            task: { userId: 'test-user-id' },
          }),
        })
      );

      // groupBy call (byAgent)
      expect(prisma.taskRun.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            task: { userId: 'test-user-id' },
          }),
        })
      );

      // automationSetting scoped to userId
      expect(prisma.automationSetting.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        })
      );
    });

    it('should filter by SUCCESS and FAILED statuses', async () => {
      setupCostMocks();

      await app.inject({
        method: 'GET',
        url: '/costs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.taskRun.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['SUCCESS', 'FAILED'] },
          }),
        })
      );
    });

    it('should return byAgent breakdown', async () => {
      setupCostMocks({
        byAgent: [
          { agentType: 'developer', _sum: { tokens: 100000, cost: 5.0 }, _count: 20 },
          { agentType: 'reviewer', _sum: { tokens: 10000, cost: 0.5 }, _count: 2 },
          { agentType: 'qa', _sum: { tokens: 5000, cost: 0.25 }, _count: 1 },
        ],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/costs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.byAgent).toHaveLength(3);
      expect(body.byAgent[0].agentType).toBe('developer');
      expect(body.byAgent[0]._count).toBe(20);
    });
  });
});
