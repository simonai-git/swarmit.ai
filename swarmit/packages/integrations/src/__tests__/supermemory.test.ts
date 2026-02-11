import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createSupermemoryClient, type SupermemoryClient } from '../supermemory/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const SUPERMEMORY_API = 'https://api.supermemory.ai';

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function mockErrorResponse(status: number, body = 'Error') {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ message: body }),
    text: () => Promise.resolve(body),
  };
}

describe('SupermemoryClient', () => {
  let client: SupermemoryClient;
  const apiKey = 'sm-test-key-123';

  beforeEach(() => {
    vi.clearAllMocks();
    client = createSupermemoryClient(apiKey);
  });

  describe('addDocument', () => {
    it('sends correct body to /v3/documents', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'doc-abc' }));

      const result = await client.addDocument('Hello world');

      expect(result).toEqual({ id: 'doc-abc' });
      expect(mockFetch).toHaveBeenCalledWith(
        `${SUPERMEMORY_API}/v3/documents`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          }),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({ content: 'Hello world', metadata: undefined });
    });

    it('includes metadata when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'doc-meta' }));

      await client.addDocument('content', { source: 'test', priority: 1 });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({
        content: 'content',
        metadata: { source: 'test', priority: 1 },
      });
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(500, 'Internal error'));

      await expect(client.addDocument('fail')).rejects.toThrow(
        'Supermemory API error: 500'
      );
    });
  });

  describe('search', () => {
    it('sends query with default limit of 5', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          results: [
            { id: 'r1', content: 'Result 1', score: 0.95, metadata: {} },
          ],
        })
      );

      const result = await client.search('test query');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('r1');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({ query: 'test query', limit: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        `${SUPERMEMORY_API}/v3/search`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends custom limit', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ results: [] }));

      await client.search('query', 10);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.limit).toBe(10);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(401, 'Unauthorized'));

      await expect(client.search('test')).rejects.toThrow(
        'Supermemory API error: 401'
      );
    });
  });

  describe('listDocuments', () => {
    it('calls with default page 1', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ documents: [{ id: 'doc-1' }, { id: 'doc-2' }] })
      );

      const result = await client.listDocuments();

      expect(result.documents).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        `${SUPERMEMORY_API}/v3/documents/list?page=1`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('calls with custom page param', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ documents: [] }));

      await client.listDocuments(3);

      expect(mockFetch).toHaveBeenCalledWith(
        `${SUPERMEMORY_API}/v3/documents/list?page=3`,
        expect.anything()
      );
    });
  });

  describe('addAgentMemory', () => {
    it('includes containerTag, customId, and empty metadata', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'mem-1' }));

      // Mock Date.now so we can predict the customId
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

      await client.addAgentMemory('agent-42', 'Remember this fact');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({
        content: 'Remember this fact',
        containerTag: 'agent-42',
        customId: 'agent-42-1700000000000',
        metadata: {},
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${SUPERMEMORY_API}/v3/documents`,
        expect.objectContaining({ method: 'POST' })
      );

      dateSpy.mockRestore();
    });

    it('includes custom metadata when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'mem-2' }));

      await client.addAgentMemory('agent-99', 'content', { source: 'task-123' });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.metadata).toEqual({ source: 'task-123' });
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(429, 'Rate limited'));

      await expect(
        client.addAgentMemory('agent-1', 'content')
      ).rejects.toThrow('Supermemory API error: 429');
    });
  });

  describe('searchAgentMemory', () => {
    it('queries by containerTags and formats results', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          results: [
            { content: 'First memory', text: 'alt' },
            { content: 'Second memory' },
          ],
        })
      );

      const result = await client.searchAgentMemory('agent-42', 'what did I learn');

      expect(result).toBe('1. First memory\n2. Second memory');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({
        q: 'what did I learn',
        containerTags: ['agent-42'],
      });
    });

    it('falls back to text field when content is missing', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          results: [{ text: 'From text field' }],
        })
      );

      const result = await client.searchAgentMemory('agent-1', 'query');

      expect(result).toBe('1. From text field');
    });

    it('uses documents array when results is missing', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          documents: [{ content: 'From documents' }],
        })
      );

      const result = await client.searchAgentMemory('agent-1', 'query');

      expect(result).toBe('1. From documents');
    });

    it('returns empty string when no results', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ results: [] }));

      const result = await client.searchAgentMemory('agent-1', 'query');

      expect(result).toBe('');
    });

    it('returns empty string when both results and documents are missing', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}));

      const result = await client.searchAgentMemory('agent-1', 'query');

      expect(result).toBe('');
    });
  });

  describe('clearAgentMemory', () => {
    it('sends DELETE to correct URL', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ success: true }));

      await client.clearAgentMemory('agent-42');

      expect(mockFetch).toHaveBeenCalledWith(
        `${SUPERMEMORY_API}/v3/container-tags/agent-42`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('encodes special characters in agentId', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ success: true }));

      await client.clearAgentMemory('agent/special chars');

      expect(mockFetch).toHaveBeenCalledWith(
        `${SUPERMEMORY_API}/v3/container-tags/${encodeURIComponent('agent/special chars')}`,
        expect.anything()
      );
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(404, 'Not found'));

      await expect(client.clearAgentMemory('unknown')).rejects.toThrow(
        'Supermemory API error: 404'
      );
    });
  });

  describe('authentication', () => {
    it('sends Bearer token in all requests', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'x' }));

      await client.addDocument('test');

      expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
        Authorization: `Bearer ${apiKey}`,
      });
    });
  });
});
