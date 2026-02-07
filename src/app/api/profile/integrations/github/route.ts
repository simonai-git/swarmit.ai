import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { setUserGitHubIntegration, clearUserGitHubIntegration } from '@/lib/db';
import { validateGitHubToken } from '@/lib/github';

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

    // Store the token
    await setUserGitHubIntegration(session.user.email, token, userInfo.username);

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
