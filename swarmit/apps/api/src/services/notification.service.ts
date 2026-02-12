import type { PrismaClient } from '@swarmit/db';
import type { Server } from 'socket.io';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('notification');

export class NotificationService {
  private ntfyTopic: string;

  constructor(
    private prisma?: PrismaClient,
    private io?: Server,
  ) {
    this.ntfyTopic = process.env.NTFY_TOPIC || '';
  }

  private get ntfyUrl(): string {
    return `https://ntfy.sh/${this.ntfyTopic}`;
  }

  private get ntfyEnabled(): boolean {
    return !!this.ntfyTopic;
  }

  /**
   * Create a notification in DB and emit via Socket.io.
   */
  async createNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    let notification: unknown = null;

    if (this.prisma) {
      notification = await this.prisma.notification.create({
        data: {
          userId,
          type: type as any,
          title,
          message,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        },
      });
    }

    // Emit via Socket.io to user room
    if (this.io) {
      this.io.to(`user:${userId}`).emit('notification:new', {
        type,
        title,
        message,
        metadata,
        createdAt: new Date().toISOString(),
      });
    }

    // Send via ntfy.sh as fallback
    if (this.ntfyEnabled) {
      try {
        await fetch(this.ntfyUrl, {
          method: 'POST',
          headers: { 'Title': title, 'Priority': '3', 'Tags': 'bell' },
          body: message,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to send ntfy notification');
      }
    }

    return notification;
  }

  /**
   * Get paginated notifications.
   */
  async getNotifications(userId: string, page: number, limit: number, unreadOnly?: boolean) {
    if (!this.prisma) return { notifications: [], total: 0 };

    const where: Record<string, unknown> = { userId };
    if (unreadOnly) where.isRead = false;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  /**
   * Get unread notification count.
   */
  async getUnreadCount(userId: string): Promise<number> {
    if (!this.prisma) return 0;
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(id: string, userId: string) {
    if (!this.prisma) return;
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead(userId: string) {
    if (!this.prisma) return;
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  // Legacy ntfy-only methods for backward compatibility

  async sendTaskNotification(payload: {
    event: string;
    task: {
      id: string;
      title: string;
      description?: string | null;
      status: string;
      assigneeName?: string;
      priority: number;
    };
  }): Promise<void> {
    if (!this.ntfyEnabled) return;

    try {
      const eventLabels: Record<string, string> = {
        'task.created': 'New Task',
        'task.updated': 'Updated',
        'task.deleted': 'Deleted',
        'task.completed': 'Completed',
      };

      const title = `${eventLabels[payload.event] || 'Updated'}: ${payload.task.title}`;
      const message = [
        payload.task.description || 'No description',
        '',
        `Priority: ${payload.task.priority}`,
        payload.task.assigneeName ? `Assignee: ${payload.task.assigneeName}` : 'Unassigned',
      ].filter(Boolean).join('\n');

      const priority = payload.task.priority >= 3 ? '5' : payload.task.priority >= 2 ? '3' : '2';
      const tags = payload.event === 'task.completed' ? 'tada' : priority === '5' ? 'rotating_light' : 'white_check_mark';

      await fetch(this.ntfyUrl, {
        method: 'POST',
        headers: { 'Title': title, 'Priority': priority, 'Tags': tags },
        body: message,
      });

      logger.info({ event: payload.event, taskId: payload.task.id }, 'Notification sent');
    } catch (err) {
      logger.error({ err }, 'Failed to send notification');
    }
  }

  async sendCommentNotification(payload: {
    task: { id: string; title: string; status: string };
    comment: { author: string; content: string };
  }): Promise<void> {
    if (!this.ntfyEnabled) return;

    try {
      const title = `Comment on: ${payload.task.title}`;
      const message = [
        `From: ${payload.comment.author}`,
        '',
        payload.comment.content,
        '',
        `Task Status: ${payload.task.status}`,
      ].join('\n');

      await fetch(this.ntfyUrl, {
        method: 'POST',
        headers: { 'Title': title, 'Priority': '4', 'Tags': 'speech_balloon' },
        body: message,
      });

      logger.info({ taskId: payload.task.id, author: payload.comment.author }, 'Comment notification sent');
    } catch (err) {
      logger.error({ err }, 'Failed to send comment notification');
    }
  }
}
