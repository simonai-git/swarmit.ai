import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { pool } from '@/lib/db';

// Mask API key for display
function maskApiKey(key: string): string {
  if (!key || key.length < 12) return '***';
  return key.slice(0, 10) + '...' + key.slice(-4);
}

// Simple encryption for storing API key (in production, use proper encryption)
function encryptKey(key: string): string {
  // Base64 encode for now - in production use proper encryption
  return Buffer.from(key).toString('base64');
}

function decryptKey(encrypted: string): string {
  return Buffer.from(encrypted, 'base64').toString('utf-8');
}

// GET - fetch Claude connection status
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT claude_api_key, claude_connected_at FROM user_profiles WHERE email = $1',
        [session.user.email]
      );

      if (result.rows.length === 0 || !result.rows[0].claude_api_key) {
        return NextResponse.json({ connected: false });
      }

      const decryptedKey = decryptKey(result.rows[0].claude_api_key);
      
      return NextResponse.json({
        connected: true,
        maskedKey: maskApiKey(decryptedKey),
        connectedAt: result.rows[0].claude_connected_at,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to fetch Claude connection:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - save Claude API key
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { apiKey } = await req.json();
    
    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    // Validate key format - only accept regular API keys (sk-ant-api*)
    // OAT tokens (sk-ant-oat*) from claude setup-token are scoped specifically to Claude Code CLI
    if (apiKey.startsWith('sk-ant-oat')) {
      return NextResponse.json({ 
        error: 'OAuth tokens from Claude Code are scoped specifically to that application and cannot be used by SwarmIt.AI. Please use a regular Claude API key from console.anthropic.com' 
      }, { status: 400 });
    }
    
    if (!apiKey.startsWith('sk-ant-api')) {
      return NextResponse.json({ error: 'Invalid Claude API key format. Must start with sk-ant-api' }, { status: 400 });
    }
    
    // Test the API key by making a simple request
    try {
      const testRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (!testRes.ok) {
        const error = await testRes.json().catch(() => ({}));
        if (testRes.status === 401) {
          return NextResponse.json({ error: 'Invalid API key' }, { status: 400 });
        }
        // Rate limit or other errors might be ok - key is valid
        if (testRes.status !== 429) {
          return NextResponse.json({ error: error.error?.message || 'Failed to validate API key' }, { status: 400 });
        }
      }
    } catch (e) {
      console.error('API key validation failed:', e);
      return NextResponse.json({ error: 'Failed to validate API key' }, { status: 400 });
    }

    const encryptedKey = encryptKey(apiKey);
    const now = new Date().toISOString();

    const client = await pool.connect();
    try {
      // Upsert user profile with Claude API key
      await client.query(`
        INSERT INTO user_profiles (email, claude_api_key, claude_connected_at, updated_at)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (email) DO UPDATE SET
          claude_api_key = EXCLUDED.claude_api_key,
          claude_connected_at = EXCLUDED.claude_connected_at,
          updated_at = EXCLUDED.updated_at
      `, [session.user.email, encryptedKey, now]);

      return NextResponse.json({
        success: true,
        maskedKey: maskApiKey(apiKey),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to save Claude API key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - disconnect Claude
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await pool.connect();
    try {
      await client.query(`
        UPDATE user_profiles 
        SET claude_api_key = NULL, claude_connected_at = NULL, updated_at = NOW()
        WHERE email = $1
      `, [session.user.email]);

      return NextResponse.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to disconnect Claude:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
