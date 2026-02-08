import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockExec, mockSpawn } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    default: { ...actual, exec: mockExec, spawn: mockSpawn },
    exec: mockExec,
    spawn: mockSpawn,
  };
});

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn(),
      rm: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn(),
      access: vi.fn(),
      unlink: vi.fn(),
    },
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn(),
    rm: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn(),
  };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    default: { ...actual, tmpdir: vi.fn(() => '/tmp'), platform: vi.fn(() => 'linux') },
    tmpdir: vi.fn(() => '/tmp'),
    platform: vi.fn(() => 'linux'),
  };
});

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'abcd1234-5678-90ef-ghij-klmnopqrstuv'),
}));

import { SubprocessSandbox, AGENT_TOOLKITS, isDockerAvailable, getAgentImage, getWorkspaceVolumeName, cleanupTaskVolume } from '@/lib/sandbox';
import type { SandboxConfig } from '@/lib/sandbox';

describe('AGENT_TOOLKITS', () => {
  it('should have all required agent types', () => {
    expect(AGENT_TOOLKITS).toHaveProperty('developer');
    expect(AGENT_TOOLKITS).toHaveProperty('frontend');
    expect(AGENT_TOOLKITS).toHaveProperty('backend');
    expect(AGENT_TOOLKITS).toHaveProperty('devops');
    expect(AGENT_TOOLKITS).toHaveProperty('qa');
    expect(AGENT_TOOLKITS).toHaveProperty('reviewer');
  });

  it('should have setupCommands array for each agent type', () => {
    Object.values(AGENT_TOOLKITS).forEach(toolkit => {
      expect(Array.isArray(toolkit.setupCommands)).toBe(true);
      expect(toolkit.setupCommands.length).toBeGreaterThan(0);
    });
  });

  it('should have envVars object for each agent type', () => {
    Object.values(AGENT_TOOLKITS).forEach(toolkit => {
      expect(typeof toolkit.envVars).toBe('object');
      expect(toolkit.envVars).not.toBeNull();
    });
  });

  it('should have NODE_ENV=development for developer toolkit', () => {
    expect(AGENT_TOOLKITS.developer.envVars.NODE_ENV).toBe('development');
  });

  it('should have NODE_ENV=test and build command for QA toolkit', () => {
    expect(AGENT_TOOLKITS.qa.envVars.NODE_ENV).toBe('test');
    const hasBuildCommand = AGENT_TOOLKITS.qa.setupCommands.some(cmd =>
      cmd.includes('npm run build')
    );
    expect(hasBuildCommand).toBe(true);
  });

  it('should have CI=true for DevOps toolkit', () => {
    expect(AGENT_TOOLKITS.devops.envVars.CI).toBe('true');
  });
});

