import type { FastifyInstance } from 'fastify';
import { paginationSchema } from '@swarmit/shared';
import { NotificationService } from '../services/notification.service.js';

export async function notificationRoutes(app: FastifyInstance) {
  const notificationService = new NotificationService(app.prisma, app.io);

  // List notifications (paginated)
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const query = request.query as Record<string, string>;
    const unreadOnly = query.unreadOnly === 'true';

    const { notifications, total } = await notificationService.getNotifications(
      request.userId,
      page,
      limit,
      unreadOnly,
    );

    return { notifications, total, page, limit };
  });

  // Get unread count
  app.get('/unread-count', { preHandler: [app.authenticate] }, async (request) => {
    const count = await notificationService.getUnreadCount(request.userId);
    return { count };
  });

  // Mark single notification as read
  app.patch<{ Params: { id: string } }>('/:id/read', { preHandler: [app.authenticate] }, async (request) => {
    await notificationService.markAsRead(request.params.id, request.userId);
    return { success: true };
  });

  // Mark all as read
  app.post('/read-all', { preHandler: [app.authenticate] }, async (request) => {
    await notificationService.markAllAsRead(request.userId);
    return { success: true };
  });
}
