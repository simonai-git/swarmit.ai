import { describe, it, expect, vi } from 'vitest';
import { authOptions } from '@/lib/auth';

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn(() => ({ id: 'google', name: 'Google' })),
}));

vi.mock('next-auth', () => ({
  default: vi.fn(),
}));

describe('auth', () => {
  describe('authOptions.providers', () => {
    it('has at least one provider', () => {
      expect(authOptions.providers).toBeDefined();
      expect(authOptions.providers.length).toBeGreaterThan(0);
    });
  });

  describe('signIn callback', () => {
    const signInCallback = authOptions.callbacks?.signIn;

    it('allows bogdan@alexandrescu.io', async () => {
      const result = await signInCallback!({
        user: { email: 'bogdan@alexandrescu.io' }
      } as any);
      expect(result).toBe(true);
    });

    it('allows bogdan@alexandrescu.ai', async () => {
      const result = await signInCallback!({
        user: { email: 'bogdan@alexandrescu.ai' }
      } as any);
      expect(result).toBe(true);
    });

    it('allows bogdan@saga.xyz', async () => {
      const result = await signInCallback!({
        user: { email: 'bogdan@saga.xyz' }
      } as any);
      expect(result).toBe(true);
    });

    it('allows simon@alexandrescu.io', async () => {
      const result = await signInCallback!({
        user: { email: 'simon@alexandrescu.io' }
      } as any);
      expect(result).toBe(true);
    });

    it('allows simon@alexandrescu.ai', async () => {
      const result = await signInCallback!({
        user: { email: 'simon@alexandrescu.ai' }
      } as any);
      expect(result).toBe(true);
    });

    it('rejects unknown email hacker@evil.com', async () => {
      const result = await signInCallback!({
        user: { email: 'hacker@evil.com' }
      } as any);
      expect(result).toBe(false);
    });

    it('rejects user with no email', async () => {
      const result = await signInCallback!({
        user: {}
      } as any);
      expect(result).toBe(false);
    });
  });

  describe('session callback', () => {
    const sessionCallback = authOptions.callbacks?.session;

    it('returns session object', async () => {
      const mockSession = {
        user: { email: 'bogdan@alexandrescu.io', name: 'Bogdan' },
        expires: '2026-12-31',
      };

      const result = await sessionCallback!({
        session: mockSession,
        token: {}
      } as any);

      expect(result).toEqual(mockSession);
    });
  });

  describe('pages', () => {
    it('signIn page is /login', () => {
      expect(authOptions.pages?.signIn).toBe('/login');
    });

    it('error page is /login', () => {
      expect(authOptions.pages?.error).toBe('/login');
    });
  });
});
