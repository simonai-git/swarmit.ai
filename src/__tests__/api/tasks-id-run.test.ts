import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing the route
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/db', () => ({
  getTask: vi.fn(),
  getAutomationUserEmail: vi.fn(),
}));

vi.mock('@/lib/agent-queue', () => ({
  agentQueue: {
    enqueue: vi.fn(),
    getStatus: vi.fn(),
  },
}));

import { POST, GET } from '@/app/api/tasks/[id]/run/route';
import { getServerSession } from 'next-auth';
import { getTask, getAutomationUserEmail } from '@/lib/db';
import { agentQueue } from '@/lib/agent-queue';

describe('API /api/tasks/[id]/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SIMON_API_KEY = 'test-api-key';
  });

  describe('POST /api/tasks/:id/run', () => {
    it('should return 401 without auth (no API key, no session)', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'POST',
        body: JSON.stringify({ agentType: 'developer' }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should allow API key auth', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
        priority: 'high',
      };
      const job = {
        id: 'job-1',
        taskId: 'task-123',
        agentType: 'developer',
        status: 'queued',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(getServerSession).mockResolvedValue(null);
      vi.mocked(getTask).mockResolvedValue(task as any);
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@example.com');
      vi.mocked(agentQueue.enqueue).mockResolvedValue(job as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({ agentType: 'developer' }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 400 for invalid agentType', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@example.com' } } as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'POST',
        body: JSON.stringify({ agentType: 'invalid' }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid agentType');
    });

    it('should return 404 if task not found', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@example.com' } } as any);
      vi.mocked(getTask).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'POST',
        body: JSON.stringify({ agentType: 'developer' }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Task not found');
    });

    it('should enqueue job with correct priority', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
        priority: 'high',
      };
      const job = {
        id: 'job-1',
        taskId: 'task-123',
        agentType: 'developer',
        status: 'queued',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@example.com' } } as any);
      vi.mocked(getTask).mockResolvedValue(task as any);
      vi.mocked(agentQueue.enqueue).mockResolvedValue(job as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'POST',
        body: JSON.stringify({ agentType: 'developer' }),
      });
      await POST(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(agentQueue.enqueue).toHaveBeenCalledWith({
        taskId: 'task-123',
        agentType: 'developer',
        priority: 10, // high priority
        tenantId: 'default',
        userEmail: 'test@example.com',
      });
    });

    it('should use session email as userEmail', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
        priority: 'medium',
      };
      const job = {
        id: 'job-1',
        taskId: 'task-123',
        agentType: 'qa',
        status: 'queued',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'user@example.com' } } as any);
      vi.mocked(getTask).mockResolvedValue(task as any);
      vi.mocked(agentQueue.enqueue).mockResolvedValue(job as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'POST',
        body: JSON.stringify({ agentType: 'qa' }),
      });
      await POST(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          userEmail: 'user@example.com',
        })
      );
    });

    it('should fall back to getAutomationUserEmail() when no session (BUG 6 fix regression test)', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
        priority: 'low',
      };
      const job = {
        id: 'job-1',
        taskId: 'task-123',
        agentType: 'reviewer',
        status: 'queued',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(getServerSession).mockResolvedValue(null);
      vi.mocked(getTask).mockResolvedValue(task as any);
      vi.mocked(getAutomationUserEmail).mockResolvedValue('automation@example.com');
      vi.mocked(agentQueue.enqueue).mockResolvedValue(job as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'POST',
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({ agentType: 'reviewer' }),
      });
      await POST(request, { params: Promise.resolve({ id: 'task-123' }) });

      expect(getAutomationUserEmail).toHaveBeenCalled();
      expect(agentQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          userEmail: 'automation@example.com',
        })
      );
    });

    it('should return job info on success', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
        priority: 'medium',
      };
      const job = {
        id: 'job-1',
        taskId: 'task-123',
        agentType: 'developer',
        status: 'queued',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'test@example.com' } } as any);
      vi.mocked(getTask).mockResolvedValue(task as any);
      vi.mocked(agentQueue.enqueue).mockResolvedValue(job as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'POST',
        body: JSON.stringify({ agentType: 'developer' }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.job).toEqual({
        id: 'job-1',
        taskId: 'task-123',
        agentType: 'developer',
        status: 'queued',
        createdAt: job.createdAt,
      });
      expect(data.message).toContain('task-123');
    });
  });

  describe('GET /api/tasks/:id/run', () => {
    it('should return 401 without API key', async () => {
      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'GET',
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 for missing task', async () => {
      vi.mocked(getTask).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'GET',
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Task not found');
    });

    it('should return jobs and activeRuns for task', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
      };
      const queueStatus = {
        jobs: [
          { id: 'job-1', taskId: 'task-123', status: 'queued' },
          { id: 'job-2', taskId: 'task-456', status: 'queued' },
          { id: 'job-3', taskId: 'task-123', status: 'queued' },
        ],
        activeRuns: [
          { id: 'run-1', taskId: 'task-123', status: 'running' },
          { id: 'run-2', taskId: 'task-789', status: 'running' },
        ],
      };

      vi.mocked(getTask).mockResolvedValue(task as any);
      vi.mocked(agentQueue.getStatus).mockResolvedValue(queueStatus as any);

      const request = new NextRequest('http://localhost/api/tasks/task-123/run', {
        method: 'GET',
        headers: { 'x-api-key': 'test-api-key' },
      });
      const response = await GET(request, { params: Promise.resolve({ id: 'task-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobs).toHaveLength(2);
      expect(data.jobs.every((j: any) => j.taskId === 'task-123')).toBe(true);
      expect(data.activeRuns).toHaveLength(1);
      expect(data.activeRuns[0].taskId).toBe('task-123');
    });
  });
});
