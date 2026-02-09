import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('pg', () => {
  const PoolClass = vi.fn(function(this: any) {
    this.query = mockQuery;
    this.connect = vi.fn(() => Promise.resolve({
      query: mockQuery,
      release: vi.fn(),
    }));
  });
  return { Pool: PoolClass };
});

import * as db from '../../lib/db';
import type {
  Task,
  Comment,
  ActivityLog,
  WatcherConfig,
  Agent,
  Project,
  ProjectFeedback,
  AgentConfig,
  AgentRun,
  TaskDependency,
  TaskDependencyWithTitle,
} from '../../lib/db';

describe('Database Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tasks CRUD', () => {
    describe('getAllTasks', () => {
      it('should return all tasks ordered by updated_at DESC', async () => {
        const mockTasks: Task[] = [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'Description 1',
            status: 'todo',
            assignee: 'Simon',
            priority: 'high',
            due_date: '2026-02-10',
            estimated_hours: 5,
            time_spent: 2,
            progress: 40,
            is_blocked: false,
            feedback_id: null,
            blocked_reason: null,
            current_run_id: null,
            agent_context: 'has_context',
            project_id: 'proj-1',
            worked_by: '[]',
            user_email: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Description 2',
            status: 'in_progress',
            assignee: 'Bogdan',
            priority: 'medium',
            due_date: null,
            estimated_hours: null,
            time_spent: 0,
            progress: 0,
            is_blocked: false,
            feedback_id: null,
            blocked_reason: null,
            current_run_id: null,
            agent_context: null,
            project_id: null,
            worked_by: '["Simon"]',
            user_email: null,
            created_at: '2026-02-02T00:00:00Z',
            updated_at: '2026-02-04T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockTasks, rowCount: 2 });

        const result = await db.getAllTasks();

        expect(result).toEqual(mockTasks);
        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY updated_at DESC'));
      });

      it('should return empty array when no tasks exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAllTasks();

        expect(result).toEqual([]);
      });
    });

    describe('searchTasks', () => {
      it('should filter by search query', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ q: 'test' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('LOWER(title) LIKE'),
          ['%test%']
        );
      });

      it('should filter by status', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ status: 'todo,in_progress' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('status = ANY'),
          [['todo', 'in_progress']]
        );
      });

      it('should filter by assignee', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ assignee: 'Simon' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('assignee = $'),
          ['Simon']
        );
      });

      it('should filter by unassigned', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ assignee: 'unassigned' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('assignee IS NULL'),
          []
        );
      });

      it('should filter by priority', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ priority: 'high' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('priority = $'),
          ['high']
        );
      });

      it('should filter by project_id', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ project_id: 'proj-1' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('project_id = $'),
          ['proj-1']
        );
      });

      it('should filter by no project', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ project_id: 'none' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('project_id IS NULL'),
          []
        );
      });

      it('should filter by is_blocked=true', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ is_blocked: 'true' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_blocked = TRUE'),
          []
        );
      });

      it('should filter by is_blocked=false', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchTasks({ is_blocked: 'false' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('(is_blocked = FALSE OR is_blocked IS NULL)'),
          []
        );
      });

      it('should return tasks matching all filters', async () => {
        const mockTasks: Task[] = [
          {
            id: 'task-1',
            title: 'Test Task',
            description: 'Test Description',
            status: 'in_progress',
            assignee: 'Simon',
            priority: 'high',
            due_date: null,
            estimated_hours: null,
            time_spent: 0,
            progress: 0,
            is_blocked: false,
            feedback_id: null,
            blocked_reason: null,
            current_run_id: null,
            agent_context: null,
            project_id: 'proj-1',
            worked_by: '[]',
            user_email: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockTasks, rowCount: 1 });

        const result = await db.searchTasks({
          q: 'test',
          status: 'in_progress',
          assignee: 'Simon',
          priority: 'high',
          project_id: 'proj-1',
        });

        expect(result).toEqual(mockTasks);
      });

      it('should return empty array when no filters provided', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.searchTasks({});

        expect(result).toEqual([]);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.not.stringContaining('WHERE'),
          []
        );
      });
    });

    describe('getTask', () => {
      it('should return task by id', async () => {
        const mockTask: Task = {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description',
          status: 'todo',
          assignee: 'Simon',
          priority: 'medium',
          due_date: null,
          estimated_hours: null,
          time_spent: 0,
          progress: 0,
          is_blocked: false,
          feedback_id: null,
          blocked_reason: null,
          current_run_id: null,
          agent_context: null,
          project_id: null,
          worked_by: '[]',
          user_email: null,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockTask], rowCount: 1 });

        const result = await db.getTask('task-1');

        expect(result).toEqual(mockTask);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM tasks WHERE id = $1'),
          ['task-1']
        );
      });

      it('should return null when task not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getTask('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getTasksByStatus', () => {
      it('should return tasks with specific status', async () => {
        const mockTasks: Task[] = [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'Description',
            status: 'todo',
            assignee: 'Simon',
            priority: 'medium',
            due_date: null,
            estimated_hours: null,
            time_spent: 0,
            progress: 0,
            is_blocked: false,
            feedback_id: null,
            blocked_reason: null,
            current_run_id: null,
            agent_context: null,
            project_id: null,
            worked_by: '[]',
            user_email: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockTasks, rowCount: 1 });

        const result = await db.getTasksByStatus('todo');

        expect(result).toEqual(mockTasks);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE status = $1 ORDER BY created_at DESC'),
          ['todo']
        );
      });

      it('should return empty array when no tasks with status', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getTasksByStatus('done');

        expect(result).toEqual([]);
      });
    });

    describe('createTask', () => {
      it('should create and return new task', async () => {
        const newTask: Partial<Task> & { id: string; title: string } = {
          id: 'task-1',
          title: 'New Task',
          description: 'Description',
          status: 'todo',
          assignee: 'Simon',
          priority: 'high',
        };

        const createdTask: Task = {
          ...newTask,
          description: 'Description',
          status: 'todo',
          assignee: 'Simon',
          priority: 'high',
          due_date: null,
          estimated_hours: null,
          time_spent: 0,
          progress: 0,
          is_blocked: false,
          feedback_id: null,
          blocked_reason: null,
          current_run_id: null,
          agent_context: null,
          project_id: null,
          worked_by: '[]',
          user_email: null,
          created_at: '2026-02-05T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdTask], rowCount: 1 });

        const result = await db.createTask(newTask);

        expect(result).toEqual(createdTask);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tasks'),
          expect.arrayContaining(['task-1', 'New Task'])
        );
      });

      it('should create task with null assignee', async () => {
        const newTask = {
          id: 'task-1',
          title: 'Unassigned Task',
          assignee: null,
        };

        const createdTask: Task = {
          id: 'task-1',
          title: 'Unassigned Task',
          description: null,
          status: 'todo',
          assignee: null,
          priority: 'medium',
          due_date: null,
          estimated_hours: null,
          time_spent: 0,
          progress: 0,
          is_blocked: false,
          feedback_id: null,
          blocked_reason: null,
          current_run_id: null,
          agent_context: null,
          project_id: null,
          worked_by: '[]',
          user_email: null,
          created_at: '2026-02-05T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdTask], rowCount: 1 });

        const result = await db.createTask(newTask);

        expect(result.assignee).toBeNull();
      });
    });

    describe('getTasksByProjectId', () => {
      it('should return tasks for specific project', async () => {
        const mockTasks: Task[] = [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'Description',
            status: 'todo',
            assignee: 'Simon',
            priority: 'medium',
            due_date: null,
            estimated_hours: null,
            time_spent: 0,
            progress: 0,
            is_blocked: false,
            feedback_id: null,
            blocked_reason: null,
            current_run_id: null,
            agent_context: null,
            project_id: 'proj-1',
            worked_by: '[]',
            user_email: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockTasks, rowCount: 1 });

        const result = await db.getTasksByProjectId('proj-1');

        expect(result).toEqual(mockTasks);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE project_id = $1 ORDER BY created_at ASC'),
          ['proj-1']
        );
      });

      it('should return empty array when no tasks for project', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getTasksByProjectId('proj-999');

        expect(result).toEqual([]);
      });
    });

    describe('updateTask', () => {
      it('should update and return task', async () => {
        const updates: Partial<Task> = {
          title: 'Updated Task',
          status: 'in_progress',
        };

        const updatedTask: Task = {
          id: 'task-1',
          title: 'Updated Task',
          description: 'Description',
          status: 'in_progress',
          assignee: 'Simon',
          priority: 'medium',
          due_date: null,
          estimated_hours: null,
          time_spent: 0,
          progress: 0,
          is_blocked: false,
          feedback_id: null,
          blocked_reason: null,
          current_run_id: null,
          agent_context: null,
          project_id: null,
          worked_by: '[]',
          user_email: null,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedTask], rowCount: 1 });

        const result = await db.updateTask('task-1', updates);

        expect(result).toEqual(updatedTask);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE tasks SET'),
          expect.arrayContaining(['Updated Task', 'in_progress', 'task-1'])
        );
      });

      it('should return null when task not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.updateTask('non-existent', { title: 'Updated' });

        expect(result).toBeNull();
      });

      it('should return null when no fields to update', async () => {
        const result = await db.updateTask('task-1', {});

        expect(result).toBeNull();
        expect(mockQuery).not.toHaveBeenCalled();
      });
    });

    describe('deleteTask', () => {
      it('should delete task and return true', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await db.deleteTask('task-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM tasks WHERE id = $1'),
          ['task-1']
        );
      });

      it('should return false when task not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.deleteTask('non-existent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Comments', () => {
    describe('getCommentsByTaskId', () => {
      it('should return comments for task ordered by created_at ASC', async () => {
        const mockComments: Comment[] = [
          {
            id: 'comment-1',
            task_id: 'task-1',
            author: 'Simon',
            content: 'First comment',
            created_at: '2026-02-01T00:00:00Z',
          },
          {
            id: 'comment-2',
            task_id: 'task-1',
            author: 'Bogdan',
            content: 'Second comment',
            created_at: '2026-02-02T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockComments, rowCount: 2 });

        const result = await db.getCommentsByTaskId('task-1');

        expect(result).toEqual(mockComments);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE task_id = $1 ORDER BY created_at ASC'),
          ['task-1']
        );
      });

      it('should return empty array when no comments', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getCommentsByTaskId('task-1');

        expect(result).toEqual([]);
      });
    });

    describe('createComment', () => {
      it('should create and return comment', async () => {
        const newComment: Omit<Comment, 'created_at'> = {
          id: 'comment-1',
          task_id: 'task-1',
          author: 'Simon',
          content: 'New comment',
        };

        const createdComment: Comment = {
          ...newComment,
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdComment], rowCount: 1 });

        const result = await db.createComment(newComment);

        expect(result).toEqual(createdComment);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO comments'),
          ['comment-1', 'task-1', 'Simon', 'New comment']
        );
      });
    });

    describe('deleteComment', () => {
      it('should delete comment and return true', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await db.deleteComment('comment-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM comments WHERE id = $1'),
          ['comment-1']
        );
      });

      it('should return false when comment not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.deleteComment('non-existent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Activity Log', () => {
    describe('logActivity', () => {
      it('should create and return activity log', async () => {
        const newLog: Omit<ActivityLog, 'created_at'> = {
          id: 'log-1',
          task_id: 'task-1',
          action: 'status_changed',
          field_changed: 'status',
          old_value: 'todo',
          new_value: 'in_progress',
          actor: 'Simon',
        };

        const createdLog: ActivityLog = {
          ...newLog,
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdLog], rowCount: 1 });

        const result = await db.logActivity(newLog);

        expect(result).toEqual(createdLog);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO activity_log'),
          ['log-1', 'task-1', 'status_changed', 'status', 'todo', 'in_progress', 'Simon']
        );
      });
    });

    describe('getActivityByTaskId', () => {
      it('should return activity logs ordered by created_at DESC', async () => {
        const mockLogs: ActivityLog[] = [
          {
            id: 'log-2',
            task_id: 'task-1',
            action: 'assignee_changed',
            field_changed: 'assignee',
            old_value: 'Simon',
            new_value: 'Bogdan',
            actor: 'Bogdan',
            created_at: '2026-02-05T00:00:00Z',
          },
          {
            id: 'log-1',
            task_id: 'task-1',
            action: 'status_changed',
            field_changed: 'status',
            old_value: 'todo',
            new_value: 'in_progress',
            actor: 'Simon',
            created_at: '2026-02-01T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockLogs, rowCount: 2 });

        const result = await db.getActivityByTaskId('task-1');

        expect(result).toEqual(mockLogs);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE task_id = $1 ORDER BY created_at DESC'),
          ['task-1']
        );
      });

      it('should return empty array when no activity', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getActivityByTaskId('task-1');

        expect(result).toEqual([]);
      });
    });
  });

  describe('Watcher Config', () => {
    describe('getWatcherConfig', () => {
      it('should return singleton watcher config', async () => {
        const mockConfig: WatcherConfig = {
          id: 'singleton',
          is_running: false,
          last_run: '2026-02-05T00:00:00Z',
          current_task_id: null,
          active_task_ids: '[]',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockConfig], rowCount: 1 });

        const result = await db.getWatcherConfig();

        expect(result).toEqual(mockConfig);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("WHERE id = $1"),
          ['singleton']
        );
      });
    });

    describe('updateWatcherConfig', () => {
      it('should update and return config', async () => {
        const updates: Partial<WatcherConfig> = {
          is_running: true,
          current_task_id: 'task-1',
        };

        const updatedConfig: WatcherConfig = {
          id: 'singleton',
          is_running: true,
          last_run: null,
          current_task_id: 'task-1',
          active_task_ids: '["task-1"]',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedConfig], rowCount: 1 });

        const result = await db.updateWatcherConfig(updates);

        expect(result).toEqual(updatedConfig);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE watcher_config SET'),
          expect.arrayContaining([true, 'task-1'])
        );
      });

      it('should return existing config when no fields to update', async () => {
        const existingConfig: WatcherConfig = {
          id: 'singleton',
          is_running: false,
          last_run: null,
          current_task_id: null,
          active_task_ids: '[]',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [existingConfig], rowCount: 1 });

        const result = await db.updateWatcherConfig({});

        expect(result).toEqual(existingConfig);
      });
    });

    describe('toggleWatcher', () => {
      it('should toggle is_running and return config', async () => {
        const toggledConfig: WatcherConfig = {
          id: 'singleton',
          is_running: true,
          last_run: null,
          current_task_id: null,
          active_task_ids: '[]',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [toggledConfig], rowCount: 1 });

        const result = await db.toggleWatcher();

        expect(result).toEqual(toggledConfig);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_running = NOT is_running')
        );
      });
    });
  });

  describe('Agents', () => {
    describe('getAllAgents', () => {
      it('should return all agents ordered by created_at DESC', async () => {
        const mockAgents: Agent[] = [
          {
            id: 'agent-1',
            name: 'Simon',
            specialization: 'Full Stack',
            description: 'Description',
            system_prompt: 'Prompt',
            memory: null,
            avatar_emoji: '🦊',
            avatar_color: 'from-orange-500 to-amber-500',
            is_active: true,
            tasks_completed: 5,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockAgents, rowCount: 1 });

        const result = await db.getAllAgents();

        expect(result).toEqual(mockAgents);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC')
        );
      });

      it('should return empty array when no agents', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAllAgents();

        expect(result).toEqual([]);
      });
    });

    describe('getActiveAgents', () => {
      it('should return only active agents ordered by name ASC', async () => {
        const mockAgents: Agent[] = [
          {
            id: 'agent-1',
            name: 'Agent A',
            specialization: 'Developer',
            description: null,
            system_prompt: null,
            memory: null,
            avatar_emoji: '🤖',
            avatar_color: 'from-blue-500 to-purple-500',
            is_active: true,
            tasks_completed: 0,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockAgents, rowCount: 1 });

        const result = await db.getActiveAgents();

        expect(result).toEqual(mockAgents);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE is_active = TRUE ORDER BY name ASC')
        );
      });
    });

    describe('getAgent', () => {
      it('should return agent by id', async () => {
        const mockAgent: Agent = {
          id: 'agent-1',
          name: 'Simon',
          specialization: 'Full Stack',
          description: 'Description',
          system_prompt: 'Prompt',
          memory: null,
          avatar_emoji: '🦊',
          avatar_color: 'from-orange-500 to-amber-500',
          is_active: true,
          tasks_completed: 5,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAgent], rowCount: 1 });

        const result = await db.getAgent('agent-1');

        expect(result).toEqual(mockAgent);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE id = $1'),
          ['agent-1']
        );
      });

      it('should return null when agent not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgent('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getAgentByName', () => {
      it('should return agent by name', async () => {
        const mockAgent: Agent = {
          id: 'agent-1',
          name: 'Simon',
          specialization: 'Full Stack',
          description: 'Description',
          system_prompt: 'Prompt',
          memory: null,
          avatar_emoji: '🦊',
          avatar_color: 'from-orange-500 to-amber-500',
          is_active: true,
          tasks_completed: 5,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAgent], rowCount: 1 });

        const result = await db.getAgentByName('Simon');

        expect(result).toEqual(mockAgent);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE name = $1'),
          ['Simon']
        );
      });

      it('should return null when agent not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgentByName('NonExistent');

        expect(result).toBeNull();
      });
    });

    describe('createAgent', () => {
      it('should create and return agent', async () => {
        const newAgent: Partial<Agent> & { id: string; name: string; specialization: string } = {
          id: 'agent-1',
          name: 'TestAgent',
          specialization: 'Testing',
          description: 'Test agent',
        };

        const createdAgent: Agent = {
          id: 'agent-1',
          name: 'TestAgent',
          specialization: 'Testing',
          description: 'Test agent',
          system_prompt: null,
          memory: null,
          avatar_emoji: '🤖',
          avatar_color: 'from-blue-500 to-purple-500',
          is_active: true,
          tasks_completed: 0,
          created_at: '2026-02-05T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdAgent], rowCount: 1 });

        const result = await db.createAgent(newAgent);

        expect(result).toEqual(createdAgent);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO agents'),
          expect.arrayContaining(['agent-1', 'TestAgent', 'Testing'])
        );
      });
    });

    describe('updateAgent', () => {
      it('should update and return agent', async () => {
        const updates: Partial<Agent> = {
          description: 'Updated description',
          is_active: false,
        };

        const updatedAgent: Agent = {
          id: 'agent-1',
          name: 'Simon',
          specialization: 'Full Stack',
          description: 'Updated description',
          system_prompt: 'Prompt',
          memory: null,
          avatar_emoji: '🦊',
          avatar_color: 'from-orange-500 to-amber-500',
          is_active: false,
          tasks_completed: 5,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedAgent], rowCount: 1 });

        const result = await db.updateAgent('agent-1', updates);

        expect(result).toEqual(updatedAgent);
      });

      it('should return null when agent not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.updateAgent('non-existent', { description: 'Updated' });

        expect(result).toBeNull();
      });

      it('should return null when no fields to update', async () => {
        const result = await db.updateAgent('agent-1', {});

        expect(result).toBeNull();
        expect(mockQuery).not.toHaveBeenCalled();
      });
    });

    describe('deleteAgent', () => {
      it('should delete agent and return true', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await db.deleteAgent('agent-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM agents WHERE id = $1'),
          ['agent-1']
        );
      });

      it('should return false when agent not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.deleteAgent('non-existent');

        expect(result).toBe(false);
      });
    });

    describe('incrementAgentTasksCompleted', () => {
      it('should increment tasks_completed and return agent', async () => {
        const updatedAgent: Agent = {
          id: 'agent-1',
          name: 'Simon',
          specialization: 'Full Stack',
          description: 'Description',
          system_prompt: 'Prompt',
          memory: null,
          avatar_emoji: '🦊',
          avatar_color: 'from-orange-500 to-amber-500',
          is_active: true,
          tasks_completed: 6,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedAgent], rowCount: 1 });

        const result = await db.incrementAgentTasksCompleted('agent-1');

        expect(result).toEqual(updatedAgent);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('tasks_completed = tasks_completed + 1'),
          ['agent-1']
        );
      });

      it('should return null when agent not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.incrementAgentTasksCompleted('non-existent');

        expect(result).toBeNull();
      });
    });
  });

  describe('Projects', () => {
    describe('getAllProjects', () => {
      it('should return all projects with stats', async () => {
        const mockProjects = [
          {
            id: 'proj-1',
            title: 'Project 1',
            description: 'Description',
            status: 'in_progress',
            owner: 'Bogdan',
            reviewer: 'Bogdan',
            product_manager: 'Simon',
            prd: null,
            goals: null,
            requirements: null,
            constraints: null,
            tech_stack: null,
            timeline: null,
            deadline: null,
            github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
            started_at: '2026-02-01T00:00:00Z',
            paused_at: null,
            completed_at: null,
            canceled_at: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
            task_count: 5,
            completed_task_count: 2,
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockProjects, rowCount: 1 });

        const result = await db.getAllProjects();

        expect(result).toEqual(mockProjects);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY p.created_at DESC')
        );
      });

      it('should return empty array when no projects', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAllProjects();

        expect(result).toEqual([]);
      });
    });

    describe('getProject', () => {
      it('should return project with stats by id', async () => {
        const mockProject = {
          id: 'proj-1',
          title: 'Project 1',
          description: 'Description',
          status: 'in_progress',
          owner: 'Bogdan',
          reviewer: 'Bogdan',
          product_manager: 'Simon',
          prd: null,
          goals: null,
          requirements: null,
          constraints: null,
          tech_stack: null,
          timeline: null,
          deadline: null,
          github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
          started_at: '2026-02-01T00:00:00Z',
          paused_at: null,
          completed_at: null,
          canceled_at: null,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
          task_count: 5,
          completed_task_count: 2,
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockProject], rowCount: 1 });

        const result = await db.getProject('proj-1');

        expect(result).toEqual(mockProject);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE p.id = $1'),
          ['proj-1']
        );
      });

      it('should return null when project not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getProject('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getProjectsByStatus', () => {
      it('should return projects with specific status', async () => {
        const mockProjects = [
          {
            id: 'proj-1',
            title: 'Project 1',
            description: 'Description',
            status: 'in_progress',
            owner: 'Bogdan',
            reviewer: 'Bogdan',
            product_manager: 'Simon',
            prd: null,
            goals: null,
            requirements: null,
            constraints: null,
            tech_stack: null,
            timeline: null,
            deadline: null,
            github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
            started_at: '2026-02-01T00:00:00Z',
            paused_at: null,
            completed_at: null,
            canceled_at: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
            task_count: 5,
            completed_task_count: 2,
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockProjects, rowCount: 1 });

        const result = await db.getProjectsByStatus('in_progress');

        expect(result).toEqual(mockProjects);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE p.status = $1'),
          ['in_progress']
        );
      });

      it('should return empty array when no projects with status', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getProjectsByStatus('completed');

        expect(result).toEqual([]);
      });
    });

    describe('createProject', () => {
      it('should create and return project', async () => {
        const newProject: Partial<Project> & { id: string; title: string } = {
          id: 'proj-1',
          title: 'New Project',
          description: 'Project description',
          owner: 'Bogdan',
        };

        const createdProject: Project = {
          id: 'proj-1',
          title: 'New Project',
          description: 'Project description',
          status: 'defined',
          owner: 'Bogdan',
          reviewer: 'Bogdan',
          product_manager: 'Simon',
          prd: null,
          goals: null,
          requirements: null,
          constraints: null,
          tech_stack: null,
          timeline: null,
          deadline: null,
          github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
          started_at: null,
          paused_at: null,
          completed_at: null,
          canceled_at: null,
          created_at: '2026-02-05T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdProject], rowCount: 1 });

        const result = await db.createProject(newProject);

        expect(result).toEqual(createdProject);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO projects'),
          expect.arrayContaining(['proj-1', 'New Project'])
        );
      });
    });

    describe('updateProject', () => {
      it('should update and return project', async () => {
        const updates: Partial<Project> = {
          title: 'Updated Project',
          status: 'paused',
        };

        const updatedProject: Project = {
          id: 'proj-1',
          title: 'Updated Project',
          description: 'Description',
          status: 'paused',
          owner: 'Bogdan',
          reviewer: 'Bogdan',
          product_manager: 'Simon',
          prd: null,
          goals: null,
          requirements: null,
          constraints: null,
          tech_stack: null,
          timeline: null,
          deadline: null,
          github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
          started_at: '2026-02-01T00:00:00Z',
          paused_at: '2026-02-05T00:00:00Z',
          completed_at: null,
          canceled_at: null,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedProject], rowCount: 1 });

        const result = await db.updateProject('proj-1', updates);

        expect(result).toEqual(updatedProject);
      });

      it('should return null when project not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.updateProject('non-existent', { title: 'Updated' });

        expect(result).toBeNull();
      });

      it('should return null when no fields to update', async () => {
        const result = await db.updateProject('proj-1', {});

        expect(result).toBeNull();
        expect(mockQuery).not.toHaveBeenCalled();
      });
    });

    describe('deleteProject', () => {
      it('should unlink tasks and delete project', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 2 })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await db.deleteProject('proj-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE tasks SET project_id = NULL'),
          ['proj-1']
        );
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM projects WHERE id = $1'),
          ['proj-1']
        );
      });

      it('should return false when project not found', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.deleteProject('non-existent');

        expect(result).toBe(false);
      });
    });

    describe('Project Lifecycle', () => {
      describe('startProject', () => {
        it('should start project and set started_at', async () => {
          const startedProject: Project = {
            id: 'proj-1',
            title: 'Project 1',
            description: 'Description',
            status: 'in_progress',
            owner: 'Bogdan',
            reviewer: 'Bogdan',
            product_manager: 'Simon',
            prd: null,
            goals: null,
            requirements: null,
            constraints: null,
            tech_stack: null,
            timeline: null,
            deadline: null,
            github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
            started_at: '2026-02-05T00:00:00Z',
            paused_at: null,
            completed_at: null,
            canceled_at: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          };

          mockQuery.mockResolvedValueOnce({ rows: [startedProject], rowCount: 1 });

          const result = await db.startProject('proj-1');

          expect(result).toEqual(startedProject);
          expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("status = 'in_progress'"),
            ['proj-1']
          );
        });

        it('should return null when project not in defined status', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

          const result = await db.startProject('proj-1');

          expect(result).toBeNull();
        });
      });

      describe('pauseProject', () => {
        it('should pause project and set paused_at', async () => {
          const pausedProject: Project = {
            id: 'proj-1',
            title: 'Project 1',
            description: 'Description',
            status: 'paused',
            owner: 'Bogdan',
            reviewer: 'Bogdan',
            product_manager: 'Simon',
            prd: null,
            goals: null,
            requirements: null,
            constraints: null,
            tech_stack: null,
            timeline: null,
            deadline: null,
            github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
            started_at: '2026-02-01T00:00:00Z',
            paused_at: '2026-02-05T00:00:00Z',
            completed_at: null,
            canceled_at: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          };

          mockQuery.mockResolvedValueOnce({ rows: [pausedProject], rowCount: 1 });

          const result = await db.pauseProject('proj-1');

          expect(result).toEqual(pausedProject);
          expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("status = 'paused'"),
            ['proj-1']
          );
        });

        it('should return null when project not in_progress', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

          const result = await db.pauseProject('proj-1');

          expect(result).toBeNull();
        });
      });

      describe('resumeProject', () => {
        it('should resume project and clear paused_at', async () => {
          const resumedProject: Project = {
            id: 'proj-1',
            title: 'Project 1',
            description: 'Description',
            status: 'in_progress',
            owner: 'Bogdan',
            reviewer: 'Bogdan',
            product_manager: 'Simon',
            prd: null,
            goals: null,
            requirements: null,
            constraints: null,
            tech_stack: null,
            timeline: null,
            deadline: null,
            github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
            started_at: '2026-02-01T00:00:00Z',
            paused_at: null,
            completed_at: null,
            canceled_at: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          };

          mockQuery.mockResolvedValueOnce({ rows: [resumedProject], rowCount: 1 });

          const result = await db.resumeProject('proj-1');

          expect(result).toEqual(resumedProject);
          expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("status = 'in_progress'"),
            ['proj-1']
          );
        });

        it('should return null when project not paused', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

          const result = await db.resumeProject('proj-1');

          expect(result).toBeNull();
        });
      });

      describe('cancelProject', () => {
        it('should cancel project and set canceled_at', async () => {
          const canceledProject: Project = {
            id: 'proj-1',
            title: 'Project 1',
            description: 'Description',
            status: 'canceled',
            owner: 'Bogdan',
            reviewer: 'Bogdan',
            product_manager: 'Simon',
            prd: null,
            goals: null,
            requirements: null,
            constraints: null,
            tech_stack: null,
            timeline: null,
            deadline: null,
            github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
            started_at: '2026-02-01T00:00:00Z',
            paused_at: null,
            completed_at: null,
            canceled_at: '2026-02-05T00:00:00Z',
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          };

          mockQuery.mockResolvedValueOnce({ rows: [canceledProject], rowCount: 1 });

          const result = await db.cancelProject('proj-1');

          expect(result).toEqual(canceledProject);
          expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("status = 'canceled'"),
            ['proj-1']
          );
        });

        it('should return null when project not cancelable', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

          const result = await db.cancelProject('proj-1');

          expect(result).toBeNull();
        });
      });

      describe('completeProject', () => {
        it('should complete project and set completed_at', async () => {
          const completedProject: Project = {
            id: 'proj-1',
            title: 'Project 1',
            description: 'Description',
            status: 'completed',
            owner: 'Bogdan',
            reviewer: 'Bogdan',
            product_manager: 'Simon',
            prd: null,
            goals: null,
            requirements: null,
            constraints: null,
            tech_stack: null,
            timeline: null,
            deadline: null,
            github_repo: null,
          deploy_to_railway: false,
          push_to_github: false,
            started_at: '2026-02-01T00:00:00Z',
            paused_at: null,
            completed_at: '2026-02-05T00:00:00Z',
            canceled_at: null,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          };

          mockQuery.mockResolvedValueOnce({ rows: [completedProject], rowCount: 1 });

          const result = await db.completeProject('proj-1');

          expect(result).toEqual(completedProject);
          expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("status = 'completed'"),
            ['proj-1']
          );
        });

        it('should return null when project not in_progress', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

          const result = await db.completeProject('proj-1');

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('Feedback', () => {
    describe('getProjectFeedback', () => {
      it('should return feedback for project ordered by created_at DESC', async () => {
        const mockFeedback: ProjectFeedback[] = [
          {
            id: 'fb-1',
            project_id: 'proj-1',
            author: 'Bogdan',
            type: 'suggestion',
            title: 'Improve UI',
            content: 'The UI could be better',
            status: 'open',
            created_at: '2026-02-05T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockFeedback, rowCount: 1 });

        const result = await db.getProjectFeedback('proj-1');

        expect(result).toEqual(mockFeedback);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE project_id = $1 ORDER BY created_at DESC'),
          ['proj-1']
        );
      });

      it('should return empty array when no feedback', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getProjectFeedback('proj-1');

        expect(result).toEqual([]);
      });
    });

    describe('createProjectFeedback', () => {
      it('should create and return feedback', async () => {
        const newFeedback: Omit<ProjectFeedback, 'created_at' | 'updated_at'> = {
          id: 'fb-1',
          project_id: 'proj-1',
          author: 'Bogdan',
          type: 'bug',
          title: 'Bug Report',
          content: 'Found a bug',
          status: 'open',
        };

        const createdFeedback: ProjectFeedback = {
          ...newFeedback,
          created_at: '2026-02-05T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdFeedback], rowCount: 1 });

        const result = await db.createProjectFeedback(newFeedback);

        expect(result).toEqual(createdFeedback);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO project_feedback'),
          ['fb-1', 'proj-1', 'Bogdan', 'bug', 'Bug Report', 'Found a bug', 'open']
        );
      });
    });

    describe('updateProjectFeedback', () => {
      it('should update and return feedback', async () => {
        const updates: Partial<ProjectFeedback> = {
          status: 'resolved',
          title: 'Updated Title',
        };

        const updatedFeedback: ProjectFeedback = {
          id: 'fb-1',
          project_id: 'proj-1',
          author: 'Bogdan',
          type: 'bug',
          title: 'Updated Title',
          content: 'Found a bug',
          status: 'resolved',
          created_at: '2026-02-05T00:00:00Z',
          updated_at: '2026-02-05T10:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedFeedback], rowCount: 1 });

        const result = await db.updateProjectFeedback('fb-1', updates);

        expect(result).toEqual(updatedFeedback);
      });

      it('should return null when feedback not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.updateProjectFeedback('non-existent', { status: 'resolved' });

        expect(result).toBeNull();
      });

      it('should return null when no fields to update', async () => {
        const result = await db.updateProjectFeedback('fb-1', {});

        expect(result).toBeNull();
        expect(mockQuery).not.toHaveBeenCalled();
      });
    });

    describe('deleteProjectFeedback', () => {
      it('should delete feedback and return true', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await db.deleteProjectFeedback('fb-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM project_feedback WHERE id = $1'),
          ['fb-1']
        );
      });

      it('should return false when feedback not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.deleteProjectFeedback('non-existent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Agent Configs', () => {
    describe('getAgentConfigs', () => {
      it('should return all agent configs ordered by name', async () => {
        const mockConfigs: AgentConfig[] = [
          {
            id: 'config-1',
            name: 'Developer',
            specialization: 'development',
            system_prompt: 'You are a developer',
            model: 'claude-sonnet-4-20250514',
            temperature: 0,
            max_tokens: 8000,
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-05T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockConfigs, rowCount: 1 });

        const result = await db.getAgentConfigs();

        expect(result).toEqual(mockConfigs);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY name')
        );
      });

      it('should return empty array when no configs', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgentConfigs();

        expect(result).toEqual([]);
      });
    });

    describe('getAgentConfig', () => {
      it('should return agent config by id', async () => {
        const mockConfig: AgentConfig = {
          id: 'config-1',
          name: 'Developer',
          specialization: 'development',
          system_prompt: 'You are a developer',
          model: 'claude-sonnet-4-20250514',
          temperature: 0,
          max_tokens: 8000,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockConfig], rowCount: 1 });

        const result = await db.getAgentConfig('config-1');

        expect(result).toEqual(mockConfig);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE id = $1'),
          ['config-1']
        );
      });

      it('should return null when config not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgentConfig('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getAgentConfigByName', () => {
      it('should return agent config by name', async () => {
        const mockConfig: AgentConfig = {
          id: 'config-1',
          name: 'Developer',
          specialization: 'development',
          system_prompt: 'You are a developer',
          model: 'claude-sonnet-4-20250514',
          temperature: 0,
          max_tokens: 8000,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockConfig], rowCount: 1 });

        const result = await db.getAgentConfigByName('Developer');

        expect(result).toEqual(mockConfig);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE name = $1'),
          ['Developer']
        );
      });

      it('should return null when config not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgentConfigByName('NonExistent');

        expect(result).toBeNull();
      });
    });

    describe('getAgentConfigBySpecialization', () => {
      it('should return first agent config by specialization', async () => {
        const mockConfig: AgentConfig = {
          id: 'config-1',
          name: 'Developer',
          specialization: 'development',
          system_prompt: 'You are a developer',
          model: 'claude-sonnet-4-20250514',
          temperature: 0,
          max_tokens: 8000,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockConfig], rowCount: 1 });

        const result = await db.getAgentConfigBySpecialization('development');

        expect(result).toEqual(mockConfig);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE specialization = $1 LIMIT 1'),
          ['development']
        );
      });

      it('should return null when config not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgentConfigBySpecialization('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('createAgentConfig', () => {
      it('should create and return agent config', async () => {
        const newConfig: Omit<AgentConfig, 'id' | 'created_at' | 'updated_at'> = {
          name: 'Tester',
          specialization: 'testing',
          system_prompt: 'You are a tester',
          model: 'claude-sonnet-4-20250514',
          temperature: 0,
          max_tokens: 8000,
        };

        const createdConfig: AgentConfig = {
          id: 'config-1',
          ...newConfig,
          created_at: '2026-02-05T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdConfig], rowCount: 1 });

        const result = await db.createAgentConfig(newConfig);

        expect(result).toEqual(createdConfig);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO agent_configs'),
          ['Tester', 'testing', 'You are a tester', 'claude-sonnet-4-20250514', 0, 8000]
        );
      });
    });

    describe('updateAgentConfig', () => {
      it('should update and return agent config', async () => {
        const updates: Partial<AgentConfig> = {
          system_prompt: 'Updated prompt',
          temperature: 0.5,
        };

        const updatedConfig: AgentConfig = {
          id: 'config-1',
          name: 'Developer',
          specialization: 'development',
          system_prompt: 'Updated prompt',
          model: 'claude-sonnet-4-20250514',
          temperature: 0.5,
          max_tokens: 8000,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedConfig], rowCount: 1 });

        const result = await db.updateAgentConfig('config-1', updates);

        expect(result).toEqual(updatedConfig);
      });

      it('should return null when config not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.updateAgentConfig('non-existent', { temperature: 0.5 });

        expect(result).toBeNull();
      });

      it('should return null when no fields to update', async () => {
        const result = await db.updateAgentConfig('config-1', {});

        expect(result).toBeNull();
        expect(mockQuery).not.toHaveBeenCalled();
      });
    });

    describe('deleteAgentConfig', () => {
      it('should delete agent config and return true', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await db.deleteAgentConfig('config-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM agent_configs WHERE id = $1'),
          ['config-1']
        );
      });

      it('should return false when config not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.deleteAgentConfig('non-existent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Agent Runs', () => {
    describe('createAgentRun', () => {
      it('should create and return agent run', async () => {
        const newRun: Omit<AgentRun, 'id' | 'created_at'> = {
          task_id: 'task-1',
          agent_type: 'developer',
          status: 'pending',
          input_tokens: 0,
          output_tokens: 0,
          cost_cents: 0,
          transcript: [],
        };

        const createdRun: AgentRun = {
          id: 'run-1',
          ...newRun,
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [{ ...createdRun, transcript: [] }], rowCount: 1 });

        const result = await db.createAgentRun(newRun);

        expect(result).toEqual(createdRun);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO agent_runs'),
          expect.arrayContaining(['task-1', 'developer', null, 'pending'])
        );
      });
    });

    describe('getAgentRun', () => {
      it('should return agent run by id', async () => {
        const mockRun: AgentRun = {
          id: 'run-1',
          task_id: 'task-1',
          agent_type: 'developer',
          status: 'completed',
          started_at: '2026-02-05T00:00:00Z',
          completed_at: '2026-02-05T01:00:00Z',
          input_tokens: 1000,
          output_tokens: 500,
          cost_cents: 10,
          transcript: [{ role: 'assistant', content: 'Test', timestamp: '2026-02-05T00:30:00Z' }],
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockRun], rowCount: 1 });

        const result = await db.getAgentRun('run-1');

        expect(result).toEqual(mockRun);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE id = $1'),
          ['run-1']
        );
      });

      it('should return null when run not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgentRun('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getAgentRunsByTask', () => {
      it('should return agent runs for task ordered by created_at DESC', async () => {
        const mockRuns: AgentRun[] = [
          {
            id: 'run-2',
            task_id: 'task-1',
            agent_type: 'developer',
            status: 'completed',
            started_at: '2026-02-05T00:00:00Z',
            completed_at: '2026-02-05T01:00:00Z',
            input_tokens: 1000,
            output_tokens: 500,
            cost_cents: 10,
            transcript: [],
            created_at: '2026-02-05T00:00:00Z',
          },
          {
            id: 'run-1',
            task_id: 'task-1',
            agent_type: 'qa',
            status: 'failed',
            started_at: '2026-02-04T00:00:00Z',
            completed_at: '2026-02-04T01:00:00Z',
            input_tokens: 800,
            output_tokens: 300,
            cost_cents: 8,
            error: 'Test error',
            transcript: [],
            created_at: '2026-02-04T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockRuns, rowCount: 2 });

        const result = await db.getAgentRunsByTask('task-1');

        expect(result).toEqual(mockRuns);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE task_id = $1 ORDER BY created_at DESC'),
          ['task-1']
        );
      });

      it('should return empty array when no runs', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgentRunsByTask('task-1');

        expect(result).toEqual([]);
      });
    });

    describe('getRecentAgentRuns', () => {
      it('should return recent agent runs with default limit', async () => {
        const mockRuns: AgentRun[] = [
          {
            id: 'run-1',
            task_id: 'task-1',
            agent_type: 'developer',
            status: 'completed',
            started_at: '2026-02-05T00:00:00Z',
            completed_at: '2026-02-05T01:00:00Z',
            input_tokens: 1000,
            output_tokens: 500,
            cost_cents: 10,
            transcript: [],
            created_at: '2026-02-05T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockRuns, rowCount: 1 });

        const result = await db.getRecentAgentRuns();

        expect(result).toEqual(mockRuns);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC LIMIT $1'),
          [50]
        );
      });

      it('should return recent agent runs with custom limit', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.getRecentAgentRuns(10);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT $1'),
          [10]
        );
      });
    });

    describe('updateAgentRun', () => {
      it('should update and return agent run', async () => {
        const updates: Partial<AgentRun> = {
          status: 'running',
          started_at: '2026-02-05T00:00:00Z',
        };

        const updatedRun: AgentRun = {
          id: 'run-1',
          task_id: 'task-1',
          agent_type: 'developer',
          status: 'running',
          started_at: '2026-02-05T00:00:00Z',
          input_tokens: 0,
          output_tokens: 0,
          cost_cents: 0,
          transcript: [],
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedRun], rowCount: 1 });

        const result = await db.updateAgentRun('run-1', updates);

        expect(result).toEqual(updatedRun);
      });

      it('should update transcript as JSONB', async () => {
        const updates: Partial<AgentRun> = {
          transcript: [{ role: 'user', content: 'Test', timestamp: '2026-02-05T00:00:00Z' }],
        };

        const updatedRun: AgentRun = {
          id: 'run-1',
          task_id: 'task-1',
          agent_type: 'developer',
          status: 'running',
          input_tokens: 0,
          output_tokens: 0,
          cost_cents: 0,
          transcript: [{ role: 'user', content: 'Test', timestamp: '2026-02-05T00:00:00Z' }],
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedRun], rowCount: 1 });

        const result = await db.updateAgentRun('run-1', updates);

        expect(result).toEqual(updatedRun);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('transcript = $1::jsonb'),
          expect.arrayContaining([JSON.stringify(updates.transcript), 'run-1'])
        );
      });

      it('should return null when run not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.updateAgentRun('non-existent', { status: 'running' });

        expect(result).toBeNull();
      });

      it('should return null when no fields to update', async () => {
        const result = await db.updateAgentRun('run-1', {});

        expect(result).toBeNull();
        expect(mockQuery).not.toHaveBeenCalled();
      });
    });

    describe('completeAgentRun', () => {
      it('should complete agent run with success status', async () => {
        const metrics = { inputTokens: 1000, outputTokens: 500, costCents: 10 };

        const completedRun: AgentRun = {
          id: 'run-1',
          task_id: 'task-1',
          agent_type: 'developer',
          status: 'completed',
          started_at: '2026-02-05T00:00:00Z',
          completed_at: '2026-02-05T01:00:00Z',
          input_tokens: 1000,
          output_tokens: 500,
          cost_cents: 10,
          transcript: [],
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [completedRun], rowCount: 1 });

        const result = await db.completeAgentRun('run-1', 'completed', metrics);

        expect(result).toEqual(completedRun);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('status = $1, completed_at = NOW()'),
          ['completed', 1000, 500, 10, null, 'run-1']
        );
      });

      it('should complete agent run with failed status and error', async () => {
        const metrics = { inputTokens: 500, outputTokens: 0, costCents: 5 };

        const failedRun: AgentRun = {
          id: 'run-1',
          task_id: 'task-1',
          agent_type: 'developer',
          status: 'failed',
          started_at: '2026-02-05T00:00:00Z',
          completed_at: '2026-02-05T00:30:00Z',
          input_tokens: 500,
          output_tokens: 0,
          cost_cents: 5,
          error: 'Connection timeout',
          transcript: [],
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery.mockResolvedValueOnce({ rows: [failedRun], rowCount: 1 });

        const result = await db.completeAgentRun('run-1', 'failed', metrics, 'Connection timeout');

        expect(result).toEqual(failedRun);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.anything(),
          ['failed', 500, 0, 5, 'Connection timeout', 'run-1']
        );
      });

      it('should return null when run not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.completeAgentRun('non-existent', 'completed', { inputTokens: 0, outputTokens: 0, costCents: 0 });

        expect(result).toBeNull();
      });
    });

    describe('appendToTranscript', () => {
      it('should append entry to transcript', async () => {
        const entry = { role: 'user', content: 'Hello' };

        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.appendToTranscript('run-1', entry);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('transcript = transcript || $1::jsonb'),
          expect.arrayContaining([expect.stringContaining('"role":"user"'), 'run-1'])
        );
      });

      it('should use provided timestamp', async () => {
        const entry = { role: 'assistant', content: 'Hi', timestamp: '2026-02-05T00:00:00Z' };

        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.appendToTranscript('run-1', entry);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.anything(),
          expect.arrayContaining([expect.stringContaining('2026-02-05T00:00:00Z'), 'run-1'])
        );
      });
    });
  });

  describe('Cost Tracking', () => {
    describe('getTodayAgentCost', () => {
      it('should return total cost for today', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ total: '150' }], rowCount: 1 });

        const result = await db.getTodayAgentCost();

        expect(result).toBe(150);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE started_at >= CURRENT_DATE')
        );
      });

      it('should return 0 when no runs today', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 });

        const result = await db.getTodayAgentCost();

        expect(result).toBe(0);
      });
    });

    describe('getAgentCostByPeriod', () => {
      it('should return cost breakdown for period', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-06');

        mockQuery
          .mockResolvedValueOnce({ rows: [{ total: '500' }], rowCount: 1 })
          .mockResolvedValueOnce({
            rows: [
              { agent_type: 'developer', total: '300' },
              { agent_type: 'qa', total: '200' },
            ],
            rowCount: 2
          })
          .mockResolvedValueOnce({
            rows: [
              { date: new Date('2026-02-01'), total: '100' },
              { date: new Date('2026-02-02'), total: '150' },
              { date: new Date('2026-02-05'), total: '250' },
            ],
            rowCount: 3
          });

        const result = await db.getAgentCostByPeriod(startDate, endDate);

        expect(result).toEqual({
          total: 500,
          byAgent: { developer: 300, qa: 200 },
          byDay: [
            { date: '2026-02-01', total: 100 },
            { date: '2026-02-02', total: 150 },
            { date: '2026-02-05', total: 250 },
          ],
        });
      });

      it('should return zeros when no data in period', async () => {
        const startDate = new Date('2026-01-01');
        const endDate = new Date('2026-01-02');

        mockQuery
          .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAgentCostByPeriod(startDate, endDate);

        expect(result).toEqual({
          total: 0,
          byAgent: {},
          byDay: [],
        });
      });
    });

    describe('getAgentRunStats', () => {
      it('should return overall agent run statistics', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{
            total_runs: '100',
            completed_runs: '80',
            failed_runs: '15',
            total_tokens: '500000',
            total_cost_cents: '2500',
          }],
          rowCount: 1
        });

        const result = await db.getAgentRunStats();

        expect(result).toEqual({
          totalRuns: 100,
          completedRuns: 80,
          failedRuns: 15,
          totalTokens: 500000,
          totalCostCents: 2500,
        });
      });

      it('should return zeros when no runs', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{
            total_runs: '0',
            completed_runs: '0',
            failed_runs: '0',
            total_tokens: '0',
            total_cost_cents: '0',
          }],
          rowCount: 1
        });

        const result = await db.getAgentRunStats();

        expect(result).toEqual({
          totalRuns: 0,
          completedRuns: 0,
          failedRuns: 0,
          totalTokens: 0,
          totalCostCents: 0,
        });
      });
    });
  });

  describe('Dependencies', () => {
    describe('getTaskDependencies', () => {
      it('should return dependencies with title and status', async () => {
        const mockDeps: TaskDependencyWithTitle[] = [
          {
            id: 'dep-1',
            task_id: 'task-2',
            depends_on_id: 'task-1',
            title: 'Task 1',
            status: 'done',
            created_at: '2026-02-01T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockDeps, rowCount: 1 });

        const result = await db.getTaskDependencies('task-2');

        expect(result).toEqual(mockDeps);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE td.task_id = $1'),
          ['task-2']
        );
      });

      it('should return empty array when no dependencies', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getTaskDependencies('task-1');

        expect(result).toEqual([]);
      });
    });

    describe('getTaskDependents', () => {
      it('should return dependents with title and status', async () => {
        const mockDeps: TaskDependencyWithTitle[] = [
          {
            id: 'dep-1',
            task_id: 'task-2',
            depends_on_id: 'task-1',
            title: 'Task 2',
            status: 'todo',
            created_at: '2026-02-01T00:00:00Z',
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockDeps, rowCount: 1 });

        const result = await db.getTaskDependents('task-1');

        expect(result).toEqual(mockDeps);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE td.depends_on_id = $1'),
          ['task-1']
        );
      });

      it('should return empty array when no dependents', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getTaskDependents('task-1');

        expect(result).toEqual([]);
      });
    });

    describe('addTaskDependency', () => {
      it('should add dependency and recalculate blocked status', async () => {
        const newDep: TaskDependency = {
          id: expect.stringContaining('dep-'),
          task_id: 'task-2',
          depends_on_id: 'task-1',
          created_at: '2026-02-05T00:00:00Z',
        };

        mockQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({ rows: [newDep], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ title: 'Task 1' }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await db.addTaskDependency('task-2', 'task-1');

        expect(result.task_id).toBe('task-2');
        expect(result.depends_on_id).toBe('task-1');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO task_dependencies'),
          expect.arrayContaining([expect.stringContaining('dep-'), 'task-2', 'task-1'])
        );
      });

      it('should throw error when cycle would be created', async () => {
        // wouldCreateCycle('task-1', 'task-2') queries depends_on_id='task-1'
        // returns task-2, which means task-2→task-1 exists already
        // then stack pops task-2, which === dependsOnId ('task-2') → cycle!
        mockQuery.mockResolvedValueOnce({
          rows: [{ task_id: 'task-2' }],
          rowCount: 1
        });

        await expect(db.addTaskDependency('task-1', 'task-2')).rejects.toThrow(
          'Adding this dependency would create a circular dependency'
        );
      });
    });

    describe('removeTaskDependency', () => {
      it('should remove dependency and recalculate blocked status', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({
            rows: [{
              id: 'task-2',
              blocked_reason: 'Waiting on: Task 1',
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await db.removeTaskDependency('task-2', 'task-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM task_dependencies'),
          ['task-2', 'task-1']
        );
      });

      it('should return false when dependency not found', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({
            rows: [{ id: 'task-2', blocked_reason: null }],
            rowCount: 1
          });

        const result = await db.removeTaskDependency('task-2', 'task-1');

        expect(result).toBe(false);
      });
    });

    describe('recalculateBlockedStatus', () => {
      it('should set task as blocked when dependencies incomplete', async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              { title: 'Task 1' },
              { title: 'Task 3' },
            ],
            rowCount: 2
          })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.recalculateBlockedStatus('task-2');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_blocked = TRUE'),
          [expect.stringContaining('Waiting on:'), 'task-2']
        );
      });

      it('should unblock task when all dependencies complete', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({
            rows: [{
              id: 'task-2',
              blocked_reason: 'Waiting on: Task 1',
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.recalculateBlockedStatus('task-2');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_blocked = FALSE'),
          ['task-2']
        );
      });

      it('should not unblock manually blocked task', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({
            rows: [{
              id: 'task-2',
              blocked_reason: 'Manual block reason',
            }],
            rowCount: 1
          });

        await db.recalculateBlockedStatus('task-2');

        expect(mockQuery).toHaveBeenCalledTimes(2);
      });
    });

    describe('getTaskDependencyCount', () => {
      it('should return count of dependencies for task', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });

        const result = await db.getTaskDependencyCount('task-1');

        expect(result).toBe(3);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE task_id = $1'),
          ['task-1']
        );
      });

      it('should return 0 when no dependencies', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

        const result = await db.getTaskDependencyCount('task-1');

        expect(result).toBe(0);
      });
    });

    describe('getAllTaskDependencyCounts', () => {
      it('should return dependency counts for all tasks', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            { task_id: 'task-1', count: '2' },
            { task_id: 'task-2', count: '1' },
            { task_id: 'task-3', count: '3' },
          ],
          rowCount: 3
        });

        const result = await db.getAllTaskDependencyCounts();

        expect(result).toEqual({
          'task-1': 2,
          'task-2': 1,
          'task-3': 3,
        });
      });

      it('should return empty object when no dependencies', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getAllTaskDependencyCounts();

        expect(result).toEqual({});
      });
    });
  });

  describe('getAutomationUserEmail', () => {
    it('should return email of first user with Claude API key', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: 'user@example.com' }],
        rowCount: 1
      });

      const result = await db.getAutomationUserEmail();

      expect(result).toBe('user@example.com');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE claude_api_key IS NOT NULL LIMIT 1')
      );
    });

    it('should return undefined when no user has Claude API key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await db.getAutomationUserEmail();

      expect(result).toBeUndefined();
    });

    it('should return undefined when query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await db.getAutomationUserEmail();

      expect(result).toBeUndefined();
    });
  });

  describe('Task Run Claim/Release', () => {
    describe('claimTaskRun', () => {
      it('should return true when task has no active run (successful claim)', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }], rowCount: 1 });

        const result = await db.claimTaskRun('task-1', 'run-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('current_run_id IS NULL'),
          ['task-1', 'run-1']
        );
      });

      it('should return false when task already has an active run', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.claimTaskRun('task-1', 'run-2');

        expect(result).toBe(false);
      });

      it('should set current_run_id on the task', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }], rowCount: 1 });

        await db.claimTaskRun('task-1', 'run-abc');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SET current_run_id = $2'),
          ['task-1', 'run-abc']
        );
      });
    });

    describe('releaseTaskRun', () => {
      it('should release the claim when caller owns it', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.releaseTaskRun('task-1', 'run-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('current_run_id = NULL'),
          ['task-1', 'run-1']
        );
      });

      it('should only release if current_run_id matches the caller', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.releaseTaskRun('task-1', 'wrong-run');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE id = $1 AND current_run_id = $2'),
          ['task-1', 'wrong-run']
        );
      });
    });
  });
});
