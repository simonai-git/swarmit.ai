import { NextRequest, NextResponse } from 'next/server';
import { getSpecializations, seedDefaultSpecializations, createSpecialization } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET /api/specializations - List specializations for current user (auto-seed on first access)
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let specs = await getSpecializations(userId);

    // Auto-seed defaults on first access
    if (specs.length === 0) {
      await seedDefaultSpecializations(userId);
      specs = await getSpecializations(userId);
    }

    return NextResponse.json(specs);
  } catch (error) {
    console.error('Error fetching specializations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/specializations - Create a new specialization
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const spec = await createSpecialization({
      name: body.name,
      description: body.description || null,
      system_prompt: body.system_prompt || null,
      icon: body.icon || '🤖',
      user_id: userId,
    });

    return NextResponse.json(spec, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating specialization:', error);
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A specialization with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
