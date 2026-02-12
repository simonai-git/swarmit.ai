import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encrypt, decrypt, isEncrypted, getEncryptionKey } from '../crypto.js';
import { randomBytes } from 'node:crypto';

const TEST_KEY = randomBytes(32);
const TEST_KEY_HEX = TEST_KEY.toString('hex');

describe('crypto', () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_HEX;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe('getEncryptionKey', () => {
    it('returns buffer from hex env var', () => {
      const key = getEncryptionKey();
      expect(key).toEqual(TEST_KEY);
    });

    it('throws when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => getEncryptionKey()).toThrow('ENCRYPTION_KEY environment variable is not set');
    });

    it('throws when ENCRYPTION_KEY has wrong length', () => {
      process.env.ENCRYPTION_KEY = 'abcd';
      expect(() => getEncryptionKey()).toThrow('ENCRYPTION_KEY must be 64 hex characters');
    });
  });

  describe('encrypt/decrypt', () => {
    it('round-trips plaintext', () => {
      const plaintext = 'sk-ant-api03-secret-key-12345';
      const encrypted = encrypt(plaintext, TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe(plaintext);
    });

    it('round-trips using env key', () => {
      const plaintext = 'my-secret-api-key';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'test-key';
      const a = encrypt(plaintext, TEST_KEY);
      const b = encrypt(plaintext, TEST_KEY);
      expect(a).not.toBe(b);
    });

    it('handles empty string', () => {
      const encrypted = encrypt('', TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe('');
    });

    it('handles unicode', () => {
      const plaintext = 'key-with-emoji-🔑-and-日本語';
      const encrypted = encrypt(plaintext, TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);
      expect(decrypted).toBe(plaintext);
    });

    it('throws on tampered ciphertext', () => {
      const encrypted = encrypt('secret', TEST_KEY);
      const parts = encrypted.split(':');
      // Tamper with the ciphertext
      parts[2] = Buffer.from('tampered').toString('base64');
      expect(() => decrypt(parts.join(':'), TEST_KEY)).toThrow();
    });

    it('throws on invalid format', () => {
      expect(() => decrypt('not-valid', TEST_KEY)).toThrow('Invalid encrypted value format');
    });

    it('throws on wrong key', () => {
      const encrypted = encrypt('secret', TEST_KEY);
      const wrongKey = randomBytes(32);
      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('returns true for encrypted values', () => {
      const encrypted = encrypt('test', TEST_KEY);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(isEncrypted('sk-ant-api03-regular-key')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('returns false for single colon', () => {
      expect(isEncrypted('a:b')).toBe(false);
    });

    it('returns false for non-base64 parts', () => {
      expect(isEncrypted('!!!:@@@:###')).toBe(false);
    });
  });
});
