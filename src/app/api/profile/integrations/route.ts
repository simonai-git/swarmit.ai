import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';

// GET /api/profile/integrations - Get all integrations status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT railway_token, railway_projects, railway_selected_project,
              github_token, github_username, github_connected_at
       FROM user_integrations
       WHERE user_email = $1`,
      [session.user.email]
    );

    const integrations = result.rows[0] || {};

    return NextResponse.json({
      railway: {
        connected: !!integrations.railway_token,
        projects: integrations.railway_projects ? JSON.parse(integrations.railway_projects) : [],
        selectedProject: integrations.railway_selected_project,
      },
      github: {
        connected: !!integrations.github_token,
        username: integrations.github_username || null,
        connectedAt: integrations.github_connected_at || null,
      },
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}
