import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/scheduler', () => ({
  getSchedulerStatus: vi.fn(),
  startScheduler: vi.fn(),
  stopScheduler: vi.fn(),
  forceSchedulerTick: vi.fn(),
}));

vi.mock('@/lib/agent-queue', () => ({
  agentQueue: {
    getStatus: vi.fn(),
  },
}));

import { GET, POST } from '@/app/api/scheduler/route';
import { getSchedulerStatus, startScheduler, forceSchedulerTick } from '@/lib/scheduler';
import { agentQueue } from '@/lib/agent-queue';

describe('API /api/scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/scheduler', () => {
    it('should return scheduler and queue status', async () => {
      vi.mocked(getSchedulerStatus).mockReturnValue({
        isRunning: true,
        recentlyEnqueuedCount: 3,
      });
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ id: 'job-1' } as any],
        activeRuns: [],
        pending: 1,
        running: 0,
        completed: 0,
        failed: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.scheduler.isRunning).toBe(true);
      expect(data.queue.jobsQueued).toBe(1);
    });

    it('should auto-start scheduler if not running', async () => {
      vi.mocked(getSchedulerStatus).mockReturnValue({
        isRunning: false,
        recentlyEnqueuedCount: 0,
      });
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [],
        activeRuns: [],
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });

      await GET();

      expect(startScheduler).toHaveBeenCalled();
    });

    it('should return 200 with zero queue stats when getStatus fails (Redis down)', async () => {
      vi.mocked(getSchedulerStatus).mockReturnValue({
        isRunning: true,
        recentlyEnqueuedCount: 0,
      });
      vi.mocked(agentQueue.getStatus).mockRejectedValue(new Error('Redis connection refused'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.scheduler.isRunning).toBe(true);
      expect(data.queue.jobsQueued).toBe(0);
      expect(data.queue.activeRuns).toBe(0);
      expect(data.queue.jobs).toEqual([]);
    });
  });

  describe('POST /api/scheduler', () => {
    it('should start scheduler', async () => {
      const request = new NextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        body: JSON.stringify({ action: 'start' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(startScheduler).toHaveBeenCalled();
    });

    it('should execute tick and return queue status', async () => {
      vi.mocked(agentQueue.getStatus).mockResolvedValue({
        jobs: [{ id: 'job-1' } as any, { id: 'job-2' } as any],
        activeRuns: [{ id: 'run-1' } as any],
        pending: 2,
        running: 1,
        completed: 0,
        failed: 0,
      });

      const request = new NextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        body: JSON.stringify({ action: 'tick' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(forceSchedulerTick).toHaveBeenCalled();
      expect(data.queue.jobsQueued).toBe(2);
      expect(data.queue.activeRuns).toBe(1);
    });

    it('should handle tick when getStatus fails (Redis down)', async () => {
      vi.mocked(agentQueue.getStatus).mockRejectedValue(new Error('Redis connection refused'));

      const request = new NextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        body: JSON.stringify({ action: 'tick' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.queue.jobsQueued).toBe(0);
      expect(data.queue.activeRuns).toBe(0);
    });

    it('should return 400 for invalid action', async () => {
      const request = new NextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        body: JSON.stringify({ action: 'invalid' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should handle errors gracefully', async () => {
      const request = new NextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        body: 'invalid json',
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });
});
