import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';

// GET /api/profile - Get user profile
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query(
      'SELECT * FROM user_profiles WHERE email = $1',
      [session.user.email]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        name: session.user.name,
        email: session.user.email,
        company: '',
        location: '',
        bio: '',
      });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// POST /api/profile - Save user profile
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, company, location, bio } = body;

    // Upsert profile
    await pool.query(
      `INSERT INTO user_profiles (email, name, company, location, bio, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (email) DO UPDATE SET
         name = $2, company = $3, location = $4, bio = $5, updated_at = NOW()`,
      [session.user.email, name, company, location, bio]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving profile:', error);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
