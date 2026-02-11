import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@swarmit/logger';
import type { Sandbox, SandboxOptions } from './index.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('sandbox-docker');

export function getAgentImage(agent: { dockerImage?: string; specialization?: string }): string {
  if (agent.dockerImage) return agent.dockerImage;

  const registry = process.env.DOCKER_REGISTRY || 'ghcr.io/simonai-git';
  const tag = process.env.DOCKER_IMAGE_TAG || 'latest';
  const imageMap: Record<string, string> = {
    'product-manager': `${registry}/swarmit-product-manager:${tag}`,
    'project-manager': `${registry}/swarmit-project-manager:${tag}`,
    'backend': `${registry}/swarmit-backend:${tag}`,
    'frontend': `${registry}/swarmit-frontend:${tag}`,
    'qa': `${registry}/swarmit-qa:${tag}`,
    'reviewer': `${registry}/swarmit-reviewer:${tag}`,
    'ai-ml': `${registry}/swarmit-ai-ml:${tag}`,
    'fullstack': `${registry}/swarmit-fullstack:${tag}`,
    'devops': `${registry}/swarmit-devops:${tag}`,
  };
  return imageMap[agent.specialization || ''] || `${registry}/swarmit-fullstack:${tag}`;
}

export class DockerSandbox implements Sandbox {
  private containerId: string | null = null;
  private options: SandboxOptions;

  constructor(options: SandboxOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    const image = getAgentImage({
      dockerImage: this.options.dockerImage,
      specialization: this.options.specialization,
    });

    const envArgs: string[] = [];
    for (const [key, value] of Object.entries(this.options.envVars || {})) {
      envArgs.push('-e', `${key}=${value}`);
    }

    const name = `swarmit-${randomUUID().slice(0, 8)}`;
    const { stdout } = await execFileAsync('docker', [
      'run', '-d',
      '--name', name,
      '--network', 'none',
      '--memory', '512m',
      '--cpus', '1',
      '-w', this.options.workDir || '/workspace',
      ...envArgs,
      image,
      'sleep', '3600',
    ]);

    this.containerId = stdout.trim();
    logger.info({ containerId: this.containerId, image }, 'Sandbox container started');
  }

  async exec(command: string, timeout = 300000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.containerId) throw new Error('Sandbox not initialized');

    try {
      const { stdout, stderr } = await execFileAsync('docker', [
        'exec', this.containerId, 'sh', '-c', command,
      ], { timeout });

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
    if (!this.containerId) throw new Error('Sandbox not initialized');
    const encoded = Buffer.from(content).toString('base64');
    await this.exec(`echo '${encoded}' | base64 -d > ${path}`);
  }

  async readFile(path: string): Promise<string> {
    if (!this.containerId) throw new Error('Sandbox not initialized');
    const { stdout } = await this.exec(`cat ${path}`);
    return stdout;
  }

  async listFiles(dir = '.', recursive = false): Promise<string[]> {
    if (!this.containerId) throw new Error('Sandbox not initialized');
    const cmd = recursive
      ? `find ${dir} -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | sort`
      : `ls -1 ${dir}`;
    const { stdout, exitCode } = await this.exec(cmd);
    if (exitCode !== 0 || !stdout.trim()) return [];
    return stdout.trim().split('\n').filter(Boolean);
  }

  async destroy(): Promise<void> {
    if (!this.containerId) return;
    try {
      await execFileAsync('docker', ['rm', '-f', this.containerId]);
      logger.info({ containerId: this.containerId }, 'Sandbox container destroyed');
    } catch (err) {
      logger.error({ err, containerId: this.containerId }, 'Failed to destroy sandbox');
    }
    this.containerId = null;
  }
}
