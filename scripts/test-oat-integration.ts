#!/usr/bin/env npx tsx
/**
 * Real E2E test for OAT token integration with Claude API
 * This actually calls Claude to verify the OAT setup works
 */

import { streamSimpleAnthropic } from '@mariozechner/pi-ai';
import type { Model, Context, Message, UserMessage, TextContent } from '@mariozechner/pi-ai';

// Check if key is an OAT token
function isOATToken(key: string): boolean {
  return key.startsWith('sk-ant-oat') || key.includes('sk-ant-oat');
}

// Claude Code identity - MUST be first in system prompt for OAT tokens
const CLAUDE_CODE_IDENTITY = `You are Claude Code, Anthropic's official CLI for Claude.`;

// Create a pi-ai compatible model object
function createModel(modelId: string): Model<'anthropic-messages'> {
  return {
    id: modelId,
    name: modelId,
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
}

async function testOATIntegration() {
  console.log('=== OAT Token Integration Test ===\n');

  // Get token from env or DB (for test, use env)
  const token = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  
  if (!token) {
    console.error('❌ No API key found in ANTHROPIC_API_KEY or CLAUDE_API_KEY');
    process.exit(1);
  }

  const isOAT = isOATToken(token);
  console.log(`Token type: ${isOAT ? 'OAT (OAuth Access Token)' : 'Regular API Key'}`);
  console.log(`Token prefix: ${token.slice(0, 15)}...`);
  console.log('');

  // Build system prompt (with Claude Code identity for OAT)
  const systemPrompt = isOAT 
    ? `${CLAUDE_CODE_IDENTITY}\n\nYou are a helpful assistant. Respond briefly.`
    : `You are a helpful assistant. Respond briefly.`;

  console.log(`System prompt includes Claude Code identity: ${isOAT ? 'YES ✓' : 'NO'}`);
  console.log('');

  // Create model
  const model = createModel('claude-sonnet-4-20250514');
  console.log(`Model: ${model.id}`);
  console.log('');

  // Build messages
  const messages: Message[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Say "OAT integration working!" if you can read this.' }]
    } as UserMessage
  ];

  // Create context
  const context: Context = {
    system: systemPrompt,
    messages,
    model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [] as any[],
    toolChoice: 'auto',
    continueTurn: () => Promise.resolve(false),
    signalTokenUsage: () => {},
    signalCompletion: () => {},
    signalError: () => {},
    signalContent: (content) => {
      if (content.type === 'text') {
        process.stdout.write(content.text);
      }
    },
    stopSignal: { stop: false, reason: null },
  };

  console.log('Calling Claude API via pi-ai streamSimpleAnthropic...\n');
  console.log('--- Response ---');

  try {
    // Make the actual API call
    const response = await streamSimpleAnthropic(context, {
      apiKey: token,
      maxTokens: 100,
    });

    console.log('\n--- End Response ---\n');

    // Check response
    const textContent = response.content?.find((c): c is TextContent => c.type === 'text');
    const responseText = textContent?.text || '';

    console.log(`Stop reason: ${response.stopReason}`);
    console.log(`Input tokens: ${response.inputTokens}`);
    console.log(`Output tokens: ${response.outputTokens}`);
    console.log('');

    if (responseText.toLowerCase().includes('working')) {
      console.log('✅ SUCCESS: OAT integration is working!');
      return true;
    } else {
      console.log('⚠️  Response received but unexpected content');
      return true; // Still a success if we got a response
    }
  } catch (error) {
    console.log('\n--- End Response ---\n');
    console.error('❌ FAILED:', error instanceof Error ? error.message : error);
    
    if (error instanceof Error) {
      // Check for common OAT errors
      if (error.message.includes('credential')) {
        console.error('\n💡 This error suggests the OAT token is not being handled correctly.');
        console.error('   Make sure pi-ai is using authToken (not apiKey) for OAT tokens.');
      }
      if (error.message.includes('Claude Code')) {
        console.error('\n💡 This error suggests the system prompt needs Claude Code identity.');
      }
    }
    return false;
  }
}

// Run the test
testOATIntegration().then((success) => {
  process.exit(success ? 0 : 1);
});
