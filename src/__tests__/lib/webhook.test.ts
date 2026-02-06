import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWebhook, sendCommentWebhook, WebhookPayload, CommentWebhookPayload } from '@/lib/webhook';

describe('webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockResolvedValue(new Response('ok'));
  });

  describe('sendWebhook', () => {
    it('sends POST to ntfy.sh with correct Title header', async () => {
      const payload: WebhookPayload = {
        event: 'task.created',
        task: {
          id: 'task-1',
          title: 'Test Task',
          description: 'Test description',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ntfy.sh'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Title: 'New Task: Test Task',
          }),
        })
      );
    });

    it('maps event types to titles: created -> New Task', async () => {
      const payload: WebhookPayload = {
        event: 'task.created',
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Title: 'New Task: Test Task',
          }),
        })
      );
    });

    it('maps event types to titles: updated -> Updated', async () => {
      const payload: WebhookPayload = {
        event: 'task.updated',
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'in_progress',
          assignee: 'user@test.com',
          priority: 'medium',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Title: 'Updated: Test Task',
          }),
        })
      );
    });

    it('maps event types to titles: deleted -> Deleted', async () => {
      const payload: WebhookPayload = {
        event: 'task.deleted',
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Title: 'Deleted: Test Task',
          }),
        })
      );
    });

    it('maps event types to titles: completed -> Completed', async () => {
      const payload: WebhookPayload = {
        event: 'task.completed',
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'done',
          assignee: 'user@test.com',
          priority: 'medium',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Title: 'Completed: Test Task',
          }),
        })
      );
    });

    it('sets priority header based on task priority: high=5', async () => {
      const payload: WebhookPayload = {
        event: 'task.created',
        task: {
          id: 'task-1',
          title: 'High Priority Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'high',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Priority: '5',
          }),
        })
      );
    });

    it('sets priority header based on task priority: medium=3', async () => {
      const payload: WebhookPayload = {
        event: 'task.created',
        task: {
          id: 'task-1',
          title: 'Medium Priority Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Priority: '3',
          }),
        })
      );
    });

    it('sets priority header based on task priority: low=2', async () => {
      const payload: WebhookPayload = {
        event: 'task.created',
        task: {
          id: 'task-1',
          title: 'Low Priority Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'low',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Priority: '2',
          }),
        })
      );
    });

    it('sets tags to tada for completed events', async () => {
      const payload: WebhookPayload = {
        event: 'task.completed',
        task: {
          id: 'task-1',
          title: 'Completed Task',
          status: 'done',
          assignee: 'user@test.com',
          priority: 'high',
        },
      };

      await sendWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Tags: 'tada',
          }),
        })
      );
    });

    it('includes description, priority, assignee in body', async () => {
      const payload: WebhookPayload = {
        event: 'task.created',
        task: {
          id: 'task-1',
          title: 'Test Task',
          description: 'This is a test task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'high',
        },
      };

      await sendWebhook(payload);

      const call = vi.mocked(global.fetch).mock.calls[0];
      const body = call[1]?.body as string;

      expect(body).toContain('This is a test task');
      expect(body).toContain('Priority: HIGH');
      expect(body).toContain('Assignee: user@test.com');
    });

    it('handles missing description gracefully', async () => {
      const payload: WebhookPayload = {
        event: 'task.created',
        task: {
          id: 'task-1',
          title: 'Test Task',
          description: null,
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
        },
      };

      await sendWebhook(payload);

      const call = vi.mocked(global.fetch).mock.calls[0];
      const body = call[1]?.body as string;

      expect(body).toContain('No description');
    });

    it('does NOT throw on fetch error', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const payload: WebhookPayload = {
        event: 'task.created',
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'todo',
          assignee: 'user@test.com',
          priority: 'medium',
        },
      };

      await expect(sendWebhook(payload)).resolves.not.toThrow();
    });
  });

  describe('sendCommentWebhook', () => {
    it('sends POST with comment author and content', async () => {
      const payload: CommentWebhookPayload = {
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'in_progress',
          assignee: 'user@test.com',
        },
        comment: {
          author: 'reviewer@test.com',
          content: 'This looks good!',
        },
      };

      await sendCommentWebhook(payload);

      const call = vi.mocked(global.fetch).mock.calls[0];
      const body = call[1]?.body as string;

      expect(body).toContain('From: reviewer@test.com');
      expect(body).toContain('This looks good!');
    });

    it('sets priority to 4', async () => {
      const payload: CommentWebhookPayload = {
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'in_progress',
          assignee: 'user@test.com',
        },
        comment: {
          author: 'reviewer@test.com',
          content: 'Comment text',
        },
      };

      await sendCommentWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Priority: '4',
          }),
        })
      );
    });

    it('sets tags to speech_balloon', async () => {
      const payload: CommentWebhookPayload = {
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'in_progress',
          assignee: 'user@test.com',
        },
        comment: {
          author: 'reviewer@test.com',
          content: 'Comment text',
        },
      };

      await sendCommentWebhook(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Tags: 'speech_balloon',
          }),
        })
      );
    });

    it('does NOT throw on fetch error', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const payload: CommentWebhookPayload = {
        task: {
          id: 'task-1',
          title: 'Test Task',
          status: 'in_progress',
          assignee: 'user@test.com',
        },
        comment: {
          author: 'reviewer@test.com',
          content: 'Comment text',
        },
      };

      await expect(sendCommentWebhook(payload)).resolves.not.toThrow();
    });
  });
});
