/**
 * Task Sandbox - Execution environment for AI agents
 * 
 * Two modes:
 * 1. Docker (local dev) - Full container isolation
 * 2. Subprocess (Railway) - Lightweight temp directory isolation
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface SandboxConfig {
  taskId: string;
  repo?: string;
  branch?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  agentType?: string;
}

export interface SandboxToolkit {
  setupCommands: string[];
  envVars: Record<string, string>;
}

// Map agent types to their specialized Docker image
export function getAgentImage(agentType: string): string {
  const registry = process.env.DOCKER_REGISTRY || 'ghcr.io/simonai-git';
  const tag = process.env.DOCKER_IMAGE_TAG || 'latest';
  const imageMap: Record<string, string> = {
    developer: `${registry}/swarmit-developer:${tag}`,
    frontend: `${registry}/swarmit-frontend:${tag}`,
    backend: `${registry}/swarmit-backend:${tag}`,
    devops: `${registry}/swarmit-devops:${tag}`,
    qa: `${registry}/swarmit-qa:${tag}`,
    reviewer: `${registry}/swarmit-reviewer:${tag}`,
  };
  return imageMap[agentType] || `${registry}/swarmit-developer:${tag}`;
}

// Get volume name for a task's workspace
export function getWorkspaceVolumeName(taskId: string): string {
  return `swarmit-workspace-${taskId}`;
}

// Pre-configured toolkits per agent specialization
// Git config is baked into Docker images; only project-level setup remains
export const AGENT_TOOLKITS: Record<string, SandboxToolkit> = {
  developer: {
    setupCommands: [
      'npm install --prefer-offline --no-audit || echo "WARN: npm install failed"',
    ],
    envVars: {
      NODE_ENV: 'development',
    },
  },
  frontend: {
    setupCommands: [
      'npm install --prefer-offline --no-audit || echo "WARN: npm install failed"',
    ],
    envVars: {
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
  backend: {
    setupCommands: [
      'npm install --prefer-offline --no-audit || echo "WARN: npm install failed"',
    ],
    envVars: {
      NODE_ENV: 'development',
    },
  },
  devops: {
    setupCommands: [
      'npm install --prefer-offline --no-audit || echo "WARN: npm install failed"',
    ],
    envVars: {
      NODE_ENV: 'production',
      CI: 'true',
    },
  },
  qa: {
    setupCommands: [
      'npm install --prefer-offline --no-audit || echo "WARN: npm install failed"',
      'npm run build || echo "WARN: npm run build failed"',
    ],
    envVars: {
      NODE_ENV: 'test',
    },
  },
  reviewer: {
    setupCommands: [
      'npm install --prefer-offline --no-audit || echo "WARN: npm install failed"',
    ],
    envVars: {
      NODE_ENV: 'development',
    },
  },
};

const DEFAULT_TIMEOUT_MS = 60000; // 1 minute
const DEFAULT_MAX_OUTPUT = 1024 * 1024; // 1MB

/**
 * Abstract sandbox interface
 */
export abstract class TaskSandbox {
  protected taskId: string;
  protected workdir: string;
  protected config: SandboxConfig;

  constructor(config: SandboxConfig) {
    this.taskId = config.taskId;
    this.workdir = '';
    this.config = {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_MAX_OUTPUT,
      ...config
    };
  }

  abstract initialize(): Promise<void>;
  abstract exec(command: string, cwd?: string, onOutput?: (stream: 'stdout' | 'stderr', data: string) => void): Promise<ExecResult>;
  abstract readFile(filePath: string): Promise<string>;
  abstract writeFile(filePath: string, content: string): Promise<void>;
  abstract listFiles(dir?: string): Promise<string[]>;
  abstract cleanup(): Promise<void>;
  abstract saveSnapshot(excludeDirs?: string[]): Promise<Buffer>;
  abstract restoreSnapshot(snapshot: Buffer): Promise<void>;

  getWorkdir(): string {
    return this.workdir;
  }

  /**
   * Apply a toolkit's setup commands and env vars for the given agent type
   */
  async applyToolkit(agentType: string): Promise<void> {
    const toolkit = AGENT_TOOLKITS[agentType];
    if (!toolkit) return;

    console.log(`[Sandbox] Applying ${agentType} toolkit`);

    for (const cmd of toolkit.setupCommands) {
      const result = await this.exec(cmd);
      if (result.exitCode !== 0 && !cmd.includes('|| true')) {
        console.warn(`[Sandbox] Toolkit setup command failed: ${cmd} - ${result.stderr}`);
      }
    }
  }

  /**
   * Clone a git repository into the sandbox
   */
  async gitClone(repo: string, branch?: string): Promise<ExecResult> {
    const branchArg = branch ? `-b ${branch}` : '';
    return this.exec(`git clone ${branchArg} ${repo} .`);
  }

  /**
   * Git commit changes
   */
  async gitCommit(message: string): Promise<ExecResult> {
    await this.exec('git add -A');
    return this.exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  }

  /**
   * Git push changes
   */
  async gitPush(remote = 'origin', branch = 'main'): Promise<ExecResult> {
    return this.exec(`git push ${remote} ${branch}`);
  }

