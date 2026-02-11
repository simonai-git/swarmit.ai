import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync } from 'node:fs';

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@swarmit/shared/config', () => ({
  flags: { SANDBOX_MODE: 'stub' },
}));

import { createSandbox } from '../index.js';
import { LocalStubSandbox } from '../local-stub.js';
import { getAgentImage } from '../docker.js';

describe('getAgentImage', () => {
  it('returns custom dockerImage if set', () => {
    const image = getAgentImage({ dockerImage: 'my-custom-image:v2' });
    expect(image).toBe('my-custom-image:v2');
  });

  it('returns correct image for backend specialization', () => {
    const image = getAgentImage({ specialization: 'backend' });
    expect(image).toBe('ghcr.io/simonai-git/swarmit-backend:latest');
  });

  it('returns correct image for frontend specialization', () => {
    const image = getAgentImage({ specialization: 'frontend' });
    expect(image).toBe('ghcr.io/simonai-git/swarmit-frontend:latest');
  });

  it('returns correct image for qa specialization', () => {
    const image = getAgentImage({ specialization: 'qa' });
    expect(image).toBe('ghcr.io/simonai-git/swarmit-qa:latest');
  });

  it('returns correct image for devops specialization', () => {
    const image = getAgentImage({ specialization: 'devops' });
    expect(image).toBe('ghcr.io/simonai-git/swarmit-devops:latest');
  });

  it('falls back to swarmit-fullstack for unknown specialization', () => {
    const image = getAgentImage({ specialization: 'unknown-thing' });
    expect(image).toBe('ghcr.io/simonai-git/swarmit-fullstack:latest');
  });

  it('falls back to swarmit-fullstack when no specialization given', () => {
    const image = getAgentImage({});
    expect(image).toBe('ghcr.io/simonai-git/swarmit-fullstack:latest');
  });

  it('prefers dockerImage over specialization', () => {
    const image = getAgentImage({
      dockerImage: 'custom:1.0',
      specialization: 'backend',
    });
    expect(image).toBe('custom:1.0');
  });
});

describe('createSandbox', () => {
  it('returns LocalStubSandbox when SANDBOX_MODE=stub', () => {
    const sandbox = createSandbox({});
    expect(sandbox).toBeInstanceOf(LocalStubSandbox);
  });
});

describe('LocalStubSandbox', () => {
  let sandbox: LocalStubSandbox;

  afterEach(async () => {
    if (sandbox) {
      try {
        await sandbox.destroy();
      } catch {
        // ignore
      }
    }
  });

  it('init creates a temp directory', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    const result = await sandbox.exec('pwd');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toContain('swarmit-');
  });

  it('exec runs shell commands and returns stdout/stderr/exitCode', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    const result = await sandbox.exec('echo hello world');
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('exec returns non-zero exit code for failed commands', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    const result = await sandbox.exec('exit 42');
    expect(result.exitCode).not.toBe(0);
  });

  it('exec returns stderr for commands that write to stderr', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    const result = await sandbox.exec('echo error-msg >&2');
    expect(result.stderr).toContain('error-msg');
  });

  it('exec throws if sandbox is not initialized', async () => {
    sandbox = new LocalStubSandbox({});

    await expect(sandbox.exec('echo hi')).rejects.toThrow(
      'Sandbox not initialized'
    );
  });

  it('writeFile writes content and readFile reads it back', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    await sandbox.writeFile('test.txt', 'hello world content');
    const content = await sandbox.readFile('test.txt');
    expect(content).toBe('hello world content');
  });

  it('writeFile + readFile handles multi-line content', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    const multiLine = 'line1\nline2\nline3\n';
    await sandbox.writeFile('multi.txt', multiLine);
    const content = await sandbox.readFile('multi.txt');
    expect(content).toBe(multiLine);
  });

  it('readFile throws for non-existent file', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    await expect(sandbox.readFile('does-not-exist.txt')).rejects.toThrow();
  });

  it('listFiles lists directory contents (non-recursive)', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    await sandbox.writeFile('a.txt', 'aaa');
    await sandbox.writeFile('b.txt', 'bbb');
    await sandbox.exec('mkdir sub');

    const files = await sandbox.listFiles();
    expect(files).toContain('a.txt');
    expect(files).toContain('b.txt');
    expect(files).toContain('sub');
  });

  it('listFiles lists files recursively', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    await sandbox.exec('mkdir -p nested/deep');
    await sandbox.writeFile('top.txt', 'top');
    await sandbox.writeFile('nested/mid.txt', 'mid');
    await sandbox.writeFile('nested/deep/bottom.txt', 'bottom');

    const files = await sandbox.listFiles('.', true);
    const fileNames = files.map((f) => f.split('/').pop());
    expect(fileNames).toContain('top.txt');
    expect(fileNames).toContain('mid.txt');
    expect(fileNames).toContain('bottom.txt');
  });

  it('listFiles returns empty array for non-existent directory', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    const files = await sandbox.listFiles('nonexistent');
    expect(files).toEqual([]);
  });

  it('destroy removes the temp directory', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    const { stdout } = await sandbox.exec('pwd');
    const workDir = stdout.trim();

    expect(existsSync(workDir)).toBe(true);

    await sandbox.destroy();

    expect(existsSync(workDir)).toBe(false);
  });

  it('destroy can be called multiple times safely', async () => {
    sandbox = new LocalStubSandbox({});
    await sandbox.init();

    await sandbox.destroy();
    await sandbox.destroy();
  });

  it('uses custom workDir when provided', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { realpathSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const customDir = mkdtempSync(join(tmpdir(), 'sandbox-custom-'));
    // Resolve symlinks (macOS /var -> /private/var) so pwd matches
    const resolvedDir = realpathSync(customDir);

    sandbox = new LocalStubSandbox({ workDir: customDir });
    await sandbox.init();

    const result = await sandbox.exec('pwd');
    expect(result.stdout.trim()).toBe(resolvedDir);

    await sandbox.destroy();
    expect(existsSync(customDir)).toBe(false);
  });

  it('passes envVars to executed commands', async () => {
    sandbox = new LocalStubSandbox({
      envVars: { MY_TEST_VAR: 'test_value_123' },
    });
    await sandbox.init();

    const result = await sandbox.exec('echo $MY_TEST_VAR');
    expect(result.stdout.trim()).toBe('test_value_123');
  });
});
