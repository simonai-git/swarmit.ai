import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment. Must be 64 hex chars (32 bytes).
 */
export function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  if (hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encrypt(plaintext: string, key?: Buffer): string {
  const encKey = key || getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encKey, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a value encrypted by `encrypt()`.
 */
export function decrypt(encrypted: string, key?: Buffer): string {
  const encKey = key || getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  const decipher = createDecipheriv(ALGORITHM, encKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Check if a value looks like it was encrypted by `encrypt()`.
 * Validates the 3-part colon-separated base64 format.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Check each part is valid base64
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return parts.every(part => part.length > 0 && base64Regex.test(part));
}
