import { appendTaskLogBatch } from './db';

export interface BufferedLogEntry {
  task_id: string;
  run_id: string | null;
  agent_type: string | null;
  stream: 'stdout' | 'stderr' | 'system';
  content: string;
  timestamp: number;
}

type LogSubscriber = (entry: BufferedLogEntry) => void;

const MAX_ENTRIES_PER_TASK = 200;
const FLUSH_INTERVAL_MS = 2000;

class TaskLogBuffer {
  private buffer: Map<string, BufferedLogEntry[]> = new Map();
  private pendingFlush: BufferedLogEntry[] = [];
  private subscribers: Map<string, Set<LogSubscriber>> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  append(entry: BufferedLogEntry): void {
    // Add to ring buffer
    let taskEntries = this.buffer.get(entry.task_id);
    if (!taskEntries) {
      taskEntries = [];
      this.buffer.set(entry.task_id, taskEntries);
    }
    taskEntries.push(entry);
    if (taskEntries.length > MAX_ENTRIES_PER_TASK) {
      taskEntries.splice(0, taskEntries.length - MAX_ENTRIES_PER_TASK);
    }

    // Add to pending flush queue
    this.pendingFlush.push(entry);

    // Notify subscribers
    const subs = this.subscribers.get(entry.task_id);
    if (subs) {
      for (const cb of subs) {
        try { cb(entry); } catch { /* ignore subscriber errors */ }
      }
    }
  }

  subscribe(taskId: string, cb: LogSubscriber): () => void {
    let subs = this.subscribers.get(taskId);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(taskId, subs);
    }
    subs.add(cb);

    return () => {
      subs!.delete(cb);
      if (subs!.size === 0) {
        this.subscribers.delete(taskId);
      }
    };
  }

  getBuffered(taskId: string): BufferedLogEntry[] {
    return this.buffer.get(taskId) || [];
  }

  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Final flush
    this.flush();
  }

  private flush(): void {
    if (this.pendingFlush.length === 0) return;

    const batch = this.pendingFlush.splice(0);
    const dbLogs = batch.map(e => ({
      task_id: e.task_id,
      run_id: e.run_id,
      agent_type: e.agent_type,
      stream: e.stream,
      content: e.content,
    }));

    appendTaskLogBatch(dbLogs).catch(err => {
      console.error('[TaskLogBuffer] Failed to flush logs to DB:', err);
    });
  }
}

export const taskLogBuffer = new TaskLogBuffer();
