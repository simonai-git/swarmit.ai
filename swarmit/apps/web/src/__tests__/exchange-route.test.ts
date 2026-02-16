import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---
const mockGetToken = vi.fn();
const mockEncode = vi.fn();

vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
  encode: (...args: unknown[]) => mockEncode(...args),
}));

// Mock NextRequest / NextResponse
vi.mock('next/server', () => {
  class MockNextRequest {
    private bodyData: unknown;
    headers: Map<string, string>;
    cookies: Map<string, string>;

    constructor(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
      this.bodyData = init?.body ? JSON.parse(init.body) : null;
      this.headers = new Map(Object.entries(init?.headers || {}));
      this.cookies = new Map();
    }

    async json() {
      return this.bodyData;
    }
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({
        body,
        status: init?.status || 200,
        async json() { return body; },
      }),
    },
  };
});

import { POST } from '../app/api/integrations/claude/exchange/route';

// Helper to create a mock NextRequest
function createRequest(body: Record<string, unknown>) {
  const { NextRequest } = require('next/server');
  return new NextRequest('http://localhost:3000/api/integrations/claude/exchange', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/integrations/claude/exchange', () => {
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue({ userId: 'user-123' });
    mockEncode.mockResolvedValue('encoded-bearer-token');
  });

  it('returns 401 when JWT has no userId', async () => {
    mockGetToken.mockResolvedValue(null);
    const req = createRequest({ code: 'abc', codeVerifier: 'xyz' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when code or codeVerifier is missing', async () => {
    const req = createRequest({ code: 'abc' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing code or codeVerifier' });
  });

  it('returns tokenPrefix on successful exchange with sk-ant-oat token', async () => {
    const mockFetch = vi.fn();

    // Anthropic token exchange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'sk-ant-oat-abc123def456-rest',
        refresh_token: 'rt-refresh-123',
        expires_in: 3600,
        token_type: 'bearer',
      }),
    });

    // Store token API call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    global.fetch = mockFetch;

    const req = createRequest({ code: 'authcode123#state456', codeVerifier: 'verifier-xyz' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      tokenPrefix: 'sk-ant-oat-a',
    });
  });

  it('logs the token prefix after successful exchange', async () => {
    const mockFetch = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'sk-ant-oat-xyz789',
        token_type: 'bearer',
      }),
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    global.fetch = mockFetch;

    const req = createRequest({ code: 'code123', codeVerifier: 'verifier' });
    await POST(req);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Anthropic OAuth token prefix:',
      'sk-ant-oat-x',
    );
  });

  it('returns tokenPrefix even for non-OAT tokens', async () => {
    const mockFetch = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'some-other-token-format',
        token_type: 'bearer',
      }),
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    global.fetch = mockFetch;

    const req = createRequest({ code: 'code', codeVerifier: 'verifier' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body.tokenPrefix).toBe('some-other-t');
  });

  it('splits code#state correctly and passes to Anthropic', async () => {
    const mockFetch = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'sk-ant-oat-test',
        token_type: 'bearer',
      }),
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    global.fetch = mockFetch;

    const req = createRequest({ code: 'mycode#mystate', codeVerifier: 'v' });
    await POST(req);

    const exchangeCall = mockFetch.mock.calls[0];
    const body = JSON.parse(exchangeCall[1].body);
    expect(body.code).toBe('mycode');
    expect(body.state).toBe('mystate');
  });

  it('returns 502 when Anthropic exchange fails', async () => {
    const mockFetch = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    global.fetch = mockFetch;

    const req = createRequest({ code: 'bad', codeVerifier: 'v' });
    const res = await POST(req);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Failed to exchange code with Anthropic');
  });

  it('returns 502 when Anthropic returns error in token data', async () => {
    const mockFetch = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'The authorization code has expired',
      }),
    });

    global.fetch = mockFetch;

    const req = createRequest({ code: 'expired', codeVerifier: 'v' });
    const res = await POST(req);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('The authorization code has expired');
  });

  it('returns 500 when storing token fails', async () => {
    const mockFetch = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'sk-ant-oat-test',
        token_type: 'bearer',
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    global.fetch = mockFetch;

    const req = createRequest({ code: 'code', codeVerifier: 'v' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to store token');
  });

  it('includes refresh_token and expiresAt when provided', async () => {
    const mockFetch = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'sk-ant-oat-test',
        refresh_token: 'rt-refresh',
        expires_in: 7200,
        token_type: 'bearer',
      }),
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    global.fetch = mockFetch;

    const req = createRequest({ code: 'code', codeVerifier: 'v' });
    await POST(req);

    const storeCall = mockFetch.mock.calls[1];
    const body = JSON.parse(storeCall[1].body);
    expect(body.refreshToken).toBe('rt-refresh');
    expect(body.expiresAt).toBeDefined();
    expect(body.provider).toBe('anthropic');
  });
});
