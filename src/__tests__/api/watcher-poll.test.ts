import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules
vi.mock('@/lib/db', () => ({
  getAllTasks: vi.fn(),
  getWatcherConfig: vi.fn(),
}));

vi.mock('@/lib/agent-queue', () => ({
  agentQueue: {
    enqueue: vi.fn(),
    getStatus: vi.fn(),
    startProcessing: vi.fn(),
  },
}));

// Set env for tests
process.env.SIMON_API_KEY = 'test-api-key';

import { POST, GET } from '@/app/api/watcher/poll/route';
import { getAllTasks, getWatcherConfig } from '@/lib/db';
import { agentQueue } from '@/lib/agent-queue';

describe('API /api/watcher/poll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/watcher/poll', () => {
    it('should return unauthorized without API key', async () => {
      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should do nothing when watcher is paused', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: false } as any);

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toContain('paused');
      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should enqueue todo tasks when watcher is running', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getAllTasks).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'high' },
        { id: 'task-2', status: 'in_progress', priority: 'medium' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        pending: 0,
        running: 0,
      } as any);

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.enqueued).toBe(1); // Only the todo task
      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1' })
      );
    });

    it('should not enqueue tasks already in queue', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getAllTasks).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'high' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ taskId: 'task-1' }],
        pending: 1,
        running: 0,
      } as any);

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.enqueued).toBe(0);
    });

    it('should set correct priority for high priority tasks', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getAllTasks).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'high' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        pending: 0,
        running: 0,
      } as any);

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      await POST(request);

      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 10 })
      );
    });

    it('should set correct priority for low priority tasks', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getAllTasks).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'low' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        pending: 0,
        running: 0,
      } as any);

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      await POST(request);

      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 1 })
      );
    });

    it('should call startProcessing', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getAllTasks).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        pending: 0,
        running: 0,
      } as any);

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      await POST(request);

      expect(agentQueue.startProcessing).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(getWatcherConfig).mockRejectedValue(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/watcher/poll', () => {
    it('should return unauthorized without API key', async () => {
      const request = new NextRequest('http://localhost/api/watcher/poll');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return watcher status', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({
        is_running: true,
        last_run: '2026-02-05T00:00:00Z',
      } as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        pending: 2,
        running: 1,
        jobs: [],
      } as any);
      vi.mocked(getAllTasks).mockResolvedValue([
        { id: '1', status: 'todo' },
        { id: '2', status: 'in_progress' },
        { id: '3', status: 'todo' },
      ] as any);

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.watcher.isRunning).toBe(true);
      expect(data.queue.pending).toBe(2);
      expect(data.queue.running).toBe(1);
      expect(data.tasks.todo).toBe(2);
      expect(data.tasks.total).toBe(3);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(getWatcherConfig).mockRejectedValue(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });
});