describe('SubprocessSandbox', () => {
  let sandbox: SubprocessSandbox;
  let config: SandboxConfig;

  beforeEach(async () => {
    vi.clearAllMocks();
    config = { taskId: 'test-task', timeoutMs: 5000 };
  });

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
    }
  });

  describe('initialize()', () => {
    it('should create temp directory with correct path pattern', async () => {
      const fs = await import('fs/promises');
      sandbox = new SubprocessSandbox(config);

      await sandbox.initialize();

      expect(fs.mkdir).toHaveBeenCalled();
      const mkdirCall = vi.mocked(fs.mkdir).mock.calls[0];
      expect(mkdirCall[0]).toMatch(/\/tmp\/swarmit-test-tas-abcd1234/);
      expect(mkdirCall[1]).toEqual({ recursive: true });
      expect(sandbox.getWorkdir()).toMatch(/\/tmp\/swarmit-test-tas-abcd1234/);
    });

    it('should apply toolkit env vars when agentType is set', async () => {
      config.agentType = 'qa';
      sandbox = new SubprocessSandbox(config);

      await sandbox.initialize();

      // Verify the toolkit env vars are stored (we'll check usage in exec test)
      expect(sandbox.getWorkdir()).toBeTruthy();
    });

    it('should call gitClone when repo is specified', async () => {
      const { spawn } = await import('child_process');
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'close') handler(0);
        }),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      config.repo = 'https://github.com/test/repo.git';
      config.branch = 'main';
      sandbox = new SubprocessSandbox(config);

      await sandbox.initialize();

      expect(spawn).toHaveBeenCalled();
      const spawnCall = vi.mocked(spawn).mock.calls[0];
      expect(spawnCall[1]).toEqual(expect.arrayContaining(['-c', expect.stringContaining('git clone')]));
    });
  });

  describe('exec()', () => {
    it('should spawn sh with command in workdir', async () => {
      const { spawn } = await import('child_process');
      const mockChild = {
        stdout: { on: vi.fn((event, handler) => {
          if (event === 'data') handler(Buffer.from('test output'));
        }) },
        stderr: { on: vi.fn((event, handler) => {
          if (event === 'data') handler(Buffer.from(''));
        }) },
        on: vi.fn((event, handler) => {
          if (event === 'close') handler(0);
        }),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const result = await sandbox.exec('echo test');

      expect(spawn).toHaveBeenCalledWith('sh', ['-c', 'echo test'], expect.objectContaining({
        cwd: sandbox.getWorkdir(),
        env: expect.objectContaining({
          PATH: expect.any(String),
          HOME: sandbox.getWorkdir(),
        })
      }));
      expect(result.stdout).toBe('test output');
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it('should apply toolkit env vars in exec when agentType is set', async () => {
      const { spawn } = await import('child_process');
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, handler) => {
          if (event === 'close') handler(0);
        }),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      config.agentType = 'devops';
      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await sandbox.exec('env');

      expect(spawn).toHaveBeenCalledWith('sh', ['-c', 'env'], expect.objectContaining({
        env: expect.objectContaining({
          NODE_ENV: 'production',
          CI: 'true',
          PATH: expect.any(String)
        })
      }));
    });

    it('should handle command errors', async () => {
      const { spawn } = await import('child_process');
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn((event, handler) => {
          if (event === 'data') handler(Buffer.from('command failed'));
        }) },
        on: vi.fn((event, handler) => {
          if (event === 'close') handler(1);
        }),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const result = await sandbox.exec('false');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('command failed');
    });

    it('should handle spawn errors', async () => {
      const { spawn } = await import('child_process');
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, handler) => {
          if (event === 'error') handler(new Error('spawn failed'));
        }),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const result = await sandbox.exec('invalid-command');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('spawn failed');
    });
  });

  describe('readFile()', () => {
    it('should read from within workdir with relative path', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('file content');

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const content = await sandbox.readFile('test.txt');

      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/swarmit-test-tas-abcd1234\/test\.txt/),
        'utf-8'
      );
      expect(content).toBe('file content');
    });

    it('should read from within workdir with absolute path', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('file content');

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const workdir = sandbox.getWorkdir();
      const content = await sandbox.readFile(`${workdir}/test.txt`);

      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/swarmit-test-tas-abcd1234\/test\.txt/),
        'utf-8'
      );
      expect(content).toBe('file content');
    });

    it('should throw on path escape attempt', async () => {
      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await expect(sandbox.readFile('../../../etc/passwd')).rejects.toThrow('Path escape attempt detected');
    });

    it('should throw on absolute path outside workdir', async () => {
      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await expect(sandbox.readFile('/etc/passwd')).rejects.toThrow('Path escape attempt detected');
    });
  });

  describe('writeFile()', () => {
    it('should write within workdir with relative path', async () => {
      const fs = await import('fs/promises');

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await sandbox.writeFile('test.txt', 'content');

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/swarmit-test-tas-abcd1234\/test\.txt/),
        'content',
        'utf-8'
      );
    });

    it('should create nested directories before writing', async () => {
      const fs = await import('fs/promises');

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await sandbox.writeFile('src/lib/test.ts', 'content');

      const mkdirCalls = vi.mocked(fs.mkdir).mock.calls;
      const nestedDirCall = mkdirCalls.find(call =>
        typeof call[0] === 'string' && call[0].includes('src/lib')
      );
      expect(nestedDirCall).toBeDefined();
      expect(nestedDirCall?.[1]).toEqual({ recursive: true });
    });

    it('should write within workdir with absolute path', async () => {
      const fs = await import('fs/promises');

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const workdir = sandbox.getWorkdir();
      await sandbox.writeFile(`${workdir}/test.txt`, 'content');

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/swarmit-test-tas-abcd1234\/test\.txt/),
        'content',
        'utf-8'
      );
    });

    it('should throw on path escape attempt with relative path', async () => {
      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await expect(sandbox.writeFile('../../../tmp/evil.txt', 'content')).rejects.toThrow('Path escape attempt detected');
    });

    it('should throw on path escape attempt with absolute path', async () => {
      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await expect(sandbox.writeFile('/etc/shadow', 'content')).rejects.toThrow('Path escape attempt detected');
    });
  });

  describe('listFiles()', () => {
    it('should return files from workdir', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'test.js', isDirectory: () => false, isFile: () => true } as any,
        { name: 'src', isDirectory: () => true, isFile: () => false } as any,
      ]);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const files = await sandbox.listFiles();

      expect(fs.readdir).toHaveBeenCalledWith(
        sandbox.getWorkdir(),
        { withFileTypes: true }
      );
      expect(files).toContain('file.ts');
      expect(files).toContain('test.js');
    });

    it('should recursively walk directories', async () => {
      const fs = await import('fs/promises');

      // First call: root directory
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        { name: 'root.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'src', isDirectory: () => true, isFile: () => false } as any,
      ]);

      // Second call: src directory
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        { name: 'nested.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const files = await sandbox.listFiles();

      expect(files).toContain('root.ts');
      expect(files).toContain('src/nested.ts');
    });

    it('should skip node_modules and .git directories', async () => {
      const fs = await import('fs/promises');

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'node_modules', isDirectory: () => true, isFile: () => false } as any,
        { name: '.git', isDirectory: () => true, isFile: () => false } as any,
      ]);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const files = await sandbox.listFiles();

      expect(files).toContain('file.ts');
      // Should only call readdir once (not recursing into node_modules or .git)
      expect(fs.readdir).toHaveBeenCalledTimes(1);
    });

    it('should throw on path escape attempt', async () => {
      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await expect(sandbox.listFiles('../../../etc')).rejects.toThrow('Path escape attempt detected');
    });

    it('should limit results to 100 files', async () => {
      const fs = await import('fs/promises');

      // Create more than 100 mock files
      const manyFiles = Array.from({ length: 150 }, (_, i) => ({
        name: `file${i}.ts`,
        isDirectory: () => false,
        isFile: () => true
      } as any));

      vi.mocked(fs.readdir).mockResolvedValue(manyFiles);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const files = await sandbox.listFiles();

      expect(files.length).toBeLessThanOrEqual(100);
    });

    it('should handle permission errors gracefully', async () => {
      const fs = await import('fs/promises');

      // First call succeeds
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        { name: 'file.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'restricted', isDirectory: () => true, isFile: () => false } as any,
      ]);

      // Second call (restricted dir) fails
      vi.mocked(fs.readdir).mockRejectedValueOnce(new Error('EACCES: permission denied'));

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const files = await sandbox.listFiles();

      // Should still return the accessible file
      expect(files).toContain('file.ts');
    });
  });

  describe('cleanup()', () => {
    it('should remove workdir recursively', async () => {
      const fs = await import('fs/promises');

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const workdir = sandbox.getWorkdir();
      await sandbox.cleanup();

      expect(fs.rm).toHaveBeenCalledWith(
        workdir,
        { recursive: true, force: true }
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      const fs = await import('fs/promises');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(fs.rm).mockRejectedValue(new Error('cleanup failed'));

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      await sandbox.cleanup();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to cleanup sandbox directory:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('getWorkdir()', () => {
    it('should return workdir path', async () => {
      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();

      const workdir = sandbox.getWorkdir();

      expect(workdir).toMatch(/\/tmp\/swarmit-test-tas-abcd1234/);
    });
  });

  describe('PATH and HOME env vars', () => {
    it('should inherit system PATH instead of hardcoding', async () => {
      const { spawn } = await import('child_process');
      const originalPath = process.env.PATH;
      process.env.PATH = '/custom/path:/usr/bin';

      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'close') handler(0);
        }),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();
      await sandbox.exec('echo test');

      expect(spawn).toHaveBeenCalledWith('sh', ['-c', 'echo test'], expect.objectContaining({
        env: expect.objectContaining({
          PATH: '/custom/path:/usr/bin',
        })
      }));

      process.env.PATH = originalPath;
    });

    it('should set HOME to workdir for git config', async () => {
      const { spawn } = await import('child_process');
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'close') handler(0);
        }),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      sandbox = new SubprocessSandbox(config);
      await sandbox.initialize();
      await sandbox.exec('git config user.name');

      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const env = spawnCall[2]?.env as Record<string, string>;
      expect(env.HOME).toBe(sandbox.getWorkdir());
    });
  });
});

