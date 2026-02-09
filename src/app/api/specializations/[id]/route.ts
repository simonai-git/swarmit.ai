import { NextRequest, NextResponse } from 'next/server';
import { getSpecialization, updateSpecialization, deleteSpecialization, getSpecializationAgentCount } from '@/lib/db';
import { getServerSession } from 'next-auth';

// GET /api/specializations/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const spec = await getSpecialization(id);
    if (!spec) {
      return NextResponse.json({ error: 'Specialization not found' }, { status: 404 });
    }
    return NextResponse.json(spec);
  } catch (error) {
    console.error('Error fetching specialization:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/specializations/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const spec = await updateSpecialization(id, body);
    if (!spec) {
      return NextResponse.json({ error: 'Specialization not found' }, { status: 404 });
    }
    return NextResponse.json(spec);
  } catch (error: unknown) {
    console.error('Error updating specialization:', error);
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A specialization with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/specializations/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession();
    const userEmail = session?.user?.email || 'default';

    const spec = await getSpecialization(id);
    if (!spec) {
      return NextResponse.json({ error: 'Specialization not found' }, { status: 404 });
    }

    // Check if agents reference this specialization
    const count = await getSpecializationAgentCount(spec.name, userEmail);
    if (count > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${count} agent(s) use this specialization` },
        { status: 409 }
      );
    }

    const deleted = await deleteSpecialization(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Specialization not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting specialization:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
