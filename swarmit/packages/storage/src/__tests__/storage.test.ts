import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createStorage, type BlobStorage } from '../index.js';
import { LocalStorage } from '../local.js';

describe('createStorage', () => {
  it('returns a LocalStorage instance', () => {
    const storage = createStorage('/tmp/test-storage-factory');
    expect(storage).toBeInstanceOf(LocalStorage);
  });
});

describe('LocalStorage', () => {
  let storage: BlobStorage;
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'swarmit-storage-test-'));
    storage = createStorage(baseDir);
  });

  afterEach(() => {
    if (existsSync(baseDir)) {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('put writes a file and get reads it back (string)', async () => {
    await storage.put('hello.txt', 'Hello, world!');
    const data = await storage.get('hello.txt');

    expect(data).not.toBeNull();
    expect(data!.toString()).toBe('Hello, world!');
  });

  it('put writes a file and get reads it back (Buffer)', async () => {
    const buffer = Buffer.from('binary content here');
    await storage.put('binary.dat', buffer);
    const data = await storage.get('binary.dat');

    expect(data).not.toBeNull();
    expect(Buffer.compare(data!, buffer)).toBe(0);
  });

  it('get returns null for non-existent key', async () => {
    const data = await storage.get('does-not-exist.txt');
    expect(data).toBeNull();
  });

  it('delete removes a file', async () => {
    await storage.put('to-delete.txt', 'temporary data');
    expect(await storage.exists('to-delete.txt')).toBe(true);

    await storage.delete('to-delete.txt');
    expect(await storage.exists('to-delete.txt')).toBe(false);

    const data = await storage.get('to-delete.txt');
    expect(data).toBeNull();
  });

  it('delete does not throw for non-existent key', async () => {
    await storage.delete('nonexistent-file.txt');
  });

  it('exists returns true for existing key', async () => {
    await storage.put('check-exists.txt', 'data');
    const result = await storage.exists('check-exists.txt');
    expect(result).toBe(true);
  });

  it('exists returns false for non-existent key', async () => {
    const result = await storage.exists('nope.txt');
    expect(result).toBe(false);
  });

  it('put creates nested directories automatically', async () => {
    await storage.put('deep/nested/path/file.txt', 'nested content');
    const data = await storage.get('deep/nested/path/file.txt');

    expect(data).not.toBeNull();
    expect(data!.toString()).toBe('nested content');
  });

  it('put overwrites existing file', async () => {
    await storage.put('overwrite.txt', 'original');
    await storage.put('overwrite.txt', 'updated');

    const data = await storage.get('overwrite.txt');
    expect(data).not.toBeNull();
    expect(data!.toString()).toBe('updated');
  });

  it('handles empty string content', async () => {
    await storage.put('empty.txt', '');
    const data = await storage.get('empty.txt');

    expect(data).not.toBeNull();
    expect(data!.toString()).toBe('');
  });

  it('handles large content', async () => {
    const largeContent = 'x'.repeat(1024 * 1024);
    await storage.put('large.txt', largeContent);
    const data = await storage.get('large.txt');

    expect(data).not.toBeNull();
    expect(data!.toString()).toBe(largeContent);
  });

  it('handles special characters in content', async () => {
    const special = 'unicode: \u00e9\u00e8\u00ea \ud83d\ude80 newlines:\n\ttabs';
    await storage.put('special.txt', special);
    const data = await storage.get('special.txt');

    expect(data).not.toBeNull();
    expect(data!.toString()).toBe(special);
  });

  it('handles keys with special characters', async () => {
    await storage.put('file with spaces.txt', 'data');
    const data = await storage.get('file with spaces.txt');

    expect(data).not.toBeNull();
    expect(data!.toString()).toBe('data');
  });

  it('exists returns false after delete', async () => {
    await storage.put('lifecycle.txt', 'data');
    expect(await storage.exists('lifecycle.txt')).toBe(true);

    await storage.delete('lifecycle.txt');
    expect(await storage.exists('lifecycle.txt')).toBe(false);
  });
});
