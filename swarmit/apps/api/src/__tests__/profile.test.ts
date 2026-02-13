import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, createTestToken, type MockPrisma } from './helpers.js';
import { profileRoutes } from '../routes/profile.js';

describe('profile routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: MockPrisma;
  let token: string;

  beforeEach(async () => {
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;

    // Add missing create mock for automationSetting
    (prisma.automationSetting as any).create = vi.fn();

    await app.register(profileRoutes, { prefix: '/profile' });
    await app.ready();
    token = await createTestToken();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /profile should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/profile' });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /profile should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        payload: { name: 'New Name' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /profile/automation should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/profile/automation' });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /profile/automation should return 401 without auth', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        payload: { autoAssign: true },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /profile ──────────────────────────────────────────────

  describe('GET /profile', () => {
    it('should return user profile with masked API key', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        plan: 'free',
        claudeApiKey: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
        createdAt: '2024-01-01T00:00:00Z',
      };

      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const res = await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('test-user-id');
      expect(body.email).toBe('test@example.com');
      expect(body.name).toBe('Test User');
      // API key should be masked: first 12 chars + ... + last 4 chars
      expect(body.claudeApiKey).toBe('sk-ant-api03...wxyz');
      expect(body.claudeApiKey).not.toContain('abcdefghijklmnopqrstuvwxyz');
    });

    it('should return null claudeApiKey when user has no key', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        image: null,
        plan: 'free',
        claudeApiKey: null,
        createdAt: '2024-01-01T00:00:00Z',
      };

      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const res = await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.claudeApiKey).toBeNull();
    });

    it('should return error when user not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.error).toBe('User not found');
    });

    it('should query by the authenticated user id', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-user-id' },
        })
      );
    });

    it('should select only the required fields', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            plan: true,
            claudeApiKey: true,
            createdAt: true,
          },
        })
      );
    });

    it('should handle empty string API key as truthy and mask it', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        image: null,
        plan: 'free',
        claudeApiKey: 'short-key-12345678',
        createdAt: '2024-01-01T00:00:00Z',
      };

      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const res = await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // 'short-key-12345678' -> first 12 = 'short-key-12' + '...' + last 4 = '5678'
      expect(body.claudeApiKey).toBe('short-key-12...5678');
    });
  });

  // ─── PATCH /profile ─────────────────────────────────────────────

  describe('PATCH /profile', () => {
    it('should update user name', async () => {
      prisma.user.update.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Name' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-user-id' },
          data: expect.objectContaining({ name: 'Updated Name' }),
        })
      );
    });

    it('should update Claude API key', async () => {
      prisma.user.update.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { claudeApiKey: 'sk-ant-new-key-12345' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should clear claudeApiKey when set to null', async () => {
      prisma.user.update.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { claudeApiKey: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ claudeApiKey: null }),
        })
      );
    });

    it('should reject invalid payload with validation error', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: '' }, // min 1 char
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject name exceeding max length', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'a'.repeat(101) }, // max 100 chars
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should update with both name and API key', async () => {
      prisma.user.update.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'New Name', claudeApiKey: 'sk-new-key' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });
  });

  // ─── GET /profile/automation ──────────────────────────────────

  describe('GET /profile/automation', () => {
    it('should return existing automation settings', async () => {
      const mockSettings = {
        id: 'setting-1',
        userId: 'test-user-id',
        autoAssign: true,
        autoSpawn: false,
        defaultModel: 'claude-sonnet-4-5-20250929',
        maxConcurrentAgents: 5,
        dailyBudgetCents: 1000,
      };

      prisma.automationSetting.findUnique.mockResolvedValueOnce(mockSettings);

      const res = await app.inject({
        method: 'GET',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.autoAssign).toBe(true);
      expect(body.autoSpawn).toBe(false);
      expect(body.maxConcurrentAgents).toBe(5);
    });

    it('should create default settings when none exist', async () => {
      const defaultSettings = {
        id: 'setting-new',
        userId: 'test-user-id',
        autoAssign: false,
        autoSpawn: false,
        defaultModel: null,
        maxConcurrentAgents: 3,
        dailyBudgetCents: 0,
      };

      prisma.automationSetting.findUnique.mockResolvedValueOnce(null);
      (prisma.automationSetting as any).create.mockResolvedValueOnce(defaultSettings);

      const res = await app.inject({
        method: 'GET',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect((prisma.automationSetting as any).create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 'test-user-id' },
        })
      );
    });

    it('should query by the authenticated user id', async () => {
      prisma.automationSetting.findUnique.mockResolvedValueOnce({
        id: 'setting-1',
        userId: 'test-user-id',
      });

      await app.inject({
        method: 'GET',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(prisma.automationSetting.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        })
      );
    });
  });

  // ─── PATCH /profile/automation ────────────────────────────────

  describe('PATCH /profile/automation', () => {
    it('should upsert automation settings', async () => {
      prisma.automationSetting.upsert.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
        payload: { autoAssign: true, autoSpawn: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(prisma.automationSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
          create: expect.objectContaining({
            autoAssign: true,
            autoSpawn: true,
            userId: 'test-user-id',
          }),
          update: { autoAssign: true, autoSpawn: true },
        })
      );
    });

    it('should update defaultModel', async () => {
      prisma.automationSetting.upsert.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
        payload: { defaultModel: 'claude-opus-4-20250514' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should update maxConcurrentAgents', async () => {
      prisma.automationSetting.upsert.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
        payload: { maxConcurrentAgents: 10 },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.automationSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { maxConcurrentAgents: 10 },
        })
      );
    });

    it('should update dailyBudgetCents', async () => {
      prisma.automationSetting.upsert.mockResolvedValueOnce({});

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
        payload: { dailyBudgetCents: 5000 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should reject maxConcurrentAgents below minimum', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
        payload: { maxConcurrentAgents: 0 }, // min is 1
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject maxConcurrentAgents above maximum', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
        payload: { maxConcurrentAgents: 21 }, // max is 20
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should reject negative dailyBudgetCents', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
        payload: { dailyBudgetCents: -100 }, // min is 0
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should update multiple fields at once', async () => {
      prisma.automationSetting.upsert.mockResolvedValueOnce({});

      const payload = {
        autoAssign: true,
        autoSpawn: false,
        defaultModel: 'claude-sonnet-4-5-20250929',
        maxConcurrentAgents: 8,
        dailyBudgetCents: 2500,
      };

      const res = await app.inject({
        method: 'PATCH',
        url: '/profile/automation',
        headers: { authorization: `Bearer ${token}` },
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.automationSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: payload,
        })
      );
    });
  });
});
