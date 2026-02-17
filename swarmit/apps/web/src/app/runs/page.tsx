'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  ChevronDown,
  ChevronRight,
  XCircle,
  Loader2,
  ChevronLeft,
  Terminal,
} from 'lucide-react';
import { api, type TaskRun, type TaskLog } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  QUEUED: 'bg-zinc-600',
  RUNNING: 'bg-blue-600',
  SUCCESS: 'bg-green-600',
  FAILED: 'bg-red-600',
  CANCELLED: 'bg-yellow-600',
};

const LOG_STREAM_COLORS: Record<string, string> = {
  system: 'text-zinc-400',
  assistant: 'text-blue-400',
  tool: 'text-green-400',
  stdout: 'text-white',
  stderr: 'text-red-400',
};

function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return '--';
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number | null): string {
  if (tokens === null || tokens === undefined) return '--';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

function formatDuration(run: TaskRun): string {
  const start = run.startedAt ? new Date(run.startedAt) : null;
  const end = run.endedAt ? new Date(run.endedAt) : null;

  if (!start) return '--';

  const endTime = end ?? new Date();
  const diffMs = endTime.getTime() - start.getTime();
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default function RunsPage() {
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, TaskLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({});

  const limit = 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.runs.list(page, limit);
      setRuns(data.runs);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch runs:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleToggleExpand = async (run: TaskRun) => {
    if (expandedRunId === run.id) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(run.id);

    if (!logs[run.id]) {
      setLogsLoading((prev) => ({ ...prev, [run.id]: true }));
      try {
        const runLogs = await api.tasks.getRunLogs(run.taskId, run.id);
        setLogs((prev) => ({ ...prev, [run.id]: runLogs }));
      } catch (err) {
        console.error('Failed to fetch logs:', err);
        setLogs((prev) => ({ ...prev, [run.id]: [] }));
      } finally {
        setLogsLoading((prev) => ({ ...prev, [run.id]: false }));
      }
    }
  };

  const handleCancel = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    if (cancelling[runId]) return;

    setCancelling((prev) => ({ ...prev, [runId]: true }));
    try {
      await api.runs.cancel(runId);
      await fetchRuns();
    } catch (err) {
      console.error('Failed to cancel run:', err);
    } finally {
      setCancelling((prev) => ({ ...prev, [runId]: false }));
    }
  };

  if (loading && runs.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="h-12 bg-zinc-800 rounded" />
          <div className="h-12 bg-zinc-800 rounded" />
          <div className="h-12 bg-zinc-800 rounded" />
          <div className="h-12 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Runs</h1>
          <p className="text-zinc-400 mt-1 hidden sm:block">
            {total} total run{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => fetchRuns()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <Loader2
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      {/* Table */}
      {runs.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-lg">
          <Play className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">No runs yet</p>
          <p className="text-zinc-500 mt-1">
            Runs will appear here when agents execute tasks
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-zinc-800/50">
            {runs.map((run) => {
              const isExpanded = expandedRunId === run.id;
              const canCancel =
                run.status === 'QUEUED' || run.status === 'RUNNING';

              return (
                <div key={run.id}>
                  <div
                    onClick={() => handleToggleExpand(run)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      isExpanded ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                        )}
                        <span className="font-mono text-xs text-zinc-500 shrink-0">
                          {run.id.slice(0, 8)}
                        </span>
                        <span className="text-sm text-white truncate">
                          {run.task?.title || run.taskId}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white shrink-0 ${
                          STATUS_COLORS[run.status] || 'bg-zinc-600'
                        }`}
                      >
                        {run.status === 'RUNNING' && (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        )}
                        {run.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-400 ml-6">
                      <span className="capitalize">{run.agentType}</span>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums">{formatTokens(run.tokens)}</span>
                        <span className="tabular-nums">{formatCost(run.cost)}</span>
                        <span className="text-zinc-500">{formatDuration(run)}</span>
                        {canCancel && (
                          <button
                            onClick={(e) => handleCancel(e, run.id)}
                            disabled={cancelling[run.id]}
                            className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                            title="Cancel run"
                          >
                            {cancelling[run.id] ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-zinc-800/50">
                      <div className="mx-3 my-3 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
                          <Terminal className="w-4 h-4 text-zinc-500" />
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            Run Logs
                          </span>
                          {run.status === 'RUNNING' && (
                            <span className="flex items-center gap-1 text-xs text-blue-400">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="p-3 max-h-64 overflow-y-auto overflow-x-auto font-mono text-xs leading-relaxed">
                          {logsLoading[run.id] ? (
                            <div className="flex items-center gap-2 text-zinc-500">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading logs...
                            </div>
                          ) : !logs[run.id] || logs[run.id].length === 0 ? (
                            <span className="text-zinc-600">
                              No logs available for this run.
                            </span>
                          ) : (
                            logs[run.id].map((log) => (
                              <div key={log.id} className="flex gap-2 py-0.5">
                                <span
                                  className={`shrink-0 w-12 text-right ${
                                    LOG_STREAM_COLORS[log.stream] ||
                                    'text-zinc-400'
                                  }`}
                                >
                                  [{log.stream}]
                                </span>
                                <span
                                  className={
                                    LOG_STREAM_COLORS[log.stream] ||
                                    'text-zinc-400'
                                  }
                                >
                                  {log.content}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block">
            {/* Table Header */}
            <div className="grid grid-cols-[80px_minmax(0,2fr)_minmax(0,1fr)_100px_90px_90px_100px_90px_40px] gap-4 px-4 py-3 bg-zinc-900 border-b border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <div>Run ID</div>
              <div>Task</div>
              <div>Agent Type</div>
              <div>Status</div>
              <div className="text-right">Tokens</div>
              <div className="text-right">Cost</div>
              <div>Started</div>
              <div className="text-right">Duration</div>
              <div />
            </div>

            {/* Rows */}
            {runs.map((run) => {
              const isExpanded = expandedRunId === run.id;
              const canCancel =
                run.status === 'QUEUED' || run.status === 'RUNNING';

              return (
                <div key={run.id}>
                  {/* Run Row */}
                  <div
                    onClick={() => handleToggleExpand(run)}
                    className={`grid grid-cols-[80px_minmax(0,2fr)_minmax(0,1fr)_100px_90px_90px_100px_90px_40px] gap-4 px-4 py-3 cursor-pointer transition-colors ${
                      isExpanded
                        ? 'bg-zinc-800/50'
                        : 'hover:bg-zinc-800/30'
                    } border-b border-zinc-800/50`}
                  >
                    {/* Run ID */}
                    <div className="flex items-center">
                      <span className="font-mono text-xs text-zinc-500">
                        {run.id.slice(0, 8)}
                      </span>
                    </div>

                    {/* Task */}
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                      )}
                      <span className="text-sm text-white truncate">
                        {run.task?.title || run.taskId}
                      </span>
                    </div>

                    {/* Agent Type */}
                    <div className="flex items-center">
                      <span className="text-sm text-zinc-300 capitalize">
                        {run.agentType}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white ${
                          STATUS_COLORS[run.status] || 'bg-zinc-600'
                        }`}
                      >
                        {run.status === 'RUNNING' && (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        )}
                        {run.status}
                      </span>
                    </div>

                    {/* Tokens */}
                    <div className="flex items-center justify-end">
                      <span className="text-sm text-zinc-400 tabular-nums">
                        {formatTokens(run.tokens)}
                      </span>
                    </div>

                    {/* Cost */}
                    <div className="flex items-center justify-end">
                      <span className="text-sm text-zinc-400 tabular-nums">
                        {formatCost(run.cost)}
                      </span>
                    </div>

                    {/* Started */}
                    <div className="flex items-center">
                      <span className="text-sm text-zinc-500">
                        {run.createdAt ? formatTime(run.createdAt) : '--'}
                      </span>
                    </div>

                    {/* Duration */}
                    <div className="flex items-center justify-end">
                      <span className="text-sm text-zinc-500 tabular-nums">
                        {formatDuration(run)}
                      </span>
                    </div>

                    {/* Cancel */}
                    <div className="flex items-center justify-center">
                      {canCancel && (
                        <button
                          onClick={(e) => handleCancel(e, run.id)}
                          disabled={cancelling[run.id]}
                          className="p-1 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Cancel run"
                        >
                          {cancelling[run.id] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Logs Panel */}
                  {isExpanded && (
                    <div className="border-b border-zinc-800/50">
                      <div className="mx-4 my-3 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden">
                        {/* Logs Header */}
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                          <Terminal className="w-4 h-4 text-zinc-500" />
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            Run Logs
                          </span>
                          {run.status === 'RUNNING' && (
                            <span className="flex items-center gap-1 text-xs text-blue-400">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Live
                            </span>
                          )}
                        </div>

                        {/* Logs Content */}
                        <div className="p-4 max-h-96 overflow-y-auto font-mono text-xs leading-relaxed">
                          {logsLoading[run.id] ? (
                            <div className="flex items-center gap-2 text-zinc-500">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading logs...
                            </div>
                          ) : !logs[run.id] || logs[run.id].length === 0 ? (
                            <span className="text-zinc-600">
                              No logs available for this run.
                            </span>
                          ) : (
                            logs[run.id].map((log) => (
                              <div key={log.id} className="flex gap-3 py-0.5">
                                <span className="text-zinc-600 shrink-0 select-none w-20 text-right">
                                  {new Date(log.createdAt).toLocaleTimeString()}
                                </span>
                                <span
                                  className={`shrink-0 w-16 text-right ${
                                    LOG_STREAM_COLORS[log.stream] ||
                                    'text-zinc-400'
                                  }`}
                                >
                                  [{log.stream}]
                                </span>
                                <span
                                  className={
                                    LOG_STREAM_COLORS[log.stream] ||
                                    'text-zinc-400'
                                  }
                                >
                                  {log.content}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
          <p className="text-sm text-zinc-500">
            Showing {(page - 1) * limit + 1}--
            {Math.min(page * limit, total)} of {total} runs
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-sm text-zinc-400 px-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
