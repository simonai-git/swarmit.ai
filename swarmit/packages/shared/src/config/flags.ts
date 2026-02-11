export interface Flags {
  APF_MODE: 'personal' | 'team';
  INTEGRATIONS_MODE: 'mock' | 'real';
  LLM_PROVIDER: 'mock' | 'anthropic';
  SANDBOX_MODE: 'stub' | 'docker';
  STORAGE_MODE: 'local' | 's3';
}

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const flags: Flags = {
  APF_MODE: getEnv('APF_MODE', 'personal') as Flags['APF_MODE'],
  INTEGRATIONS_MODE: getEnv('INTEGRATIONS_MODE', 'mock') as Flags['INTEGRATIONS_MODE'],
  LLM_PROVIDER: getEnv('LLM_PROVIDER', 'mock') as Flags['LLM_PROVIDER'],
  SANDBOX_MODE: getEnv('SANDBOX_MODE', 'stub') as Flags['SANDBOX_MODE'],
  STORAGE_MODE: getEnv('STORAGE_MODE', 'local') as Flags['STORAGE_MODE'],
};
