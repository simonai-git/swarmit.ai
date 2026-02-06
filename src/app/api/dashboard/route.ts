import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const [projectStats, agentPerformance, costTrends, recentActivity] = await Promise.all([
      // 1. Project completion stats
      pool.query(`
        SELECT p.id, p.title,
          COUNT(*) FILTER (WHERE t.status = 'todo') as todo,
          COUNT(*) FILTER (WHERE t.status = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE t.status = 'testing') as testing,
          COUNT(*) FILTER (WHERE t.status = 'in_review') as in_review,
          COUNT(*) FILTER (WHERE t.status = 'done') as done,
          COUNT(*) as total
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id, p.title
        ORDER BY p.title
      `),

      // 2. Agent performance
      pool.query(`
        SELECT
          agent_type,
          COUNT(*) as total_runs,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_runs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
          COALESCE(AVG(input_tokens + output_tokens), 0) as avg_tokens,
          COALESCE(SUM(cost_cents), 0) as total_cost
        FROM agent_runs
        GROUP BY agent_type
        ORDER BY agent_type
      `),

      // 3. Cost trends (last 30 days)
      pool.query(`
        SELECT DATE(started_at) as date,
          COALESCE(SUM(cost_cents), 0) as total_cost
        FROM agent_runs
        WHERE started_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(started_at)
        ORDER BY date
      `),

      // 4. Recent activity (last 20 entries with task titles)
      pool.query(`
        SELECT al.*, t.title as task_title
        FROM activity_log al
        LEFT JOIN tasks t ON al.task_id = t.id
        ORDER BY al.created_at DESC
        LIMIT 20
      `),
    ]);

    return NextResponse.json({
      projects: projectStats.rows.map(r => ({
        id: r.id,
        title: r.title,
        todo: parseInt(r.todo) || 0,
        in_progress: parseInt(r.in_progress) || 0,
        testing: parseInt(r.testing) || 0,
        in_review: parseInt(r.in_review) || 0,
        done: parseInt(r.done) || 0,
        total: parseInt(r.total) || 0,
      })),
      agents: agentPerformance.rows.map(r => ({
        agentType: r.agent_type,
        totalRuns: parseInt(r.total_runs) || 0,
        completedRuns: parseInt(r.completed_runs) || 0,
        failedRuns: parseInt(r.failed_runs) || 0,
        successRate: parseInt(r.total_runs) > 0
          ? Math.round((parseInt(r.completed_runs) / parseInt(r.total_runs)) * 100)
          : 0,
        avgTokens: Math.round(parseFloat(r.avg_tokens)) || 0,
        totalCost: parseInt(r.total_cost) || 0,
      })),
      costTrends: costTrends.rows.map(r => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
        cost: parseInt(r.total_cost) || 0,
      })),
      activity: recentActivity.rows.map(r => ({
        id: r.id,
        taskId: r.task_id,
        taskTitle: r.task_title || 'Unknown Task',
        action: r.action,
        fieldChanged: r.field_changed,
        oldValue: r.old_value,
        newValue: r.new_value,
        actor: r.actor,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
