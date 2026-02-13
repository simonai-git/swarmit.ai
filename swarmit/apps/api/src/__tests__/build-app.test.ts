import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';

// Mock all plugins to avoid real Redis/Prisma/Socket connections
// We wrap with fp (fastify-plugin) to break Fastify encapsulation, matching the real plugins.
// We wrap with fp to break Fastify encapsulation, matching the real plugins.
vi.mock('../plugins/prisma.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    prismaPlugin: fp(async (app: any) => {
      app.decorate('prisma', { $disconnect: vi.fn() });
    }),
  };
});
vi.mock('../plugins/auth.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    authPlugin: fp(async (app: any) => {
      app.decorateRequest('userId', '');
      app.decorate('authenticate', async () => {});
    }),
  };
});
vi.mock('../plugins/socket.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    socketPlugin: fp(async (app: any) => {
      app.decorate('io', { emit: vi.fn(), close: vi.fn() });
    }),
  };
});
vi.mock('../plugins/queue.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    default: fp(async (app: any) => {
      app.decorate('agentQueue', { add: vi.fn(), close: vi.fn() });
      app.decorate('lifecycleQueue', { add: vi.fn(), close: vi.fn() });
    }),
  };
});

// Mock all route modules to register a simple no-op route each
vi.mock('../routes/health.js', () => ({
  healthRoutes: async (app: any) => {
    app.get('/', async () => ({ ok: true }));
  },
}));
vi.mock('../routes/tasks.js', () => ({
  taskRoutes: async () => {},
}));
vi.mock('../routes/projects.js', () => ({
  projectRoutes: async () => {},
}));
vi.mock('../routes/agents.js', () => ({
  agentRoutes: async () => {},
}));
vi.mock('../routes/workflows.js', () => ({
  workflowRoutes: async () => {},
}));
vi.mock('../routes/specializations.js', () => ({
  specializationRoutes: async () => {},
}));
vi.mock('../routes/profile.js', () => ({
  profileRoutes: async () => {},
}));
vi.mock('../routes/runs.js', () => ({
  runRoutes: async () => {},
}));
vi.mock('../routes/dashboard.js', () => ({
  dashboardRoutes: async () => {},
}));
vi.mock('../routes/skills.js', () => ({
  skillRoutes: async () => {},
}));
vi.mock('../routes/costs.js', () => ({
  costRoutes: async () => {},
}));
vi.mock('../routes/notifications.js', () => ({
  notificationRoutes: async () => {},
}));
vi.mock('../routes/integrations.js', () => ({
  integrationRoutes: async () => {},
}));

// Mock logger to suppress output
vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { buildApp } from '../index.js';
import type { FastifyInstance } from 'fastify';

describe('buildApp()', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns a Fastify instance', async () => {
    app = await buildApp();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
    expect(typeof app.inject).toBe('function');
  });

  it('registers prisma decoration', async () => {
    app = await buildApp();
    await app.ready();
    expect(app.prisma).toBeDefined();
  });

  it('registers auth decoration', async () => {
    app = await buildApp();
    await app.ready();
    expect(app.authenticate).toBeDefined();
  });

  it('registers socket.io decoration', async () => {
    app = await buildApp();
    await app.ready();
    expect(app.io).toBeDefined();
    expect(app.io.emit).toBeDefined();
  });

  it('registers queue decorations', async () => {
    app = await buildApp();
    await app.ready();
    expect(app.agentQueue).toBeDefined();
    expect(app.lifecycleQueue).toBeDefined();
  });

  it('registers the /health route prefix', async () => {
    app = await buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  describe('error handler', () => {
    it('formats ZodError as 400 with validation details', async () => {
      app = await buildApp();

      // Register a test route that throws a ZodError
      app.get('/test-zod-error', async () => {
        const schema = z.object({
          name: z.string().min(3),
          age: z.number().positive(),
        });
        schema.parse({ name: '', age: -1 });
      });

      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/test-zod-error' });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('Validation error');
      expect(body.details).toBeDefined();
    });

    it('handles generic errors with statusCode', async () => {
      app = await buildApp();

      app.get('/test-generic-error', async () => {
        const err = new Error('Not Found') as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      });

      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/test-generic-error' });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBe('Not Found');
    });

    it('defaults to 500 when error has no statusCode', async () => {
      app = await buildApp();

      app.get('/test-500-error', async () => {
        throw new Error('Something went wrong');
      });

      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/test-500-error' });
      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.error).toBe('Something went wrong');
    });
  });
});
