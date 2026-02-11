import { flags } from '@swarmit/shared/config';
import { DockerSandbox } from './docker.js';
import { LocalStubSandbox } from './local-stub.js';

export interface Sandbox {
  init(): Promise<void>;
  exec(command: string, timeout?: number): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  listFiles(dir?: string, recursive?: boolean): Promise<string[]>;
  destroy(): Promise<void>;
}

export interface SandboxOptions {
  dockerImage?: string;
  specialization?: string;
  workDir?: string;
  envVars?: Record<string, string>;
}

export function createSandbox(options: SandboxOptions): Sandbox {
  if (flags.SANDBOX_MODE === 'docker') {
    return new DockerSandbox(options);
  }
  return new LocalStubSandbox(options);
}

export { getAgentImage } from './docker.js';
