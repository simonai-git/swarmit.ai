import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';

// POST /api/profile/integrations/railway/project - Select default project
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    await pool.query(
      `UPDATE user_integrations 
       SET railway_selected_project = $2
       WHERE user_email = $1`,
      [session.user.email, projectId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error selecting project:', error);
    return NextResponse.json({ error: 'Failed to select project' }, { status: 500 });
  }
}
