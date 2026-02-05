#!/usr/bin/env node
/**
 * Direct OAT test using pi-ai
 * Run with: node scripts/test-oat-direct.mjs
 */

// Import pi-ai - this should use the same version as the deployed app
import { streamSimpleAnthropic } from '@mariozechner/pi-ai';

// OAT token from debug endpoint (we know the prefix)
const OAT_TOKEN = process.env.TEST_OAT_TOKEN;

if (!OAT_TOKEN || !OAT_TOKEN.includes('sk-ant-oat')) {
  console.error('ERROR: Set TEST_OAT_TOKEN env var to an OAT token');
  console.error('Example: TEST_OAT_TOKEN=sk-ant-oat01-... node scripts/test-oat-direct.mjs');
  process.exit(1);
}

console.log('=== Direct pi-ai OAT Test ===\n');
console.log(`Token prefix: ${OAT_TOKEN.slice(0, 20)}...`);
console.log(`Token includes "sk-ant-oat": ${OAT_TOKEN.includes('sk-ant-oat')}`);
console.log('');

// Create model (same as swarmit.ai)
const model = {
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

// Create context (same structure as swarmit.ai)
const context = {
  systemPrompt: 'You are a helpful assistant. Respond briefly.',
  messages: [
    {
      role: 'user',
      content: 'Say exactly: "OAT test successful!"',
      timestamp: Date.now(),
    },
  ],
  tools: [],
};

console.log('Calling streamSimpleAnthropic...\n');
console.log('--- Response ---');

try {
  const stream = streamSimpleAnthropic(model, context, {
    apiKey: OAT_TOKEN,
    maxTokens: 100,
  });

  for await (const event of stream) {
    if (event.type === 'text_delta') {
      process.stdout.write(event.delta);
    } else if (event.type === 'done') {
      console.log('\n--- End ---\n');
      console.log(`Stop reason: ${event.reason}`);
      console.log(`Input tokens: ${event.message.usage?.input || 0}`);
      console.log(`Output tokens: ${event.message.usage?.output || 0}`);
    } else if (event.type === 'error') {
      console.log('\n--- Error ---\n');
      console.error('Error:', event.error);
    }
  }

  console.log('\n✅ SUCCESS: OAT token works with pi-ai!');
} catch (error) {
  console.log('\n--- End ---\n');
  console.error('❌ FAILED:', error.message);
  
  if (error.message.includes('credential')) {
    console.error('\n💡 The OAT token is not being handled correctly by pi-ai');
    console.error('   Expected headers: anthropic-beta: claude-code-20250219,oauth-2025-04-20');
  }
  
  process.exit(1);
}
