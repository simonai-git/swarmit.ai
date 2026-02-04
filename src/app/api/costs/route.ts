import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// GET /api/costs - Get cost summary
export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today'; // today, week, month, all
    const groupBy = searchParams.get('groupBy'); // agent, task, day

    // Calculate date range
    let startDate: Date;
    const endDate = new Date();

    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default:
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
    }

    // Get total costs
    const totalResult = await pool.query(
      `SELECT 
        COALESCE(SUM(cost_cents), 0) as total_cost,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_runs
       FROM agent_runs 
       WHERE started_at >= $1 AND started_at <= $2`,
      [startDate, endDate]
    );

    const summary = totalResult.rows[0];

    // Get breakdown by group if requested
    let breakdown: any[] = [];

    if (groupBy === 'agent') {
      const breakdownResult = await pool.query(
        `SELECT 
          agent_type,
          COALESCE(SUM(cost_cents), 0) as cost,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COUNT(*) as runs
         FROM agent_runs 
         WHERE started_at >= $1 AND started_at <= $2
         GROUP BY agent_type
         ORDER BY cost DESC`,
        [startDate, endDate]
      );
      breakdown = breakdownResult.rows;
    } else if (groupBy === 'day') {
      const breakdownResult = await pool.query(
        `SELECT 
          DATE(started_at) as date,
          COALESCE(SUM(cost_cents), 0) as cost,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COUNT(*) as runs
         FROM agent_runs 
         WHERE started_at >= $1 AND started_at <= $2
         GROUP BY DATE(started_at)
         ORDER BY date DESC`,
        [startDate, endDate]
      );
      breakdown = breakdownResult.rows.map(row => ({
        ...row,
        date: row.date.toISOString().split('T')[0],
      }));
    } else if (groupBy === 'task') {
      const breakdownResult = await pool.query(
        `SELECT 
          ar.task_id,
          t.title as task_title,
          COALESCE(SUM(ar.cost_cents), 0) as cost,
          COALESCE(SUM(ar.input_tokens), 0) as input_tokens,
          COALESCE(SUM(ar.output_tokens), 0) as output_tokens,
          COUNT(*) as runs
         FROM agent_runs ar
         LEFT JOIN tasks t ON ar.task_id = t.id
         WHERE ar.started_at >= $1 AND ar.started_at <= $2
         GROUP BY ar.task_id, t.title
         ORDER BY cost DESC
         LIMIT 20`,
        [startDate, endDate]
      );
      breakdown = breakdownResult.rows;
    }

    // Budget info
    const dailyBudget = parseInt(process.env.DAILY_BUDGET_CENTS || '1000');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayResult = await pool.query(
      `SELECT COALESCE(SUM(cost_cents), 0) as today_cost
       FROM agent_runs 
       WHERE started_at >= $1`,
      [todayStart]
    );
    const todayCost = parseInt(todayResult.rows[0].today_cost);

    return NextResponse.json({
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary: {
        totalCostCents: parseInt(summary.total_cost),
        totalCostDollars: (parseInt(summary.total_cost) / 100).toFixed(2),
        totalInputTokens: parseInt(summary.total_input_tokens),
        totalOutputTokens: parseInt(summary.total_output_tokens),
        totalRuns: parseInt(summary.total_runs),
        successfulRuns: parseInt(summary.successful_runs),
        failedRuns: parseInt(summary.failed_runs),
        successRate: summary.total_runs > 0 
          ? ((parseInt(summary.successful_runs) / parseInt(summary.total_runs)) * 100).toFixed(1) + '%'
          : 'N/A',
      },
      budget: {
        dailyLimitCents: dailyBudget,
        todaySpentCents: todayCost,
        todayRemainingCents: Math.max(0, dailyBudget - todayCost),
        percentUsed: ((todayCost / dailyBudget) * 100).toFixed(1) + '%',
      },
      breakdown: groupBy ? breakdown : undefined,
    });
  } catch (error) {
    console.error('Error getting costs:', error);
    return NextResponse.json(
      { error: 'Failed to get costs' },
      { status: 500 }
    );
  }
}
