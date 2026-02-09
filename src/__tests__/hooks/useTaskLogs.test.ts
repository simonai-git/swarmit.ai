import { describe, it, expect } from 'vitest';
import { consolidateLogs, LogEntry } from '@/hooks/useTaskLogs';

function makeEntry(overrides: Partial<LogEntry> & { stream: LogEntry['stream']; content: string }): LogEntry {
  return {
    task_id: 'task-1',
    run_id: 'run-1',
    agent_type: 'developer',
    ...overrides,
  };
}

describe('consolidateLogs', () => {
  it('should return empty array for empty input', () => {
    expect(consolidateLogs([])).toEqual([]);
  });

  it('should return single entry unchanged', () => {
    const entry = makeEntry({ stream: 'stdout', content: 'hello', timestamp: 1000 });
    expect(consolidateLogs([entry])).toEqual([entry]);
  });

  it('should not merge entries with different streams', () => {
    const entries = [
      makeEntry({ stream: 'stdout', content: 'out', timestamp: 1000 }),
      makeEntry({ stream: 'stderr', content: 'err', timestamp: 1050 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('out');
    expect(result[1].content).toBe('err');
  });

  it('should merge consecutive same-stream entries within 200ms', () => {
    const entries = [
      makeEntry({ stream: 'stdout', content: 'Hello ', timestamp: 1000 }),
      makeEntry({ stream: 'stdout', content: 'World', timestamp: 1100 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Hello World');
  });

  it('should not merge entries with different run_id', () => {
    const entries = [
      makeEntry({ stream: 'stdout', content: 'A', run_id: 'run-1', timestamp: 1000 }),
      makeEntry({ stream: 'stdout', content: 'B', run_id: 'run-2', timestamp: 1050 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(2);
  });

  it('should not merge entries 200ms or more apart', () => {
    const entries = [
      makeEntry({ stream: 'stdout', content: 'A', timestamp: 1000 }),
      makeEntry({ stream: 'stdout', content: 'B', timestamp: 1200 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(2);
  });

  it('should merge entries less than 200ms apart', () => {
    const entries = [
      makeEntry({ stream: 'stdout', content: 'A', timestamp: 1000 }),
      makeEntry({ stream: 'stdout', content: 'B', timestamp: 1199 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('AB');
  });

  it('should handle multiple merge groups', () => {
    const entries = [
      makeEntry({ stream: 'stdout', content: 'a', timestamp: 1000 }),
      makeEntry({ stream: 'stdout', content: 'b', timestamp: 1050 }),
      makeEntry({ stream: 'stdout', content: 'c', timestamp: 1100 }),
      makeEntry({ stream: 'stderr', content: 'error', timestamp: 1150 }),
      makeEntry({ stream: 'stdout', content: 'x', timestamp: 1200 }),
      makeEntry({ stream: 'stdout', content: 'y', timestamp: 1250 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe('abc');
    expect(result[0].stream).toBe('stdout');
    expect(result[1].content).toBe('error');
    expect(result[1].stream).toBe('stderr');
    expect(result[2].content).toBe('xy');
    expect(result[2].stream).toBe('stdout');
  });

  it('should use created_at for time comparison when available', () => {
    const base = new Date('2026-02-08T10:00:00.000Z');
    const entries = [
      makeEntry({ stream: 'stdout', content: 'A', created_at: base.toISOString() }),
      makeEntry({ stream: 'stdout', content: 'B', created_at: new Date(base.getTime() + 100).toISOString() }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('AB');
  });

  it('should fall back to timestamp when created_at is absent', () => {
    const entries = [
      makeEntry({ stream: 'system', content: 'log1', timestamp: 5000 }),
      makeEntry({ stream: 'system', content: 'log2', timestamp: 5100 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('log1log2');
  });

  it('should default to 0 when both created_at and timestamp are absent', () => {
    const entries = [
      makeEntry({ stream: 'stdout', content: 'A' }),
      makeEntry({ stream: 'stdout', content: 'B' }),
    ];
    // Both default to time 0, so diff is 0 < 200 → merged
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('AB');
  });

  it('should chain multiple consecutive merges', () => {
    const entries = [
      makeEntry({ stream: 'stdout', content: 'w', timestamp: 1000 }),
      makeEntry({ stream: 'stdout', content: 'o', timestamp: 1050 }),
      makeEntry({ stream: 'stdout', content: 'r', timestamp: 1100 }),
      makeEntry({ stream: 'stdout', content: 'd', timestamp: 1150 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('word');
  });

  it('should handle null run_id matching', () => {
    const entries = [
      makeEntry({ stream: 'system', content: 'init', run_id: null, timestamp: 1000 }),
      makeEntry({ stream: 'system', content: ' done', run_id: null, timestamp: 1050 }),
    ];
    const result = consolidateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('init done');
  });

  it('should preserve stream label abbreviation compatibility', () => {
    // Verify all stream types work with consolidation
    const streams: LogEntry['stream'][] = ['stdout', 'stderr', 'system', 'assistant', 'tool'];
    for (const stream of streams) {
      const entries = [
        makeEntry({ stream, content: 'part1', timestamp: 1000 }),
        makeEntry({ stream, content: 'part2', timestamp: 1050 }),
      ];
      const result = consolidateLogs(entries);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('part1part2');
    }
  });
});
