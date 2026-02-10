import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  getWorkflowEvents: vi.fn(),
}));

import { GET } from '@/app/api/tasks/[id]/workflow-events/route';
import { getWorkflowEvents } from '@/lib/db';

describe('API /api/tasks/[id]/workflow-events', () => {
  beforeEach(() => {
    process.env.FEATURE_WORKFLOWS = 'true';
    vi.clearAllMocks();
  });

  it('should return 404 when feature flag is disabled', async () => {
    process.env.FEATURE_WORKFLOWS = 'false';

    const request = new NextRequest('http://localhost/api/tasks/task-1/workflow-events');
    const response = await GET(request, { params: Promise.resolve({ id: 'task-1' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Workflows feature is not enabled');
    expect(getWorkflowEvents).not.toHaveBeenCalled();
  });

  it('should return events for a task', async () => {
    const mockEvents = [
      { id: 1, task_id: 'task-1', event_type: 'step_started', step_name: 'build' },
      { id: 2, task_id: 'task-1', event_type: 'step_completed', step_name: 'build' },
    ];
    vi.mocked(getWorkflowEvents).mockResolvedValue(mockEvents as any);

    const request = new NextRequest('http://localhost/api/tasks/task-1/workflow-events');
    const response = await GET(request, { params: Promise.resolve({ id: 'task-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockEvents);
    expect(getWorkflowEvents).toHaveBeenCalledWith('task-1', {
      runId: undefined,
      afterId: undefined,
      limit: undefined,
    });
  });

  it('should pass query params (run_id, after_id, limit) to getWorkflowEvents', async () => {
    vi.mocked(getWorkflowEvents).mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost/api/tasks/task-1/workflow-events?run_id=run-1&after_id=5&limit=10'
    );
    const response = await GET(request, { params: Promise.resolve({ id: 'task-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
    expect(getWorkflowEvents).toHaveBeenCalledWith('task-1', {
      runId: 'run-1',
      afterId: 5,
      limit: 10,
    });
  });

  it('should return 500 on error', async () => {
    vi.mocked(getWorkflowEvents).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost/api/tasks/task-1/workflow-events');
    const response = await GET(request, { params: Promise.resolve({ id: 'task-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch workflow events');
  });
});
