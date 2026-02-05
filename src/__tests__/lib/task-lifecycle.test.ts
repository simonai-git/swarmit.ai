import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectSpecialization,
  selectSpecialist,
  getAutomationSettings,
  setAutomationSettings,
} from '@/lib/task-lifecycle';

// Mock the agent-queue module
vi.mock('@/lib/agent-queue', () => ({
  agentQueue: {
    enqueue: vi.fn(),
  },
}));

// Mock the db module
vi.mock('@/lib/db', () => ({
  getTask: vi.fn(),
  updateTask: vi.fn(),
}));

describe('task-lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectSpecialization', () => {
    it('should detect frontend tasks', () => {
      expect(detectSpecialization({ title: 'Fix button styling' })).toBe('frontend');
      expect(detectSpecialization({ title: 'Add responsive design' })).toBe('frontend');
      expect(detectSpecialization({ title: 'Update CSS for modal' })).toBe('frontend');
      expect(detectSpecialization({ title: 'React component refactor' })).toBe('frontend');
    });

    it('should detect backend tasks', () => {
      expect(detectSpecialization({ title: 'Create API endpoint' })).toBe('backend');
      expect(detectSpecialization({ title: 'Fix database query' })).toBe('backend');
      expect(detectSpecialization({ title: 'Add auth middleware' })).toBe('backend');
    });

    it('should detect devops tasks', () => {
      expect(detectSpecialization({ title: 'Deploy to Railway' })).toBe('devops');
      expect(detectSpecialization({ title: 'Setup Docker container' })).toBe('devops');
      expect(detectSpecialization({ title: 'Configure CI/CD pipeline' })).toBe('devops');
    });

    it('should detect QA tasks', () => {
      expect(detectSpecialization({ title: 'Test login flow' })).toBe('qa');
      expect(detectSpecialization({ title: 'Fix bug in checkout' })).toBe('qa');
      expect(detectSpecialization({ title: 'Verify payment issue' })).toBe('qa');
    });

    it('should detect AI tasks', () => {
      expect(detectSpecialization({ title: 'Update LLM prompt' })).toBe('ai');
      // 'agent' is an AI keyword
      expect(detectSpecialization({ title: 'Train agent model' })).toBe('ai');
      // 'vector' and 'embedding' are AI keywords
      expect(detectSpecialization({ title: 'Improve vector embedding' })).toBe('ai');
    });

    it('should return default for generic tasks', () => {
      expect(detectSpecialization({ title: 'Update documentation' })).toBe('default');
      expect(detectSpecialization({ title: 'Review code changes' })).toBe('default');
    });

    it('should consider description in detection', () => {
      // "Fix" and "broken" match QA keywords, need more frontend keywords to win
      expect(detectSpecialization({ 
        title: 'Update styling', 
        description: 'The button CSS and layout needs responsive design' 
      })).toBe('frontend');
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
  });

  describe('getAutomationSettings / setAutomationSettings', () => {
    it('should return default settings', () => {
      const settings = getAutomationSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.autoAssign).toBe(true);
      expect(settings.autoSpawnOnCreate).toBe(true);
    });

    it('should update settings', () => {
      setAutomationSettings({ enabled: false });
      const settings = getAutomationSettings();
      expect(settings.enabled).toBe(false);
      
      // Reset for other tests
      setAutomationSettings({ enabled: true });
    });

    it('should merge settings, not replace', () => {
      const original = getAutomationSettings();
      setAutomationSettings({ autoSpawnOnCreate: false });
      const updated = getAutomationSettings();
      
      expect(updated.autoAssign).toBe(original.autoAssign);
      expect(updated.autoSpawnOnCreate).toBe(false);
      
      // Reset
      setAutomationSettings({ autoSpawnOnCreate: true });
    });
  });
});
