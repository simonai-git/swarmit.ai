import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';

// GET /api/profile/usage - Get usage statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    
    // Calculate date range
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get aggregate stats
    const statsResult = await pool.query(
      `SELECT 
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cost_cents), 0) as total_cost_cents,
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_runs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_runs
       FROM agent_runs
       WHERE started_at >= $1`,
      [startDate]
    );

    // Get daily breakdown
    const dailyResult = await pool.query(
      `SELECT 
        DATE(started_at) as date,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cost_cents), 0) as cost_cents,
        COUNT(*) as runs
       FROM agent_runs
       WHERE started_at >= $1
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      [startDate]
    );

    const stats = statsResult.rows[0];
    const dailyUsage = dailyResult.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      inputTokens: parseInt(row.input_tokens),
      outputTokens: parseInt(row.output_tokens),
      costCents: parseInt(row.cost_cents),
      runs: parseInt(row.runs),
    }));

    return NextResponse.json({
      totalInputTokens: parseInt(stats.total_input_tokens),
      totalOutputTokens: parseInt(stats.total_output_tokens),
      totalCostCents: parseInt(stats.total_cost_cents),
      totalRuns: parseInt(stats.total_runs),
      completedRuns: parseInt(stats.completed_runs),
      failedRuns: parseInt(stats.failed_runs),
      dailyUsage,
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    return NextResponse.json({ error: 'Failed to fetch usage stats' }, { status: 500 });
  }
}
