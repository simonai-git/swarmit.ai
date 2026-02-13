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
  const storedState = req.cookies.get('railway_oauth_state')?.value;
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Invalid OAuth state')}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Missing authorization code')}`);
  }

  const clientId = process.env.RAILWAY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.RAILWAY_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Railway OAuth not configured')}`);
  }

  try {
    // Exchange code for tokens
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const redirectUri = `${baseUrl}/api/integrations/railway/callback`;

    const tokenResponse = await fetch('https://backboard.railway.com/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error('Railway token exchange failed:', tokenResponse.status, text);
      return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Failed to exchange code for token')}`);
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type: string;
    };

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

    // Calculate expiry
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : undefined;

    // Store tokens via Fastify API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const storeResponse = await fetch(`${apiUrl}/integrations/tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'railway',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
      }),
    });

    if (!storeResponse.ok) {
      const text = await storeResponse.text();
      console.error('Failed to store Railway tokens:', storeResponse.status, text);
      return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Failed to store Railway tokens')}`);
    }

    // Clear state cookie and redirect to settings
    const response = NextResponse.redirect(`${baseUrl}/settings?railway=connected`);
    response.cookies.delete('railway_oauth_state');
    return response;
  } catch (err) {
    console.error('Railway OAuth callback error:', err);
    return NextResponse.redirect(`${baseUrl}/settings?error=${encodeURIComponent('Railway OAuth failed')}`);
  }
}
