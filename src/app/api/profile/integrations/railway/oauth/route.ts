import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { randomBytes, createHash } from 'crypto';
import { cookies } from 'next/headers';

// Generate PKCE code verifier and challenge
function generatePKCE() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// GET /api/profile/integrations/railway/oauth - Initiate Railway OAuth flow
export async function GET() {
  try {
    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
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

    // Generate PKCE challenge
    const pkce = generatePKCE();

    // Store state and PKCE verifier in cookies for verification in callback
    const cookieStore = await cookies();
    cookieStore.set('railway_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });
    cookieStore.set('railway_oauth_verifier', pkce.verifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
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
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `https://backboard.railway.com/oauth/auth?${params.toString()}`;

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Railway OAuth:', error);
    return NextResponse.json({ error: 'Failed to initiate OAuth' }, { status: 500 });
  }
}
