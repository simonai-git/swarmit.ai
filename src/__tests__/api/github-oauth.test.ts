import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---

const { mockPoolQuery, mockCookieStore } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockCookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/db', () => ({
  default: { query: mockPoolQuery },
  pool: { query: mockPoolQuery },
  setUserGitHubIntegration: vi.fn(),
  clearUserGitHubIntegration: vi.fn(),
  getUserGitHubToken: vi.fn(),
}));

vi.mock('@/lib/github', () => ({
  validateGitHubToken: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

import { getServerSession } from 'next-auth';
import { setUserGitHubIntegration } from '@/lib/db';

// --- Helpers ---

function mockSession(email = 'test@example.com', id = 'user-test-123') {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id, email },
  } as any);
}

function mockNoSession() {
  vi.mocked(getServerSession).mockResolvedValue(null);
}

// --- OAuth Initiation Tests ---

describe('GitHub OAuth Initiation - GET /api/profile/integrations/github/oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GITHUB_CLIENT_ID', 'test-github-client-id');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
  });

  it('should return 401 without session', async () => {
    mockNoSession();

    const { GET } = await import('@/app/api/profile/integrations/github/oauth/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 501 when GITHUB_CLIENT_ID is not set', async () => {
    mockSession();
    vi.stubEnv('GITHUB_CLIENT_ID', '');

    const { GET } = await import('@/app/api/profile/integrations/github/oauth/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.error).toContain('not configured');
  });

  it('should redirect to GitHub OAuth authorize endpoint', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/github/oauth/route');
    const response = await GET();

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('https://github.com/login/oauth/authorize?');
    expect(location).toContain('client_id=test-github-client-id');
    expect(location).toContain('scope=repo+read%3Auser+user%3Aemail');
    expect(location).toContain('state=');
  });

  it('should use correct redirect_uri based on NEXTAUTH_URL', async () => {
    mockSession();
    vi.stubEnv('NEXTAUTH_URL', 'https://swarmit.ai');

    const { GET } = await import('@/app/api/profile/integrations/github/oauth/route');
    const response = await GET();

    const location = response.headers.get('location')!;
    expect(location).toContain(encodeURIComponent('https://swarmit.ai/api/profile/integrations/github/callback'));
  });

  it('should set CSRF state cookie', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/github/oauth/route');
    await GET();

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'github_oauth_state',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      })
    );
  });

  it('should NOT include PKCE parameters (GitHub does not support PKCE)', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/github/oauth/route');
    const response = await GET();

    const location = response.headers.get('location')!;
    expect(location).not.toContain('code_challenge');
    expect(location).not.toContain('code_challenge_method');
  });
});

// --- OAuth Callback Tests ---

