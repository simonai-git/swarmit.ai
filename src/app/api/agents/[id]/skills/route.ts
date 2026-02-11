import { NextRequest, NextResponse } from 'next/server';
import { getAgentSkills, setAgentSkills } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET /api/agents/[id]/skills - Get skills assigned to an agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const skills = await getAgentSkills(id);
    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Error fetching agent skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/agents/[id]/skills - Set skills for an agent
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();

    if (!Array.isArray(body.skill_ids)) {
      return NextResponse.json({ error: 'skill_ids array is required' }, { status: 400 });
    }

    await setAgentSkills(id, body.skill_ids, userId);
    const skills = await getAgentSkills(id);
    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Error setting agent skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
