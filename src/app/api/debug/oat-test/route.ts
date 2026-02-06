import { NextRequest, NextResponse } from 'next/server';
import { streamSimpleAnthropic } from '@mariozechner/pi-ai';
import { getUserClaudeKey } from '@/lib/claude';

// Minimal test - just check if we can make a Claude API call with the OAT token
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.SIMON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = request.nextUrl.searchParams.get('email') || 'bogdan@alexandrescu.io';
  
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    email,
    steps: [],
  };

  try {
    // Step 1: Get user key
    const userKey = await getUserClaudeKey(email);
    (result.steps as string[]).push(`Got key: ${userKey ? userKey.slice(0, 20) + '...' : 'null'}`);
    
    if (!userKey) {
      result.error = 'No key found';
      return NextResponse.json(result);
    }

    // Step 2: Check if OAT
    const isOAT = userKey.includes('sk-ant-oat');
    (result.steps as string[]).push(`Is OAT: ${isOAT}`);
    result.isOAT = isOAT;
    result.keyPrefix = userKey.slice(0, 20);

    // Step 3: Simple model (use any to avoid type issues)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model: any = {
      id: 'claude-sonnet-4-20250514',
      name: 'claude-sonnet-4-20250514',
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      reasoning: true,
      input: ['text', 'image'],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200000,
      maxTokens: 64000,
    };
    (result.steps as string[]).push('Created model');

    // Step 4: Call API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context: any = {
      systemPrompt: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'Say "OK"', timestamp: Date.now() }],
      tools: [],
    };
    (result.steps as string[]).push('Calling API...');

    const stream = streamSimpleAnthropic(model, context, {
      apiKey: userKey,
      maxTokens: 10,
    });

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text_delta') {
        text += event.delta;
      } else if (event.type === 'done') {
        result.usage = event.message.usage;
      }
    }

    (result.steps as string[]).push(`Got response: "${text}"`);
    result.response = text;
    result.success = true;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    (result.steps as string[]).push(`ERROR: ${msg}`);
    result.error = msg;
    result.success = false;
  }

  return NextResponse.json(result);
}
