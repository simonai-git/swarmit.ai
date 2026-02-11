import { createLogger } from '@swarmit/logger';

const logger = createLogger('supermemory');

const SUPERMEMORY_API = 'https://api.supermemory.ai';

export interface SupermemoryClient {
  addDocument(content: string, metadata?: Record<string, unknown>): Promise<{ id: string }>;
  search(query: string, limit?: number): Promise<{ results: SupermemoryResult[] }>;
  listDocuments(page?: number): Promise<{ documents: unknown[] }>;
  addAgentMemory(agentId: string, content: string, metadata?: Record<string, string>): Promise<void>;
  searchAgentMemory(agentId: string, query: string): Promise<string>;
  clearAgentMemory(agentId: string): Promise<void>;
}

export interface SupermemoryResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export function createSupermemoryClient(apiKey: string): SupermemoryClient {
  async function smFetch(path: string, options?: RequestInit) {
    const response = await fetch(`${SUPERMEMORY_API}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ path, status: response.status, body: text }, 'Supermemory API error');
      throw new Error(`Supermemory API error: ${response.status}`);
    }

    return response.json();
  }

  return {
    async addDocument(content, metadata) {
      return smFetch('/v3/documents', {
        method: 'POST',
        body: JSON.stringify({ content, metadata }),
      }) as Promise<{ id: string }>;
    },

    async search(query, limit = 5) {
      return smFetch('/v3/search', {
        method: 'POST',
        body: JSON.stringify({ query, limit }),
      }) as Promise<{ results: SupermemoryResult[] }>;
    },

    async listDocuments(page = 1) {
      return smFetch(`/v3/documents/list?page=${page}`, {
        method: 'POST',
        body: JSON.stringify({}),
      }) as Promise<{ documents: unknown[] }>;
    },

    async addAgentMemory(agentId, content, metadata) {
      const customId = `${agentId}-${Date.now()}`;
      await smFetch('/v3/documents', {
        method: 'POST',
        body: JSON.stringify({
          content,
          containerTag: agentId,
          customId,
          metadata: metadata || {},
        }),
      });
      logger.info({ agentId, customId }, 'Agent memory stored');
    },

    async searchAgentMemory(agentId, query) {
      const data = await smFetch('/v3/search', {
        method: 'POST',
        body: JSON.stringify({
          q: query,
          containerTags: [agentId],
        }),
      }) as { results?: Array<{ content?: string; text?: string }>; documents?: Array<{ content?: string; text?: string }> };

      const results = data.results || data.documents || [];
      if (results.length === 0) return '';

      return results
        .map((r, i) => `${i + 1}. ${r.content || r.text || ''}`)
        .join('\n');
    },

    async clearAgentMemory(agentId) {
      await smFetch(`/v3/container-tags/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
      });
      logger.info({ agentId }, 'Agent memory cleared');
    },
  };
}
