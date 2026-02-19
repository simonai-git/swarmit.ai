import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createGitHubClient, type GitHubClient } from '../github/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

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

describe('GitHubClient', () => {
  let client: GitHubClient;
  const token = 'ghp_test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    client = createGitHubClient(token);
  });

  describe('validateToken', () => {
    it('returns username and name on success', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ login: 'octocat', name: 'The Octocat' })
      );

      const result = await client.validateToken();

      expect(result).toEqual({ username: 'octocat', name: 'The Octocat' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${token}`,
          }),
        })
      );
    });

    it('falls back to login when name is not set', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ login: 'octocat', name: null })
      );

      const result = await client.validateToken();
      expect(result).toEqual({ username: 'octocat', name: 'octocat' });
    });

    it('throws on invalid token', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(401, 'Bad credentials'));

      await expect(client.validateToken()).rejects.toThrow('GitHub API error: 401');
    });
  });

  describe('getRepo', () => {
    it('calls the correct URL', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ id: 1, full_name: 'owner/repo' })
      );

      await client.getRepo('owner', 'repo');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('throws on 404', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(404, 'Not Found'));

      await expect(client.getRepo('owner', 'nonexistent')).rejects.toThrow(
        'GitHub API error: 404'
      );
    });
  });

  describe('listRepos', () => {
    it('returns formatted results with default perPage', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse([
          { full_name: 'user/repo1', private: false, html_url: 'https://github.com/user/repo1', extra: 'ignored' },
          { full_name: 'user/repo2', private: true, html_url: 'https://github.com/user/repo2', extra: 'ignored' },
        ])
      );

      const repos = await client.listRepos();

      expect(repos).toEqual([
        { full_name: 'user/repo1', private: false, html_url: 'https://github.com/user/repo1' },
        { full_name: 'user/repo2', private: true, html_url: 'https://github.com/user/repo2' },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('per_page=30'),
        expect.anything()
      );
    });

    it('respects custom perPage', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse([]));

      await client.listRepos(10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('per_page=10'),
        expect.anything()
      );
    });
  });

  describe('createRepo', () => {
    it('sends correct body and returns formatted response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          full_name: 'user/new-repo',
          clone_url: 'https://github.com/user/new-repo.git',
          html_url: 'https://github.com/user/new-repo',
          extra_field: 'ignored',
        })
      );

      const result = await client.createRepo('new-repo', 'A test repo', true);

      expect(result).toEqual({
        full_name: 'user/new-repo',
        clone_url: 'https://github.com/user/new-repo.git',
        html_url: 'https://github.com/user/new-repo',
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({
        name: 'new-repo',
        description: 'A test repo',
        private: true,
        auto_init: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/user/repos',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('repoExists', () => {
    it('returns true when repo exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 1 }),
        text: () => Promise.resolve(''),
      });

      const exists = await client.repoExists('owner/repo');
      expect(exists).toBe(true);
    });

    it('returns false when repo does not exist (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not Found' }),
        text: () => Promise.resolve('Not Found'),
      });

      const exists = await client.repoExists('owner/nonexistent');
      expect(exists).toBe(false);
    });

    it('throws on non-404 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server Error' }),
        text: () => Promise.resolve('Server Error'),
      });

      await expect(client.repoExists('owner/repo')).rejects.toThrow(
        'GitHub API error: 500'
      );
    });
  });

  describe('createBlob', () => {
    it('sends content with utf-8 encoding', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ sha: 'blob-sha-123' })
      );

      const result = await client.createBlob('owner', 'repo', 'file content');

      expect(result).toEqual({ sha: 'blob-sha-123' });
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({ content: 'file content', encoding: 'utf-8' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/git/blobs',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('createTree', () => {
    it('sends tree items without base_tree', async () => {
      const tree = [
        { path: 'file.txt', mode: '100644', type: 'blob', sha: 'abc123' },
      ];

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ sha: 'tree-sha-456' })
      );

      const result = await client.createTree('owner', 'repo', tree);

      expect(result).toEqual({ sha: 'tree-sha-456' });
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({ tree });
      expect(callBody).not.toHaveProperty('base_tree');
    });

    it('includes base_tree when provided', async () => {
      const tree = [
        { path: 'file.txt', mode: '100644', type: 'blob', sha: 'abc123' },
      ];

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ sha: 'tree-sha-789' })
      );

      const result = await client.createTree('owner', 'repo', tree, 'base-tree-sha');

      expect(result).toEqual({ sha: 'tree-sha-789' });
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.base_tree).toBe('base-tree-sha');
    });
  });

  describe('createCommit', () => {
    it('sends commit with author info', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ sha: 'commit-sha-abc' })
      );

      const result = await client.createCommit(
        'owner', 'repo', 'Initial commit', 'tree-sha', ['parent-sha']
      );

      expect(result).toEqual({ sha: 'commit-sha-abc' });
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({
        message: 'Initial commit',
        tree: 'tree-sha',
        parents: ['parent-sha'],
        author: { name: 'Swarmit Agent', email: 'agent@swarmit.ai' },
      });
    });
  });

  describe('updateRef', () => {
    it('sends PATCH with force flag', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ref: 'refs/heads/main' }));

      await client.updateRef('owner', 'repo', 'heads/main', 'new-sha');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/git/refs/heads/main',
        expect.objectContaining({ method: 'PATCH' })
      );
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({ sha: 'new-sha', force: true });
    });
  });

  describe('getRef', () => {
    it('returns sha when ref exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: { sha: 'ref-sha-123' } }),
        text: () => Promise.resolve(''),
      });

      const result = await client.getRef('owner', 'repo', 'heads/main');
      expect(result).toEqual({ sha: 'ref-sha-123' });
    });

    it('returns null when ref does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not Found' }),
        text: () => Promise.resolve('Not Found'),
      });

      const result = await client.getRef('owner', 'repo', 'heads/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createRef', () => {
    it('sends POST with full ref path', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ ref: 'refs/heads/new-branch' })
      );

      await client.createRef('owner', 'repo', 'heads/new-branch', 'sha-abc');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({ ref: 'refs/heads/new-branch', sha: 'sha-abc' });
    });
  });

  describe('pushFiles', () => {
    it('pushes multiple files end-to-end (existing branch)', async () => {
      const files = [
        { path: 'README.md', content: '# Hello' },
        { path: 'src/index.ts', content: 'export {}' },
      ];

      // createBlob for file 1
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'blob-1' }));
      // createBlob for file 2
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'blob-2' }));
      // getRef (existing branch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: { sha: 'existing-ref-sha' } }),
        text: () => Promise.resolve(''),
      });
      // createTree
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'tree-sha' }));
      // createCommit
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'commit-sha-final' }));
      // updateRef (existing branch)
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ref: 'refs/heads/main' }));

      const result = await client.pushFiles('owner/repo', files, 'Add files');

      expect(result).toEqual({ sha: 'commit-sha-final' });
      expect(mockFetch).toHaveBeenCalledTimes(6);

      // Verify blob creation calls
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.github.com/repos/owner/repo/git/blobs'
      );
      expect(mockFetch.mock.calls[1][0]).toBe(
        'https://api.github.com/repos/owner/repo/git/blobs'
      );

      // Verify commit includes parent
      const commitBody = JSON.parse(mockFetch.mock.calls[4][1].body);
      expect(commitBody.parents).toEqual(['existing-ref-sha']);
    });

    it('creates ref when branch does not exist', async () => {
      const files = [{ path: 'file.txt', content: 'hello' }];

      // createBlob
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'blob-new' }));
      // getRef (does not exist)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve('Not Found'),
      });
      // createTree
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'tree-sha-new' }));
      // createCommit
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'commit-sha-new' }));
      // createRef (new branch)
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ref: 'refs/heads/main' }));

      const result = await client.pushFiles('owner/repo', files, 'Init', 'main');

      expect(result).toEqual({ sha: 'commit-sha-new' });

      // Verify commit has no parents
      const commitBody = JSON.parse(mockFetch.mock.calls[3][1].body);
      expect(commitBody.parents).toEqual([]);

      // Verify createRef was called instead of updateRef
      expect(mockFetch.mock.calls[4][0]).toBe(
        'https://api.github.com/repos/owner/repo/git/refs'
      );
      expect(mockFetch.mock.calls[4][1].method).toBe('POST');
    });

    it('uses custom branch name', async () => {
      const files = [{ path: 'file.txt', content: 'hello' }];

      // createBlob
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'blob-x' }));
      // getRef for custom branch
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve('Not Found'),
      });
      // createTree
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'tree-x' }));
      // createCommit
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ sha: 'commit-x' }));
      // createRef
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}));

      await client.pushFiles('owner/repo', files, 'Feature', 'feature/branch');

      // Verify getRef used the custom branch name
      expect(mockFetch.mock.calls[1][0]).toBe(
        'https://api.github.com/repos/owner/repo/git/ref/heads/feature/branch'
      );
    });
  });

  describe('createPullRequest', () => {
    it('sends correct body and returns number + html_url', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ number: 42, html_url: 'https://github.com/owner/repo/pull/42', extra: 'ignored' })
      );

      const result = await client.createPullRequest('owner', 'repo', 'My PR', 'PR body', 'feature-branch', 'main');

      expect(result).toEqual({ number: 42, html_url: 'https://github.com/owner/repo/pull/42' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls',
        expect.objectContaining({ method: 'POST' })
      );
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({ title: 'My PR', body: 'PR body', head: 'feature-branch', base: 'main' });
    });

    it('defaults base to main', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ number: 1, html_url: 'https://github.com/o/r/pull/1' })
      );

      await client.createPullRequest('o', 'r', 'title', 'body', 'head');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.base).toBe('main');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(422, 'Validation failed'));

      await expect(
        client.createPullRequest('o', 'r', 'title', 'body', 'head')
      ).rejects.toThrow('GitHub API error: 422');
    });
  });

  describe('error handling', () => {
    it('includes status and body in error message', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(403, '{"message":"rate limit exceeded"}')
      );

      await expect(client.getRepo('owner', 'repo')).rejects.toThrow('GitHub API error: 403');
    });
  });
});
