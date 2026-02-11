import { mkdir, writeFile, readFile, unlink, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createLogger } from '@swarmit/logger';
import type { BlobStorage } from './index.js';

const logger = createLogger('storage-local');

export class LocalStorage implements BlobStorage {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.env.STORAGE_DIR || '/tmp/swarmit-storage';
  }

  private resolvePath(key: string): string {
    return join(this.baseDir, key);
  }

  async put(key: string, data: Buffer | string): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    logger.info({ key, size: Buffer.byteLength(data) }, 'Stored blob');
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolvePath(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolvePath(key));
    } catch {
      // File may not exist
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }
}
