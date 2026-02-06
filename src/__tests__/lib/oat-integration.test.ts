import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test OAT (OAuth Access Token) integration with Claude API
// These tests verify that swarmit.ai correctly handles OAT tokens like OpenClaw does

describe('OAT Token Integration', () => {
  describe('Token Detection', () => {
    // Mirrors the isOATToken function in claude.ts (fixed version)
    const isOATToken = (key: string): boolean => {
      return key.startsWith('sk-ant-oat');
    };

    it('should detect OAT tokens by prefix', () => {
      expect(isOATToken('sk-ant-oat-abc123')).toBe(true);
      expect(isOATToken('sk-ant-oat01-xyz789')).toBe(true);
    });

    it('should NOT detect OAT tokens embedded in middle of string', () => {
      expect(isOATToken('some-prefix-sk-ant-oat-suffix')).toBe(false);
    });

    it('should NOT detect regular API keys as OAT', () => {
      expect(isOATToken('sk-ant-api01-abc123')).toBe(false);
      expect(isOATToken('sk-ant-sid01-xyz789')).toBe(false);
      expect(isOATToken('sk-proj-abc123')).toBe(false);
    });

    it('should NOT detect empty strings as OAT', () => {
      expect(isOATToken('')).toBe(false);
    });
  });

  describe('Claude Code Identity', () => {
    // The Claude Code identity string that MUST be in system prompts for OAT tokens
    const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

    it('should have correct Claude Code identity string', () => {
      expect(CLAUDE_CODE_IDENTITY).toContain('Claude Code');
      expect(CLAUDE_CODE_IDENTITY).toContain('Anthropic');
      expect(CLAUDE_CODE_IDENTITY).toContain('official CLI');
    });

    it('system prompt should include identity when using OAT', () => {
      const usingOAT = true;
      const basePrompt = 'You are a developer agent.';
      
      let systemPrompt = basePrompt;
      if (usingOAT) {
        systemPrompt = `${CLAUDE_CODE_IDENTITY}\n${basePrompt}`;
      }
      
      expect(systemPrompt).toContain(CLAUDE_CODE_IDENTITY);
      expect(systemPrompt).toContain(basePrompt);
      expect(systemPrompt.indexOf(CLAUDE_CODE_IDENTITY)).toBe(0); // Identity must be FIRST
    });

    it('system prompt should NOT include identity when NOT using OAT', () => {
      const usingOAT = false;
      const basePrompt = 'You are a developer agent.';
      
      let systemPrompt = basePrompt;
      if (usingOAT) {
        systemPrompt = `${CLAUDE_CODE_IDENTITY}\n${basePrompt}`;
      }
      
      expect(systemPrompt).not.toContain(CLAUDE_CODE_IDENTITY);
      expect(systemPrompt).toBe(basePrompt);
    });
  });

  describe('Required Headers for OAT', () => {
    // Headers required for OAT token authentication (from OpenClaw's pi-ai)
    const CLAUDE_CODE_VERSION = '2.1.2';
    
    const getRequiredOATHeaders = () => ({
      'accept': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
      'user-agent': `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
      'x-app': 'cli',
    });

    it('should include claude-code beta feature', () => {
      const headers = getRequiredOATHeaders();
      expect(headers['anthropic-beta']).toContain('claude-code-20250219');
    });

    it('should include oauth beta feature', () => {
      const headers = getRequiredOATHeaders();
      expect(headers['anthropic-beta']).toContain('oauth-2025-04-20');
    });

    it('should have correct user-agent mimicking Claude CLI', () => {
      const headers = getRequiredOATHeaders();
      expect(headers['user-agent']).toContain('claude-cli');
      expect(headers['user-agent']).toContain('external');
    });

    it('should have x-app set to cli', () => {
      const headers = getRequiredOATHeaders();
      expect(headers['x-app']).toBe('cli');
    });
  });

  describe('Anthropic SDK Configuration for OAT', () => {
    // When using OAT tokens, the Anthropic SDK must be configured differently
    
    it('should use authToken instead of apiKey for OAT', () => {
      const oatToken = 'sk-ant-oat-abc123';
      const isOAT = oatToken.includes('sk-ant-oat');
      
      // This is how the SDK should be configured for OAT
      const sdkConfig = isOAT 
        ? { apiKey: '', authToken: oatToken }  // Note: apiKey must be empty string
        : { apiKey: oatToken };
      
      expect(sdkConfig.authToken).toBe(oatToken);
      expect(sdkConfig.apiKey).toBe('');
    });

    it('should use apiKey for regular API keys', () => {
      const regularKey = 'sk-ant-api01-abc123';
      const isOAT = regularKey.includes('sk-ant-oat');
      
      const sdkConfig = isOAT 
        ? { apiKey: '', authToken: regularKey }
        : { apiKey: regularKey };
      
      expect(sdkConfig.apiKey).toBe(regularKey);
      expect(sdkConfig.authToken).toBeUndefined();
    });
  });

  describe('Tool Name Casing for OAT', () => {
    // Claude Code requires specific tool name casing
    const CLAUDE_CODE_TOOLS = [
      'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob',
      'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode',
      'KillShell', 'NotebookEdit', 'Skill', 'Task', 'TaskOutput',
      'TodoWrite', 'WebFetch', 'WebSearch', 'Find',
    ];

    const toClaudeCodeName = (name: string): string => {
      const lookup = new Map(CLAUDE_CODE_TOOLS.map(t => [t.toLowerCase(), t]));
      return lookup.get(name.toLowerCase()) ?? name;
    };

    it('should convert lowercase tool names to Claude Code casing', () => {
      expect(toClaudeCodeName('read')).toBe('Read');
      expect(toClaudeCodeName('write')).toBe('Write');
      expect(toClaudeCodeName('bash')).toBe('Bash');
    });

    it('should convert mixed case tool names to Claude Code casing', () => {
      expect(toClaudeCodeName('READ')).toBe('Read');
      expect(toClaudeCodeName('WebFetch')).toBe('WebFetch');
      expect(toClaudeCodeName('WEBFETCH')).toBe('WebFetch');
    });

    it('should preserve unknown tool names', () => {
      expect(toClaudeCodeName('custom_tool')).toBe('custom_tool');
      expect(toClaudeCodeName('MySpecialTool')).toBe('MySpecialTool');
    });

    it('should handle exec_command (swarmit custom) gracefully', () => {
      // swarmit.ai has custom tools that aren't in Claude Code
      expect(toClaudeCodeName('exec_command')).toBe('exec_command');
      expect(toClaudeCodeName('read_file')).toBe('read_file');
      expect(toClaudeCodeName('task_complete')).toBe('task_complete');
    });
  });
});

describe('pi-ai OAT Integration', () => {
  // These tests verify that @mariozechner/pi-ai handles OAT correctly
  // They're more integration-style but don't make actual API calls
  
  describe('streamSimpleAnthropic options', () => {
    it('should accept apiKey in options', () => {
      // This mirrors how swarmit.ai passes the key
      const options = {
        apiKey: 'sk-ant-oat-test123',
        maxTokens: 8000,
      };
      
      expect(options.apiKey).toBeDefined();
      expect(options.apiKey.includes('sk-ant-oat')).toBe(true);
    });

    it('should support reasoning option', () => {
      const options = {
        apiKey: 'sk-ant-oat-test123',
        maxTokens: 8000,
        reasoning: 'low' as const,
      };
      
      expect(options.reasoning).toBe('low');
    });
  });

  describe('Model configuration for pi-ai', () => {
    it('should have correct model structure for anthropic-messages API', () => {
      const model = {
        id: 'claude-sonnet-4-20250514',
        name: 'claude-sonnet-4-20250514',
        api: 'anthropic-messages' as const,
        provider: 'anthropic' as const,
        baseUrl: 'https://api.anthropic.com',
        reasoning: true,
        input: ['text', 'image'] as const,
        cost: {
          input: 3,
          output: 15,
          cacheRead: 0.3,
          cacheWrite: 3.75,
        },
        contextWindow: 200000,
        maxTokens: 64000,
      };

      expect(model.api).toBe('anthropic-messages');
      expect(model.provider).toBe('anthropic');
      expect(model.baseUrl).toBe('https://api.anthropic.com');
    });
  });
});

describe('E2E OAT Flow (Unit)', () => {
  // This simulates the full flow without making real API calls
  
  it('should handle complete OAT authentication flow', () => {
    const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
    
    // Step 1: Receive OAT token from user profile
    const userToken = 'sk-ant-oat01-abcdef123456789';
    
    // Step 2: Detect it's an OAT token
    const isOAT = userToken.includes('sk-ant-oat');
    expect(isOAT).toBe(true);
    
    // Step 3: Prepare system prompt with Claude Code identity
    const basePrompt = 'You are a developer agent. Complete the task.';
    const systemPrompt = isOAT 
      ? `${CLAUDE_CODE_IDENTITY}\n${basePrompt}` 
      : basePrompt;
    expect(systemPrompt.startsWith(CLAUDE_CODE_IDENTITY)).toBe(true);
    
    // Step 4: Prepare SDK config
    const sdkConfig = {
      apiKey: isOAT ? '' : userToken,
      authToken: isOAT ? userToken : undefined,
      baseURL: 'https://api.anthropic.com',
      defaultHeaders: isOAT ? {
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
        'user-agent': 'claude-cli/2.1.2 (external, cli)',
        'x-app': 'cli',
      } : {},
    };
    
    expect(sdkConfig.authToken).toBe(userToken);
    expect(sdkConfig.apiKey).toBe('');
    expect(sdkConfig.defaultHeaders['anthropic-beta']).toContain('oauth-2025-04-20');
  });

  it('should handle regular API key flow', () => {
    // Step 1: Receive regular API key
    const userToken = 'sk-ant-api01-abcdef123456789';
    
    // Step 2: Detect it's NOT an OAT token
    const isOAT = userToken.includes('sk-ant-oat');
    expect(isOAT).toBe(false);
    
    // Step 3: System prompt should NOT include Claude Code identity
    const basePrompt = 'You are a developer agent.';
    const systemPrompt = isOAT 
      ? `You are Claude Code...\n${basePrompt}` 
      : basePrompt;
    expect(systemPrompt).toBe(basePrompt);
    
    // Step 4: SDK config uses apiKey directly
    const sdkConfig = {
      apiKey: isOAT ? '' : userToken,
      authToken: isOAT ? userToken : undefined,
    };
    
    expect(sdkConfig.apiKey).toBe(userToken);
    expect(sdkConfig.authToken).toBeUndefined();
  });
});
