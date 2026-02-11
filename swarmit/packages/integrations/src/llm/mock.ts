import type { LLMClient } from './index.js';
import type { LLMResponse, LLMMessage, LLMTool } from '@swarmit/shared';

export class MockLLMClient implements LLMClient {
  async chat(params: {
    model: string;
    systemPrompt: string;
    messages: LLMMessage[];
    tools?: LLMTool[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<LLMResponse> {
    const lastMessage = params.messages[params.messages.length - 1];
    const content = typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : 'No message content';

    return {
      id: `mock-${Date.now()}`,
      content: [
        {
          type: 'text',
          text: `[Mock LLM Response] Processed: "${content.slice(0, 100)}"`,
        },
      ],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
      model: params.model,
    };
  }
}
