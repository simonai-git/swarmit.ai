import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger } from '@swarmit/logger';
import type { Sandbox, SandboxOptions } from './index.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('sandbox-stub');

export class LocalStubSandbox implements Sandbox {
  private workDir: string | null = null;
  private options: SandboxOptions;

  constructor(options: SandboxOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    this.workDir = this.options.workDir || await mkdtemp(join(tmpdir(), 'swarmit-'));
    logger.info({ workDir: this.workDir }, 'Local stub sandbox initialized');
  }

  async exec(command: string, timeout = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.workDir) throw new Error('Sandbox not initialized');

    try {
      const { stdout, stderr } = await execFileAsync('sh', ['-c', command], {
        cwd: this.workDir,
        timeout,
        env: { ...process.env, ...this.options.envVars },
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || String(err),
        exitCode: error.code || 1,
      };
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.workDir) throw new Error('Sandbox not initialized');
    const fullPath = path.startsWith('/') ? path : join(this.workDir, path);
    await writeFile(fullPath, content, 'utf-8');
  }

  async readFile(path: string): Promise<string> {
    if (!this.workDir) throw new Error('Sandbox not initialized');
    const fullPath = path.startsWith('/') ? path : join(this.workDir, path);
    return readFile(fullPath, 'utf-8');
  }

  async listFiles(dir = '.', recursive = false): Promise<string[]> {
    if (!this.workDir) throw new Error('Sandbox not initialized');
    const fullDir = dir.startsWith('/') ? dir : join(this.workDir, dir);

    if (recursive) {
      // Use find for recursive listing
      const { stdout, exitCode } = await this.exec(
        `find ${fullDir} -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | sort`
      );
      if (exitCode !== 0 || !stdout.trim()) return [];
      return stdout.trim().split('\n').filter(Boolean);
    }

    try {
      const entries = await readdir(fullDir);
      return entries;
    } catch {
      return [];
    }
  }

  async destroy(): Promise<void> {
    if (!this.workDir) return;
    try {
      await rm(this.workDir, { recursive: true, force: true });
      logger.info({ workDir: this.workDir }, 'Local stub sandbox destroyed');
    } catch (err) {
      logger.error({ err }, 'Failed to destroy stub sandbox');
    }
    this.workDir = null;
  }
}