describe('AGENT_TOOLKITS setup commands', () => {
  it('should include npm install in all toolkit setup commands', () => {
    for (const [, toolkit] of Object.entries(AGENT_TOOLKITS)) {
      const hasNpmInstall = toolkit.setupCommands.some(cmd =>
        cmd.includes('npm install')
      );
      expect(hasNpmInstall).toBe(true);
    }
  });

  it('should not include git config (baked into Docker images)', () => {
    for (const [, toolkit] of Object.entries(AGENT_TOOLKITS)) {
      for (const cmd of toolkit.setupCommands) {
        expect(cmd).not.toContain('git config');
      }
    }
  });

  it('should not suppress stderr with 2>/dev/null in setup commands', () => {
    for (const [, toolkit] of Object.entries(AGENT_TOOLKITS)) {
      for (const cmd of toolkit.setupCommands) {
        expect(cmd).not.toContain('2>/dev/null');
      }
    }
  });

  it('should not use || true to hide failures in setup commands', () => {
    for (const [, toolkit] of Object.entries(AGENT_TOOLKITS)) {
      for (const cmd of toolkit.setupCommands) {
        expect(cmd).not.toContain('|| true');
      }
    }
  });
});

describe('getAgentImage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return correct image for each agent type', () => {
    const types = ['developer', 'frontend', 'backend', 'devops', 'qa', 'reviewer'];
    for (const type of types) {
      const image = getAgentImage(type);
      expect(image).toBe(`ghcr.io/simonai-git/swarmit-${type}:latest`);
    }
  });

  it('should default to developer image for unknown agent type', () => {
    const image = getAgentImage('unknown');
    expect(image).toBe('ghcr.io/simonai-git/swarmit-developer:latest');
  });

  it('should use custom registry from env', () => {
    process.env.DOCKER_REGISTRY = 'docker.io/myuser';
    const image = getAgentImage('qa');
    expect(image).toBe('docker.io/myuser/swarmit-qa:latest');
  });

  it('should use custom tag from env', () => {
    process.env.DOCKER_IMAGE_TAG = 'v1.2.3';
    const image = getAgentImage('developer');
    expect(image).toBe('ghcr.io/simonai-git/swarmit-developer:v1.2.3');
  });

  it('should use both custom registry and tag', () => {
    process.env.DOCKER_REGISTRY = 'registry.example.com/org';
    process.env.DOCKER_IMAGE_TAG = 'abc123';
    const image = getAgentImage('frontend');
    expect(image).toBe('registry.example.com/org/swarmit-frontend:abc123');
  });
});

