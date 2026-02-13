import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

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

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

import Anthropic from '@anthropic-ai/sdk';
import { createLLMClient } from '../llm/index.js';
import { MockLLMClient } from '../llm/mock.js';
import { isOATToken, AnthropicClient } from '../llm/anthropic.js';

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

  it('is case-sensitive', () => {
    expect(isOATToken('SK-ANT-OAT-abc123')).toBe(false);
    expect(isOATToken('Sk-Ant-Oat-abc123')).toBe(false);
  });
});

describe('AnthropicClient', () => {
  const mockResponse = {
    id: 'msg_123',
    content: [{ type: 'text', text: 'Hello from Claude' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 50, output_tokens: 25 },
    model: 'claude-sonnet-4-20250514',
  };

  beforeEach(() => {
    mockCreate.mockReset();
    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCreate.mockResolvedValue(mockResponse);
  });

  describe('with standard API key', () => {
    const standardKey = 'sk-ant-api03-abc123';
    let client: AnthropicClient;

    beforeEach(() => {
      client = new AnthropicClient(standardKey);
    });

    it('creates Anthropic client with the API key directly', async () => {
      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(Anthropic).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: standardKey })
      );
      // Should NOT have defaultHeaders for standard keys
      const constructorCall = (Anthropic as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(constructorCall.defaultHeaders).toBeUndefined();
    });

    it('passes system prompt without prefix', async () => {
      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'You are a test bot.',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a test bot.',
        })
      );
    });

    it('passes tools without name transformation', async () => {
      const tools = [
        { name: 'readFile', description: 'Read a file', input_schema: { type: 'object' } },
        { name: 'writeFile', description: 'Write a file', input_schema: { type: 'object' } },
      ];

      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Do something' }],
        tools,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            expect.objectContaining({ name: 'readFile' }),
            expect.objectContaining({ name: 'writeFile' }),
          ],
        })
      );
    });

    it('returns a properly mapped response', async () => {
      const response = await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response).toEqual({
        id: 'msg_123',
        content: [{ type: 'text', text: 'Hello from Claude' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 25 },
        model: 'claude-sonnet-4-20250514',
      });
    });

    it('passes model and messages correctly', async () => {
      const messages = [
        { role: 'user' as const, content: 'First' },
        { role: 'assistant' as const, content: 'Response' },
        { role: 'user' as const, content: 'Second' },
      ];

      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          messages,
        })
      );
    });
  });

  describe('with OAT token', () => {
    const oatKey = 'sk-ant-oat-mytoken123';
    let client: AnthropicClient;

    beforeEach(() => {
      client = new AnthropicClient(oatKey);
    });

    it('creates Anthropic client with dummy apiKey and custom headers', async () => {
      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const constructorCall = (Anthropic as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(constructorCall.apiKey).toBe('dummy');
      expect(constructorCall.defaultHeaders).toEqual({
        'Authorization': `Bearer ${oatKey}`,
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
        'user-agent': 'claude-cli/2.1.2 (external, cli)',
        'x-app': 'cli',
        'anthropic-dangerous-direct-browser-access': 'true',
      });
    });

    it('prefixes system prompt with Claude Code identity', async () => {
      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'You are a test assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: "You are Claude Code, Anthropic's official CLI for Claude.\nYou are a test assistant.",
        })
      );
    });

    it('converts tool names to PascalCase', async () => {
      const tools = [
        { name: 'readFile', description: 'Read a file', input_schema: { type: 'object' } },
        { name: 'writeFile', description: 'Write a file', input_schema: { type: 'object' } },
        { name: 'execute', description: 'Execute command', input_schema: { type: 'object' } },
      ];

      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Do something' }],
        tools,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            expect.objectContaining({ name: 'ReadFile' }),
            expect.objectContaining({ name: 'WriteFile' }),
            expect.objectContaining({ name: 'Execute' }),
          ],
        })
      );
    });

    it('preserves tool description and input_schema when converting names', async () => {
      const tools = [
        {
          name: 'searchCode',
          description: 'Search code in the repo',
          input_schema: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ];

      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Search' }],
        tools,
      });

      const calledTools = mockCreate.mock.calls[0][0].tools;
      expect(calledTools[0].name).toBe('SearchCode');
      expect(calledTools[0].description).toBe('Search code in the repo');
      expect(calledTools[0].input_schema).toEqual({
        type: 'object',
        properties: { query: { type: 'string' } },
      });
    });
  });

  describe('default parameters', () => {
    it('uses 8192 as default maxTokens when not provided', async () => {
      const client = new AnthropicClient('sk-ant-api03-test');

      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 8192 })
      );
    });

    it('uses provided maxTokens when specified', async () => {
      const client = new AnthropicClient('sk-ant-api03-test');

      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 4096,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 4096 })
      );
    });

    it('passes temperature when provided', async () => {
      const client = new AnthropicClient('sk-ant-api03-test');

      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.7 })
      );
    });

    it('does not send tools when not provided', async () => {
      const client = new AnthropicClient('sk-ant-api03-test');

      await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ tools: undefined })
      );
    });
  });

  describe('response mapping', () => {
    it('maps tool_use stop reason', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_456',
        content: [
          { type: 'text', text: 'I will read the file.' },
          { type: 'tool_use', id: 'toolu_01', name: 'readFile', input: { path: '/test.ts' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 75 },
        model: 'claude-sonnet-4-20250514',
      });

      const client = new AnthropicClient('sk-ant-api03-test');
      const response = await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Read test.ts' }],
      });

      expect(response.stop_reason).toBe('tool_use');
      expect(response.content).toHaveLength(2);
      expect(response.content[0].type).toBe('text');
      expect(response.content[1].type).toBe('tool_use');
    });

    it('maps max_tokens stop reason', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_789',
        content: [{ type: 'text', text: 'Truncated response...' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 200, output_tokens: 8192 },
        model: 'claude-sonnet-4-20250514',
      });

      const client = new AnthropicClient('sk-ant-api03-test');
      const response = await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Write a very long essay' }],
      });

      expect(response.stop_reason).toBe('max_tokens');
      expect(response.usage.output_tokens).toBe(8192);
    });

    it('correctly maps usage tokens', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_usage',
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1234, output_tokens: 5678 },
        model: 'claude-sonnet-4-20250514',
      });

      const client = new AnthropicClient('sk-ant-api03-test');
      const response = await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.usage).toEqual({
        input_tokens: 1234,
        output_tokens: 5678,
      });
    });

    it('returns the model from the response, not the request', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_model',
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514-v2', // API might return a different model version
      });

      const client = new AnthropicClient('sk-ant-api03-test');
      const response = await client.chat({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.model).toBe('claude-sonnet-4-20250514-v2');
    });
  });

  describe('error handling', () => {
    it('propagates API errors', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const client = new AnthropicClient('sk-ant-api03-test');

      await expect(
        client.chat({
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'System',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow('API rate limit exceeded');
    });
  });
});
