import { flags } from '@swarmit/shared/config';
import { AnthropicClient } from './anthropic.js';
import { MockLLMClient } from './mock.js';
import type { LLMResponse, LLMMessage, LLMTool } from '@swarmit/shared';

export interface LLMClient {
  chat(params: {
    model: string;
    systemPrompt: string;
    messages: LLMMessage[];
    tools?: LLMTool[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<LLMResponse>;
}

export function createLLMClient(apiKey: string): LLMClient {
  if (flags.LLM_PROVIDER === 'mock') {
    return new MockLLMClient();
  }
  return new AnthropicClient(apiKey);
}
