import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { agentQueue } from '@/lib/agent-queue';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// GET /api/monitoring - System health and metrics
export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dailyBudget = parseInt(process.env.DAILY_BUDGET_CENTS || '1000');

    // Get today's costs
    const todayCostResult = await pool.query(
      `SELECT COALESCE(SUM(cost_cents), 0) as total 
       FROM agent_runs 
       WHERE started_at >= CURRENT_DATE`
    );
    const todayCost = parseInt(todayCostResult.rows[0].total) || 0;

    // Get run stats for today
    const todayStatsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
      FROM agent_runs 
      WHERE started_at >= CURRENT_DATE
    `);
    const todayStats = todayStatsResult.rows[0];

    // Get recent failures (last 24h)
    const recentFailuresResult = await pool.query(`
      SELECT id, task_id, agent_type, error, started_at, completed_at
      FROM agent_runs 
      WHERE status = 'failed' AND started_at >= NOW() - INTERVAL '24 hours'
      ORDER BY started_at DESC
      LIMIT 10
    `);

    // Get queue status
    const queueStatus = await agentQueue.getStatus();

    // Calculate health score (0-100)
    const successRate = todayStats.total_runs > 0 
      ? (parseInt(todayStats.completed) / parseInt(todayStats.total_runs)) * 100 
      : 100;
    const budgetHealth = Math.max(0, 100 - (todayCost / dailyBudget) * 100);
    const healthScore = Math.round((successRate * 0.7) + (budgetHealth * 0.3));

    return NextResponse.json({
      health: {
        score: healthScore,
        status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical',
      },
      budget: {
        dailyLimitCents: dailyBudget,
        spentTodayCents: todayCost,
        remainingCents: Math.max(0, dailyBudget - todayCost),
        percentUsed: ((todayCost / dailyBudget) * 100).toFixed(1),
        budgetExceeded: todayCost >= dailyBudget,
      },
      runs: {
        today: {
          total: parseInt(todayStats.total_runs),
          completed: parseInt(todayStats.completed),
          failed: parseInt(todayStats.failed),
          running: parseInt(todayStats.running),
          successRate: successRate.toFixed(1) + '%',
          totalTokens: parseInt(todayStats.total_tokens),
        },
      },
      queue: {
        pending: queueStatus.pending,
        running: queueStatus.running,
        maxConcurrent: 3,
        isProcessing: queueStatus.running > 0,
      },
      recentFailures: recentFailuresResult.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        agentType: row.agent_type,
        error: row.error,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      })),
      alerts: {
        budgetWarning: todayCost >= dailyBudget * 0.8,
        budgetExceeded: todayCost >= dailyBudget,
        highFailureRate: parseInt(todayStats.failed) > parseInt(todayStats.completed),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting monitoring data:', error);
    return NextResponse.json(
      { error: 'Failed to get monitoring data' },
      { status: 500 }
    );
  }
}
