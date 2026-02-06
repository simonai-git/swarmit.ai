/**
 * Sandbox Tool Executor
 * 
 * Implements the ToolExecutor interface using TaskSandbox
 * Bridges Claude's tool calls to sandboxed execution
 */

import TaskSandbox, { SandboxConfig } from './sandbox';
import { ToolExecutor } from './claude';

export class SandboxToolExecutor implements ToolExecutor {
  private sandbox: TaskSandbox;
  private initialized = false;

  constructor(sandbox: TaskSandbox) {
    this.sandbox = sandbox;
    this.initialized = true;
  }

  /**
   * Create a new executor with its own sandbox
   */
  static async create(config: SandboxConfig): Promise<SandboxToolExecutor> {
    const sandbox = await TaskSandbox.create(config);
    return new SandboxToolExecutor(sandbox);
  }

  async execCommand(command: string, workdir?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.ensureInitialized();
    const result = await this.sandbox.exec(command, workdir);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
  }

  async readFile(path: string): Promise<string> {
    this.ensureInitialized();
    return this.sandbox.readFile(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.ensureInitialized();
    await this.sandbox.writeFile(path, content);
  }

  async listFiles(path: string, recursive?: boolean): Promise<string[]> {
    this.ensureInitialized();
    // The sandbox listFiles already handles recursion internally
    return this.sandbox.listFiles(path);
  }

  async gitCommit(message: string, files?: string[]): Promise<string> {
    this.ensureInitialized();
    
    // Stage files
    if (files && files.length > 0) {
      for (const file of files) {
        await this.sandbox.exec(`git add "${file}"`);
      }
    } else {
      await this.sandbox.exec('git add -A');
    }

    // Commit
    const result = await this.sandbox.exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Git commit failed: ${result.stderr}`);
    }

    // Get the commit SHA
    const shaResult = await this.sandbox.exec('git rev-parse HEAD');
    return shaResult.stdout.trim().slice(0, 8);
  }

  async gitPush(branch?: string): Promise<void> {
    this.ensureInitialized();
    
    const branchArg = branch || 'HEAD';
    const result = await this.sandbox.exec(`git push origin ${branchArg}`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Git push failed: ${result.stderr}`);
    }
  }

  /**
   * Search file contents using grep
   */
  async search(pattern: string, path?: string, mode: 'content' | 'files_with_matches' | 'count' = 'content'): Promise<string> {
    this.ensureInitialized();
    const dir = path || '.';
    const flag = mode === 'files_with_matches' ? 'l' : mode === 'count' ? 'c' : 'n';
    const result = await this.sandbox.exec(
      `grep -r${flag} "${pattern.replace(/"/g, '\\"')}" "${dir}" 2>/dev/null | head -100`
    );
    return result.stdout || 'No matches found';
  }

  /**
   * Edit a file with precise string replacement
   */
  async editFile(filePath: string, oldString: string, newString: string): Promise<string> {
    this.ensureInitialized();
    const content = await this.sandbox.readFile(filePath);
    if (!content.includes(oldString)) {
      throw new Error(`old_string not found in ${filePath}`);
    }
    const updated = content.replace(oldString, newString);
    await this.sandbox.writeFile(filePath, updated);
    return `Edited: ${filePath}`;
  }

  /**
   * Find files matching a glob pattern
   */
  async glob(pattern: string, path?: string): Promise<string[]> {
    this.ensureInitialized();
    const dir = path || '.';
    const files = await this.sandbox.listFiles(dir);
    const regex = new RegExp(
      pattern.replace(/\*\*/g, '___DOUBLESTAR___')
        .replace(/\*/g, '[^/]*')
        .replace(/___DOUBLESTAR___/g, '.*')
        .replace(/\?/g, '.')
    );
    return files.filter(f => regex.test(f));
  }

  /**
   * Get the sandbox working directory
   */
  getWorkdir(): string {
    return this.sandbox.getWorkdir();
  }

  /**
   * Cleanup the sandbox
   */
  async cleanup(): Promise<void> {
    if (this.initialized) {
      await this.sandbox.cleanup();
      this.initialized = false;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Sandbox executor not initialized or already cleaned up');
    }
  }
}

export default SandboxToolExecutor;
