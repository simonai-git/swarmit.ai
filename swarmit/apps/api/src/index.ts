import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { createLogger } from '@swarmit/logger';
import { prismaPlugin } from './plugins/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { socketPlugin } from './plugins/socket.js';
import queuePlugin from './plugins/queue.js';
import { healthRoutes } from './routes/health.js';
import { taskRoutes } from './routes/tasks.js';
import { projectRoutes } from './routes/projects.js';
import { agentRoutes } from './routes/agents.js';
import { workflowRoutes } from './routes/workflows.js';
import { specializationRoutes } from './routes/specializations.js';
import { profileRoutes } from './routes/profile.js';
import { runRoutes } from './routes/runs.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { skillRoutes } from './routes/skills.js';
import { costRoutes } from './routes/costs.js';
import { notificationRoutes } from './routes/notifications.js';
import { integrationRoutes } from './routes/integrations.js';

const logger = createLogger('api');

export async function buildApp() {
  const app = Fastify({
    logger: false,
  });

  // Plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(socketPlugin);
  await app.register(queuePlugin);

  // Zod validation error handler
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation error',
        details: error.flatten().fieldErrors,
      });
    }
    reply.code(error.statusCode ?? 500).send({ error: error.message });
  });

  // Routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(taskRoutes, { prefix: '/tasks' });
  await app.register(projectRoutes, { prefix: '/projects' });
  await app.register(agentRoutes, { prefix: '/agents' });
  await app.register(workflowRoutes, { prefix: '/workflows' });
  await app.register(specializationRoutes, { prefix: '/specializations' });
  await app.register(profileRoutes, { prefix: '/profile' });
  await app.register(runRoutes, { prefix: '/runs' });
  await app.register(dashboardRoutes, { prefix: '/dashboard' });
  await app.register(skillRoutes, { prefix: '/skills' });
  await app.register(costRoutes, { prefix: '/costs' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(integrationRoutes, { prefix: '/integrations' });

  return app;
}

async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '4000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    logger.info(`API server listening on ${host}:${port}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
