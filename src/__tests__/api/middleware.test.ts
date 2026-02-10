import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

import { middleware } from '@/middleware';
import { getToken } from 'next-auth/jwt';

describe('Middleware', () => {
  beforeEach(() => {
    process.env.SIMON_API_KEY = 'test-key';
    vi.clearAllMocks();
  });

  describe('API key authentication', () => {
    it('should pass through /api/tasks with valid API key', async () => {
      const request = new NextRequest('http://localhost/api/tasks', {
        headers: { 'x-api-key': 'test-key' },
      });
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('should pass through /api/workflows with valid API key', async () => {
      const request = new NextRequest('http://localhost/api/workflows', {
        headers: { 'x-api-key': 'test-key' },
      });
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('should redirect to login with invalid API key', async () => {
      vi.mocked(getToken).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/tasks', {
        headers: { 'x-api-key': 'wrong-key' },
      });
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('callbackUrl')).toBe('/api/tasks');
    });
  });

  describe('Public routes', () => {
    it('should pass through /login without auth', async () => {
      const request = new NextRequest('http://localhost/login');
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('should pass through /api/auth routes without auth', async () => {
      const request = new NextRequest('http://localhost/api/auth/callback');
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });
  });

  describe('Session authentication', () => {
    it('should redirect to login with callbackUrl when session is missing', async () => {
      vi.mocked(getToken).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/dashboard');
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('callbackUrl')).toBe('/dashboard');
    });

    it('should pass through when session is valid', async () => {
      vi.mocked(getToken).mockResolvedValue({ sub: 'user-1', name: 'Test User' } as any);

      const request = new NextRequest('http://localhost/dashboard');
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });
  });
});
