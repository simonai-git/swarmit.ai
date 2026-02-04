import { spawn, exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(execCallback);

// Execution result from sandbox
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Sandbox configuration
export interface SandboxConfig {
  repo?: string;           // Git repository to clone
  branch?: string;         // Branch to checkout (default: main)
  taskId: string;          // Task ID for naming
  timeout?: number;        // Execution timeout in ms (default: 300000 = 5min)
  memoryLimit?: string;    // Docker memory limit (default: 2g)
  cpuLimit?: string;       // Docker CPU limit (default: 1)
  networkEnabled?: boolean; // Enable network access (default: true)
  env?: Record<string, string>; // Environment variables
}

// Docker image for sandbox
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'node:20-alpine';

// Base directory for sandbox workspaces (host)
const SANDBOX_BASE = process.env.SANDBOX_BASE || '/tmp/swarmit-sandboxes';

/**
 * TaskSandbox - Isolated Docker container for task execution
 */
export class TaskSandbox {
  public containerId: string = '';
  public workdir: string;
  public taskId: string;
  
  private config: SandboxConfig;
  private isRunning: boolean = false;
  private hostWorkdir: string;

  constructor(config: SandboxConfig) {
    this.config = {
      timeout: 300000,
      memoryLimit: '2g',
      cpuLimit: '1',
      networkEnabled: true,
      branch: 'main',
      ...config,
    };
    this.taskId = config.taskId;
    this.hostWorkdir = path.join(SANDBOX_BASE, `task-${config.taskId}-${uuidv4().slice(0, 8)}`);
    this.workdir = '/workspace';
  }

  /**
   * Create and start the sandbox container
   */
  static async create(config: SandboxConfig): Promise<TaskSandbox> {
    const sandbox = new TaskSandbox(config);
    await sandbox.start();
    return sandbox;
  }

  /**
   * Start the sandbox container
   */
  async start(): Promise<void> {
    // Create host workspace directory
    await fs.mkdir(this.hostWorkdir, { recursive: true });

    // Build docker run command
    const args = [
      'run',
      '-d', // Detached
      '--name', `swarmit-${this.taskId.slice(0, 8)}-${Date.now()}`,
      '--memory', this.config.memoryLimit!,
      '--cpus', this.config.cpuLimit!,
      '-v', `${this.hostWorkdir}:${this.workdir}`,
      '-w', this.workdir,
    ];

    // Network configuration
    if (!this.config.networkEnabled) {
      args.push('--network', 'none');
    }

    // Environment variables
    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // Add common tools and keep container alive
    args.push(SANDBOX_IMAGE, 'sh', '-c', 'apk add --no-cache git curl && tail -f /dev/null');

    try {
      const { stdout } = await execAsync(`docker ${args.join(' ')}`);
      this.containerId = stdout.trim();
      this.isRunning = true;
      console.log(`[Sandbox] Started container ${this.containerId.slice(0, 12)} for task ${this.taskId}`);

      // Clone repository if specified
      if (this.config.repo) {
        await this.gitClone(this.config.repo, this.config.branch);
      }
    } catch (error) {
      throw new Error(`Failed to start sandbox: ${error}`);
    }
  }

  /**
   * Execute a command in the sandbox
   */
  async exec(command: string, options: { timeout?: number; cwd?: string } = {}): Promise<ExecResult> {
    if (!this.isRunning) {
      throw new Error('Sandbox is not running');
    }

    const timeout = options.timeout || this.config.timeout!;
    const workdir = options.cwd || this.workdir;

    return new Promise((resolve, reject) => {
      const dockerExec = spawn('docker', [
        'exec',
        '-w', workdir,
        this.containerId,
        'sh', '-c', command,
      ]);

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        dockerExec.kill('SIGKILL');
      }, timeout);

      dockerExec.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      dockerExec.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      dockerExec.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          resolve({
            stdout,
            stderr: stderr + '\n[TIMEOUT] Command exceeded time limit',
            exitCode: 124,
          });
        } else {
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 0,
          });
        }
      });

      dockerExec.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(filePath: string): Promise<string> {
    const result = await this.exec(`cat "${filePath}"`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }
    return result.stdout;
  }

  /**
   * Write a file to the sandbox
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    // Create directory if needed
    const dir = path.dirname(filePath);
    await this.exec(`mkdir -p "${dir}"`);

    // Write content using base64 to handle special characters
    const base64Content = Buffer.from(content).toString('base64');
    const result = await this.exec(`echo "${base64Content}" | base64 -d > "${filePath}"`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.stderr}`);
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(dirPath: string, recursive: boolean = false): Promise<string[]> {
    const cmd = recursive ? `find "${dirPath}" -type f` : `ls -1 "${dirPath}"`;
    const result = await this.exec(cmd);
    
    if (result.exitCode !== 0) {
      return [];
    }
    
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Clone a git repository
   */
  async gitClone(repo: string, branch: string = 'main'): Promise<void> {
    // Add GitHub token if available for private repos
    const githubToken = process.env.GITHUB_TOKEN;
    let cloneUrl = repo;
    
    if (githubToken && repo.includes('github.com')) {
      cloneUrl = repo.replace('https://github.com/', `https://${githubToken}@github.com/`);
    }

    const result = await this.exec(`git clone --branch ${branch} --depth 1 ${cloneUrl} .`, {
      timeout: 120000, // 2 minutes for clone
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to clone repository: ${result.stderr}`);
    }

    // Configure git
    await this.exec('git config user.email "agent@swarmit.ai"');
    await this.exec('git config user.name "SwarmIt Agent"');

    console.log(`[Sandbox] Cloned ${repo} into sandbox`);
  }

  /**
   * Commit changes
   */
  async gitCommit(message: string, files?: string[]): Promise<string> {
    // Stage files
    if (files && files.length > 0) {
      const result = await this.exec(`git add ${files.map(f => `"${f}"`).join(' ')}`);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to stage files: ${result.stderr}`);
      }
    } else {
      await this.exec('git add -A');
    }

    // Commit
    const result = await this.exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    if (result.exitCode !== 0) {
      // Check if there's nothing to commit
      if (result.stdout.includes('nothing to commit')) {
        return 'nothing-to-commit';
      }
      throw new Error(`Failed to commit: ${result.stderr}`);
    }

    // Get commit SHA
    const shaResult = await this.exec('git rev-parse HEAD');
    return shaResult.stdout.trim();
  }

  /**
   * Push changes to remote
   */
  async gitPush(branch?: string): Promise<void> {
    const targetBranch = branch || 'main';
    const result = await this.exec(`git push origin ${targetBranch}`, {
      timeout: 60000, // 1 minute for push
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to push: ${result.stderr}`);
    }

    console.log(`[Sandbox] Pushed to ${targetBranch}`);
  }

  /**
   * Install npm dependencies
   */
  async npmInstall(): Promise<ExecResult> {
    return this.exec('npm install', { timeout: 180000 }); // 3 minutes
  }

  /**
   * Run npm script
   */
  async npmRun(script: string): Promise<ExecResult> {
    return this.exec(`npm run ${script}`);
  }

  /**
   * Check if sandbox is running
   */
  async isAlive(): Promise<boolean> {
    if (!this.containerId) return false;
    
    try {
      const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${this.containerId}`);
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Stop and remove the sandbox container
   */
  async cleanup(): Promise<void> {
    if (!this.containerId) return;

    try {
      // Stop container
      await execAsync(`docker stop ${this.containerId}`).catch(() => {});
      
      // Remove container
      await execAsync(`docker rm -f ${this.containerId}`).catch(() => {});
      
      // Remove host workspace
      await fs.rm(this.hostWorkdir, { recursive: true, force: true }).catch(() => {});

      this.isRunning = false;
      console.log(`[Sandbox] Cleaned up container ${this.containerId.slice(0, 12)}`);
    } catch (error) {
      console.error(`[Sandbox] Cleanup error:`, error);
    }
  }

  /**
   * Get container logs
   */
  async getLogs(tail: number = 100): Promise<string> {
    if (!this.containerId) return '';
    
    try {
      const { stdout } = await execAsync(`docker logs --tail ${tail} ${this.containerId}`);
      return stdout;
    } catch {
      return '';
    }
  }
}

/**
 * Cleanup all orphaned sandbox containers
 */
export async function cleanupOrphanedSandboxes(): Promise<void> {
  try {
    // Find all swarmit containers
    const { stdout } = await execAsync('docker ps -a --filter "name=swarmit-" --format "{{.ID}}"');
    const containerIds = stdout.trim().split('\n').filter(Boolean);

    for (const id of containerIds) {
      await execAsync(`docker rm -f ${id}`).catch(() => {});
    }

    // Cleanup sandbox directories
    await fs.rm(SANDBOX_BASE, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(SANDBOX_BASE, { recursive: true }).catch(() => {});

    console.log(`[Sandbox] Cleaned up ${containerIds.length} orphaned containers`);
  } catch (error) {
    console.error('[Sandbox] Orphan cleanup error:', error);
  }
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}
