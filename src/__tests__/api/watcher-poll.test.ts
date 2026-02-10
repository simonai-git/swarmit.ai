import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules
vi.mock('@/lib/db', () => ({
  getAllTasks: vi.fn(),
  getWatcherConfig: vi.fn(),
  getUsersWithApiKeys: vi.fn(),
  getTasksByUserId: vi.fn(),
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
import { getAllTasks, getWatcherConfig, getUsersWithApiKeys, getTasksByUserId } from '@/lib/db';
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
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ id: 'user-test-123', email: 'user@test.com' }]);
      vi.mocked(getTasksByUserId).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'high', user_id: 'user-test-123' },
        { id: 'task-2', status: 'in_progress', priority: 'medium', user_id: 'user-test-123' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

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
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ id: 'user-test-123', email: 'user@test.com' }]);
      vi.mocked(getTasksByUserId).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'high', user_id: 'user-test-123' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ taskId: 'task-1', status: 'pending' } as any],
        activeRuns: [],
        pending: 1,
        running: 0,
        completed: 0,
        failed: 0,
      });

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
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ id: 'user-test-123', email: 'user@test.com' }]);
      vi.mocked(getTasksByUserId).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'high', user_id: 'user-test-123' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

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
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ id: 'user-test-123', email: 'user@test.com' }]);
      vi.mocked(getTasksByUserId).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'low', user_id: 'user-test-123' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

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
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

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

    it('should pass tenantId and userId to enqueue', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ id: 'user-auto-456', email: 'automation@example.com' }]);
      vi.mocked(getTasksByUserId).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'medium', user_id: 'user-auto-456' },
      ] as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      await POST(request);

      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-auto-456',
          tenantId: 'user-auto-456',
        })
      );
    });

    it('should not enqueue when no users with API keys', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([]);
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      await POST(request);

      expect(agentQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should still enqueue tasks when getStatus fails (Redis down)', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([{ id: 'user-test-123', email: 'user@test.com' }]);
      vi.mocked(getTasksByUserId).mockResolvedValue([
        { id: 'task-1', status: 'todo', priority: 'medium', user_id: 'user-test-123' },
      ] as any);
      // getStatus fails (Redis down) — should still attempt to enqueue
      vi.mocked(agentQueue.getStatus).mockRejectedValue(new Error('Redis connection refused'));

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await POST(request);

      // Should not return 500 — should gracefully degrade
      expect(response.status).toBe(200);
      // Should still attempt to enqueue (no dedup info, but that's ok)
      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1' })
      );
    });

    it('should return 200 with zero queue stats when getStatus fails for GET response', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({ is_running: true } as any);
      vi.mocked(getUsersWithApiKeys).mockResolvedValue([]);
      // All getStatus calls fail
      vi.mocked(agentQueue.getStatus).mockRejectedValue(new Error('Redis connection refused'));

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.queueStatus.pending).toBe(0);
      expect(data.queueStatus.running).toBe(0);
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
        activeRuns: [],
        completed: 0,
        failed: 0,
      });
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

    it('should return 200 with zero queue stats when getStatus fails (Redis down)', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({
        is_running: true,
        last_run: '2026-02-05T00:00:00Z',
      } as any);
      vi.mocked(agentQueue.getStatus).mockRejectedValue(new Error('Redis connection refused'));
      vi.mocked(getAllTasks).mockResolvedValue([
        { id: '1', status: 'todo' },
        { id: '2', status: 'in_progress' },
      ] as any);

      const request = new NextRequest('http://localhost/api/watcher/poll', {
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.watcher.isRunning).toBe(true);
      expect(data.queue.pending).toBe(0);
      expect(data.queue.running).toBe(0);
      expect(data.tasks.todo).toBe(1);
      expect(data.tasks.total).toBe(2);
    });
  });
});
