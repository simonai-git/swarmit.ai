import { NextRequest, NextResponse } from 'next/server';
import { getAutomationSettings, setAutomationSettings } from '@/lib/task-lifecycle';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// GET /api/settings/automation - Get current automation settings
export async function GET(request: NextRequest) {
  // Verify API key
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = getAutomationSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error getting automation settings:', error);
    return NextResponse.json(
      { error: 'Failed to get automation settings' },
      { status: 500 }
    );
  }
}

// POST /api/settings/automation - Update automation settings
export async function POST(request: NextRequest) {
  // Verify API key
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    // Validate settings
    const validKeys = [
      'enabled',
      'autoAssign',
      'autoSpawnOnCreate',
      'autoSpawnOnTesting',
      'autoSpawnOnReview',
      'autoConvertFeedback',
    ];
    
    const updates: Record<string, boolean> = {};
    for (const key of validKeys) {
      if (typeof body[key] === 'boolean') {
        updates[key] = body[key];
      }
    }
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid settings provided. Use boolean values for: ' + validKeys.join(', ') },
        { status: 400 }
      );
    }
    
    const settings = setAutomationSettings(updates);
    
    return NextResponse.json({
      success: true,
      settings,
      message: `Updated ${Object.keys(updates).length} setting(s)`,
    });
  } catch (error) {
    console.error('Error updating automation settings:', error);
    return NextResponse.json(
      { error: 'Failed to update automation settings' },
      { status: 500 }
    );
  }
}
