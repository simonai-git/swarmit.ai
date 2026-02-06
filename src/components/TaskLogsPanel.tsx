'use client';

import { useEffect, useRef, useState } from 'react';
import { useTaskLogs, LogEntry } from '@/hooks/useTaskLogs';

interface TaskLogsPanelProps {
  taskId: string;
  isActive: boolean;
}

interface RunOption {
  id: string;
  agentType: string;
  status: string;
  startedAt: string | null;
}

type StreamFilter = 'all' | 'stdout' | 'stderr' | 'system';

const streamColors: Record<string, string> = {
  stdout: 'text-green-400',
  stderr: 'text-red-400',
  system: 'text-blue-400',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusIcon: Record<string, string> = {
  completed: '\u2705',
  running: '\u{1F504}',
  failed: '\u274C',
  cancelled: '\u26A0\uFE0F',
};

export default function TaskLogsPanel({ taskId, isActive }: TaskLogsPanelProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunOption[]>([]);

  const { logs, isConnected, isLoading } = useTaskLogs({
    taskId,
    runId: selectedRunId,
    enabled: isActive,
  });

  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<StreamFilter>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Fetch runs list when panel becomes active
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    const fetchRuns = async () => {
      try {
        const res = await fetch(`/api/runs?taskId=${taskId}&limit=20`);
        const data = await res.json();
        if (cancelled) return;
        const fetchedRuns: RunOption[] = (data.runs || []).map((r: { id: string; agentType: string; status: string; startedAt: string | null }) => ({
          id: r.id,
          agentType: r.agentType,
          status: r.status,
          startedAt: r.startedAt,
        }));
        setRuns(fetchedRuns);
      } catch (err) {
        if (!cancelled) console.error('[TaskLogsPanel] Failed to fetch runs:', err);
      }
    };
    fetchRuns();
    return () => { cancelled = true; };
  }, [taskId, isActive]);

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.stream === filter);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;

    if (!atBottom) {
      userScrolledRef.current = true;
      setAutoScroll(false);
    } else if (userScrolledRef.current) {
      userScrolledRef.current = false;
      setAutoScroll(true);
    }
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    setAutoScroll(true);
    userScrolledRef.current = false;
  };

  const formatTimestamp = (entry: LogEntry): string => {
    const ts = entry.created_at ? new Date(entry.created_at) : entry.timestamp ? new Date(entry.timestamp) : null;
    if (!ts) return '';
    return ts.toLocaleTimeString();
  };

  const isLive = selectedRunId === null;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {/* Run selector */}
          <select
            value={selectedRunId ?? '__live__'}
            onChange={(e) => setSelectedRunId(e.target.value === '__live__' ? null : e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-white/20 max-w-[240px]"
          >
            <option value="__live__">Live (current)</option>
            {runs.map(run => (
              <option key={run.id} value={run.id}>
                {run.agentType} {statusIcon[run.status] || ''} {run.startedAt ? timeAgo(run.startedAt) : ''}
              </option>
            ))}
          </select>

          {/* Connection indicator */}
          {isLive && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`relative flex h-2 w-2`}>
                {isConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </span>
              <span className="text-white/50">{isConnected ? 'Live' : 'Disconnected'}</span>
            </div>
          )}

          {/* Line count */}
          <span className="text-xs text-white/40">{logs.length} lines</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Stream filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as StreamFilter)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-white/20"
          >
            <option value="all">All streams</option>
            <option value="stdout">stdout</option>
            <option value="stderr">stderr</option>
            <option value="system">system</option>
          </select>

          {/* Auto-scroll toggle */}
          <button
            onClick={scrollToBottom}
            className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
              autoScroll
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'
            }`}
          >
            {autoScroll ? 'Auto-scroll ON' : 'Scroll to bottom'}
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 bg-black rounded-xl border border-white/10 p-3 overflow-y-auto font-mono text-xs leading-relaxed min-h-[200px] max-h-[400px]"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-white/40">
            Loading logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40">
            {isLive
              ? 'No logs yet. Logs will appear here when an agent runs.'
              : 'No logs found for this run.'}
          </div>
        ) : (
          filteredLogs.map((entry, i) => (
            <div key={entry.id || `buf-${i}`} className="flex gap-2 hover:bg-white/5 px-1 -mx-1 rounded">
              <span className="text-white/25 select-none flex-shrink-0 w-16 text-right">
                {formatTimestamp(entry)}
              </span>
              <span className={`flex-shrink-0 w-12 text-right ${streamColors[entry.stream] || 'text-white/50'}`}>
                [{entry.stream === 'system' ? 'sys' : entry.stream}]
              </span>
              <span className={`whitespace-pre-wrap break-all ${
                entry.stream === 'stderr' ? 'text-red-300' :
                entry.stream === 'system' ? 'text-blue-300' :
                'text-white/80'
              }`}>
                {entry.content}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
