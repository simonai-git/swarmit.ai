import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing the route
vi.mock('@/lib/db', () => ({
  getTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  logActivity: vi.fn(),
  getProject: vi.fn(),
  getTaskDependents: vi.fn(),
  recalculateBlockedStatus: vi.fn(),
}));

vi.mock('@/lib/webhook', () => ({
  sendWebhook: vi.fn(),
}));

vi.mock('@/lib/task-lifecycle', () => ({
  onTaskStatusChanged: vi.fn(() => Promise.resolve()),
  onTaskAssigned: vi.fn(() => Promise.resolve()),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

import { PATCH, DELETE } from '@/app/api/tasks/[id]/route';
import { getTask, updateTask, deleteTask, logActivity, getProject, getTaskDependents, recalculateBlockedStatus } from '@/lib/db';
import { sendWebhook } from '@/lib/webhook';
import { onTaskStatusChanged, onTaskAssigned } from '@/lib/task-lifecycle';

describe('API /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SIMON_API_KEY = 'test-api-key';
  });

  describe('PATCH /api/tasks/:id', () => {
    it('should return 404 if task not found', async () => {
      vi.mocked(getTask).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Task not found');
    });

    it('should update task and return it', async () => {
      const oldTask = {
        id: 'task-123',
        title: 'Test Task',
        status: 'todo',
        assignee: 'Simon',
        priority: 'medium',
        project_id: null,
        worked_by: null,
      };
      const updatedTask = { ...oldTask, status: 'in_progress' };

      vi.mocked(getTask).mockResolvedValue(oldTask as any);
      vi.mocked(updateTask).mockResolvedValue(updatedTask as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('in_progress');
      expect(updateTask).toHaveBeenCalledWith('task-123', expect.objectContaining({ status: 'in_progress' }));
    });

    it('should log activity for changed fields', async () => {
      const oldTask = {
        id: 'task-123',
        title: 'Test Task',
        status: 'todo',
        priority: 'medium',
        assignee: 'Simon',
        project_id: null,
        worked_by: null,
      };
      const updatedTask = { ...oldTask, status: 'in_progress', priority: 'high' };

      vi.mocked(getTask).mockResolvedValue(oldTask as any);
      vi.mocked(updateTask).mockResolvedValue(updatedTask as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress', priority: 'high' }),
      });
      await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(logActivity).toHaveBeenCalledTimes(2);
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
        task_id: 'task-123',
        action: 'updated',
        field_changed: 'status',
        old_value: 'todo',
        new_value: 'in_progress',
        actor: 'Bogdan',
      }));
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
        field_changed: 'priority',
        old_value: 'medium',
        new_value: 'high',
      }));
    });

    it('should auto-assign reviewer when status changes to in_review', async () => {
      const oldTask = {
        id: 'task-123',
        title: 'Test Task',
        status: 'in_progress',
        assignee: 'Simon',
        project_id: 'proj-1',
        worked_by: null,
      };
      const updatedTask = { ...oldTask, status: 'in_review', assignee: 'Bogdan' };

      vi.mocked(getTask).mockResolvedValue(oldTask as any);
      vi.mocked(getProject).mockResolvedValue({ id: 'proj-1', reviewer: 'Bogdan' } as any);
      vi.mocked(updateTask).mockResolvedValue(updatedTask as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_review' }),
      });
      await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(updateTask).toHaveBeenCalledWith('task-123', expect.objectContaining({
        status: 'in_review',
        assignee: 'Bogdan',
      }));
    });

    it('should auto-assign Simon when reviewer moves back to todo/in_progress', async () => {
      const oldTask = {
        id: 'task-123',
        title: 'Test Task',
        status: 'in_review',
        assignee: 'Bogdan',
        project_id: 'proj-1',
        worked_by: null,
      };
      const updatedTask = { ...oldTask, status: 'in_progress', assignee: 'Simon' };

      vi.mocked(getTask).mockResolvedValue(oldTask as any);
      vi.mocked(getProject).mockResolvedValue({ id: 'proj-1', reviewer: 'Bogdan' } as any);
      vi.mocked(updateTask).mockResolvedValue(updatedTask as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });
      await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(updateTask).toHaveBeenCalledWith('task-123', expect.objectContaining({
        status: 'in_progress',
        assignee: 'Simon',
      }));
    });

    it('should track worked_by contributors on work-related status changes', async () => {
      const oldTask = {
        id: 'task-123',
        title: 'Test Task',
        status: 'todo',
        assignee: 'Simon',
        project_id: null,
        worked_by: null,
      };
      const updatedTask = { ...oldTask, status: 'in_progress', worked_by: '["Bogdan"]' };

      vi.mocked(getTask).mockResolvedValue(oldTask as any);
      vi.mocked(updateTask).mockResolvedValue(updatedTask as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });
      await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(updateTask).toHaveBeenCalledWith('task-123', expect.objectContaining({
        worked_by: '["Bogdan"]',
      }));
    });

    it('should recalculate blocked status for dependents when status=done', async () => {
      const oldTask = {
        id: 'task-123',
        title: 'Test Task',
        status: 'in_progress',
        assignee: 'Simon',
        project_id: null,
        worked_by: null,
      };
      const updatedTask = { ...oldTask, status: 'done' };
      const dependents = [
        { task_id: 'dep-1', depends_on_task_id: 'task-123' },
        { task_id: 'dep-2', depends_on_task_id: 'task-123' },
      ];

      vi.mocked(getTask).mockResolvedValue(oldTask as any);
      vi.mocked(updateTask).mockResolvedValue(updatedTask as any);
      vi.mocked(getTaskDependents).mockResolvedValue(dependents as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });
      await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(getTaskDependents).toHaveBeenCalledWith('task-123');
      expect(recalculateBlockedStatus).toHaveBeenCalledTimes(2);
      expect(recalculateBlockedStatus).toHaveBeenCalledWith('dep-1');
      expect(recalculateBlockedStatus).toHaveBeenCalledWith('dep-2');
    });

    it('should send webhook on update', async () => {
      const oldTask = {
        id: 'task-123',
        title: 'Test Task',
        status: 'todo',
        assignee: 'Simon',
        project_id: null,
        worked_by: null,
      };
      const updatedTask = { ...oldTask, status: 'in_progress' };

      vi.mocked(getTask).mockResolvedValue(oldTask as any);
      vi.mocked(updateTask).mockResolvedValue(updatedTask as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });
      await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(sendWebhook).toHaveBeenCalledWith({
        event: 'task.updated',
        task: updatedTask,
      });
    });

    it('should handle errors gracefully (500)', async () => {
      vi.mocked(getTask).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(response.status).toBe(500);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should return 404 if task not found (deleteTask returns false)', async () => {
      vi.mocked(getTask).mockResolvedValue(null);
      vi.mocked(deleteTask).mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Task not found');
    });

    it('should delete task and return success', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
        status: 'todo',
      };

      vi.mocked(getTask).mockResolvedValue(task as any);
      vi.mocked(deleteTask).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(deleteTask).toHaveBeenCalledWith('task-123');
    });

    it('should send webhook on delete', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
        status: 'todo',
      };

      vi.mocked(getTask).mockResolvedValue(task as any);
      vi.mocked(deleteTask).mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'DELETE',
      });
      await DELETE(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(sendWebhook).toHaveBeenCalledWith({
        event: 'task.deleted',
        task: task,
      });
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(getTask).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/tasks/task-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(response.status).toBe(500);
    });
  });
});
