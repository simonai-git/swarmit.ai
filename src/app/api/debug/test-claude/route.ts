import { NextRequest, NextResponse } from 'next/server';
import { streamSimpleAnthropic } from '@mariozechner/pi-ai';
import type { Model, Message, UserMessage } from '@mariozechner/pi-ai';
import { getUserClaudeKey } from '@/lib/claude';

// GET /api/debug/test-claude - Test Claude API with user's stored OAT token
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.SIMON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = request.nextUrl.searchParams.get('email') || 'bogdan@alexandrescu.io';
  
  const steps: Array<{ step: string; result: unknown; error?: string }> = [];

  try {
    // Step 1: Get the user's Claude key
    steps.push({ step: 'Fetching user Claude key', result: 'starting...' });
    const userKey = await getUserClaudeKey(email);
    
    if (!userKey) {
      steps[steps.length - 1] = { 
        step: 'Fetching user Claude key', 
        result: 'No key found',
        error: `No Claude API key found for ${email}`
      };
      return NextResponse.json({ success: false, steps });
    }
    
    steps[steps.length - 1] = { 
      step: 'Fetching user Claude key', 
      result: {
        length: userKey.length,
        prefix: userKey.slice(0, 20),
        isOAT: userKey.includes('sk-ant-oat'),
      }
    };

    // Step 2: Create model
    const model: Model<'anthropic-messages'> = {
      id: 'claude-sonnet-4-20250514',
      name: 'claude-sonnet-4-20250514',
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      reasoning: true,
      input: ['text', 'image'],
      cost: {
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
      },
      contextWindow: 200000,
      maxTokens: 64000,
    };
    steps.push({ step: 'Created model', result: model.id });

    // Step 3: Create context
    interface StreamContext {
      systemPrompt: string;
      messages: Message[];
      tools: unknown[];
    }
    
    const context: StreamContext = {
      systemPrompt: 'You are a helpful assistant. Respond with exactly one word.',
      messages: [
        {
          role: 'user',
          content: 'Say "SUCCESS" if you can read this.',
          timestamp: Date.now(),
        } as UserMessage,
      ],
      tools: [],
    };
    steps.push({ step: 'Created context', result: 'ready' });

    // Step 4: Call streamSimpleAnthropic
    steps.push({ step: 'Calling Claude API', result: 'starting...' });
    
    const stream = streamSimpleAnthropic(model, context, {
      apiKey: userKey,
      maxTokens: 50,
    });

    let responseText = '';
    let usage = { input: 0, output: 0 };
    let stopReason = '';

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        responseText += event.delta;
      } else if (event.type === 'done') {
        stopReason = event.reason;
        usage = {
          input: event.message.usage?.input || 0,
          output: event.message.usage?.output || 0,
        };
      } else if (event.type === 'error') {
        throw new Error(event.error.errorMessage || 'Stream error');
      }
    }

    steps[steps.length - 1] = { 
      step: 'Calling Claude API', 
      result: {
        responseText: responseText.slice(0, 100),
        stopReason,
        usage,
      }
    };

    return NextResponse.json({
      success: true,
      response: responseText,
      usage,
      stopReason,
      steps,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    steps.push({ 
      step: 'Error', 
      result: 'failed',
      error: errorMessage,
    });
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      steps,
    });
  }
}
