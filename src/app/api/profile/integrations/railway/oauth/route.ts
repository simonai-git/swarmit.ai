import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

// GET /api/profile/integrations/railway/oauth - Initiate Railway OAuth flow
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = process.env.RAILWAY_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'Railway OAuth is not configured on this server' },
        { status: 501 }
      );
    }

    // Generate CSRF state parameter
    const state = randomBytes(32).toString('hex');

    // Store state in a cookie for verification in callback
    const cookieStore = await cookies();
    cookieStore.set('railway_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    // Build the redirect URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/profile/integrations/railway/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });

    const authUrl = `https://backboard.railway.com/oauth/auth?${params.toString()}`;

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Railway OAuth:', error);
    return NextResponse.json({ error: 'Failed to initiate OAuth' }, { status: 500 });
  }
}
