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
  const authUrl = `https://${token}@github.com/${repoFullName}.git`;

  // Initialize git if not already
  await sandbox.execCommand('git init');
  await sandbox.execCommand('git config user.email "swarmit@bot.dev"');
  await sandbox.execCommand('git config user.name "Swarmit Agent"');

  // Set remote (add or update)
  const remoteCheck = await sandbox.execCommand('git remote get-url github');
  if (remoteCheck.exitCode !== 0) {
    await sandbox.execCommand(`git remote add github ${authUrl}`);
  } else {
    await sandbox.execCommand(`git remote set-url github ${authUrl}`);
  }

  // Stage and commit
  await sandbox.execCommand('git add -A');
  const commitResult = await sandbox.execCommand(
    `git commit -m "${commitMessage.replace(/"/g, '\\"')}" --allow-empty`
  );
  if (commitResult.exitCode !== 0 && !commitResult.stderr.includes('nothing to commit')) {
    console.warn('[GitHub] Commit warning:', commitResult.stderr);
  }

  // Push (force to handle diverged histories from auto-init)
  const pushResult = await sandbox.execCommand(`git push github HEAD:${branch} --force`);
  if (pushResult.exitCode !== 0) {
    throw new Error(`Git push failed: ${pushResult.stderr}`);
  }
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
