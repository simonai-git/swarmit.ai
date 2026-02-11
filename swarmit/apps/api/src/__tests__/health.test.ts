import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import { healthRoutes } from '../routes/health.js';

describe('health routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let prisma: Awaited<ReturnType<typeof buildTestApp>>['prisma'];

  beforeEach(async () => {
    const result = await buildTestApp();
    app = result.app;
    prisma = result.prisma;
    await app.register(healthRoutes, { prefix: '/health' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready when database is connected', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const res = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ready');
      expect(body.database).toBe('connected');
    });

    it('should return not_ready when database is disconnected', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('Connection refused'));

      const res = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('not_ready');
      expect(body.database).toBe('disconnected');
    });
  });
});