describe('GitHub OAuth Callback - GET /api/profile/integrations/github/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GITHUB_CLIENT_ID', 'test-github-client-id');
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-client-secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    global.fetch = vi.fn();
  });

  it('should redirect with error when not authenticated', async () => {
    mockNoSession();

    const { GET } = await import('@/app/api/profile/integrations/github/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/github/callback?code=abc&state=xyz');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('github=error');
    expect(location).toContain('Not%20authenticated');
  });

  it('should redirect with error when GitHub returns an error', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/github/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/github/callback?error=access_denied&error_description=User+denied+access');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('github=error');
    expect(location).toContain('User%20denied%20access');
  });

  it('should redirect with error when code or state is missing', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/github/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/github/callback');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('github=error');
    expect(location).toContain('Missing%20code%20or%20state');
  });

  it('should redirect with error when CSRF state does not match', async () => {
    mockSession();
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'github_oauth_state') return { value: 'stored-state' };
      return undefined;
    });

    const { GET } = await import('@/app/api/profile/integrations/github/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/github/callback?code=abc&state=wrong-state');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('github=error');
    expect(location).toContain('Invalid%20state');
  });

  it('should redirect with error when token exchange fails', async () => {
    mockSession();
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'github_oauth_state') return { value: 'valid-state' };
      return undefined;
    });

    (global.fetch as any).mockResolvedValue({
      ok: false,
      text: async () => 'invalid_grant',
    });

    const { GET } = await import('@/app/api/profile/integrations/github/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/github/callback?code=abc&state=valid-state');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('github=error');
    expect(location).toContain('Failed%20to%20exchange');
  });

  it('should redirect with error when token response contains error field', async () => {
    mockSession();
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'github_oauth_state') return { value: 'valid-state' };
      return undefined;
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        error: 'bad_verification_code',
        error_description: 'The code passed is incorrect or expired.',
      }),
    });

    const { GET } = await import('@/app/api/profile/integrations/github/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/github/callback?code=expired&state=valid-state');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('github=error');
    expect(location).toContain('incorrect%20or%20expired');
  });

  it('should exchange code for token, fetch user info, and store in DB on success', async () => {
    mockSession();
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'github_oauth_state') return { value: 'valid-state' };
      return undefined;
    });

    // Mock token exchange
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'gho_new-access-token',
          token_type: 'bearer',
          scope: 'repo,read:user,user:email',
        }),
      })
      // Mock user info fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          login: 'testuser',
          name: 'Test User',
        }),
      });

    const { GET } = await import('@/app/api/profile/integrations/github/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/github/callback?code=auth-code&state=valid-state');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('github=connected');

    // Verify token exchange called correct endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      })
    );

    // Verify user info was fetched
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gho_new-access-token',
        }),
      })
    );

    // Verify DB store with oauth auth method
    expect(setUserGitHubIntegration).toHaveBeenCalledWith(
      'user-test-123',
      'gho_new-access-token',
      'testuser',
      'oauth',
      null, // no refresh token for classic OAuth
      null  // no expiry for classic OAuth
    );

    // Verify cookie was deleted
    expect(mockCookieStore.delete).toHaveBeenCalledWith('github_oauth_state');
  });

  it('should handle tokens with refresh_token and expires_in (GitHub Apps)', async () => {
    mockSession();
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'github_oauth_state') return { value: 'valid-state' };
      return undefined;
    });

    // Mock token exchange with refresh token
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'ghu_app-token',
          token_type: 'bearer',
          scope: 'repo',
          refresh_token: 'ghr_refresh-token',
          expires_in: 28800,
        }),
      })
      // Mock user info
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          login: 'appuser',
          name: 'App User',
        }),
      });

    const { GET } = await import('@/app/api/profile/integrations/github/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/github/callback?code=app-code&state=valid-state');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('github=connected');

    // Verify DB store with refresh token and expiry
    expect(setUserGitHubIntegration).toHaveBeenCalledWith(
      'user-test-123',
      'ghu_app-token',
      'appuser',
      'oauth',
      'ghr_refresh-token',
      expect.any(Date)
    );
  });
});

// --- Token Refresh Tests ---

describe('GitHub Token Refresh - refreshGitHubToken()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GITHUB_CLIENT_ID', 'test-github-client-id');
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-client-secret');
    global.fetch = vi.fn();
  });

  it('should throw when OAuth is not configured', async () => {
    vi.stubEnv('GITHUB_CLIENT_ID', '');
    vi.stubEnv('GITHUB_CLIENT_SECRET', '');

    const { refreshGitHubToken } = await import('@/app/api/profile/integrations/github/route');

    await expect(refreshGitHubToken('some-refresh-token'))
      .rejects.toThrow('GitHub OAuth not configured');
  });

  it('should POST to GitHub token endpoint with refresh_token grant', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 28800,
      }),
    });

    const { refreshGitHubToken } = await import('@/app/api/profile/integrations/github/route');
    const result = await refreshGitHubToken('old-refresh-token');

    expect(result.access_token).toBe('new-access');
    expect(result.refresh_token).toBe('new-refresh');
    expect(result.expires_in).toBe(28800);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      })
    );
  });

  it('should throw when refresh fails with HTTP error', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      text: async () => 'server error',
    });

    const { refreshGitHubToken } = await import('@/app/api/profile/integrations/github/route');

    await expect(refreshGitHubToken('expired-refresh'))
      .rejects.toThrow('Token refresh failed');
  });

  it('should throw when response contains error field', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        error: 'bad_refresh_token',
        error_description: 'The refresh token is invalid',
      }),
    });

    const { refreshGitHubToken } = await import('@/app/api/profile/integrations/github/route');

    await expect(refreshGitHubToken('bad-refresh'))
      .rejects.toThrow('Token refresh failed');
  });
});

