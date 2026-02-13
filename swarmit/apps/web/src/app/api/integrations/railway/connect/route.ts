import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import crypto from 'crypto';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.RAILWAY_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Railway OAuth not configured' }, { status: 500 });
  }

  const state = crypto.randomBytes(32).toString('hex');
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/integrations/railway/callback`;

  const authorizeUrl = new URL('https://railway.com/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', '*');
  authorizeUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set('railway_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}
