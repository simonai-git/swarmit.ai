import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserClaudeKey } from '@/lib/claude';

// GET /api/debug/claude-key - Debug Claude key lookup
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.SIMON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check raw database
    const client = await pool.connect();
    try {
      // Get all user profiles with claude keys
      const allProfiles = await client.query(
        'SELECT email, claude_api_key IS NOT NULL as has_key, LENGTH(claude_api_key) as key_length, claude_connected_at FROM user_profiles'
      );
      
      // Get specific user
      const email = request.nextUrl.searchParams.get('email') || 'bogdan@alexandrescu.io';
      const userResult = await client.query(
        'SELECT email, claude_api_key, claude_connected_at FROM user_profiles WHERE email = $1',
        [email]
      );

      let decodedKey = null;
      let decodedKeyInfo = null;
      
      if (userResult.rows.length > 0 && userResult.rows[0].claude_api_key) {
        const storedKey = userResult.rows[0].claude_api_key;
        try {
          decodedKey = Buffer.from(storedKey, 'base64').toString('utf-8');
          decodedKeyInfo = {
            length: decodedKey.length,
            prefix: decodedKey.slice(0, 15),
            suffix: decodedKey.slice(-4),
          };
        } catch (e) {
          decodedKeyInfo = { error: 'Failed to decode: ' + String(e) };
        }
      }

      // Also test the getUserClaudeKey function
      let functionResult = null;
      try {
        functionResult = await getUserClaudeKey(email);
        if (functionResult) {
          functionResult = {
            success: true,
            length: functionResult.length,
            prefix: functionResult.slice(0, 15),
          };
        } else {
          functionResult = { success: false, result: null };
        }
      } catch (e) {
        functionResult = { success: false, error: String(e) };
      }

      return NextResponse.json({
        allProfiles: allProfiles.rows,
        targetEmail: email,
        userProfile: userResult.rows[0] ? {
          email: userResult.rows[0].email,
          hasKey: !!userResult.rows[0].claude_api_key,
          storedKeyLength: userResult.rows[0].claude_api_key?.length,
          connectedAt: userResult.rows[0].claude_connected_at,
        } : null,
        decodedKeyInfo,
        getUserClaudeKeyResult: functionResult,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
