import Anthropic from '@anthropic-ai/sdk';
import Bottleneck from 'bottleneck';
import { createLogger } from '@swarmit/logger';
import type { LLMClient } from './index.js';
import type { LLMResponse, LLMMessage, LLMTool, LLMContentBlock } from '@swarmit/shared';

const logger = createLogger('anthropic');

const OAT_PREFIX = 'sk-ant-oat';

export function isOATToken(key: string): boolean {
  return key.startsWith(OAT_PREFIX);
}

const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200,
});

export class AnthropicClient implements LLMClient {
  private apiKey: string;
  private isOAuth: boolean;

  constructor(apiKey: string, isOAuth?: boolean) {
    this.apiKey = apiKey;
    this.isOAuth = isOAuth ?? false;
  }

  async chat(params: {
    model: string;
    systemPrompt: string;
    messages: LLMMessage[];
    tools?: LLMTool[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<LLMResponse> {
    const isOAT = isOATToken(this.apiKey) || this.isOAuth;

    // Build Anthropic client with appropriate auth
    const clientOptions: Record<string, unknown> = {};

    if (isOAT) {
      clientOptions.apiKey = 'dummy'; // SDK requires apiKey but we override headers
      clientOptions.defaultHeaders = {
        'Authorization': `Bearer ${this.apiKey}`,
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
        'user-agent': 'claude-cli/2.1.2 (external, cli)',
        'x-app': 'cli',
        'anthropic-dangerous-direct-browser-access': 'true',
      };
    } else {
      clientOptions.apiKey = this.apiKey;
    }

    const client = new Anthropic(clientOptions as ConstructorParameters<typeof Anthropic>[0]);

    // Prepend Claude Code identity for OAT
    const systemPrompt = isOAT
      ? `You are Claude Code, Anthropic's official CLI for Claude.\n${params.systemPrompt}`
      : params.systemPrompt;

    // Select tool naming convention
    const tools = params.tools
      ? (isOAT ? toPascalCaseTools(params.tools) : params.tools)
      : undefined;

    const response = await limiter.schedule(() =>
      client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens || 8192,
        temperature: params.temperature,
        system: systemPrompt,
        messages: params.messages as Anthropic.MessageParam[],
        tools: tools as Anthropic.Tool[] | undefined,
      })
    );

    logger.info({
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
    }, 'Anthropic API response');

    return {
      id: response.id,
      content: response.content as LLMContentBlock[],
      stop_reason: response.stop_reason as LLMResponse['stop_reason'],
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }
}

function toPascalCaseTools(tools: LLMTool[]): LLMTool[] {
  return tools.map(tool => ({
    ...tool,
    name: tool.name.charAt(0).toUpperCase() + tool.name.slice(1),
  }));
}
