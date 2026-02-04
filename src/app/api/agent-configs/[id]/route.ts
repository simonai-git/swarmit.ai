/**
 * Individual Agent Config API
 * GET /api/agent-configs/:id - Get a specific agent config
 * PATCH /api/agent-configs/:id - Update an agent config
 * DELETE /api/agent-configs/:id - Delete an agent config
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgentConfig, updateAgentConfig, deleteAgentConfig } from '@/lib/db';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.API_KEY || process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// GET /api/agent-configs/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const config = await getAgentConfig(id);
    
    if (!config) {
      return NextResponse.json({ error: 'Agent config not found' }, { status: 404 });
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching agent config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent config' },
      { status: 500 }
    );
  }
}

// PATCH /api/agent-configs/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const config = await updateAgentConfig(id, body);
    
    if (!config) {
      return NextResponse.json({ error: 'Agent config not found' }, { status: 404 });
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error updating agent config:', error);
    return NextResponse.json(
      { error: 'Failed to update agent config' },
      { status: 500 }
    );
  }
}

// DELETE /api/agent-configs/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = await deleteAgentConfig(id);
    
    if (!deleted) {
      return NextResponse.json({ error: 'Agent config not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent config:', error);
    return NextResponse.json(
      { error: 'Failed to delete agent config' },
      { status: 500 }
    );
  }
}
