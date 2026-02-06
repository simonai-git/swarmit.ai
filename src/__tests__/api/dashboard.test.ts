import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing the route
const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({
  default: { query: mockQuery },
}));

import { GET } from '@/app/api/dashboard/route';

describe('API /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return project stats, agents, costTrends, activity', async () => {
    // Mock the 4 parallel queries
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'proj-1',
          title: 'Project 1',
          todo: '5',
          in_progress: '3',
          testing: '1',
          in_review: '2',
          done: '10',
          total: '21',
        },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          agent_type: 'developer',
          total_runs: '20',
          completed_runs: '15',
          failed_runs: '5',
          avg_tokens: '1500.5',
          total_cost: '2500',
        },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { date: new Date('2025-01-01'), total_cost: '500' },
        { date: '2025-01-02', total_cost: '750' },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'act-1',
          task_id: 'task-1',
          task_title: 'Task 1',
          action: 'updated',
          field_changed: 'status',
          old_value: 'todo',
          new_value: 'in_progress',
          actor: 'Simon',
          created_at: '2025-01-01T10:00:00Z',
        },
      ],
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0]).toEqual({
      id: 'proj-1',
      title: 'Project 1',
      todo: 5,
      in_progress: 3,
      testing: 1,
      in_review: 2,
      done: 10,
      total: 21,
    });

    expect(data.agents).toHaveLength(1);
    expect(data.agents[0]).toEqual({
      agentType: 'developer',
      totalRuns: 20,
      completedRuns: 15,
      failedRuns: 5,
      successRate: 75,
      avgTokens: 1501,
      totalCost: 2500,
    });

    expect(data.costTrends).toHaveLength(2);
    expect(data.costTrends[0]).toEqual({
      date: '2025-01-01',
      cost: 500,
    });

    expect(data.activity).toHaveLength(1);
    expect(data.activity[0]).toEqual({
      id: 'act-1',
      taskId: 'task-1',
      taskTitle: 'Task 1',
      action: 'updated',
      fieldChanged: 'status',
      oldValue: 'todo',
      newValue: 'in_progress',
      actor: 'Simon',
      createdAt: '2025-01-01T10:00:00Z',
    });
  });

  it('should handle empty results (no projects, no runs, no activity)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // projects
    mockQuery.mockResolvedValueOnce({ rows: [] }); // agents
    mockQuery.mockResolvedValueOnce({ rows: [] }); // cost trends
    mockQuery.mockResolvedValueOnce({ rows: [] }); // activity

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.projects).toEqual([]);
    expect(data.agents).toEqual([]);
    expect(data.costTrends).toEqual([]);
    expect(data.activity).toEqual([]);
  });

  it('should handle errors gracefully (500)', async () => {
    mockQuery.mockRejectedValue(new Error('Database connection failed'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch dashboard data');
  });

  it('should correctly format agent success rate', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // projects

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          agent_type: 'qa',
          total_runs: '100',
          completed_runs: '87',
          failed_runs: '13',
          avg_tokens: '2000',
          total_cost: '5000',
        },
      ],
    });

    mockQuery.mockResolvedValueOnce({ rows: [] }); // cost trends
    mockQuery.mockResolvedValueOnce({ rows: [] }); // activity

    const response = await GET();
    const data = await response.json();

    expect(data.agents[0].successRate).toBe(87); // 87/100 * 100 = 87%
  });

  it('should correctly format cost trends dates', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // projects
    mockQuery.mockResolvedValueOnce({ rows: [] }); // agents

    mockQuery.mockResolvedValueOnce({
      rows: [
        { date: new Date('2025-01-15T12:30:45Z'), total_cost: '1000' },
        { date: '2025-01-16', total_cost: '1500' },
      ],
    });

    mockQuery.mockResolvedValueOnce({ rows: [] }); // activity

    const response = await GET();
    const data = await response.json();

    expect(data.costTrends[0].date).toBe('2025-01-15');
    expect(data.costTrends[1].date).toBe('2025-01-16');
  });
});
