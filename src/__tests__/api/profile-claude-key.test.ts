import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing the route
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
vi.mock('@/lib/db', () => ({
  pool: {
    connect: vi.fn(() => Promise.resolve({
      query: mockClientQuery,
      release: mockClientRelease,
    })),
  },
}));

import { GET, POST, DELETE } from '@/app/api/profile/claude-key/route';
import { getServerSession } from 'next-auth';

describe('API /api/profile/claude-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('GET /api/profile/claude-key', () => {
    it('should return 401 without session', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return {connected: false} when no key found', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connected).toBe(false);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should return {connected: true, maskedKey} when key exists', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      const encryptedKey = Buffer.from('sk-ant-api01-test-key-1234').toString('base64');
      mockClientQuery.mockResolvedValue({
        rows: [
          {
            claude_api_key: encryptedKey,
            claude_connected_at: '2025-01-01T10:00:00Z',
          },
        ],
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connected).toBe(true);
      expect(data.maskedKey).toBe('sk-ant-api...1234');
      expect(data.connectedAt).toBe('2025-01-01T10:00:00Z');
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  describe('POST /api/profile/claude-key', () => {
    it('should return 401 without session', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/profile/claude-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'sk-ant-api01-test-key' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for missing apiKey', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      const request = new NextRequest('http://localhost/api/profile/claude-key', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('API key is required');
    });

    it('should return 400 for invalid key format', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      const request = new NextRequest('http://localhost/api/profile/claude-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'invalid-key' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid Claude API key format');
    });

    it('should validate key against Anthropic API (mock fetch)', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      mockClientQuery.mockResolvedValue({ rows: [] });

      const request = new NextRequest('http://localhost/api/profile/claude-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'sk-ant-api01-test-key-1234' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.maskedKey).toBe('sk-ant-api...1234');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-api01-test-key-1234',
          }),
        })
      );
    });

    it('should save encrypted key on success', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      mockClientQuery.mockResolvedValue({ rows: [] });

      const request = new NextRequest('http://localhost/api/profile/claude-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'sk-ant-api01-test-key-1234' }),
      });
      await POST(request);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_profiles'),
        expect.arrayContaining([
          'test@example.com',
          expect.any(String), // encrypted key
          expect.any(String), // timestamp
        ])
      );
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should handle OAT token format (sk-ant-oat...)', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      mockClientQuery.mockResolvedValue({ rows: [] });

      const request = new NextRequest('http://localhost/api/profile/claude-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'sk-ant-oat01-test-token-abcd' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify OAT uses Bearer auth
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-ant-oat01-test-token-abcd',
            'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
            'user-agent': 'claude-cli/2.1.2 (external, cli)',
          }),
        })
      );
    });
  });

  describe('DELETE /api/profile/claude-key', () => {
    it('should return 401 without session', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should clear API key successfully', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      mockClientQuery.mockResolvedValue({ rows: [] });

      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_profiles'),
        ['test@example.com']
      );
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });
});
