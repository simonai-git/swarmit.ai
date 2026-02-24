import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, authHeaders, type MockPrisma } from './helpers.js';
import { notificationRoutes } from '../routes/notifications.js';

describe('notification routes', () => {
  let app: FastifyInstance;
  let prisma: MockPrisma;
  let headers: Record<string, string>;

  beforeAll(async () => {
    const testApp = await buildTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    await app.register(notificationRoutes, { prefix: '/notifications' });
    await app.ready();
    headers = await authHeaders();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === 'object' && model !== null) {
        Object.values(model).forEach((fn) => {
          if (typeof fn === 'function' && 'mockReset' in fn) {
            (fn as { mockReset: () => void }).mockReset();
          }
        });
      }
    });
  });

  it('GET /notifications returns paginated list', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n1', type: 'TASK_STATUS_CHANGED', title: 'Test', message: 'msg', isRead: false, createdAt: new Date() },
    ]);
    prisma.notification.count.mockResolvedValue(1);

    const res = await app.inject({
      method: 'GET',
      url: '/notifications?page=1&limit=10',
      headers,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.notifications).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('GET /notifications/unread-count returns count', async () => {
    prisma.notification.count.mockResolvedValue(5);

    const res = await app.inject({
      method: 'GET',
      url: '/notifications/unread-count',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ count: 5 });
  });

  it('PATCH /notifications/:id/read marks as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });

    const res = await app.inject({
      method: 'PATCH',
      url: '/notifications/n1/read',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
  });

  it('POST /notifications/read-all marks all as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    const res = await app.inject({
      method: 'POST',
      url: '/notifications/read-all',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
  });

  it('DELETE /notifications/:id deletes a notification', async () => {
    prisma.notification.deleteMany.mockResolvedValue({ count: 1 });

    const res = await app.inject({
      method: 'DELETE',
      url: '/notifications/n1',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'test-user-id' },
    });
  });

  it('DELETE /notifications deletes all notifications', async () => {
    prisma.notification.deleteMany.mockResolvedValue({ count: 5 });

    const res = await app.inject({
      method: 'DELETE',
      url: '/notifications',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'test-user-id' },
    });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notifications',
    });

    expect(res.statusCode).toBe(401);
  });
});
