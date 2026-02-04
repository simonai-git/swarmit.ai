import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// GET /api/runs - List all runs with optional filters
export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = 'SELECT * FROM agent_runs';
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (taskId) {
      conditions.push(`task_id = $${paramIndex++}`);
      values.push(taskId);
    }

    if (status) {
      const statuses = status.split(',');
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(statuses as any);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY started_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM agent_runs';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await pool.query(countQuery, values.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    return NextResponse.json({
      runs: result.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        agentType: row.agent_type,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        inputTokens: row.input_tokens || 0,
        outputTokens: row.output_tokens || 0,
        costCents: row.cost_cents || 0,
        error: row.error,
        // Don't include full transcript in list view
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
