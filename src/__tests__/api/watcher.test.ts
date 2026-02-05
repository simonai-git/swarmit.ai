import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules
vi.mock('@/lib/db', () => ({
  getWatcherConfig: vi.fn(),
  toggleWatcher: vi.fn(),
  updateWatcherConfig: vi.fn(),
}));

import { GET, POST } from '@/app/api/watcher/route';
import { getWatcherConfig, toggleWatcher, updateWatcherConfig } from '@/lib/db';

describe('API /api/watcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/watcher', () => {
    it('should return watcher config', async () => {
      const mockConfig = {
        id: 'singleton',
        is_running: true,
        last_run: new Date().toISOString(),
        current_task_id: null,
        active_task_ids: '[]',
      };
      vi.mocked(getWatcherConfig).mockResolvedValue(mockConfig as any);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.is_running).toBe(true);
      expect(getWatcherConfig).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      vi.mocked(getWatcherConfig).mockRejectedValue(new Error('DB error'));

      const response = await GET();

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/watcher', () => {
    it('should toggle watcher state', async () => {
      const newConfig = { is_running: false };
      vi.mocked(toggleWatcher).mockResolvedValue(newConfig as any);

      const request = new NextRequest('http://localhost/api/watcher', {
        method: 'POST',
        body: JSON.stringify({ action: 'toggle' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(toggleWatcher).toHaveBeenCalled();
    });

    it('should handle heartbeat action', async () => {
      const config = { last_run: new Date().toISOString() };
      vi.mocked(updateWatcherConfig).mockResolvedValue(config as any);

      const request = new NextRequest('http://localhost/api/watcher', {
        method: 'POST',
        body: JSON.stringify({ action: 'heartbeat' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(updateWatcherConfig).toHaveBeenCalled();
    });

    it('should add task to active list', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({
        active_task_ids: '[]',
      } as any);
      vi.mocked(updateWatcherConfig).mockResolvedValue({
        active_task_ids: '["task-123"]',
      } as any);

      const request = new NextRequest('http://localhost/api/watcher', {
        method: 'POST',
        body: JSON.stringify({ action: 'start_task', task_id: 'task-123' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(updateWatcherConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          active_task_ids: expect.stringContaining('task-123'),
        })
      );
    });

    it('should remove task from active list', async () => {
      vi.mocked(getWatcherConfig).mockResolvedValue({
        active_task_ids: '["task-123"]',
      } as any);
      vi.mocked(updateWatcherConfig).mockResolvedValue({
        active_task_ids: '[]',
      } as any);

      const request = new NextRequest('http://localhost/api/watcher', {
        method: 'POST',
        body: JSON.stringify({ action: 'end_task', task_id: 'task-123' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(updateWatcherConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          active_task_ids: '[]',
        })
      );
    });
  });
});
