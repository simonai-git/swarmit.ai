import { createLogger } from '@swarmit/logger';

const logger = createLogger('skillsmp');

const SKILLSMP_API = 'https://skillsmp.com/api/v1';

export interface SkillsMPClient {
  searchSkills(query: string): Promise<SkillsMPResult[]>;
  aiSearchSkills(query: string): Promise<SkillsMPResult[]>;
}

export interface SkillsMPResult {
  id: string;
  name: string;
  description: string;
  sourceUrl?: string;
}

export function createSkillsMPClient(apiKey: string): SkillsMPClient {
  async function smpFetch(path: string) {
    const response = await fetch(`${SKILLSMP_API}${path}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ path, status: response.status, body: text }, 'SkillsMP API error');
      throw new Error(`SkillsMP API error: ${response.status}`);
    }

    return response.json();
  }

  return {
    async searchSkills(query) {
      return smpFetch(`/skills/search?q=${encodeURIComponent(query)}`) as Promise<SkillsMPResult[]>;
    },
    async aiSearchSkills(query) {
      return smpFetch(`/skills/ai-search?q=${encodeURIComponent(query)}`) as Promise<SkillsMPResult[]>;
    },
  };
}