// --- GitHub Disconnect Tests ---

describe('GitHub Disconnect - DELETE /api/profile/integrations/github', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 without session', async () => {
    mockNoSession();

    const { DELETE } = await import('@/app/api/profile/integrations/github/route');
    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should clear all GitHub fields including OAuth columns', async () => {
    mockSession();
    const { clearUserGitHubIntegration } = await import('@/lib/db');
    vi.mocked(clearUserGitHubIntegration).mockResolvedValue(undefined);

    const { DELETE } = await import('@/app/api/profile/integrations/github/route');
    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(clearUserGitHubIntegration).toHaveBeenCalledWith('user-test-123');
  });
});

// --- Integrations GET Tests (GitHub-specific) ---

describe('Integrations GET - GitHub fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GITHUB_CLIENT_ID', 'test-github-client-id');
    vi.stubEnv('RAILWAY_CLIENT_ID', '');
    global.fetch = vi.fn();
  });

  it('should return github.oauthAvailable: true when GITHUB_CLIENT_ID is set', async () => {
    mockSession();
    mockPoolQuery.mockResolvedValue({ rows: [{}] });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.github.oauthAvailable).toBe(true);
  });

  it('should return github.oauthAvailable: false when GITHUB_CLIENT_ID is not set', async () => {
    mockSession();
    vi.stubEnv('GITHUB_CLIENT_ID', '');
    mockPoolQuery.mockResolvedValue({ rows: [{}] });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.github.oauthAvailable).toBe(false);
  });

  it('should return github.authMethod from DB', async () => {
    mockSession();
    mockPoolQuery.mockResolvedValue({
      rows: [{
        github_token: 'some-token',
        github_username: 'testuser',
        github_auth_method: 'oauth',
        github_connected_at: new Date().toISOString(),
      }],
    });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(data.github.connected).toBe(true);
    expect(data.github.authMethod).toBe('oauth');
    expect(data.github.username).toBe('testuser');
  });

  it('should auto-refresh expired GitHub OAuth tokens', async () => {
    mockSession();
    const expiredAt = new Date(Date.now() - 60000).toISOString(); // expired 1 min ago
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{
          github_token: 'expired-token',
          github_username: 'testuser',
          github_auth_method: 'oauth',
          github_token_expires_at: expiredAt,
          github_refresh_token: 'old-refresh',
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE query

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-token',
        refresh_token: 'new-refresh',
        expires_in: 28800,
      }),
    });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(data.github.connected).toBe(true);

    // Verify refresh was called
    expect(global.fetch).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.anything()
    );

    // Verify DB was updated with new tokens
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('github_token = $1'),
      expect.arrayContaining(['refreshed-token'])
    );
  });

  it('should NOT refresh GitHub tokens that are still valid', async () => {
    mockSession();
    const validUntil = new Date(Date.now() + 3600000).toISOString();
    mockPoolQuery.mockResolvedValue({
      rows: [{
        github_token: 'valid-token',
        github_username: 'testuser',
        github_auth_method: 'oauth',
        github_token_expires_at: validUntil,
        github_refresh_token: 'refresh',
      }],
    });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    await GET(request);

    // fetch should NOT have been called (no refresh needed)
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should NOT refresh GitHub token-based connections', async () => {
    mockSession();
    mockPoolQuery.mockResolvedValue({
      rows: [{
        github_token: 'manual-pat',
        github_username: 'testuser',
        github_auth_method: 'token',
      }],
    });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    await GET(request);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
