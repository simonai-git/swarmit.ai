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
      `SELECT railway_token, railway_projects, railway_selected_project, railway_connected_at,
              github_token, github_username, github_connected_at
       FROM user_integrations
       WHERE user_email = $1`,
      [session.user.email]
    );

    const integrations = result.rows[0] || {};

    // Parse railway_projects - supports both old format (array) and new format ({ account, projects })
    let railwayProjects: any[] = [];
    let railwayAccount: { name: string; email: string } | null = null;
    if (integrations.railway_projects) {
      const parsed = JSON.parse(integrations.railway_projects);
      if (Array.isArray(parsed)) {
        // Old format: just an array of projects
        railwayProjects = parsed;
      } else if (parsed.projects) {
        // New format: { account, projects }
        railwayProjects = parsed.projects;
        railwayAccount = parsed.account || null;
      }
    }

    return NextResponse.json({
      railway: {
        connected: !!integrations.railway_token,
        projects: railwayProjects,
        selectedProject: integrations.railway_selected_project,
        connectedAt: integrations.railway_connected_at || null,
        account: railwayAccount,
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
