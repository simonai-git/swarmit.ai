import { NextRequest, NextResponse } from 'next/server';
import { agentQueue } from '@/lib/agent-queue';
import pool from '@/lib/db';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// GET /api/runs/:id - Get run details including transcript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Try in-memory first (for active runs)
    const run = agentQueue.getRun(id);
    let dbRun = null;

    // If not in memory, check database
    if (!run) {
      const result = await pool.query(
        `SELECT * FROM agent_runs WHERE id = $1`,
        [id]
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        dbRun = {
          id: row.id,
          jobId: row.job_id || row.id,
          taskId: row.task_id,
          agentType: row.agent_type,
          status: row.status,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          inputTokens: row.input_tokens || 0,
          outputTokens: row.output_tokens || 0,
          costCents: row.cost_cents || 0,
          transcript: row.transcript || [],
          error: row.error,
        };
      }
    }

    const finalRun = run || dbRun;
    if (!finalRun) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    return NextResponse.json(finalRun);
  } catch (error) {
    console.error('Error getting run:', error);
    return NextResponse.json(
      { error: 'Failed to get run' },
      { status: 500 }
    );
  }
}

// POST /api/runs/:id/cancel - Cancel a running agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (body.action === 'cancel') {
      // Update run status in database
      const result = await pool.query(
        `UPDATE agent_runs 
         SET status = 'cancelled', 
             completed_at = NOW(),
             error = 'Cancelled by user'
         WHERE id = $1 AND status = 'running'
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Run not found or not running' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Run cancelled',
        run: result.rows[0],
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use: cancel' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error cancelling run:', error);
    return NextResponse.json(
      { error: 'Failed to cancel run' },
      { status: 500 }
    );
  }
}
