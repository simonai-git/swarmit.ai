import { createLogger } from '@swarmit/logger';

const logger = createLogger('notification');

export interface TaskNotification {
  event: 'task.created' | 'task.updated' | 'task.completed' | 'task.deleted';
  task: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    assigneeName?: string;
    priority: number;
  };
}

export interface CommentNotification {
  task: {
    id: string;
    title: string;
    status: string;
  };
  comment: {
    author: string;
    content: string;
  };
}

export class NotificationService {
  private ntfyTopic: string;

  constructor() {
    this.ntfyTopic = process.env.NTFY_TOPIC || '';
  }

  private get ntfyUrl(): string {
    return `https://ntfy.sh/${this.ntfyTopic}`;
  }

  private get enabled(): boolean {
    return !!this.ntfyTopic;
  }

  async sendTaskNotification(payload: TaskNotification): Promise<void> {
    if (!this.enabled) return;

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

  async sendCommentNotification(payload: CommentNotification): Promise<void> {
    if (!this.enabled) return;

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
