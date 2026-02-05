import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for mock functions
const { mockEnqueue, mockUpdateTask } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockUpdateTask: vi.fn(),
}));

// Mock the agent-queue module
vi.mock('@/lib/agent-queue', () => ({
  agentQueue: {
    enqueue: mockEnqueue,
  },
}));

// Mock the db module  
vi.mock('@/lib/db', () => ({
  getTask: vi.fn(),
  updateTask: mockUpdateTask,
}));

import {
  detectSpecialization,
  selectSpecialist,
  getAutomationSettings,
  setAutomationSettings,
  onTaskCreated,
  onTaskStatusChanged,
  onTaskAssigned,
  shouldAutomate,
} from '@/lib/task-lifecycle';

describe('task-lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset settings to defaults
    setAutomationSettings({
      enabled: true,
      autoAssign: true,
      autoSpawnOnCreate: true,
      autoSpawnOnTesting: true,
      autoSpawnOnReview: true,
      autoConvertFeedback: true,
    });
  });

  describe('detectSpecialization', () => {
    describe('frontend detection', () => {
      it('should detect UI tasks', () => {
        expect(detectSpecialization({ title: 'Fix button styling' })).toBe('frontend');
      });

      it('should detect CSS tasks', () => {
        expect(detectSpecialization({ title: 'Update CSS styles' })).toBe('frontend');
      });

      it('should detect React tasks', () => {
        expect(detectSpecialization({ title: 'React component refactor' })).toBe('frontend');
      });

      it('should detect component tasks', () => {
        expect(detectSpecialization({ title: 'Create new component' })).toBe('frontend');
      });

      it('should detect modal tasks', () => {
        expect(detectSpecialization({ title: 'Fix modal dialog' })).toBe('frontend');
      });

      it('should detect layout tasks', () => {
        expect(detectSpecialization({ title: 'Update page layout' })).toBe('frontend');
      });

      it('should detect responsive tasks', () => {
        expect(detectSpecialization({ title: 'Add responsive design' })).toBe('frontend');
      });

      it('should detect tailwind tasks', () => {
        expect(detectSpecialization({ title: 'Tailwind styling updates' })).toBe('frontend');
      });

      it('should detect design tasks', () => {
        expect(detectSpecialization({ title: 'Design improvements' })).toBe('frontend');
      });

      it('should detect animation tasks', () => {
        expect(detectSpecialization({ title: 'Add animation effects' })).toBe('frontend');
      });
    });

    describe('backend detection', () => {
      it('should detect API tasks', () => {
        expect(detectSpecialization({ title: 'Create API endpoint' })).toBe('backend');
      });

      it('should detect database tasks', () => {
        expect(detectSpecialization({ title: 'Fix database query' })).toBe('backend');
      });

      it('should detect endpoint tasks', () => {
        expect(detectSpecialization({ title: 'New endpoint for users' })).toBe('backend');
      });

      it('should detect server tasks', () => {
        expect(detectSpecialization({ title: 'Server configuration' })).toBe('backend');
      });

      it('should detect SQL tasks', () => {
        expect(detectSpecialization({ title: 'Optimize SQL queries' })).toBe('backend');
      });

      it('should detect postgres tasks', () => {
        expect(detectSpecialization({ title: 'Postgres migration' })).toBe('backend');
      });

      it('should detect auth tasks', () => {
        expect(detectSpecialization({ title: 'Auth system updates' })).toBe('backend');
      });

      it('should detect middleware tasks', () => {
        expect(detectSpecialization({ title: 'Add middleware' })).toBe('backend');
      });

      it('should detect route tasks', () => {
        expect(detectSpecialization({ title: 'New route handler' })).toBe('backend');
      });
    });

    describe('devops detection', () => {
      it('should detect deploy tasks', () => {
        expect(detectSpecialization({ title: 'Deploy to production' })).toBe('devops');
      });

      it('should detect docker tasks', () => {
        expect(detectSpecialization({ title: 'Update Docker config' })).toBe('devops');
      });

      it('should detect railway tasks', () => {
        expect(detectSpecialization({ title: 'Railway deployment' })).toBe('devops');
      });

      it('should detect CI tasks', () => {
        expect(detectSpecialization({ title: 'Set up CI pipeline' })).toBe('devops');
      });

      it('should detect CD tasks', () => {
        expect(detectSpecialization({ title: 'CD workflow update' })).toBe('devops');
      });

      it('should detect pipeline tasks', () => {
        expect(detectSpecialization({ title: 'CI pipeline configuration' })).toBe('devops');
      });

      it('should detect infrastructure tasks', () => {
        expect(detectSpecialization({ title: 'Infrastructure changes' })).toBe('devops');
      });

      it('should detect env tasks', () => {
        expect(detectSpecialization({ title: 'Add env variables' })).toBe('devops');
      });

      it('should detect SSL tasks', () => {
        expect(detectSpecialization({ title: 'SSL certificate renewal' })).toBe('devops');
      });

      it('should detect domain tasks', () => {
        expect(detectSpecialization({ title: 'Domain configuration' })).toBe('devops');
      });
    });

    describe('qa detection', () => {
      it('should detect test tasks', () => {
        expect(detectSpecialization({ title: 'Write test cases' })).toBe('qa');
      });

      it('should detect bug tasks', () => {
        expect(detectSpecialization({ title: 'Bug in login flow' })).toBe('qa');
      });

      it('should detect fix tasks', () => {
        expect(detectSpecialization({ title: 'Fix broken feature' })).toBe('qa');
      });

      it('should detect verify tasks', () => {
        expect(detectSpecialization({ title: 'Verify functionality' })).toBe('qa');
      });

      it('should detect validate tasks', () => {
        expect(detectSpecialization({ title: 'Validate inputs' })).toBe('qa');
      });

      it('should detect check tasks', () => {
        expect(detectSpecialization({ title: 'Check for errors' })).toBe('qa');
      });

      it('should detect broken tasks', () => {
        expect(detectSpecialization({ title: 'Broken checkout' })).toBe('qa');
      });

      it('should detect issue tasks', () => {
        expect(detectSpecialization({ title: 'Issue with payments' })).toBe('qa');
      });

      it('should detect error tasks', () => {
        expect(detectSpecialization({ title: 'Error handling' })).toBe('qa');
      });
    });

    describe('ai detection', () => {
      it('should detect LLM tasks', () => {
        expect(detectSpecialization({ title: 'Update LLM prompt' })).toBe('ai');
      });

      it('should detect claude tasks', () => {
        expect(detectSpecialization({ title: 'Claude integration' })).toBe('ai');
      });

      it('should detect openai tasks', () => {
        // 'API' also matches backend, so make it clearer
        expect(detectSpecialization({ title: 'OpenAI integration' })).toBe('ai');
      });

      it('should detect prompt tasks', () => {
        expect(detectSpecialization({ title: 'Prompt engineering' })).toBe('ai');
      });

      it('should detect agent tasks', () => {
        expect(detectSpecialization({ title: 'Agent configuration' })).toBe('ai');
      });

      it('should detect ML tasks', () => {
        expect(detectSpecialization({ title: 'ML model update' })).toBe('ai');
      });

      it('should detect model tasks', () => {
        expect(detectSpecialization({ title: 'Model fine-tuning' })).toBe('ai');
      });

      it('should detect embedding tasks', () => {
        expect(detectSpecialization({ title: 'Embedding generation' })).toBe('ai');
      });

      it('should detect vector tasks', () => {
        expect(detectSpecialization({ title: 'Vector search' })).toBe('ai');
      });
    });

    describe('default detection', () => {
      it('should return default for generic tasks', () => {
        expect(detectSpecialization({ title: 'Update documentation' })).toBe('default');
      });

      it('should return default for vague tasks', () => {
        expect(detectSpecialization({ title: 'Make changes' })).toBe('default');
      });

      it('should return default for coordination tasks', () => {
        expect(detectSpecialization({ title: 'Team meeting notes' })).toBe('default');
      });
    });

    describe('description consideration', () => {
      it('should consider description in detection', () => {
        expect(detectSpecialization({ 
          title: 'Update styling', 
          description: 'The button CSS and layout needs responsive design' 
        })).toBe('frontend');
      });

      it('should handle null description', () => {
        expect(detectSpecialization({ 
          title: 'API endpoint', 
          description: null 
        })).toBe('backend');
      });

      it('should prioritize more matches', () => {
        // Multiple frontend keywords should win
        expect(detectSpecialization({ 
          title: 'Task',
          description: 'React component with CSS styling and responsive layout using Tailwind' 
        })).toBe('frontend');
      });
    });
  });

  describe('selectSpecialist', () => {
    it('should return Alex for frontend tasks', () => {
      expect(selectSpecialist({ title: 'Fix button UI' })).toBe('Alex');
    });

    it('should return Morgan for backend tasks', () => {
      expect(selectSpecialist({ title: 'Create API endpoint' })).toBe('Morgan');
    });

    it('should return Jordan for devops tasks', () => {
      expect(selectSpecialist({ title: 'Deploy to Railway' })).toBe('Jordan');
    });

    it('should return Riley for QA tasks', () => {
      expect(selectSpecialist({ title: 'Test login flow' })).toBe('Riley');
    });

    it('should return Casey for AI tasks', () => {
      expect(selectSpecialist({ title: 'Update LLM prompt' })).toBe('Casey');
    });

    it('should return Simon for generic tasks', () => {
      expect(selectSpecialist({ title: 'Update documentation' })).toBe('Simon');
    });

    it('should handle empty title', () => {
      expect(selectSpecialist({ title: '' })).toBe('Simon');
    });
  });

  describe('getAutomationSettings / setAutomationSettings', () => {
    it('should return default settings', () => {
      const settings = getAutomationSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.autoAssign).toBe(true);
      expect(settings.autoSpawnOnCreate).toBe(true);
      expect(settings.autoSpawnOnTesting).toBe(true);
      expect(settings.autoSpawnOnReview).toBe(true);
      expect(settings.autoConvertFeedback).toBe(true);
    });

    it('should update single setting', () => {
      setAutomationSettings({ enabled: false });
      expect(getAutomationSettings().enabled).toBe(false);
    });

    it('should merge settings, not replace', () => {
      setAutomationSettings({ autoSpawnOnCreate: false });
      const updated = getAutomationSettings();
      
      expect(updated.autoAssign).toBe(true);
      expect(updated.autoSpawnOnCreate).toBe(false);
    });

    it('should update multiple settings', () => {
      setAutomationSettings({ 
        autoSpawnOnCreate: false,
        autoSpawnOnTesting: false,
      });
      const updated = getAutomationSettings();
      
      expect(updated.autoSpawnOnCreate).toBe(false);
      expect(updated.autoSpawnOnTesting).toBe(false);
      expect(updated.autoSpawnOnReview).toBe(true);
    });

    it('should return updated settings', () => {
      const result = setAutomationSettings({ enabled: false });
      expect(result.enabled).toBe(false);
    });
  });

  describe('onTaskCreated', () => {
    const mockTask = {
      id: 'task-123',
      title: 'Test Task',
      status: 'todo',
      priority: 'medium',
      assignee: null,
    };

    it('should auto-assign when no assignee', async () => {
      await onTaskCreated(mockTask as any);
      
      expect(mockUpdateTask).toHaveBeenCalledWith(
        'task-123',
        expect.objectContaining({ assignee: expect.any(String) })
      );
    });

    it('should not auto-assign when assignee exists', async () => {
      const taskWithAssignee = { ...mockTask, assignee: 'Alex' };
      await onTaskCreated(taskWithAssignee as any);
      
      expect(mockUpdateTask).not.toHaveBeenCalled();
    });

    it('should enqueue agent for todo tasks', async () => {
      await onTaskCreated(mockTask as any);
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          agentType: 'developer',
        })
      );
    });

    it('should not enqueue when autoSpawnOnCreate is false', async () => {
      setAutomationSettings({ autoSpawnOnCreate: false });
      await onTaskCreated(mockTask as any);
      
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('should not do anything when disabled', async () => {
      setAutomationSettings({ enabled: false });
      await onTaskCreated(mockTask as any);
      
      expect(mockUpdateTask).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('should set high priority for high priority tasks', async () => {
      const highPriorityTask = { ...mockTask, priority: 'high' };
      await onTaskCreated(highPriorityTask as any);
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 10 })
      );
    });

    it('should set medium priority for medium tasks', async () => {
      await onTaskCreated(mockTask as any);
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 5 })
      );
    });

    it('should set low priority for low priority tasks', async () => {
      const lowPriorityTask = { ...mockTask, priority: 'low' };
      await onTaskCreated(lowPriorityTask as any);
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 1 })
      );
    });
  });

  describe('onTaskStatusChanged', () => {
    const mockTask = {
      id: 'task-456',
      title: 'Test Task',
      status: 'testing',
      priority: 'medium',
    };

    it('should enqueue QA agent when moved to testing', async () => {
      await onTaskStatusChanged(mockTask as any, 'in_progress', 'testing');
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-456',
          agentType: 'qa',
        })
      );
    });

    it('should enqueue reviewer when moved to in_review', async () => {
      const reviewTask = { ...mockTask, status: 'in_review' };
      await onTaskStatusChanged(reviewTask as any, 'testing', 'in_review');
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-456',
          agentType: 'reviewer',
        })
      );
    });

    it('should not enqueue when autoSpawnOnTesting is false', async () => {
      setAutomationSettings({ autoSpawnOnTesting: false });
      await onTaskStatusChanged(mockTask as any, 'in_progress', 'testing');
      
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('should not enqueue when autoSpawnOnReview is false', async () => {
      setAutomationSettings({ autoSpawnOnReview: false });
      const reviewTask = { ...mockTask, status: 'in_review' };
      await onTaskStatusChanged(reviewTask as any, 'testing', 'in_review');
      
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('should not do anything when disabled', async () => {
      setAutomationSettings({ enabled: false });
      await onTaskStatusChanged(mockTask as any, 'in_progress', 'testing');
      
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('should not enqueue for other status changes', async () => {
      await onTaskStatusChanged(mockTask as any, 'todo', 'in_progress');
      
      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe('onTaskAssigned', () => {
    const mockTask = {
      id: 'task-789',
      title: 'Test Task',
      status: 'in_progress',
      priority: 'medium',
    };

    it('should enqueue agent for in_progress task reassignment', async () => {
      await onTaskAssigned(mockTask as any, 'Simon', 'Alex');
      
      expect(mockEnqueue).toHaveBeenCalled();
    });

    it('should use developer type for most agents', async () => {
      await onTaskAssigned(mockTask as any, 'Simon', 'Alex');
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ agentType: 'developer' })
      );
    });

    it('should use qa type for Riley', async () => {
      await onTaskAssigned(mockTask as any, 'Simon', 'Riley');
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ agentType: 'qa' })
      );
    });

    it('should use reviewer type for Simon', async () => {
      await onTaskAssigned(mockTask as any, 'Alex', 'Simon');
      
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ agentType: 'reviewer' })
      );
    });

    it('should not enqueue for non-in_progress tasks', async () => {
      const todoTask = { ...mockTask, status: 'todo' };
      await onTaskAssigned(todoTask as any, 'Simon', 'Alex');
      
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('should not do anything when disabled', async () => {
      setAutomationSettings({ enabled: false });
      await onTaskAssigned(mockTask as any, 'Simon', 'Alex');
      
      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe('shouldAutomate', () => {
    it('should return true for normal tasks', () => {
      const task = { status: 'todo', is_blocked: false };
      expect(shouldAutomate(task as any)).toBe(true);
    });

    it('should return false for done tasks', () => {
      const task = { status: 'done', is_blocked: false };
      expect(shouldAutomate(task as any)).toBe(false);
    });

    it('should return false for blocked tasks', () => {
      const task = { status: 'todo', is_blocked: true };
      expect(shouldAutomate(task as any)).toBe(false);
    });

    it('should return false when disabled', () => {
      setAutomationSettings({ enabled: false });
      const task = { status: 'todo', is_blocked: false };
      expect(shouldAutomate(task as any)).toBe(false);
    });

    it('should return true for in_progress tasks', () => {
      const task = { status: 'in_progress', is_blocked: false };
      expect(shouldAutomate(task as any)).toBe(true);
    });

    it('should return true for testing tasks', () => {
      const task = { status: 'testing', is_blocked: false };
      expect(shouldAutomate(task as any)).toBe(true);
    });
  });
});
