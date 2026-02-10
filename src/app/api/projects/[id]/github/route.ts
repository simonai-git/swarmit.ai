import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getUserGitHubToken } from '@/lib/db';
import { listUserRepos } from '@/lib/github';

// GET /api/projects/[id]/github - List user's GitHub repos
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const github = await getUserGitHubToken(userId);
    if (!github) {
      return NextResponse.json({ error: 'GitHub not connected' }, { status: 400 });
    }

    const repos = await listUserRepos(github.token);
    return NextResponse.json({ repos });
  } catch (error) {
    console.error('Error fetching GitHub repos:', error);
    return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 });
  }
}
