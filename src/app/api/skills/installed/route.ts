import { NextRequest, NextResponse } from 'next/server';
import { getInstalledSkills, installSkill, uninstallSkill } from '@/lib/db';
import { getServerSession } from 'next-auth';

// GET /api/skills/installed - List user's installed skills
export async function GET() {
  try {
    const session = await getServerSession();
    const userEmail = session?.user?.email || 'default';
    const skills = await getInstalledSkills(userEmail);
    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Error fetching installed skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/skills/installed - Install a skill
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    const userEmail = session?.user?.email || 'default';
    const body = await request.json();

    if (!body.skill_id || !body.skill_name) {
      return NextResponse.json({ error: 'skill_id and skill_name are required' }, { status: 400 });
    }

    const skill = await installSkill({
      skill_id: body.skill_id,
      skill_name: body.skill_name,
      skill_description: body.skill_description || null,
      skill_content: body.skill_content || null,
      source_url: body.source_url || null,
      category: body.category || null,
      author: body.author || null,
      user_email: userEmail,
    });

    return NextResponse.json(skill, { status: 201 });
  } catch (error: unknown) {
    console.error('Error installing skill:', error);
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Skill already installed' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/skills/installed?skill_id=xxx - Uninstall a skill
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    const userEmail = session?.user?.email || 'default';
    const skillId = request.nextUrl.searchParams.get('skill_id');

    if (!skillId) {
      return NextResponse.json({ error: 'skill_id is required' }, { status: 400 });
    }

    const deleted = await uninstallSkill(skillId, userEmail);
    if (!deleted) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error uninstalling skill:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
