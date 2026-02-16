import { NextRequest, NextResponse } from 'next/server';
import { getToken, encode } from 'next-auth/jwt';

const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';

export async function POST(req: NextRequest) {
  // Authenticate via NextAuth JWT
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!jwt?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.code || !body?.codeVerifier) {
    return NextResponse.json({ error: 'Missing code or codeVerifier' }, { status: 400 });
  }

  const { code, codeVerifier } = body as { code: string; codeVerifier: string };

  try {
    // Anthropic returns code as "code#state" — split to extract both
    const splits = code.split('#');
    const authCode = splits[0];
    const state = splits[1] || undefined;

    // Exchange authorization code for access token at Anthropic
    const exchangeBody: Record<string, string> = {
      grant_type: 'authorization_code',
      code: authCode,
      client_id: ANTHROPIC_CLIENT_ID,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      code_verifier: codeVerifier,
    };
    if (state) {
      exchangeBody.state = state;
    }

    const tokenResponse = await fetch(ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exchangeBody),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error('Anthropic token exchange failed:', tokenResponse.status, text);
      return NextResponse.json(
        { error: 'Failed to exchange code with Anthropic' },
        { status: 502 },
      );
    }

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      console.error('Anthropic token error:', tokenData.error, tokenData.error_description);
      return NextResponse.json(
        { error: tokenData.error_description || 'Anthropic OAuth failed' },
        { status: 502 },
      );
    }

    const tokenPrefix = tokenData.access_token.slice(0, 12);
    console.log('Anthropic OAuth token prefix:', tokenPrefix);

    // Re-encode NextAuth JWT as Bearer token for our Fastify API
    const bearerToken = await encode({
      token: jwt,
      secret: process.env.NEXTAUTH_SECRET!,
    });

    // Store the OAT token directly (sk-ant-oat format)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const storePayload: Record<string, string> = {
      provider: 'anthropic',
      accessToken: tokenData.access_token,
    };
    if (tokenData.refresh_token) {
      storePayload.refreshToken = tokenData.refresh_token;
    }
    if (tokenData.expires_in) {
      storePayload.expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }

    const storeResponse = await fetch(`${apiUrl}/integrations/tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(storePayload),
    });

    if (!storeResponse.ok) {
      const text = await storeResponse.text();
      console.error('Failed to store Anthropic token:', storeResponse.status, text);
      return NextResponse.json({ error: 'Failed to store token' }, { status: 500 });
    }

    return NextResponse.json({ success: true, tokenPrefix });
  } catch (err) {
    console.error('Claude OAuth exchange error:', err);
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 });
  }
}
