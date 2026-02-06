import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the sandbox module
vi.mock('@/lib/sandbox', () => {
  const mockSandbox = {
    exec: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    listFiles: vi.fn(),
    cleanup: vi.fn(),
    getWorkdir: vi.fn(() => '/tmp/test-workdir'),
    gitClone: vi.fn(),
    gitCommit: vi.fn(),
    gitPush: vi.fn(),
    applyToolkit: vi.fn(),
    initialize: vi.fn(),
  };
  return {
    default: {
      create: vi.fn().mockResolvedValue(mockSandbox),
    },
    __mockSandbox: mockSandbox,
  };
});

import { SandboxToolExecutor } from '@/lib/sandbox-executor';
import type { TaskSandbox, ExecResult } from '@/lib/sandbox';

describe('SandboxToolExecutor', () => {
  let executor: SandboxToolExecutor;
  let mockSandbox: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSandbox = {
      exec: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      listFiles: vi.fn(),
      cleanup: vi.fn(),
      getWorkdir: vi.fn(() => '/tmp/test-workdir'),
      gitClone: vi.fn(),
      gitCommit: vi.fn(),
      gitPush: vi.fn(),
      applyToolkit: vi.fn(),
      initialize: vi.fn(),
    };

    executor = new SandboxToolExecutor(mockSandbox as unknown as TaskSandbox);
  });

  describe('constructor', () => {
    it('should set initialized flag to true', async () => {
      const newExecutor = new SandboxToolExecutor(mockSandbox as unknown as TaskSandbox);

      // Verify by calling a method that requires initialization (should not throw "not initialized")
      mockSandbox.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, timedOut: false });
      await expect(newExecutor.execCommand('echo test')).resolves.not.toThrow();
    });
  });

  describe('execCommand', () => {
    it('should delegate to sandbox.exec and return result', async () => {
      const mockResult: ExecResult = {
        stdout: 'command output',
        stderr: '',
        exitCode: 0,
        timedOut: false
      };
      mockSandbox.exec.mockResolvedValue(mockResult);

      const result = await executor.execCommand('echo test');

      expect(mockSandbox.exec).toHaveBeenCalledWith('echo test', undefined, undefined);
      expect(result).toEqual({
        stdout: 'command output',
        stderr: '',
        exitCode: 0
      });
    });

    it('should pass workdir to sandbox.exec', async () => {
      const mockResult: ExecResult = {
        stdout: 'output',
        stderr: '',
        exitCode: 0,
        timedOut: false
      };
      mockSandbox.exec.mockResolvedValue(mockResult);

      await executor.execCommand('ls', './src');

      expect(mockSandbox.exec).toHaveBeenCalledWith('ls', './src', undefined);
    });

    it('should return stderr and exitCode on command failure', async () => {
      const mockResult: ExecResult = {
        stdout: '',
        stderr: 'command not found',
        exitCode: 127,
        timedOut: false
      };
      mockSandbox.exec.mockResolvedValue(mockResult);

      const result = await executor.execCommand('invalid-cmd');

      expect(result.exitCode).toBe(127);
      expect(result.stderr).toBe('command not found');
    });
  });

  describe('readFile', () => {
    it('should delegate to sandbox.readFile', async () => {
      mockSandbox.readFile.mockResolvedValue('file content');

      const content = await executor.readFile('test.txt');

      expect(mockSandbox.readFile).toHaveBeenCalledWith('test.txt');
      expect(content).toBe('file content');
    });

    it('should propagate errors from sandbox', async () => {
      mockSandbox.readFile.mockRejectedValue(new Error('File not found'));

      await expect(executor.readFile('missing.txt')).rejects.toThrow('File not found');
    });
  });

  describe('writeFile', () => {
    it('should delegate to sandbox.writeFile', async () => {
      mockSandbox.writeFile.mockResolvedValue(undefined);

      await executor.writeFile('test.txt', 'content');

      expect(mockSandbox.writeFile).toHaveBeenCalledWith('test.txt', 'content');
    });

    it('should propagate errors from sandbox', async () => {
      mockSandbox.writeFile.mockRejectedValue(new Error('Permission denied'));

      await expect(executor.writeFile('readonly.txt', 'content')).rejects.toThrow('Permission denied');
    });
  });

  describe('listFiles', () => {
    it('should delegate to sandbox.listFiles', async () => {
      mockSandbox.listFiles.mockResolvedValue(['file1.ts', 'file2.js']);

      const files = await executor.listFiles('./src');

      expect(mockSandbox.listFiles).toHaveBeenCalledWith('./src');
      expect(files).toEqual(['file1.ts', 'file2.js']);
    });

    it('should pass path without recursive flag', async () => {
      mockSandbox.listFiles.mockResolvedValue(['file.ts']);

      await executor.listFiles('.', true);

      // Recursive is handled internally by sandbox
      expect(mockSandbox.listFiles).toHaveBeenCalledWith('.');
    });
  });

  describe('gitCommit', () => {
    it('should stage specific files and commit', async () => {
      mockSandbox.exec
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git add file1
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git add file2
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git commit
        .mockResolvedValueOnce({ stdout: 'abcd1234567890', stderr: '', exitCode: 0, timedOut: false }); // git rev-parse

      const sha = await executor.gitCommit('test commit', ['file1.ts', 'file2.ts']);

      expect(mockSandbox.exec).toHaveBeenCalledWith('git add "file1.ts"');
      expect(mockSandbox.exec).toHaveBeenCalledWith('git add "file2.ts"');
      expect(mockSandbox.exec).toHaveBeenCalledWith('git commit -m "test commit"');
      expect(mockSandbox.exec).toHaveBeenCalledWith('git rev-parse HEAD');
      expect(sha).toBe('abcd1234');
    });

    it('should stage all files when no files specified', async () => {
      mockSandbox.exec
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git add -A
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git commit
        .mockResolvedValueOnce({ stdout: 'abcd1234567890', stderr: '', exitCode: 0, timedOut: false }); // git rev-parse

      const sha = await executor.gitCommit('test commit');

      expect(mockSandbox.exec).toHaveBeenCalledWith('git add -A');
      expect(mockSandbox.exec).toHaveBeenCalledWith('git commit -m "test commit"');
      expect(sha).toBe('abcd1234');
    });

    it('should return short SHA (8 chars)', async () => {
      mockSandbox.exec
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git commit
        .mockResolvedValueOnce({ stdout: '1234567890abcdef', stderr: '', exitCode: 0, timedOut: false }); // git rev-parse

      const sha = await executor.gitCommit('test');

      expect(sha).toBe('12345678');
      expect(sha.length).toBe(8);
    });

    it('should escape quotes in commit message', async () => {
      mockSandbox.exec
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git commit
        .mockResolvedValueOnce({ stdout: 'abcd1234', stderr: '', exitCode: 0, timedOut: false }); // git rev-parse

      await executor.gitCommit('fix: update "quotes" test');

      expect(mockSandbox.exec).toHaveBeenCalledWith('git commit -m "fix: update \\"quotes\\" test"');
    });

    it('should throw on failed commit', async () => {
      mockSandbox.exec
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, timedOut: false }) // git add
        .mockResolvedValueOnce({ stdout: '', stderr: 'nothing to commit', exitCode: 1, timedOut: false }); // git commit fails

      await expect(executor.gitCommit('test')).rejects.toThrow('Git commit failed: nothing to commit');
    });
  });

  describe('gitPush', () => {
    it('should push to origin with specified branch', async () => {
      mockSandbox.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, timedOut: false });

      await executor.gitPush('main');

      expect(mockSandbox.exec).toHaveBeenCalledWith('git push origin main');
    });

    it('should use HEAD when branch not specified', async () => {
      mockSandbox.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, timedOut: false });

      await executor.gitPush();

      expect(mockSandbox.exec).toHaveBeenCalledWith('git push origin HEAD');
    });

    it('should throw on failed push', async () => {
      mockSandbox.exec.mockResolvedValue({
        stdout: '',
        stderr: 'remote rejected',
        exitCode: 1,
        timedOut: false
      });

      await expect(executor.gitPush('main')).rejects.toThrow('Git push failed: remote rejected');
    });
  });

  describe('search', () => {
    it('should run grep in content mode by default', async () => {
      mockSandbox.exec.mockResolvedValue({
        stdout: 'file.ts:10:const test = 123',
        stderr: '',
        exitCode: 0,
        timedOut: false
      });

      const result = await executor.search('test');

      expect(mockSandbox.exec).toHaveBeenCalledWith(
        expect.stringContaining('grep -rn')
      );
      expect(result).toBe('file.ts:10:const test = 123');
    });

    it('should run grep with -l flag for files_with_matches mode', async () => {
      mockSandbox.exec.mockResolvedValue({
        stdout: 'file1.ts\nfile2.ts',
        stderr: '',
        exitCode: 0,
        timedOut: false
      });

      const result = await executor.search('pattern', undefined, 'files_with_matches');

      expect(mockSandbox.exec).toHaveBeenCalledWith(
        expect.stringMatching(/grep -rl/)
      );
      expect(result).toContain('file1.ts');
    });

    it('should run grep with -c flag for count mode', async () => {
      mockSandbox.exec.mockResolvedValue({
        stdout: 'file.ts:5',
        stderr: '',
        exitCode: 0,
        timedOut: false
      });

      const result = await executor.search('pattern', './src', 'count');

      expect(mockSandbox.exec).toHaveBeenCalledWith(
        expect.stringMatching(/grep -rc/)
      );
      expect(result).toBe('file.ts:5');
    });

    it('should escape double quotes in pattern', async () => {
      mockSandbox.exec.mockResolvedValue({
        stdout: 'results',
        stderr: '',
        exitCode: 0,
        timedOut: false
      });

      await executor.search('pattern "with" quotes');

      expect(mockSandbox.exec).toHaveBeenCalledWith(
        expect.stringContaining('pattern \\"with\\" quotes')
      );
    });

    it('should search in specified path', async () => {
      mockSandbox.exec.mockResolvedValue({
        stdout: 'result',
        stderr: '',
        exitCode: 0,
        timedOut: false
      });

      await executor.search('test', './src/lib');

      expect(mockSandbox.exec).toHaveBeenCalledWith(
        expect.stringContaining('"./src/lib"')
      );
    });

    it('should return "No matches found" when grep returns empty', async () => {
      mockSandbox.exec.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 1,
        timedOut: false
      });

      const result = await executor.search('nonexistent');

      expect(result).toBe('No matches found');
    });

    it('should limit output to 100 lines', async () => {
      mockSandbox.exec.mockResolvedValue({
        stdout: 'results',
        stderr: '',
        exitCode: 0,
        timedOut: false
      });

      await executor.search('pattern');

      expect(mockSandbox.exec).toHaveBeenCalledWith(
        expect.stringContaining('| head -100')
      );
    });
  });

  describe('editFile', () => {
    it('should read, replace, and write file', async () => {
      mockSandbox.readFile.mockResolvedValue('const old = 123;');
      mockSandbox.writeFile.mockResolvedValue(undefined);

      const result = await executor.editFile('test.ts', 'old', 'new');

      expect(mockSandbox.readFile).toHaveBeenCalledWith('test.ts');
      expect(mockSandbox.writeFile).toHaveBeenCalledWith('test.ts', 'const new = 123;');
      expect(result).toBe('Edited: test.ts');
    });

    it('should throw if old_string not found', async () => {
      mockSandbox.readFile.mockResolvedValue('const value = 123;');

      await expect(executor.editFile('test.ts', 'nonexistent', 'new')).rejects.toThrow(
        'old_string not found in test.ts'
      );
      expect(mockSandbox.writeFile).not.toHaveBeenCalled();
    });

    it('should replace only first occurrence', async () => {
      mockSandbox.readFile.mockResolvedValue('test test test');
      mockSandbox.writeFile.mockResolvedValue(undefined);

      await executor.editFile('file.txt', 'test', 'new');

      expect(mockSandbox.writeFile).toHaveBeenCalledWith('file.txt', 'new test test');
    });

    it('should handle multiline replacements', async () => {
      mockSandbox.readFile.mockResolvedValue('line1\nline2\nline3');
      mockSandbox.writeFile.mockResolvedValue(undefined);

      await executor.editFile('file.txt', 'line2\nline3', 'newline');

      expect(mockSandbox.writeFile).toHaveBeenCalledWith('file.txt', 'line1\nnewline');
    });
  });

  describe('glob', () => {
    it('should list files and filter by pattern', async () => {
      mockSandbox.listFiles.mockResolvedValue([
        'src/file.ts',
        'src/file.js',
        'test/file.test.ts',
        'README.md'
      ]);

      const files = await executor.glob('**/*.ts');

      expect(mockSandbox.listFiles).toHaveBeenCalledWith('.');
      expect(files).toEqual(['src/file.ts', 'test/file.test.ts']);
    });

    it('should handle single star pattern', async () => {
      mockSandbox.listFiles.mockResolvedValue([
        'file.ts',
        'file.js',
        'src/nested.ts'
      ]);

      const files = await executor.glob('*.ts');

      // The glob regex is not anchored, so *.ts matches any path ending with .ts
      // where the matched segment doesn't contain /
      expect(files).toContain('file.ts');
      expect(files).not.toContain('file.js');
    });

    it('should handle double star pattern', async () => {
      mockSandbox.listFiles.mockResolvedValue([
        'src/lib/file.ts',
        'src/file.ts',
        'file.js'
      ]);

      const files = await executor.glob('**/*.ts');

      // **/*.ts matches paths with directory separators
      expect(files).toContain('src/lib/file.ts');
      expect(files).toContain('src/file.ts');
      expect(files).not.toContain('file.js');
    });

    it('should handle question mark pattern', async () => {
      mockSandbox.listFiles.mockResolvedValue([
        'file1.ts',
        'file2.ts',
        'file10.ts'
      ]);

      const files = await executor.glob('file?.ts');

      expect(files).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should search in specified path', async () => {
      mockSandbox.listFiles.mockResolvedValue(['file.ts']);

      await executor.glob('*.ts', './src');

      expect(mockSandbox.listFiles).toHaveBeenCalledWith('./src');
    });

    it('should return empty array when no matches', async () => {
      mockSandbox.listFiles.mockResolvedValue(['file.js', 'file.py']);

      const files = await executor.glob('*.ts');

      expect(files).toEqual([]);
    });

    it('should handle complex patterns', async () => {
      mockSandbox.listFiles.mockResolvedValue([
        'src/components/Button.tsx',
        'src/components/Input.tsx',
        'src/lib/utils.ts',
        'test/Button.test.tsx'
      ]);

      const files = await executor.glob('src/**/*.tsx');

      expect(files).toEqual(['src/components/Button.tsx', 'src/components/Input.tsx']);
    });
  });

  describe('getWorkdir', () => {
    it('should return sandbox workdir', () => {
      const workdir = executor.getWorkdir();

      expect(mockSandbox.getWorkdir).toHaveBeenCalled();
      expect(workdir).toBe('/tmp/test-workdir');
    });
  });

  describe('cleanup', () => {
    it('should call sandbox.cleanup and mark as not initialized', async () => {
      mockSandbox.cleanup.mockResolvedValue(undefined);

      await executor.cleanup();

      expect(mockSandbox.cleanup).toHaveBeenCalled();
    });

    it('should not throw if already cleaned up', async () => {
      mockSandbox.cleanup.mockResolvedValue(undefined);

      await executor.cleanup();

      // Second cleanup should not throw
      await expect(executor.cleanup()).resolves.not.toThrow();
    });
  });

  describe('ensureInitialized', () => {
    it('should throw after cleanup', async () => {
      mockSandbox.cleanup.mockResolvedValue(undefined);

      await executor.cleanup();

      await expect(executor.execCommand('echo test')).rejects.toThrow(
        'Sandbox executor not initialized or already cleaned up'
      );
    });

    it('should throw for all methods after cleanup', async () => {
      mockSandbox.cleanup.mockResolvedValue(undefined);
      await executor.cleanup();

      await expect(executor.execCommand('test')).rejects.toThrow('not initialized');
      await expect(executor.readFile('test.txt')).rejects.toThrow('not initialized');
      await expect(executor.writeFile('test.txt', 'content')).rejects.toThrow('not initialized');
      await expect(executor.listFiles('.')).rejects.toThrow('not initialized');
      await expect(executor.gitCommit('message')).rejects.toThrow('not initialized');
      await expect(executor.gitPush()).rejects.toThrow('not initialized');
      await expect(executor.search('pattern')).rejects.toThrow('not initialized');
      await expect(executor.editFile('file.txt', 'old', 'new')).rejects.toThrow('not initialized');
      await expect(executor.glob('*.ts')).rejects.toThrow('not initialized');
    });
  });

  describe('static create', () => {
    it('should create executor with initialized sandbox', async () => {
      const sandboxModule = await import('@/lib/sandbox');
      const mockCreatedSandbox = {
        exec: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        listFiles: vi.fn(),
        cleanup: vi.fn(),
        getWorkdir: vi.fn(() => '/tmp/created-workdir'),
      };

      vi.mocked(sandboxModule.default.create).mockResolvedValue(mockCreatedSandbox as any);

      const newExecutor = await SandboxToolExecutor.create({
        taskId: 'test-task',
        timeoutMs: 5000
      });

      expect(sandboxModule.default.create).toHaveBeenCalledWith({
        taskId: 'test-task',
        timeoutMs: 5000
      });
      expect(newExecutor).toBeInstanceOf(SandboxToolExecutor);
    });
  });
});
