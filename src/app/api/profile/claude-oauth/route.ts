import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import pool from '@/lib/db';

// GET /api/profile/claude-oauth - Get Claude connection status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT claude_email, claude_connected_at
       FROM user_integrations
       WHERE user_id = $1 AND claude_token IS NOT NULL`,
      [userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      email: result.rows[0].claude_email,
      connectedAt: result.rows[0].claude_connected_at,
    });
  } catch (error) {
    console.error('Error fetching Claude connection:', error);
    return NextResponse.json({ error: 'Failed to fetch Claude connection' }, { status: 500 });
  }
}

// DELETE /api/profile/claude-oauth - Disconnect Claude
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await pool.query(
      `UPDATE user_integrations
       SET claude_token = NULL, claude_email = NULL, claude_connected_at = NULL
       WHERE user_id = $1`,
      [userId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Claude:', error);
    return NextResponse.json({ error: 'Failed to disconnect Claude' }, { status: 500 });
  }
}
