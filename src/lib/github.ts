/**
 * GitHub API helper
 *
 * Handles GitHub integration: token validation, repo management, and pushing code.
 */

import { getUserGitHubToken, getProject } from './db';
import type { Task } from './db';
import type { SandboxToolExecutor } from './sandbox-executor';

const GITHUB_API = 'https://api.github.com';

export async function validateGitHubToken(token: string): Promise<{ username: string; name: string }> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    throw new Error(`Invalid GitHub token: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return { username: data.login, name: data.name || data.login };
}

export async function listUserRepos(token: string): Promise<Array<{ full_name: string; private: boolean; html_url: string }>> {
  const res = await fetch(`${GITHUB_API}/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to list repos: ${res.status}`);
  }
  const data = await res.json();
  return data.map((repo: { full_name: string; private: boolean; html_url: string }) => ({
    full_name: repo.full_name,
    private: repo.private,
    html_url: repo.html_url,
  }));
}

export async function createRepo(
  token: string,
  name: string,
  description: string,
  isPrivate: boolean
): Promise<{ full_name: string; clone_url: string; html_url: string }> {
  const res = await fetch(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.message || '';
    if (res.status === 403 && msg.includes('Resource not accessible')) {
      throw new Error(
        `Failed to create repo: 403 Resource not accessible by integration. ` +
        `This usually means the GitHub connection uses a GitHub App token instead of a classic OAuth token. ` +
        `Please reconnect GitHub using a classic OAuth App or a Personal Access Token with the 'repo' scope.`
      );
    }
    throw new Error(`Failed to create repo: ${res.status} ${msg}`);
  }
  const data = await res.json();
  return { full_name: data.full_name, clone_url: data.clone_url, html_url: data.html_url };
}

export async function repoExists(token: string, fullName: string): Promise<boolean> {
  const res = await fetch(`${GITHUB_API}/repos/${fullName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  return res.ok;
}

export async function pushWorkspaceToGitHub(
  token: string,
  repoFullName: string,
  sandbox: SandboxToolExecutor,
  commitMessage: string,
  branch: string = 'main'
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  // List all files in the workspace
  const files = await sandbox.listFiles('.', true);
  if (files.length === 0) {
    console.warn('[GitHub] No files to push');
    return;
  }

  console.log(`[GitHub] Pushing ${files.length} files to ${repoFullName}`);

  // Create blobs for each file
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];

  for (const filePath of files) {
    const content = await sandbox.readFile(filePath);
    const blobRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    });
    if (!blobRes.ok) {
      throw new Error(`Failed to create blob for ${filePath}: ${blobRes.status}`);
    }
    const blob = await blobRes.json();
    treeItems.push({
      path: filePath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  // Get current commit SHA (if branch exists)
  let parentSha: string | null = null;
  const refRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/ref/heads/${branch}`, {
    headers,
  });
  if (refRes.ok) {
    const ref = await refRes.json();
    parentSha = ref.object.sha;
  }

  // Create tree
  const treeBody: { tree: typeof treeItems; base_tree?: string } = { tree: treeItems };
  // Don't use base_tree — we want to replace all files cleanly
  const treeRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify(treeBody),
  });
  if (!treeRes.ok) {
    throw new Error(`Failed to create tree: ${treeRes.status}`);
  }
  const tree = await treeRes.json();

  // Create commit
  const commitBody: { message: string; tree: string; parents?: string[]; author: { name: string; email: string } } = {
    message: commitMessage,
    tree: tree.sha,
    author: { name: 'Swarmit Agent', email: 'swarmit@bot.dev' },
  };
  if (parentSha) {
    commitBody.parents = [parentSha];
  }
  const commitRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify(commitBody),
  });
  if (!commitRes.ok) {
    throw new Error(`Failed to create commit: ${commitRes.status}`);
  }
  const commit = await commitRes.json();

  // Update or create branch ref
  if (parentSha) {
    const updateRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
    if (!updateRes.ok) {
      throw new Error(`Failed to update ref: ${updateRes.status}`);
    }
  } else {
    const createRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
    if (!createRes.ok) {
      throw new Error(`Failed to create ref: ${createRes.status}`);
    }
  }

  console.log(`[GitHub] Pushed ${files.length} files to ${repoFullName}@${branch} (${commit.sha.slice(0, 8)})`);
}

/**
 * High-level: push workspace to GitHub after a successful agent run.
 * Called from agent-queue.ts
 */
export async function pushToGitHub(
  job: { taskId: string; agentType: string; userEmail?: string },
  task: Task,
  executor: SandboxToolExecutor
): Promise<string | null> {
  if (!job.userEmail) return null;

  const github = await getUserGitHubToken(job.userEmail);
  if (!github) return null; // no GitHub connected

  // Determine repo name
  let repoFullName: string;
  const project = task.project_id ? await getProject(task.project_id) : null;

  if (project?.github_repo) {
    repoFullName = project.github_repo;
  } else {
    // Auto-create for general tasks
    const repoName = `swarmit-task-${job.taskId.slice(0, 8)}`;
    const candidateName = `${github.username}/${repoName}`;
    if (!await repoExists(github.token, candidateName)) {
      const repo = await createRepo(
        github.token,
        repoName,
        `Auto-created by Swarmit for task: ${task.title}`,
        true
      );
      repoFullName = repo.full_name;
    } else {
      repoFullName = candidateName;
    }
  }

  // Push
  await pushWorkspaceToGitHub(
    github.token,
    repoFullName,
    executor,
    `[${job.agentType}] ${task.title}`,
    'main'
  );

  return repoFullName;
}
