import { LocalStorage } from './local.js';

export interface BlobStorage {
  put(key: string, data: Buffer | string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export function createStorage(baseDir?: string): BlobStorage {
  return new LocalStorage(baseDir);
}
