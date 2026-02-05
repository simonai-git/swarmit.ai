import { describe, it, expect, vi } from 'vitest';
import { calculateCost, AGENT_PROMPTS } from '@/lib/claude';

// Mock pool for getUserClaudeKey
vi.mock('@/lib/db', () => ({
  default: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

describe('claude utilities', () => {
  describe('calculateCost', () => {
    it('should calculate cost for claude-sonnet-4', () => {
      // Sonnet 4: pricing values 300/1500 per 1M (then *100)
      const cost = calculateCost(1000000, 1000000, 'claude-sonnet-4-20250514');
      // The function multiplies pricing by 100, so:
      // 1M input = 300 * 100 = 30000
      // 1M output = 1500 * 100 = 150000
      // Total = 180000
      expect(cost).toBe(180000);
    });

    it('should calculate cost for small token counts', () => {
      // 1000 input, 500 output
      const cost = calculateCost(1000, 500, 'claude-sonnet-4-20250514');
      // Cost should be positive
      expect(cost).toBeGreaterThan(0);
    });

    it('should return 0 for zero tokens', () => {
      const cost = calculateCost(0, 0, 'claude-sonnet-4-20250514');
      expect(cost).toBe(0);
    });

    it('should handle unknown models with default pricing', () => {
      const cost = calculateCost(1000, 1000, 'unknown-model');
      expect(cost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AGENT_PROMPTS', () => {
    it('should have developer prompt', () => {
      expect(AGENT_PROMPTS.developer).toBeDefined();
      expect(AGENT_PROMPTS.developer).toContain('developer');
    });

    it('should have qa prompt', () => {
      expect(AGENT_PROMPTS.qa).toBeDefined();
      expect(AGENT_PROMPTS.qa.toLowerCase()).toContain('test');
    });

    it('should have reviewer prompt', () => {
      expect(AGENT_PROMPTS.reviewer).toBeDefined();
      expect(AGENT_PROMPTS.reviewer.toLowerCase()).toContain('review');
    });
  });
});
