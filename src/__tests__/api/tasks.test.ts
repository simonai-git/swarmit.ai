import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing the route
vi.mock('@/lib/db', () => ({
  getAllTasks: vi.fn(),
  getTasksByUserEmail: vi.fn(),
  createTask: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  searchTasks: vi.fn(),
  getAutomationUserEmail: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('@/lib/webhook', () => ({
  sendWebhook: vi.fn(),
}));

vi.mock('@/lib/task-lifecycle', () => ({
  onTaskCreated: vi.fn(() => Promise.resolve()),
  selectSpecialist: vi.fn(() => 'Simon'),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { GET, POST } from '@/app/api/tasks/route';
import { getAllTasks, createTask } from '@/lib/db';

describe('API /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/tasks', () => {
    it('should return all tasks', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'todo' },
        { id: '2', title: 'Task 2', status: 'in_progress' },
      ];
      vi.mocked(getAllTasks).mockResolvedValue(mockTasks as any);

      const request = new NextRequest('http://localhost/api/tasks');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(getAllTasks).toHaveBeenCalled();
    });

    it('should filter tasks by status', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'todo' },
        { id: '2', title: 'Task 2', status: 'in_progress' },
        { id: '3', title: 'Task 3', status: 'todo' },
      ];
      vi.mocked(getAllTasks).mockResolvedValue(mockTasks as any);

      const request = new NextRequest('http://localhost/api/tasks?status=todo');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data.every((t: any) => t.status === 'todo')).toBe(true);
    });

    it('should filter by multiple statuses (comma-separated)', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'todo' },
        { id: '2', title: 'Task 2', status: 'in_progress' },
        { id: '3', title: 'Task 3', status: 'done' },
      ];
      vi.mocked(getAllTasks).mockResolvedValue(mockTasks as any);

      const request = new NextRequest('http://localhost/api/tasks?status=todo,in_progress');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(getAllTasks).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/tasks');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async () => {
      const newTask = {
        id: 'test-uuid-123',
        title: 'New Task',
        status: 'todo',
        assignee: 'Simon',
        priority: 'medium',
      };
      vi.mocked(createTask).mockResolvedValue(newTask as any);

      const request = new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Task' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.title).toBe('New Task');
      expect(createTask).toHaveBeenCalled();
    });

    it('should auto-assign specialist if no assignee', async () => {
      const newTask = {
        id: 'test-uuid-123',
        title: 'Fix button CSS',
        status: 'todo',
        assignee: 'Simon',
        priority: 'medium',
      };
      vi.mocked(createTask).mockResolvedValue(newTask as any);

      const request = new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Fix button CSS' }),
      });
      await POST(request);

      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          assignee: 'Simon',
        })
      );
    });

    it('should handle creation errors', async () => {
      vi.mocked(createTask).mockRejectedValue(new Error('Creation failed'));

      const request = new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Task' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });
});
