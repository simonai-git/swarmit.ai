'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface LogEntry {
  id?: number;
  task_id: string;
  run_id: string | null;
  agent_type: string | null;
  stream: 'stdout' | 'stderr' | 'system' | 'assistant' | 'tool';
  content: string;
  created_at?: string;
  timestamp?: number;
}

interface UseTaskLogsOptions {
  taskId: string | null;
  runId: string | null;   // null = live SSE stream, string = historical REST fetch
  enabled: boolean;
}

interface UseTaskLogsResult {
  logs: LogEntry[];
  isConnected: boolean;
  isLoading: boolean;
}

/**
 * Merge consecutive log entries from the same stream + run_id within a 200ms window.
 */
export function consolidateLogs(logs: LogEntry[]): LogEntry[] {
  return logs.reduce<LogEntry[]>((acc, entry) => {
    if (acc.length === 0) return [entry];
    const prev = acc[acc.length - 1];
    const prevTime = prev.created_at ? new Date(prev.created_at).getTime() : (prev.timestamp || 0);
    const entryTime = entry.created_at ? new Date(entry.created_at).getTime() : (entry.timestamp || 0);
    if (prev.stream === entry.stream && prev.run_id === entry.run_id && Math.abs(entryTime - prevTime) < 200) {
      acc[acc.length - 1] = { ...prev, content: prev.content + entry.content };
      return acc;
    }
    return [...acc, entry];
  }, []);
}

export function useTaskLogs({ taskId, runId, enabled }: UseTaskLogsOptions): UseTaskLogsResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Reset logs when task or runId changes or stream is disabled
  const cacheKey = enabled ? `${taskId}:${runId}` : null;
  useMemo(() => {
    setLogs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    if (!taskId || !enabled) {
      cleanup();
      return;
    }

    // Historical mode: one-time REST fetch
    if (runId) {
      cleanup();
      setIsLoading(true);
      fetch(`/api/tasks/${taskId}/logs?runId=${runId}&limit=2000`)
        .then(res => res.json())
        .then(data => {
          setLogs(data.logs || []);
          setIsLoading(false);
        })
        .catch(err => {
          console.error('[useTaskLogs] Failed to fetch historical logs:', err);
          setIsLoading(false);
        });
      return;
    }

    // Live mode: SSE stream
    const connect = () => {
      cleanup();
      setIsLoading(true);

      const es = new EventSource(`/api/tasks/${taskId}/logs/stream`);
      eventSourceRef.current = es;

      es.addEventListener('history', (e) => {
        const historyLogs: LogEntry[] = JSON.parse(e.data);
        setLogs(historyLogs);
        setIsLoading(false);
      });

      es.addEventListener('buffered', (e) => {
        const buffered: LogEntry[] = JSON.parse(e.data);
        setLogs(prev => [...prev, ...buffered]);
      });

      es.addEventListener('log', (e) => {
        const entry: LogEntry = JSON.parse(e.data);
        setLogs(prev => [...prev, entry]);
      });

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onerror = () => {
        setIsConnected(false);
        setIsLoading(false);
        es.close();
        eventSourceRef.current = null;

        // Reconnect after 3s
        reconnectTimerRef.current = setTimeout(() => {
          if (enabled && taskId && !runId) {
            connect();
          }
        }, 3000);
      };
    };

    connect();

    return cleanup;
  }, [taskId, runId, enabled, cleanup]);

  return { logs, isConnected, isLoading };
}
