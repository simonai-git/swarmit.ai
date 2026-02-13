import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks
const mockExecFile = vi.hoisted(() => vi.fn());
const mockRandomUUID = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('node:crypto', () => ({
  randomUUID: mockRandomUUID,
}));

vi.mock('@swarmit/logger', () => ({
  createLogger: () => mockLogger,
}));

vi.mock('@swarmit/shared/config', () => ({
  flags: { SANDBOX_MODE: 'docker' },
}));

import { DockerSandbox, getAgentImage } from '../docker.js';
import { createSandbox } from '../index.js';

describe('getAgentImage', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns explicit dockerImage when provided', () => {
    expect(getAgentImage({ dockerImage: 'custom:v1' })).toBe('custom:v1');
  });

  it('returns explicit dockerImage even when specialization is set', () => {
    expect(
      getAgentImage({ dockerImage: 'custom:v1', specialization: 'backend' })
    ).toBe('custom:v1');
  });

  it('maps backend specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'backend' })).toBe(
      'ghcr.io/simonai-git/swarmit-backend:latest'
    );
  });

  it('maps frontend specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'frontend' })).toBe(
      'ghcr.io/simonai-git/swarmit-frontend:latest'
    );
  });

  it('maps qa specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'qa' })).toBe(
      'ghcr.io/simonai-git/swarmit-qa:latest'
    );
  });

  it('maps reviewer specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'reviewer' })).toBe(
      'ghcr.io/simonai-git/swarmit-reviewer:latest'
    );
  });

  it('maps ai-ml specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'ai-ml' })).toBe(
      'ghcr.io/simonai-git/swarmit-ai-ml:latest'
    );
  });

  it('maps fullstack specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'fullstack' })).toBe(
      'ghcr.io/simonai-git/swarmit-fullstack:latest'
    );
  });

  it('maps devops specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'devops' })).toBe(
      'ghcr.io/simonai-git/swarmit-devops:latest'
    );
  });

  it('maps product-manager specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'product-manager' })).toBe(
      'ghcr.io/simonai-git/swarmit-product-manager:latest'
    );
  });

  it('maps project-manager specialization to correct image', () => {
    expect(getAgentImage({ specialization: 'project-manager' })).toBe(
      'ghcr.io/simonai-git/swarmit-project-manager:latest'
    );
  });

  it('falls back to fullstack for unknown specialization', () => {
    expect(getAgentImage({ specialization: 'unknown' })).toBe(
      'ghcr.io/simonai-git/swarmit-fullstack:latest'
    );
  });

  it('falls back to fullstack when no specialization is given', () => {
    expect(getAgentImage({})).toBe(
      'ghcr.io/simonai-git/swarmit-fullstack:latest'
    );
  });

  it('uses custom DOCKER_REGISTRY env var', () => {
    process.env = { ...originalEnv, DOCKER_REGISTRY: 'myregistry.io/org' };
    expect(getAgentImage({ specialization: 'backend' })).toBe(
      'myregistry.io/org/swarmit-backend:latest'
    );
  });

  it('uses custom DOCKER_IMAGE_TAG env var', () => {
    process.env = { ...originalEnv, DOCKER_IMAGE_TAG: 'v2.0.0' };
    expect(getAgentImage({ specialization: 'qa' })).toBe(
      'ghcr.io/simonai-git/swarmit-qa:v2.0.0'
    );
  });

  it('uses both custom DOCKER_REGISTRY and DOCKER_IMAGE_TAG', () => {
    process.env = {
      ...originalEnv,
      DOCKER_REGISTRY: 'custom.io/team',
      DOCKER_IMAGE_TAG: 'dev',
    };
    expect(getAgentImage({ specialization: 'frontend' })).toBe(
      'custom.io/team/swarmit-frontend:dev'
    );
  });

  it('uses custom registry for fallback fullstack image', () => {
    process.env = {
      ...originalEnv,
      DOCKER_REGISTRY: 'custom.io/team',
      DOCKER_IMAGE_TAG: 'dev',
    };
    expect(getAgentImage({ specialization: 'unknown' })).toBe(
      'custom.io/team/swarmit-fullstack:dev'
    );
  });
});

