import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';

// Step 1: Validate token with lightweight query and get account info
async function validateRailwayToken(token: string): Promise<{ name: string; email: string }> {
  const response = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: `query { me { name email } }` }),
  });

  if (!response.ok) {
    throw new Error('RAILWAY_UNREACHABLE');
  }

  const data = await response.json();
  if (data.errors) {
    const msg = data.errors[0]?.message || '';
    if (msg.includes('Not Authorized') || msg.includes('Unauthorized')) {
      throw new Error('NOT_AUTHORIZED');
    }
    throw new Error(msg || 'UNKNOWN_ERROR');
  }

  return { name: data.data?.me?.name || '', email: data.data?.me?.email || '' };
}

// Step 2: Fetch projects from Railway API
async function fetchRailwayProjects(token: string) {
  const response = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query { me { projects { edges { node { id name environments { edges { node { id name } } } } } } } }`,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch projects from Railway');
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Railway API error');
  }

  const projects = data.data?.me?.projects?.edges?.map((edge: any) => ({
    id: edge.node.id,
    name: edge.node.name,
    environments: edge.node.environments?.edges?.map((env: any) => ({
      id: env.node.id,
      name: env.node.name,
    })) || [],
  })) || [];

  return projects;
}

// POST /api/profile/integrations/railway - Connect Railway
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Step 1: Validate token and get account info
    let account: { name: string; email: string };
    try {
      account = await validateRailwayToken(token);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'NOT_AUTHORIZED') {
        return NextResponse.json({
          error: 'Token does not have account-level access',
          message: 'Please create an Account Token at railway.app/account/tokens. Project-scoped tokens cannot access account data.',
        }, { status: 400 });
      }
      if (msg === 'RAILWAY_UNREACHABLE') {
        return NextResponse.json({
          error: 'Could not reach Railway API',
          message: 'Railway may be temporarily unavailable. Please try again.',
        }, { status: 502 });
      }
      return NextResponse.json({
        error: 'Railway API error',
        message: msg || 'Unknown error',
      }, { status: 400 });
    }

    // Step 2: Fetch projects
    let projects;
    try {
      projects = await fetchRailwayProjects(token);
    } catch (error) {
      return NextResponse.json({
        error: 'Failed to fetch projects',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, { status: 400 });
    }

    // Store the token, account info, and projects
    const railwayData = { account, projects };
    await pool.query(
      `INSERT INTO user_integrations (user_email, railway_token, railway_projects, railway_connected_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_email) DO UPDATE SET
         railway_token = $2, railway_projects = $3, railway_connected_at = NOW()`,
      [session.user.email, token, JSON.stringify(railwayData)]
    );

    return NextResponse.json({
      success: true,
      account,
      projects,
    });
  } catch (error) {
    console.error('Error connecting Railway:', error);
    return NextResponse.json({ error: 'Failed to connect Railway' }, { status: 500 });
  }
}

// DELETE /api/profile/integrations/railway - Disconnect Railway
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await pool.query(
      `UPDATE user_integrations
       SET railway_token = NULL, railway_projects = NULL, railway_selected_project = NULL, railway_connected_at = NULL
       WHERE user_email = $1`,
      [session.user.email]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Railway:', error);
    return NextResponse.json({ error: 'Failed to disconnect Railway' }, { status: 500 });
  }
}