  /**
   * Factory method to create appropriate sandbox based on environment
   */
  static async create(config: SandboxConfig): Promise<TaskSandbox> {
    const useDocker = process.env.SANDBOX_MODE === 'docker' ||
                      (process.env.NODE_ENV === 'development' && await isDockerAvailable());

    const sandbox = useDocker
      ? new DockerSandbox(config)
      : new SubprocessSandbox(config);

    await sandbox.initialize();

    // Apply agent-specific toolkit if agentType is provided
    if (config.agentType) {
      await sandbox.applyToolkit(config.agentType);
    }

    return sandbox;
  }
}

/**
 * Docker-based sandbox for local development
 * Full container isolation with resource limits
 */
export class DockerSandbox extends TaskSandbox {
  private containerId: string = '';
  private imageName: string;
  private volumeName: string;

  constructor(config: SandboxConfig) {
    super(config);
    this.imageName = getAgentImage(config.agentType || 'developer');
    this.volumeName = getWorkspaceVolumeName(config.taskId);
  }

  async initialize(): Promise<void> {
    // Ensure named volume exists
    await execAsync(`docker volume create ${this.volumeName}`);

    // Create a unique container name
    const containerName = `swarmit-task-${this.taskId.slice(0, 8)}-${uuidv4().slice(0, 8)}`;

    // Start container with resource limits and named volume
    const { stdout } = await execAsync(`
      docker run -d \
        --name ${containerName} \
        --memory=512m \
        --cpus=1 \
        --network=bridge \
        --workdir=/workspace \
        -v ${this.volumeName}:/workspace \
        ${this.imageName} \
        tail -f /dev/null
    `);

    this.containerId = stdout.trim();
    this.workdir = '/workspace';

    // No need to install git or configure it — baked into base image

    // Clone repo if specified AND workspace is empty (volume may have data from previous run)
    if (this.config.repo) {
      const { stdout: fileCheck } = await this.exec('ls -A /workspace 2>/dev/null | head -1');
      if (!fileCheck.trim()) {
        await this.gitClone(this.config.repo, this.config.branch);
      }
    }
  }

