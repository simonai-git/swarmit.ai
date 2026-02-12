import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('socket');

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export const socketPlugin = fp(async (app: FastifyInstance) => {
  const io = new Server(app.server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    },
    path: '/socket.io',
  });

  // Setup Redis adapter if REDIS_URL is available
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.io Redis adapter connected');
  }

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    socket.on('task:subscribe', ({ taskId }: { taskId: string }) => {
      socket.join(`task:${taskId}`);
    });

    socket.on('task:unsubscribe', ({ taskId }: { taskId: string }) => {
      socket.leave(`task:${taskId}`);
    });

    socket.on('project:subscribe', ({ projectId }: { projectId: string }) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('project:unsubscribe', ({ projectId }: { projectId: string }) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('user:subscribe', ({ userId }: { userId: string }) => {
      socket.join(`user:${userId}`);
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected');
    });
  });

  // Subscribe to Redis channels for worker events
  if (redisUrl) {
    const subscriber = new Redis(redisUrl);
    subscriber.subscribe('task-logs', 'task-updates', 'project-updates', 'notifications');

    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        switch (channel) {
          case 'task-logs':
            io.to(`task:${data.taskId}`).emit('task:log', data);
            break;
          case 'task-updates':
            io.emit('tasks:updated', data);
            break;
          case 'project-updates':
            io.emit('project:updated', data);
            break;
          case 'notifications':
            if (data.userId) {
              // Create notification in DB via prisma (if available on app)
              io.to(`user:${data.userId}`).emit('notification:new', data);
            }
            break;
        }
      } catch (err) {
        logger.error({ err, channel }, 'Failed to parse Redis message');
      }
    });
  }

  app.decorate('io', io);

  app.addHook('onClose', async () => {
    io.close();
  });
});
