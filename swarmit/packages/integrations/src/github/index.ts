import { createLogger } from '@swarmit/logger';

const logger = createLogger('github');

const GITHUB_API = 'https://api.github.com';

export interface GitHubClient {
  // Existing methods
  getRepo(owner: string, repo: string): Promise<unknown>;
  createBlob(owner: string, repo: string, content: string): Promise<{ sha: string }>;
  createTree(owner: string, repo: string, tree: TreeItem[], baseTree?: string): Promise<{ sha: string }>;
  createCommit(owner: string, repo: string, message: string, tree: string, parents: string[]): Promise<{ sha: string }>;
  updateRef(owner: string, repo: string, ref: string, sha: string): Promise<void>;

  // New methods from monolith
  validateToken(): Promise<{ username: string; name: string }>;
  listRepos(perPage?: number): Promise<Array<{ full_name: string; private: boolean; html_url: string }>>;
  createRepo(name: string, description: string, isPrivate: boolean): Promise<{ full_name: string; clone_url: string; html_url: string }>;
  repoExists(fullName: string): Promise<boolean>;
  getRef(owner: string, repo: string, ref: string): Promise<{ sha: string } | null>;
  createRef(owner: string, repo: string, ref: string, sha: string): Promise<void>;
  pushFiles(repoFullName: string, files: Array<{ path: string; content: string }>, commitMessage: string, branch?: string): Promise<{ sha: string }>;
}

export interface TreeItem {
  path: string;
  mode: string;
  type: string;
  sha: string;
}

export function createGitHubClient(token: string): GitHubClient {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function githubFetch(url: string, options?: RequestInit) {
    const response = await fetch(`${GITHUB_API}${url}`, {
      ...options,
      headers: { ...headers, 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!response.ok) {
      const text = await response.text();
      logger.error({ url, status: response.status, body: text }, 'GitHub API error');
      throw new Error(`GitHub API error: ${response.status} ${text}`);
    }
    return response.json();
  }

  async function githubFetchOptional(url: string): Promise<unknown | null> {
    const response = await fetch(`${GITHUB_API}${url}`, { headers });
    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${text}`);
    }
    return response.json();
  }

  return {
    // --- Existing methods ---
    async getRepo(owner, repo) {
      return githubFetch(`/repos/${owner}/${repo}`);
    },
    async createBlob(owner, repo, content) {
      return githubFetch(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      }) as Promise<{ sha: string }>;
    },
    async createTree(owner, repo, tree, baseTree) {
      const body: { tree: TreeItem[]; base_tree?: string } = { tree };
      if (baseTree) body.base_tree = baseTree;
      return githubFetch(`/repos/${owner}/${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify(body),
      }) as Promise<{ sha: string }>;
    },
    async createCommit(owner, repo, message, tree, parents) {
      return githubFetch(`/repos/${owner}/${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({
          message,
          tree,
          parents,
          author: { name: 'Swarmit Agent', email: 'agent@swarmit.ai' },
        }),
      }) as Promise<{ sha: string }>;
    },
    async updateRef(owner, repo, ref, sha) {
      await githubFetch(`/repos/${owner}/${repo}/git/refs/${ref}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha, force: true }),
      });
    },

    // --- New methods ---
    async validateToken() {
      const data = await githubFetch('/user') as { login: string; name?: string };
      return { username: data.login, name: data.name || data.login };
    },

    async listRepos(perPage = 30) {
      const data = await githubFetch(`/user/repos?sort=updated&per_page=${perPage}&affiliation=owner,collaborator`) as Array<{ full_name: string; private: boolean; html_url: string }>;
      return data.map(repo => ({
        full_name: repo.full_name,
        private: repo.private,
        html_url: repo.html_url,
      }));
    },

    async createRepo(name, description, isPrivate) {
      const data = await githubFetch('/user/repos', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          private: isPrivate,
          auto_init: true,
        }),
      }) as { full_name: string; clone_url: string; html_url: string };
      return {
        full_name: data.full_name,
        clone_url: data.clone_url,
        html_url: data.html_url,
      };
    },

    async repoExists(fullName) {
      const result = await githubFetchOptional(`/repos/${fullName}`);
      return result !== null;
    },

    async getRef(owner, repo, ref) {
      const result = await githubFetchOptional(`/repos/${owner}/${repo}/git/ref/${ref}`) as { object?: { sha: string } } | null;
      if (!result || !result.object) return null;
      return { sha: result.object.sha };
    },

    async createRef(owner, repo, ref, sha) {
      await githubFetch(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/${ref}`, sha }),
      });
    },

    async pushFiles(repoFullName, files, commitMessage, branch = 'main') {
      const [owner, repo] = repoFullName.split('/');
      logger.info({ repoFullName, fileCount: files.length, branch }, 'Pushing files to GitHub');

      // Create blobs for each file
      const treeItems: TreeItem[] = [];
      for (const file of files) {
        const blob = await this.createBlob(owner, repo, file.content);
        treeItems.push({
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        });
      }

      // Get current branch ref (if exists)
      const existingRef = await this.getRef(owner, repo, `heads/${branch}`);

      // Create tree (no base_tree — replace all files cleanly)
      const tree = await this.createTree(owner, repo, treeItems);

      // Create commit
      const parents = existingRef ? [existingRef.sha] : [];
      const commit = await this.createCommit(owner, repo, commitMessage, tree.sha, parents);

      // Update or create ref
      if (existingRef) {
        await this.updateRef(owner, repo, `heads/${branch}`, commit.sha);
      } else {
        await this.createRef(owner, repo, `heads/${branch}`, commit.sha);
      }

      logger.info({ repoFullName, sha: commit.sha.slice(0, 8), branch }, 'Push complete');
      return { sha: commit.sha };
    },
  };
}
