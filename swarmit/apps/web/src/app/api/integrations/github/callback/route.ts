import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent(error)}`);
  }

  // Validate CSRF state
  const storedState = req.cookies.get('github_oauth_state')?.value;
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Invalid OAuth state')}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Missing authorization code')}`);
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('GitHub OAuth not configured')}`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error('GitHub token exchange failed:', tokenResponse.status, text);
      return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Failed to exchange code for token')}`);
    }

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub token exchange error:', tokenData.error, tokenData.error_description);
      return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent(tokenData.error_description || 'GitHub OAuth failed')}`);
    }

    // Get user's NextAuth JWT to authenticate with Fastify API
    const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!jwt) {
      return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Not authenticated')}`);
    }

    // Re-encode the JWT to pass as Bearer token to our API
    const { encode } = await import('next-auth/jwt');
    const bearerToken = await encode({
      token: jwt,
      secret: process.env.NEXTAUTH_SECRET!,
    });

    // Store token via Fastify API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const storeResponse = await fetch(`${apiUrl}/integrations/tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'github',
        accessToken: tokenData.access_token,
      }),
    });

    if (!storeResponse.ok) {
      const text = await storeResponse.text();
      console.error('Failed to store GitHub token:', storeResponse.status, text);
      return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Failed to store GitHub token')}`);
    }

    // Clear state cookie and redirect to settings
    const response = NextResponse.redirect(`${baseUrl}/settings?github=connected`);
    response.cookies.delete('github_oauth_state');
    return response;
  } catch (err) {
    console.error('GitHub OAuth callback error:', err);
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('GitHub OAuth failed')}`);
  }
}
