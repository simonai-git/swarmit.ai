import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

const mockPoolQuery = vi.fn();
vi.mock('@/lib/db', () => ({
  default: { query: mockPoolQuery },
  pool: { query: mockPoolQuery },
}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

import { getServerSession } from 'next-auth';

// --- Helpers ---

function mockSession(email = 'test@example.com') {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { email },
  } as any);
}

function mockNoSession() {
  vi.mocked(getServerSession).mockResolvedValue(null);
}

// --- OAuth Initiation Tests ---

describe('Railway OAuth Initiation - GET /api/profile/integrations/railway/oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RAILWAY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
  });

  it('should return 401 without session', async () => {
    mockNoSession();

    const { GET } = await import('@/app/api/profile/integrations/railway/oauth/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 501 when RAILWAY_CLIENT_ID is not set', async () => {
    mockSession();
    vi.stubEnv('RAILWAY_CLIENT_ID', '');

    const { GET } = await import('@/app/api/profile/integrations/railway/oauth/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.error).toContain('not configured');
  });

  it('should redirect to Railway OAuth auth endpoint', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/railway/oauth/route');
    const response = await GET();

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('https://backboard.railway.com/oauth/auth?');
    expect(location).toContain('client_id=test-client-id');
    expect(location).toContain('response_type=code');
    expect(location).toContain('scope=openid+email+profile');
    expect(location).toContain('state=');
  });

  it('should use correct redirect_uri based on NEXTAUTH_URL', async () => {
    mockSession();
    vi.stubEnv('NEXTAUTH_URL', 'https://swarmit.ai');

    const { GET } = await import('@/app/api/profile/integrations/railway/oauth/route');
    const response = await GET();

    const location = response.headers.get('location')!;
    expect(location).toContain(encodeURIComponent('https://swarmit.ai/api/profile/integrations/railway/callback'));
  });

  it('should set CSRF state cookie', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/railway/oauth/route');
    await GET();

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'railway_oauth_state',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      })
    );
  });

  it('should NOT use /oauth/authorize (wrong endpoint)', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/railway/oauth/route');
    const response = await GET();

    const location = response.headers.get('location')!;
    expect(location).not.toContain('/oauth/authorize');
    expect(location).toContain('/oauth/auth?');
  });
});

// --- OAuth Callback Tests ---

describe('Railway OAuth Callback - GET /api/profile/integrations/railway/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RAILWAY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('RAILWAY_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    global.fetch = vi.fn();
  });

  it('should redirect with error when not authenticated', async () => {
    mockNoSession();

    const { GET } = await import('@/app/api/profile/integrations/railway/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway/callback?code=abc&state=xyz');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('railway=error');
    expect(location).toContain('Not+authenticated');
  });

  it('should redirect with error when Railway returns an error', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/railway/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway/callback?error=access_denied&error_description=User+denied+access');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('railway=error');
    expect(location).toContain('User+denied+access');
  });

  it('should redirect with error when code or state is missing', async () => {
    mockSession();

    const { GET } = await import('@/app/api/profile/integrations/railway/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway/callback');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('railway=error');
    expect(location).toContain('Missing+code+or+state');
  });

  it('should redirect with error when CSRF state does not match', async () => {
    mockSession();
    mockCookieStore.get.mockReturnValue({ value: 'stored-state' });

    const { GET } = await import('@/app/api/profile/integrations/railway/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway/callback?code=abc&state=wrong-state');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('railway=error');
    expect(location).toContain('Invalid+state');
  });

  it('should redirect with error when token exchange fails', async () => {
    mockSession();
    mockCookieStore.get.mockReturnValue({ value: 'valid-state' });

    (global.fetch as any).mockResolvedValue({
      ok: false,
      text: async () => 'invalid_grant',
    });

    const { GET } = await import('@/app/api/profile/integrations/railway/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway/callback?code=abc&state=valid-state');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('railway=error');
    expect(location).toContain('Failed+to+exchange');
  });

  it('should exchange code for tokens and store in DB on success', async () => {
    mockSession();
    mockCookieStore.get.mockReturnValue({ value: 'valid-state' });

    // Mock token exchange
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      })
      // Mock userinfo
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'Test User',
          email: 'railway@example.com',
        }),
      })
      // Mock projects fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            me: {
              projects: {
                edges: [
                  { node: { id: 'proj-1', name: 'My Project', environments: { edges: [] } } },
                ],
              },
            },
          },
        }),
      });

    mockPoolQuery.mockResolvedValue({ rows: [] });

    const { GET } = await import('@/app/api/profile/integrations/railway/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway/callback?code=auth-code&state=valid-state');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('railway=connected');

    // Verify token exchange used correct endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      'https://backboard.railway.com/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      })
    );

    // Verify userinfo used /oauth/me (not /oauth/userinfo)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://backboard.railway.com/oauth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer new-access-token',
        }),
      })
    );

    // Verify DB insert
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_integrations'),
      expect.arrayContaining([
        'test@example.com',
        'new-access-token',
        expect.stringContaining('"account"'),
        'new-refresh-token',
        expect.any(Date),
      ])
    );

    // Verify state cookie was deleted
    expect(mockCookieStore.delete).toHaveBeenCalledWith('railway_oauth_state');
  });

  it('should use Basic auth for token exchange', async () => {
    mockSession();
    mockCookieStore.get.mockReturnValue({ value: 'valid-state' });

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: '', email: '' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { me: { projects: { edges: [] } } } }) });

    mockPoolQuery.mockResolvedValue({ rows: [] });

    const { GET } = await import('@/app/api/profile/integrations/railway/callback/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway/callback?code=abc&state=valid-state');
    await GET(request);

    const expectedBasicAuth = Buffer.from('test-client-id:test-client-secret').toString('base64');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://backboard.railway.com/oauth/token',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${expectedBasicAuth}`,
        }),
      })
    );
  });
});

