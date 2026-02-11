import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@swarmit/shared/config', () => ({
  flags: { LLM_PROVIDER: 'mock' },
}));

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createLLMClient } from '../llm/index.js';
import { MockLLMClient } from '../llm/mock.js';
import { isOATToken } from '../llm/anthropic.js';

describe('MockLLMClient', () => {
  let client: MockLLMClient;

  beforeEach(() => {
    client = new MockLLMClient();
  });

  it('returns a response with correct structure', async () => {
    const response = await client.chat({
      model: 'test-model',
      systemPrompt: 'You are a test assistant.',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(response).toHaveProperty('id');
    expect(response.id).toMatch(/^mock-/);
    expect(response).toHaveProperty('content');
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');
    expect(response.stop_reason).toBe('end_turn');
    expect(response.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
    expect(response.model).toBe('test-model');
  });

  it('includes truncated message content in the response text', async () => {
    const response = await client.chat({
      model: 'claude-test',
      systemPrompt: 'System',
      messages: [{ role: 'user', content: 'Build a web application' }],
    });

    expect(response.content[0].text).toContain('Build a web application');
    expect(response.content[0].text).toMatch(/^\[Mock LLM Response\] Processed: "/);
  });

  it('truncates long message content to 100 characters', async () => {
    const longContent = 'A'.repeat(200);
    const response = await client.chat({
      model: 'claude-test',
      systemPrompt: 'System',
      messages: [{ role: 'user', content: longContent }],
    });

    // The text should contain the truncated version (100 chars of the original)
    const truncated = longContent.slice(0, 100);
    expect(response.content[0].text).toContain(truncated);
    // The full 200-char string should NOT appear in the response
    expect(response.content[0].text).not.toContain(longContent);
  });

  it('handles non-string message content gracefully', async () => {
    const response = await client.chat({
      model: 'claude-test',
      systemPrompt: 'System',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'complex content' }],
        },
      ],
    });

    expect(response.content[0].text).toContain('No message content');
  });

  it('handles empty messages array', async () => {
    const response = await client.chat({
      model: 'claude-test',
      systemPrompt: 'System',
      messages: [],
    });

    expect(response.content[0].text).toContain('No message content');
  });

  it('uses the last message when multiple messages are provided', async () => {
    const response = await client.chat({
      model: 'claude-test',
      systemPrompt: 'System',
      messages: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Second message' },
      ],
    });

    expect(response.content[0].text).toContain('Second message');
    expect(response.content[0].text).not.toContain('First message');
  });
});

describe('createLLMClient', () => {
  it('returns MockLLMClient when LLM_PROVIDER is mock', () => {
    const client = createLLMClient('any-api-key');
    expect(client).toBeInstanceOf(MockLLMClient);
  });

  it('returns a client that can chat', async () => {
    const client = createLLMClient('test-key');
    const response = await client.chat({
      model: 'test-model',
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(response.content).toHaveLength(1);
    expect(response.stop_reason).toBe('end_turn');
  });
});

describe('isOATToken', () => {
  it('returns true for OAT tokens', () => {
    expect(isOATToken('sk-ant-oat-abc123')).toBe(true);
    expect(isOATToken('sk-ant-oat-')).toBe(true);
  });

  it('returns false for standard API keys', () => {
    expect(isOATToken('sk-ant-api03-abc123')).toBe(false);
    expect(isOATToken('sk-abc123')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isOATToken('')).toBe(false);
  });

  it('returns false for partial OAT prefix', () => {
    expect(isOATToken('sk-ant-oa')).toBe(false);
    expect(isOATToken('sk-ant')).toBe(false);
  });
});
