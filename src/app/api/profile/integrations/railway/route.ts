import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';

// Fetch projects from Railway API
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

    // Validate token by fetching projects
    let projects;
    try {
      projects = await fetchRailwayProjects(token);
    } catch (error) {
      return NextResponse.json({ 
        error: 'Invalid Railway token or API error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, { status: 400 });
    }

    // Store the token and projects
    await pool.query(
      `INSERT INTO user_integrations (user_email, railway_token, railway_projects, railway_connected_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_email) DO UPDATE SET
         railway_token = $2, railway_projects = $3, railway_connected_at = NOW()`,
      [session.user.email, token, JSON.stringify(projects)]
    );

    return NextResponse.json({ 
      success: true,
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
