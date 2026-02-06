import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing the middleware
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

import { middleware } from '@/middleware';
import { getToken } from 'next-auth/jwt';

describe('Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SIMON_API_KEY = 'test-api-key';
    process.env.API_KEY = 'test-api-key';
  });

  it('should allow API key routes with valid x-api-key header', async () => {
    const request = new NextRequest('http://localhost/api/tasks', {
      headers: { 'x-api-key': 'test-api-key' },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('should fall through to session check when API key invalid', async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/tasks', {
      headers: { 'x-api-key': 'wrong-key' },
    });

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('should allow /login and /api/auth routes without auth', async () => {
    const loginRequest = new NextRequest('http://localhost/login');
    const authRequest = new NextRequest('http://localhost/api/auth/signin');

    const loginResponse = await middleware(loginRequest);
    const authResponse = await middleware(authRequest);

    expect(loginResponse.status).toBe(200);
    expect(authResponse.status).toBe(200);
  });

  it('should redirect to /login when no session token', async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/tasks');

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
    expect(response.headers.get('location')).toContain('callbackUrl=%2Ftasks');
  });

  it('should allow request when session token exists', async () => {
    vi.mocked(getToken).mockResolvedValue({ email: 'test@example.com' } as any);

    const request = new NextRequest('http://localhost/tasks');

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('/api/dashboard is in apiKeyRoutes (BUG 5 fix regression)', async () => {
    const request = new NextRequest('http://localhost/api/dashboard', {
      headers: { 'x-api-key': 'test-api-key' },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(getToken).not.toHaveBeenCalled();
  });

  it('/api/monitoring is in apiKeyRoutes (BUG 5 fix regression)', async () => {
    const request = new NextRequest('http://localhost/api/monitoring', {
      headers: { 'x-api-key': 'test-api-key' },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(getToken).not.toHaveBeenCalled();
  });

  it('/api/tasks is in apiKeyRoutes', async () => {
    const request = new NextRequest('http://localhost/api/tasks', {
      headers: { 'x-api-key': 'test-api-key' },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(getToken).not.toHaveBeenCalled();
  });
});
