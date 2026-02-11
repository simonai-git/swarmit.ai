import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import pool from '@/lib/db';
import { refreshRailwayToken } from './railway/route';
import { refreshGitHubToken } from './github/route';

// GET /api/profile/integrations - Get all integrations status
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT railway_token, railway_projects, railway_selected_project, railway_connected_at,
              railway_refresh_token, railway_token_expires_at, railway_auth_method,
              github_token, github_username, github_connected_at,
              github_refresh_token, github_token_expires_at, github_auth_method
       FROM user_integrations
       WHERE user_id = $1`,
      [userId]
    );

    const integrations = result.rows[0] || {};

    // Auto-refresh expired OAuth tokens
    if (
      integrations.railway_token &&
      integrations.railway_auth_method === 'oauth' &&
      integrations.railway_refresh_token &&
      integrations.railway_token_expires_at
    ) {
      const expiresAt = new Date(integrations.railway_token_expires_at);
      const now = new Date();
      // Refresh if token expires within 5 minutes
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        try {
          const refreshed = await refreshRailwayToken(integrations.railway_refresh_token);
          const newExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000);

          await pool.query(
            `UPDATE user_integrations SET
              railway_token = $1, railway_refresh_token = $2, railway_token_expires_at = $3, updated_at = NOW()
             WHERE user_id = $4`,
            [refreshed.access_token, refreshed.refresh_token, newExpiresAt, userId]
          );

          integrations.railway_token = refreshed.access_token;
          integrations.railway_refresh_token = refreshed.refresh_token;
          integrations.railway_token_expires_at = newExpiresAt;
        } catch (error) {
          console.error('Failed to refresh Railway OAuth token:', error);
          // Token refresh failed — still return current state, user may need to re-auth
        }
      }
    }

    // Auto-refresh expired GitHub OAuth tokens
    if (
      integrations.github_token &&
      integrations.github_auth_method === 'oauth' &&
      integrations.github_refresh_token &&
      integrations.github_token_expires_at
    ) {
      const expiresAt = new Date(integrations.github_token_expires_at);
      const now = new Date();
      // Refresh if token expires within 5 minutes
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        try {
          const refreshed = await refreshGitHubToken(integrations.github_refresh_token);
          const newExpiresAt = refreshed.expires_in
            ? new Date(Date.now() + refreshed.expires_in * 1000)
            : null;

          await pool.query(
            `UPDATE user_integrations SET
              github_token = $1, github_refresh_token = $2, github_token_expires_at = $3, updated_at = NOW()
             WHERE user_id = $4`,
            [refreshed.access_token, refreshed.refresh_token || null, newExpiresAt, userId]
          );

          integrations.github_token = refreshed.access_token;
          integrations.github_refresh_token = refreshed.refresh_token;
          integrations.github_token_expires_at = newExpiresAt;
        } catch (error) {
          console.error('Failed to refresh GitHub OAuth token:', error);
          // Token refresh failed — still return current state, user may need to re-auth
        }
      }
    }

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
        authMethod: integrations.railway_auth_method || null,
        oauthAvailable: !!process.env.RAILWAY_CLIENT_ID,
      },
      github: {
        connected: !!integrations.github_token,
        username: integrations.github_username || null,
        connectedAt: integrations.github_connected_at || null,
        authMethod: integrations.github_auth_method || null,
        oauthAvailable: !!process.env.GITHUB_CLIENT_ID,
      },
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}
