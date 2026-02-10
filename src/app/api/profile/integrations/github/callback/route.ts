import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { setUserGitHubIntegration } from '@/lib/db';

// GET /api/profile/integrations/github/callback - Handle GitHub OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const redirectBase = `${baseUrl}/profile/integrations`;

  try {
    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent('Not authenticated')}`);
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors from GitHub
    if (error) {
      const errorDescription = searchParams.get('error_description') || error;
      return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent(errorDescription)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent('Missing code or state parameter')}`);
    }

    // Verify CSRF state
    const cookieStore = await cookies();
    const storedState = cookieStore.get('github_oauth_state')?.value;
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent('Invalid state parameter')}`);
    }

    // Clear OAuth cookie
    cookieStore.delete('github_oauth_state');

    // Exchange authorization code for access token
    const clientId = process.env.GITHUB_CLIENT_ID!;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET!;
    const redirectUri = `${baseUrl}/api/profile/integrations/github/callback`;

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('GitHub token exchange failed:', await tokenResponse.text());
      return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent('Failed to exchange authorization code')}`);
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('GitHub token exchange error:', tokenData.error_description || tokenData.error);
      return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent('No access token received')}`);
    }

    // Fetch user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!userResponse.ok) {
      return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent('Failed to fetch GitHub user info')}`);
    }

    const userData = await userResponse.json();
    const username = userData.login || '';

    // Calculate expiry if provided (GitHub Apps with token expiration)
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    // Store in DB
    await setUserGitHubIntegration(
      userId,
      access_token,
      username,
      'oauth',
      refresh_token || null,
      expiresAt
    );

    return NextResponse.redirect(`${redirectBase}?github=connected`);
  } catch (error) {
    console.error('Error in GitHub OAuth callback:', error);
    return NextResponse.redirect(`${redirectBase}?github=error&message=${encodeURIComponent('OAuth callback failed')}`);
  }
}