// --- Token Refresh Tests ---

describe('Railway Token Refresh - refreshRailwayToken()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RAILWAY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('RAILWAY_CLIENT_SECRET', 'test-client-secret');
    global.fetch = vi.fn();
  });

  it('should throw when OAuth is not configured', async () => {
    vi.stubEnv('RAILWAY_CLIENT_ID', '');
    vi.stubEnv('RAILWAY_CLIENT_SECRET', '');

    const { refreshRailwayToken } = await import('@/app/api/profile/integrations/railway/route');

    await expect(refreshRailwayToken('some-refresh-token'))
      .rejects.toThrow('Railway OAuth not configured');
  });

  it('should POST to /oauth/token with refresh_token grant', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }),
    });

    const { refreshRailwayToken } = await import('@/app/api/profile/integrations/railway/route');
    const result = await refreshRailwayToken('old-refresh-token');

    expect(result.access_token).toBe('new-access');
    expect(result.refresh_token).toBe('new-refresh');
    expect(result.expires_in).toBe(3600);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://backboard.railway.com/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      })
    );
  });

  it('should throw when refresh fails', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      text: async () => 'invalid_grant',
    });

    const { refreshRailwayToken } = await import('@/app/api/profile/integrations/railway/route');

    await expect(refreshRailwayToken('expired-refresh'))
      .rejects.toThrow('Token refresh failed');
  });
});

// --- Railway DELETE Tests ---

describe('Railway Disconnect - DELETE /api/profile/integrations/railway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 without session', async () => {
    mockNoSession();

    const { DELETE } = await import('@/app/api/profile/integrations/railway/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway', { method: 'DELETE' });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should clear all Railway fields including OAuth columns', async () => {
    mockSession();
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const { DELETE } = await import('@/app/api/profile/integrations/railway/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations/railway', { method: 'DELETE' });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    const query = mockPoolQuery.mock.calls[0][0];
    expect(query).toContain('railway_token = NULL');
    expect(query).toContain('railway_refresh_token = NULL');
    expect(query).toContain('railway_token_expires_at = NULL');
    expect(query).toContain('railway_auth_method = NULL');
  });
});

// --- Integrations GET Tests ---

describe('Integrations GET - GET /api/profile/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RAILWAY_CLIENT_ID', 'test-client-id');
    global.fetch = vi.fn();
  });

  it('should return 401 without session', async () => {
    mockNoSession();

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return oauthAvailable: true when RAILWAY_CLIENT_ID is set', async () => {
    mockSession();
    mockPoolQuery.mockResolvedValue({ rows: [{}] });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.railway.oauthAvailable).toBe(true);
  });

  it('should return oauthAvailable: false when RAILWAY_CLIENT_ID is not set', async () => {
    mockSession();
    vi.stubEnv('RAILWAY_CLIENT_ID', '');
    mockPoolQuery.mockResolvedValue({ rows: [{}] });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.railway.oauthAvailable).toBe(false);
  });

  it('should return authMethod from DB', async () => {
    mockSession();
    mockPoolQuery.mockResolvedValue({
      rows: [{
        railway_token: 'some-token',
        railway_projects: JSON.stringify({ account: { name: 'Test', email: 'test@r.com' }, projects: [] }),
        railway_auth_method: 'oauth',
        railway_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        railway_refresh_token: 'refresh-token',
      }],
    });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(data.railway.connected).toBe(true);
    expect(data.railway.authMethod).toBe('oauth');
  });

  it('should auto-refresh expired OAuth tokens', async () => {
    mockSession();
    const expiredAt = new Date(Date.now() - 60000).toISOString(); // expired 1 min ago
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{
          railway_token: 'expired-token',
          railway_projects: JSON.stringify({ account: { name: 'Test', email: 'test@r.com' }, projects: [] }),
          railway_auth_method: 'oauth',
          railway_token_expires_at: expiredAt,
          railway_refresh_token: 'old-refresh',
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE query

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }),
    });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    const response = await GET(request);
    const data = await response.json();

    expect(data.railway.connected).toBe(true);

    // Verify refresh was called
    expect(global.fetch).toHaveBeenCalledWith(
      'https://backboard.railway.com/oauth/token',
      expect.anything()
    );

    // Verify DB was updated with new tokens
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE user_integrations'),
      expect.arrayContaining(['refreshed-token', 'new-refresh'])
    );
  });

  it('should NOT refresh tokens that are still valid', async () => {
    mockSession();
    const validUntil = new Date(Date.now() + 3600000).toISOString(); // valid for 1 more hour
    mockPoolQuery.mockResolvedValue({
      rows: [{
        railway_token: 'valid-token',
        railway_projects: JSON.stringify({ account: { name: 'Test', email: 'test@r.com' }, projects: [] }),
        railway_auth_method: 'oauth',
        railway_token_expires_at: validUntil,
        railway_refresh_token: 'refresh',
      }],
    });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    await GET(request);

    // fetch should NOT have been called (no refresh needed)
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should NOT refresh token-based connections', async () => {
    mockSession();
    mockPoolQuery.mockResolvedValue({
      rows: [{
        railway_token: 'manual-token',
        railway_projects: JSON.stringify({ account: { name: 'Test', email: 'test@r.com' }, projects: [] }),
        railway_auth_method: 'token',
      }],
    });

    const { GET } = await import('@/app/api/profile/integrations/route');
    const request = new NextRequest('http://localhost:3000/api/profile/integrations');
    await GET(request);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
