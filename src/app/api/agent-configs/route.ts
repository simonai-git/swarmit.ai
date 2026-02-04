/**
 * Agent Configs API
 * GET /api/agent-configs - List all agent configs
 * POST /api/agent-configs - Create a new agent config
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgentConfigs, createAgentConfig } from '@/lib/db';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.API_KEY || process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// GET /api/agent-configs
export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const configs = await getAgentConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    console.error('Error fetching agent configs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent configs' },
      { status: 500 }
    );
  }
}

// POST /api/agent-configs
export async function POST(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    const { name, specialization, system_prompt, model, temperature, max_tokens } = body;
    
    if (!name || !specialization || !system_prompt) {
      return NextResponse.json(
        { error: 'name, specialization, and system_prompt are required' },
        { status: 400 }
      );
    }

    const config = await createAgentConfig({
      name,
      specialization,
      system_prompt,
      model: model || 'claude-sonnet-4-20250514',
      temperature: temperature ?? 0,
      max_tokens: max_tokens || 8000
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    console.error('Error creating agent config:', error);
    return NextResponse.json(
      { error: 'Failed to create agent config' },
      { status: 500 }
    );
  }
}