describe('getWorkspaceVolumeName', () => {
  it('should return volume name based on task ID', () => {
    expect(getWorkspaceVolumeName('task-123')).toBe('swarmit-workspace-task-123');
  });

  it('should handle UUID task IDs', () => {
    const taskId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(getWorkspaceVolumeName(taskId)).toBe(`swarmit-workspace-${taskId}`);
  });
});

describe('cleanupTaskVolume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call docker volume rm with correct volume name', async () => {
    const { exec } = await import('child_process');
    vi.mocked(exec).mockImplementation(((cmd: string, callback: any) => {
      callback(null, { stdout: '', stderr: '' });
      return {} as any;
    }) as any);

    await cleanupTaskVolume('task-456');

    expect(exec).toHaveBeenCalledWith(
      'docker volume rm swarmit-workspace-task-456',
      expect.any(Function)
    );
  });

  it('should not throw when docker volume rm fails', async () => {
    const { exec } = await import('child_process');
    vi.mocked(exec).mockImplementation(((cmd: string, callback: any) => {
      callback(new Error('volume not found'), null);
      return {} as any;
    }) as any);

    // Should not throw
    await expect(cleanupTaskVolume('nonexistent')).resolves.toBeUndefined();
  });
});

describe('isDockerAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when docker info succeeds', async () => {
    const { exec } = await import('child_process');

    // Mock successful docker info
    vi.mocked(exec).mockImplementation(((cmd: string, callback: any) => {
      callback(null, { stdout: 'docker info output', stderr: '' });
      return {} as any;
    }) as any);

    const result = await isDockerAvailable();

    expect(result).toBe(true);
  });

  it('should return false when docker info fails', async () => {
    const { exec } = await import('child_process');

    // Mock failed docker info
    vi.mocked(exec).mockImplementation(((cmd: string, callback: any) => {
      callback(new Error('docker not found'), null);
      return {} as any;
    }) as any);

    const result = await isDockerAvailable();

    expect(result).toBe(false);
  });
});