describe('DockerSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  // Helper: make mockExecFile behave like a callback-style function
  // that promisify can work with. The mock returns (stdout, stderr) via callback.
  function setupExecFileSuccess(stdout = '', stderr = '') {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        ...rest: unknown[]
      ) => {
        // promisify(execFile) calls execFile(cmd, args, cb) or execFile(cmd, args, opts, cb)
        const cb =
          typeof rest[0] === 'function'
            ? (rest[0] as (err: Error | null, result: { stdout: string; stderr: string }) => void)
            : (rest[1] as (err: Error | null, result: { stdout: string; stderr: string }) => void);
        if (cb) {
          cb(null, { stdout, stderr } as unknown as never);
        }
      }
    );
  }

  function setupExecFileError(error: {
    message?: string;
    stdout?: string;
    stderr?: string;
    code?: number;
  }) {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        ...rest: unknown[]
      ) => {
        const cb =
          typeof rest[0] === 'function'
            ? (rest[0] as (err: Error | null) => void)
            : (rest[1] as (err: Error | null) => void);
        if (cb) {
          const err = Object.assign(new Error(error.message || 'Command failed'), {
            stdout: error.stdout,
            stderr: error.stderr,
            code: error.code,
          });
          cb(err);
        }
      }
    );
  }

  describe('init()', () => {
    it('creates a container with correct docker run arguments', async () => {
      setupExecFileSuccess('abc123containerid\n');

      const sandbox = new DockerSandbox({
        specialization: 'backend',
      });
      await sandbox.init();

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockExecFile.mock.calls[0];
      expect(cmd).toBe('docker');
      expect(args).toEqual([
        'run', '-d',
        '--name', 'swarmit-aaaaaaaa',
        '--network', 'none',
        '--memory', '512m',
        '--cpus', '1',
        '-w', '/workspace',
        'ghcr.io/simonai-git/swarmit-backend:latest',
        'sleep', '3600',
      ]);
    });

    it('passes env vars as docker -e arguments', async () => {
      setupExecFileSuccess('containerid\n');

      const sandbox = new DockerSandbox({
        envVars: { API_KEY: 'secret', NODE_ENV: 'test' },
      });
      await sandbox.init();

      const [, args] = mockExecFile.mock.calls[0];
      expect(args).toContain('-e');
      expect(args).toContain('API_KEY=secret');
      expect(args).toContain('NODE_ENV=test');
    });

    it('uses custom workDir', async () => {
      setupExecFileSuccess('containerid\n');

      const sandbox = new DockerSandbox({
        workDir: '/custom/path',
      });
      await sandbox.init();

      const [, args] = mockExecFile.mock.calls[0];
      expect(args).toContain('-w');
      const wIndex = args.indexOf('-w');
      expect(args[wIndex + 1]).toBe('/custom/path');
    });

    it('defaults workDir to /workspace', async () => {
      setupExecFileSuccess('containerid\n');

      const sandbox = new DockerSandbox({});
      await sandbox.init();

      const [, args] = mockExecFile.mock.calls[0];
      const wIndex = args.indexOf('-w');
      expect(args[wIndex + 1]).toBe('/workspace');
    });

    it('uses explicit dockerImage in container run', async () => {
      setupExecFileSuccess('containerid\n');

      const sandbox = new DockerSandbox({
        dockerImage: 'myimage:v3',
      });
      await sandbox.init();

      const [, args] = mockExecFile.mock.calls[0];
      expect(args).toContain('myimage:v3');
    });

    it('trims stdout to get container ID', async () => {
      setupExecFileSuccess('  abc123def  \n');

      const sandbox = new DockerSandbox({});
      await sandbox.init();

      // After init, exec should work (containerId is set)
      // Set up for exec call
      setupExecFileSuccess('output\n');
      const result = await sandbox.exec('echo test');
      expect(result.stdout).toBe('output\n');

      // Verify exec used the trimmed container ID
      const [, execArgs] = mockExecFile.mock.calls[1];
      expect(execArgs[1]).toBe('abc123def');
    });

    it('logs container start info', async () => {
      setupExecFileSuccess('containerid123\n');

      const sandbox = new DockerSandbox({ specialization: 'qa' });
      await sandbox.init();

      expect(mockLogger.info).toHaveBeenCalledWith(
        { containerId: 'containerid123', image: 'ghcr.io/simonai-git/swarmit-qa:latest' },
        'Sandbox container started'
      );
    });
  });

  describe('exec()', () => {
    it('throws when sandbox is not initialized', async () => {
      const sandbox = new DockerSandbox({});

      await expect(sandbox.exec('echo hi')).rejects.toThrow('Sandbox not initialized');
    });

    it('runs docker exec with the correct arguments', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('hello world\n', '');
      const result = await sandbox.exec('echo hello world');

      expect(result).toEqual({
        stdout: 'hello world\n',
        stderr: '',
        exitCode: 0,
      });

      // Second call (index 1) should be docker exec
      const [cmd, args, opts] = mockExecFile.mock.calls[1];
      expect(cmd).toBe('docker');
      expect(args).toEqual(['exec', 'containerid', 'sh', '-c', 'echo hello world']);
      expect(opts).toEqual({ timeout: 300000 });
    });

    it('uses custom timeout', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('output\n');
      await sandbox.exec('ls', 5000);

      const [, , opts] = mockExecFile.mock.calls[1];
      expect(opts).toEqual({ timeout: 5000 });
    });

    it('handles exec errors with stdout and stderr', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileError({
        message: 'Command failed',
        stdout: 'partial output',
        stderr: 'error message',
        code: 2,
      });

      const result = await sandbox.exec('bad command');
      expect(result).toEqual({
        stdout: 'partial output',
        stderr: 'error message',
        exitCode: 2,
      });
    });

    it('handles exec errors without stdout/stderr fields', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileError({
        message: 'ENOENT',
      });

      const result = await sandbox.exec('nonexistent-cmd');
      expect(result).toEqual({
        stdout: '',
        stderr: expect.stringContaining('ENOENT'),
        exitCode: 1,
      });
    });

    it('handles exec error with code 0 falling back to exitCode 1', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileError({
        message: 'fail',
        stdout: '',
        stderr: 'oops',
        code: 0,
      });

      const result = await sandbox.exec('fail');
      // code 0 is falsy, so it falls back to 1
      expect(result.exitCode).toBe(1);
    });
  });

  describe('writeFile()', () => {
    it('throws when sandbox is not initialized', async () => {
      const sandbox = new DockerSandbox({});
      await expect(sandbox.writeFile('/tmp/test', 'content')).rejects.toThrow(
        'Sandbox not initialized'
      );
    });

    it('encodes content to base64 and writes via exec', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('', '');
      await sandbox.writeFile('/workspace/test.txt', 'hello world');

      // The exec call should use base64 encoding
      const [, args] = mockExecFile.mock.calls[1];
      const command = args[args.length - 1]; // the sh -c argument is at index 4
      // Actually args is ['exec', 'containerid', 'sh', '-c', command]
      const shCommand = args[3] === '-c' ? args[4] : args[args.length - 1];

      const encoded = Buffer.from('hello world').toString('base64');
      expect(shCommand).toContain(encoded);
      expect(shCommand).toContain('base64 -d');
      expect(shCommand).toContain('/workspace/test.txt');
    });
  });

  describe('readFile()', () => {
    it('throws when sandbox is not initialized', async () => {
      const sandbox = new DockerSandbox({});
      await expect(sandbox.readFile('/tmp/test')).rejects.toThrow(
        'Sandbox not initialized'
      );
    });

    it('reads file via cat command and returns stdout', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('file contents\n', '');
      const content = await sandbox.readFile('/workspace/test.txt');

      expect(content).toBe('file contents\n');

      // Verify the cat command was used
      const [, args] = mockExecFile.mock.calls[1];
      const shCommand = args[4];
      expect(shCommand).toBe('cat /workspace/test.txt');
    });
  });

  describe('listFiles()', () => {
    it('throws when sandbox is not initialized', async () => {
      const sandbox = new DockerSandbox({});
      await expect(sandbox.listFiles()).rejects.toThrow('Sandbox not initialized');
    });

    it('lists files non-recursively using ls -1', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('file1.txt\nfile2.txt\ndir1\n', '');
      const files = await sandbox.listFiles('/workspace');

      expect(files).toEqual(['file1.txt', 'file2.txt', 'dir1']);

      const [, args] = mockExecFile.mock.calls[1];
      const shCommand = args[4];
      expect(shCommand).toBe('ls -1 /workspace');
    });

    it('lists files recursively using find', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('/workspace/a.txt\n/workspace/sub/b.txt\n', '');
      const files = await sandbox.listFiles('/workspace', true);

      expect(files).toEqual(['/workspace/a.txt', '/workspace/sub/b.txt']);

      const [, args] = mockExecFile.mock.calls[1];
      const shCommand = args[4];
      expect(shCommand).toContain('find /workspace -type f');
      expect(shCommand).toContain('node_modules');
      expect(shCommand).toContain('.git');
      expect(shCommand).toContain('sort');
    });

    it('uses default dir "." when not specified', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('file.txt\n', '');
      await sandbox.listFiles();

      const [, args] = mockExecFile.mock.calls[1];
      const shCommand = args[4];
      expect(shCommand).toBe('ls -1 .');
    });

    it('returns empty array when exitCode is non-zero', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileError({ message: 'not found', code: 1, stdout: '', stderr: 'error' });
      const files = await sandbox.listFiles('/nonexistent');

      expect(files).toEqual([]);
    });

    it('returns empty array when stdout is empty', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('', '');
      const files = await sandbox.listFiles('/empty-dir');

      expect(files).toEqual([]);
    });

    it('returns empty array when stdout is only whitespace', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('  \n  \n', '');
      const files = await sandbox.listFiles('/empty-dir');

      expect(files).toEqual([]);
    });
  });

  describe('destroy()', () => {
    it('does nothing when container was never created', async () => {
      const sandbox = new DockerSandbox({});
      await sandbox.destroy();

      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('removes container with docker rm -f', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('', '');
      await sandbox.destroy();

      // Second call should be docker rm -f
      const [cmd, args] = mockExecFile.mock.calls[1];
      expect(cmd).toBe('docker');
      expect(args).toEqual(['rm', '-f', 'containerid']);
    });

    it('logs container destruction', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('', '');
      await sandbox.destroy();

      expect(mockLogger.info).toHaveBeenCalledWith(
        { containerId: 'containerid' },
        'Sandbox container destroyed'
      );
    });

    it('handles destroy errors gracefully', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileError({ message: 'No such container' });
      // Should not throw
      await sandbox.destroy();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          containerId: 'containerid',
        }),
        'Failed to destroy sandbox'
      );
    });

    it('sets containerId to null after destroy', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('', '');
      await sandbox.destroy();

      // Subsequent exec should throw "not initialized"
      await expect(sandbox.exec('echo hi')).rejects.toThrow('Sandbox not initialized');
    });

    it('sets containerId to null even after destroy error', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileError({ message: 'failed' });
      await sandbox.destroy();

      // containerId should be null now
      await expect(sandbox.exec('echo hi')).rejects.toThrow('Sandbox not initialized');
    });

    it('is a noop when called multiple times', async () => {
      setupExecFileSuccess('containerid\n');
      const sandbox = new DockerSandbox({});
      await sandbox.init();

      setupExecFileSuccess('', '');
      await sandbox.destroy();
      await sandbox.destroy();

      // docker rm should only have been called once (call index 1)
      // call 0 = docker run, call 1 = docker rm
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });
  });
});

describe('createSandbox', () => {
  it('returns DockerSandbox when SANDBOX_MODE=docker', () => {
    const sandbox = createSandbox({ specialization: 'backend' });
    expect(sandbox).toBeInstanceOf(DockerSandbox);
  });

  it('passes options through to DockerSandbox', () => {
    const opts = {
      dockerImage: 'custom:v1',
      specialization: 'qa',
      workDir: '/custom',
      envVars: { KEY: 'val' },
    };
    const sandbox = createSandbox(opts);
    expect(sandbox).toBeInstanceOf(DockerSandbox);
  });
});
