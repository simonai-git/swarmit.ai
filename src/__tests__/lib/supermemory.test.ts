import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { addAgentMemory, searchAgentMemory, clearAgentMemory } from '@/lib/supermemory';

describe('Supermemory Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPERMEMORY_API_KEY = 'sm_test_key_12345';
  });

  afterEach(() => {
    delete process.env.SUPERMEMORY_API_KEY;
  });

  describe('addAgentMemory', () => {
    it('should POST document to Supermemory API', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await addAgentMemory('agent-123', 'Task completed successfully', { taskId: 't-1' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supermemory.ai/v3/documents',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sm_test_key_12345',
            'Content-Type': 'application/json',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.content).toBe('Task completed successfully');
      expect(body.containerTag).toBe('agent-123');
      expect(body.metadata).toEqual({ taskId: 't-1' });
      expect(body.customId).toMatch(/^agent-123-\d+$/);
    });

    it('should do nothing when API key not set', async () => {
      delete process.env.SUPERMEMORY_API_KEY;

      await addAgentMemory('agent-123', 'Some content');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      });

      await expect(
        addAgentMemory('agent-123', 'Content')
      ).rejects.toThrow('Supermemory add failed: 500 Internal error');
    });

    it('should default metadata to empty object', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await addAgentMemory('agent-123', 'Content');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.metadata).toEqual({});
    });
  });

  describe('searchAgentMemory', () => {
    it('should POST search to Supermemory API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { content: 'Previous run: fixed bug in auth' },
            { content: 'Learned: always check token expiry' },
          ],
        }),
      });

      const result = await searchAgentMemory('agent-123', 'auth bug');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supermemory.ai/v3/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sm_test_key_12345',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.q).toBe('auth bug');
      expect(body.containerTags).toEqual(['agent-123']);

      expect(result).toContain('Previous run: fixed bug in auth');
      expect(result).toContain('Learned: always check token expiry');
    });

    it('should return empty string when no results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const result = await searchAgentMemory('agent-123', 'nonexistent');

      expect(result).toBe('');
    });

    it('should return empty string when API key not set', async () => {
      delete process.env.SUPERMEMORY_API_KEY;

      const result = await searchAgentMemory('agent-123', 'query');

      expect(result).toBe('');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        searchAgentMemory('agent-123', 'query')
      ).rejects.toThrow('Supermemory search failed: 401 Unauthorized');
    });

    it('should handle documents key in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            { text: 'Memory from documents key' },
          ],
        }),
      });

      const result = await searchAgentMemory('agent-123', 'query');

      expect(result).toContain('Memory from documents key');
    });

    it('should number results sequentially', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { content: 'First' },
            { content: 'Second' },
            { content: 'Third' },
          ],
        }),
      });

      const result = await searchAgentMemory('agent-123', 'query');

      expect(result).toBe('1. First\n2. Second\n3. Third');
    });
  });

  describe('clearAgentMemory', () => {
    it('should DELETE container tag from Supermemory', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await clearAgentMemory('agent-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supermemory.ai/v3/container-tags/agent-123',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'Bearer sm_test_key_12345',
          }),
        })
      );
    });

    it('should do nothing when API key not set', async () => {
      delete process.env.SUPERMEMORY_API_KEY;

      await clearAgentMemory('agent-123');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      });

      await expect(
        clearAgentMemory('agent-123')
      ).rejects.toThrow('Supermemory clear failed: 404 Not found');
    });

    it('should URL-encode agent ID', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await clearAgentMemory('agent with spaces');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supermemory.ai/v3/container-tags/agent%20with%20spaces',
        expect.any(Object)
      );
    });
  });
});
