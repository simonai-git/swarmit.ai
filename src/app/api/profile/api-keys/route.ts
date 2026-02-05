import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Generate a random API key
function generateApiKey(): string {
  return 'swm_' + crypto.randomBytes(32).toString('hex');
}

// Hash an API key for storage
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// GET /api/profile/api-keys - List user's API keys
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT id, name, key_prefix as prefix, created_at, last_used_at as last_used
       FROM user_api_keys
       WHERE user_email = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [session.user.email]
    );

    return NextResponse.json({ keys: result.rows });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

// POST /api/profile/api-keys - Create a new API key
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Generate the key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 12);
    const id = uuidv4();

    // Store the hashed key
    await pool.query(
      `INSERT INTO user_api_keys (id, user_email, name, key_hash, key_prefix, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, session.user.email, name, keyHash, keyPrefix]
    );

    return NextResponse.json({
      key: apiKey, // Only returned once!
      keyInfo: {
        id,
        name,
        prefix: keyPrefix,
        createdAt: new Date().toISOString(),
        lastUsed: null,
      },
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}
