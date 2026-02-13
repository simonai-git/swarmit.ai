import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createSkillsMPClient } from '../skillsmp/index.js';
import type { SkillsMPClient, SkillsMPResult } from '../skillsmp/index.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('SkillsMP client', () => {
  let client: SkillsMPClient;
  const TEST_API_KEY = 'smp-test-key-123';

  beforeEach(() => {
    mockFetch.mockReset();
    client = createSkillsMPClient(TEST_API_KEY);
  });

  describe('searchSkills', () => {
    it('returns results on success', async () => {
      const mockResults: SkillsMPResult[] = [
        { id: '1', name: 'TypeScript', description: 'TypeScript language' },
        { id: '2', name: 'React', description: 'React framework', sourceUrl: 'https://react.dev' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const results = await client.searchSkills('typescript');

      expect(results).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://skillsmp.com/api/v1/skills/search?q=typescript',
        {
          headers: {
            'Authorization': `Bearer ${TEST_API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );
    });

    it('URL-encodes the query parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.searchSkills('react hooks & state management');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://skillsmp.com/api/v1/skills/search?q=react%20hooks%20%26%20state%20management',
        expect.any(Object),
      );
    });

    it('handles empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const results = await client.searchSkills('nonexistent-skill-xyz');
      expect(results).toEqual([]);
    });
  });

  describe('aiSearchSkills', () => {
    it('returns results on success', async () => {
      const mockResults: SkillsMPResult[] = [
        { id: '3', name: 'AI/ML', description: 'Machine learning skills' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const results = await client.aiSearchSkills('machine learning');

      expect(results).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://skillsmp.com/api/v1/skills/ai-search?q=machine%20learning',
        {
          headers: {
            'Authorization': `Bearer ${TEST_API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );
    });

    it('URL-encodes special characters in query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.aiSearchSkills('C++ & C#');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://skillsmp.com/api/v1/skills/ai-search?q=C%2B%2B%20%26%20C%23',
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('throws on 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(client.searchSkills('test')).rejects.toThrow('SkillsMP API error: 401');
    });

    it('throws on 404 Not Found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(client.aiSearchSkills('test')).rejects.toThrow('SkillsMP API error: 404');
    });

    it('throws on 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(client.searchSkills('test')).rejects.toThrow('SkillsMP API error: 500');
    });

    it('throws on 429 Rate Limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Too Many Requests'),
      });

      await expect(client.searchSkills('test')).rejects.toThrow('SkillsMP API error: 429');
    });

    it('propagates fetch network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.searchSkills('test')).rejects.toThrow('Network error');
    });
  });

  describe('authorization', () => {
    it('sends the correct Bearer token in the Authorization header', async () => {
      const customKey = 'my-custom-api-key-456';
      const customClient = createSkillsMPClient(customKey);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await customClient.searchSkills('query');

      const calledHeaders = mockFetch.mock.calls[0][1].headers;
      expect(calledHeaders['Authorization']).toBe(`Bearer ${customKey}`);
    });

    it('sends Accept: application/json header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.searchSkills('query');

      const calledHeaders = mockFetch.mock.calls[0][1].headers;
      expect(calledHeaders['Accept']).toBe('application/json');
    });
  });
});
