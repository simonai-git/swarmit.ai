/**
 * Sandbox Test Endpoint
 * POST /api/sandbox/test
 * 
 * Tests the sandbox execution environment
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import TaskSandbox from '@/lib/sandbox';

const API_KEY = process.env.API_KEY || '';

async function verifyAuth(): Promise<boolean> {
  const headersList = await headers();
  const apiKey = headersList.get('x-api-key');
  return apiKey === API_KEY;
}

export async function POST(request: Request) {
  if (!await verifyAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sandbox: TaskSandbox | null = null;
  
  try {
    const body = await request.json();
    const { command, taskId = 'test-' + Date.now() } = body;

    if (!command) {
      return NextResponse.json(
        { error: 'command is required' },
        { status: 400 }
      );
    }

    // Create sandbox
    sandbox = await TaskSandbox.create({
      taskId,
      timeoutMs: 30000, // 30 second timeout for tests
    });

    console.log(`[Sandbox] Created for task ${taskId}, workdir: ${sandbox.getWorkdir()}`);

    // Execute command
    const result = await sandbox.exec(command);

    return NextResponse.json({
      success: true,
      workdir: sandbox.getWorkdir(),
      sandboxType: process.env.SANDBOX_MODE || 'auto',
      result
    });

  } catch (error) {
    console.error('[Sandbox] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sandbox execution failed' },
      { status: 500 }
    );
  } finally {
    // Always cleanup
    if (sandbox) {
      await sandbox.cleanup();
    }
  }
}

/**
 * GET /api/sandbox/test
 * Returns sandbox configuration info
 */
export async function GET() {
  const headersList = await headers();
  const apiKey = headersList.get('x-api-key');
  
  if (apiKey !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    sandboxMode: process.env.SANDBOX_MODE || 'auto',
    nodeEnv: process.env.NODE_ENV,
    available: {
      docker: process.env.SANDBOX_MODE === 'docker',
      subprocess: true
    }
  });
}
