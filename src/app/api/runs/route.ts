import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/runs - List all runs with optional filters (no auth required for UI)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const status = searchParams.get('status');
    const agentType = searchParams.get('agent_type');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query with LEFT JOIN to get task titles
    let query = `SELECT ar.*, t.title as task_title FROM agent_runs ar LEFT JOIN tasks t ON ar.task_id = t.id`;
    const conditions: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    let paramIndex = 1;

    if (taskId) {
      conditions.push(`ar.task_id = $${paramIndex++}`);
      values.push(taskId);
    }

    if (status) {
      const statuses = status.split(',');
      conditions.push(`ar.status = ANY($${paramIndex++})`);
      values.push(statuses);
    }

    if (agentType) {
      conditions.push(`ar.agent_type = $${paramIndex++}`);
      values.push(agentType);
    }

    if (startDate) {
      conditions.push(`ar.started_at >= $${paramIndex++}`);
      values.push(startDate);
    }

    if (endDate) {
      conditions.push(`ar.started_at <= $${paramIndex++}`);
      values.push(endDate);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY ar.started_at DESC NULLS LAST LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM agent_runs ar';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await pool.query(countQuery, values.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    return NextResponse.json({
      runs: result.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        taskTitle: row.task_title || 'Unknown Task',
        agentType: row.agent_type,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        inputTokens: row.input_tokens || 0,
        outputTokens: row.output_tokens || 0,
        costCents: row.cost_cents || 0,
        error: row.error,
        hasTranscript: row.transcript && row.transcript.length > 0,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + result.rows.length < total,
      },
    });
  } catch (error) {
    console.error('Error listing runs:', error);
    return NextResponse.json(
      { error: 'Failed to list runs' },
      { status: 500 }
    );
  }
}
