import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

// GET /api/profile/integrations/github/oauth - Initiate GitHub OAuth flow
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'GitHub OAuth is not configured on this server' },
        { status: 501 }
      );
    }

    // Generate CSRF state parameter
    const state = randomBytes(32).toString('hex');

    // Store state in cookie for verification in callback
    const cookieStore = await cookies();
    cookieStore.set('github_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    // Build the redirect URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/profile/integrations/github/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user user:email',
      state,
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating GitHub OAuth:', error);
    return NextResponse.json({ error: 'Failed to initiate OAuth' }, { status: 500 });
  }
}