  async exec(command: string, cwd?: string, onOutput?: (stream: 'stdout' | 'stderr', data: string) => void): Promise<ExecResult> {
    const workdir = cwd ? path.join(this.workdir, cwd) : this.workdir;
    const timeoutMs = this.config.timeoutMs!;

    return new Promise((resolve) => {
      const fullCommand = `docker exec -w ${workdir} ${this.containerId} sh -c "${command.replace(/"/g, '\\"')}"`;

      const child = spawn('sh', ['-c', fullCommand], {
        timeout: timeoutMs
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const maxBytes = this.config.maxOutputBytes!;

      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length < maxBytes) {
          stdout += chunk.slice(0, maxBytes - stdout.length);
        }
        onOutput?.('stdout', chunk);
      });

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length < maxBytes) {
          stderr += chunk.slice(0, maxBytes - stderr.length);
        }
        onOutput?.('stderr', chunk);
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? (timedOut ? 124 : 1),
          timedOut
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          timedOut: false
        });
      });
    });
  }

  async readFile(filePath: string): Promise<string> {
    const result = await this.exec(`cat "${filePath}"`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }
    return result.stdout;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    // Create directory if needed
    const dir = path.dirname(filePath);
    await this.exec(`mkdir -p "${dir}"`);
    
    // Write content using heredoc
    const escapedContent = content.replace(/'/g, "'\\''");
    const result = await this.exec(`cat > "${filePath}" << 'SWARMIT_EOF'\n${escapedContent}\nSWARMIT_EOF`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.stderr}`);
    }
  }

  async listFiles(dir?: string): Promise<string[]> {
    const targetDir = dir ? path.join(this.workdir, dir) : this.workdir;
    const result = await this.exec(`find "${targetDir}" -type f -name "*" | head -100`);
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout.split('\n').filter(Boolean);
  }

  async saveSnapshot(excludeDirs: string[] = ['node_modules', '.git']): Promise<Buffer> {
    const excludeArgs = excludeDirs.map(d => `--exclude=${d}`).join(' ');
    const result = await this.exec(`tar czf /tmp/snapshot.tar.gz ${excludeArgs} -C ${this.workdir} .`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create snapshot: ${result.stderr}`);
    }
    const catResult = await execAsync(`docker exec ${this.containerId} cat /tmp/snapshot.tar.gz`, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 });
    return catResult.stdout as unknown as Buffer;
  }

  async restoreSnapshot(snapshot: Buffer): Promise<void> {
    const tmpFile = path.join(os.tmpdir(), `restore-${uuidv4().slice(0, 8)}.tar.gz`);
    await fs.writeFile(tmpFile, snapshot);
    try {
      await execAsync(`docker cp ${tmpFile} ${this.containerId}:/tmp/restore.tar.gz`);
      const result = await this.exec(`tar xzf /tmp/restore.tar.gz -C ${this.workdir}`);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to restore snapshot: ${result.stderr}`);
      }
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async cleanup(): Promise<void> {
    // Remove container but KEEP the volume (workspace persists for future runs)
    if (this.containerId) {
      try {
        await execAsync(`docker rm -f ${this.containerId}`);
      } catch (e) {
        console.error('Failed to cleanup container:', e);
      }
    }
  }
}

/**
 * Clean up a task's workspace volume when the task is completed or deleted
 */
export async function cleanupTaskVolume(taskId: string): Promise<void> {
  const volumeName = getWorkspaceVolumeName(taskId);
  await execAsync(`docker volume rm ${volumeName}`).catch(() => {});
}

/**
 * Subprocess-based sandbox for Railway/production
 * Lightweight temp directory isolation
 */
export class SubprocessSandbox extends TaskSandbox {
  private toolkitEnvVars: Record<string, string> = {};

  async initialize(): Promise<void> {
    // Create temp directory for this task
    const tmpBase = os.tmpdir();
    this.workdir = path.join(tmpBase, `swarmit-${this.taskId.slice(0, 8)}-${uuidv4().slice(0, 8)}`);

    await fs.mkdir(this.workdir, { recursive: true });

    // Apply toolkit env vars if agentType is specified
    if (this.config.agentType) {
      const toolkit = AGENT_TOOLKITS[this.config.agentType];
      if (toolkit?.envVars) {
        this.toolkitEnvVars = toolkit.envVars;
      }
    }

    // Clone repo if specified
    if (this.config.repo) {
      await this.gitClone(this.config.repo, this.config.branch);
    }
  }

  async exec(command: string, cwd?: string, onOutput?: (stream: 'stdout' | 'stderr', data: string) => void): Promise<ExecResult> {
    const workdir = cwd ? path.join(this.workdir, cwd) : this.workdir;
    const timeoutMs = this.config.timeoutMs!;

    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', command], {
        cwd: workdir,
        env: {
          ...process.env,
          ...this.toolkitEnvVars,
          PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/bin',
          HOME: this.workdir,
        }
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const maxBytes = this.config.maxOutputBytes!;

      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length < maxBytes) {
          stdout += chunk.slice(0, maxBytes - stdout.length);
        }
        onOutput?.('stdout', chunk);
      });

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length < maxBytes) {
          stderr += chunk.slice(0, maxBytes - stderr.length);
        }
        onOutput?.('stderr', chunk);
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? (timedOut ? 124 : 1),
          timedOut
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          timedOut: false
        });
      });
    });
  }

  async readFile(filePath: string): Promise<string> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.workdir, filePath);
    
    // Security: ensure path is within workdir
    if (!fullPath.startsWith(this.workdir)) {
      throw new Error('Path escape attempt detected');
    }
    
    return fs.readFile(fullPath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.workdir, filePath);
    
    // Security: ensure path is within workdir
    if (!fullPath.startsWith(this.workdir)) {
      throw new Error('Path escape attempt detected');
    }
    
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async listFiles(dir?: string): Promise<string[]> {
    const targetDir = dir ? path.join(this.workdir, dir) : this.workdir;
    
    // Security check
    if (!targetDir.startsWith(this.workdir)) {
      throw new Error('Path escape attempt detected');
    }

    const files: string[] = [];
    
    async function walk(currentDir: string, base: string) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(base, fullPath);
          
          if (entry.isDirectory()) {
            // Skip node_modules and .git
            if (entry.name !== 'node_modules' && entry.name !== '.git') {
              await walk(fullPath, base);
            }
          } else {
            files.push(relativePath);
            if (files.length >= 100) return; // Limit results
          }
        }
      } catch (e) {
        // Ignore permission errors
      }
    }

    await walk(targetDir, this.workdir);
    return files;
  }

  async saveSnapshot(excludeDirs: string[] = ['node_modules', '.git']): Promise<Buffer> {
    const excludeArgs = excludeDirs.map(d => `--exclude=${d}`).join(' ');
    const tmpFile = path.join(os.tmpdir(), `snapshot-${uuidv4().slice(0, 8)}.tar.gz`);
    const result = await this.exec(`tar czf ${tmpFile} ${excludeArgs} -C ${this.workdir} .`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create snapshot: ${result.stderr}`);
    }
    try {
      const data = await fs.readFile(tmpFile);
      if (data.length > 10 * 1024 * 1024) {
        throw new Error(`Snapshot too large: ${(data.length / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
      }
      return data;
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async restoreSnapshot(snapshot: Buffer): Promise<void> {
    const tmpFile = path.join(os.tmpdir(), `restore-${uuidv4().slice(0, 8)}.tar.gz`);
    await fs.writeFile(tmpFile, snapshot);
    try {
      const result = await this.exec(`tar xzf ${tmpFile} -C ${this.workdir}`);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to restore snapshot: ${result.stderr}`);
      }
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async cleanup(): Promise<void> {
    if (this.workdir) {
      try {
        await fs.rm(this.workdir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to cleanup sandbox directory:', e);
      }
    }
  }
}

/**
 * Check if Docker is available on this system
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}

export default TaskSandbox;
