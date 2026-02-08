import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { setUserGitHubIntegration, clearUserGitHubIntegration } from '@/lib/db';
import { validateGitHubToken } from '@/lib/github';

// Refresh a GitHub OAuth access token using the refresh token
// Note: Only GitHub Apps with token expiration enabled provide refresh tokens.
// Classic OAuth apps issue non-expiring tokens without refresh support.
export async function refreshGitHubToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth not configured');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }

  return data;
}

// POST /api/profile/integrations/github - Connect GitHub
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

    // Validate token by fetching user info
    let userInfo;
    try {
      userInfo = await validateGitHubToken(token);
    } catch (error) {
      return NextResponse.json({
        error: 'Invalid GitHub token',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, { status: 400 });
    }

    // Store the token (PAT-based auth method)
    await setUserGitHubIntegration(session.user.email, token, userInfo.username, 'token');

    return NextResponse.json({
      success: true,
      username: userInfo.username,
    });
  } catch (error) {
    console.error('Error connecting GitHub:', error);
    return NextResponse.json({ error: 'Failed to connect GitHub' }, { status: 500 });
  }
}

// DELETE /api/profile/integrations/github - Disconnect GitHub
export async function DELETE() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await clearUserGitHubIntegration(session.user.email);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting GitHub:', error);
    return NextResponse.json({ error: 'Failed to disconnect GitHub' }, { status: 500 });
  }
}
