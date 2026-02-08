import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

// Fetch projects from Railway API (same as in ../route.ts)
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

// GET /api/profile/integrations/railway/callback - Handle Railway OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const redirectBase = `${baseUrl}/profile/integrations`;

  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.redirect(`${redirectBase}?railway=error&message=${encodeURIComponent('Not authenticated')}`);
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors from Railway
    if (error) {
      const errorDescription = searchParams.get('error_description') || error;
      return NextResponse.redirect(`${redirectBase}?railway=error&message=${encodeURIComponent(errorDescription)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${redirectBase}?railway=error&message=${encodeURIComponent('Missing code or state parameter')}`);
    }

    // Verify CSRF state
    const cookieStore = await cookies();
    const storedState = cookieStore.get('railway_oauth_state')?.value;
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(`${redirectBase}?railway=error&message=${encodeURIComponent('Invalid state parameter')}`);
    }

    // Get PKCE verifier from cookie
    const codeVerifier = cookieStore.get('railway_oauth_verifier')?.value;

    // Clear OAuth cookies
    cookieStore.delete('railway_oauth_state');
    cookieStore.delete('railway_oauth_verifier');

    // Exchange authorization code for tokens
    const clientId = process.env.RAILWAY_CLIENT_ID!;
    const clientSecret = process.env.RAILWAY_CLIENT_SECRET!;
    const redirectUri = `${baseUrl}/api/profile/integrations/railway/callback`;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenBody: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    };
    if (codeVerifier) {
      tokenBody.code_verifier = codeVerifier;
    }

    const tokenResponse = await fetch('https://backboard.railway.com/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenBody),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error('Railway token exchange failed:', text);
      return NextResponse.redirect(`${redirectBase}?railway=error&message=${encodeURIComponent('Failed to exchange authorization code')}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      return NextResponse.redirect(`${redirectBase}?railway=error&message=${encodeURIComponent('No access token received')}`);
    }

    // Fetch user info from Railway OAuth userinfo endpoint
    let account = { name: '', email: '' };
    try {
      const userInfoResponse = await fetch('https://backboard.railway.com/oauth/me', {
        headers: { 'Authorization': `Bearer ${access_token}` },
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        account = {
          name: userInfo.name || userInfo.preferred_username || '',
          email: userInfo.email || '',
        };
      }
    } catch {
      // Fall back to GraphQL me query
      try {
        const meResponse = await fetch('https://backboard.railway.app/graphql/v2', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: `query { me { name email } }` }),
        });
        if (meResponse.ok) {
          const meData = await meResponse.json();
          account = {
            name: meData.data?.me?.name || '',
            email: meData.data?.me?.email || '',
          };
        }
      } catch {
        // Continue without account info
      }
    }

    // Fetch projects
    let projects: any[] = [];
    try {
      projects = await fetchRailwayProjects(access_token);
    } catch {
      // Projects fetch is non-critical
    }

    // Calculate expiry
    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000);

    // Store everything in DB
    const railwayData = { account, projects };
    await pool.query(
      `INSERT INTO user_integrations (user_email, railway_token, railway_projects, railway_connected_at, railway_refresh_token, railway_token_expires_at, railway_auth_method)
       VALUES ($1, $2, $3, NOW(), $4, $5, 'oauth')
       ON CONFLICT (user_email) DO UPDATE SET
         railway_token = $2, railway_projects = $3, railway_connected_at = NOW(),
         railway_refresh_token = $4, railway_token_expires_at = $5, railway_auth_method = 'oauth',
         updated_at = NOW()`,
      [session.user.email, access_token, JSON.stringify(railwayData), refresh_token || null, expiresAt]
    );

    return NextResponse.redirect(`${redirectBase}?railway=connected`);
  } catch (error) {
    console.error('Error in Railway OAuth callback:', error);
    return NextResponse.redirect(`${redirectBase}?railway=error&message=${encodeURIComponent('OAuth callback failed')}`);
  }
}
