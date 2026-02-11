'use client';

import { useState, useEffect } from 'react';

interface RunItem {
  id: string;
  taskId: string;
  taskTitle: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string | null;
  completedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  error?: string;
  hasTranscript: boolean;
}

interface TranscriptEntry {
  role: string;
  content: string;
  timestamp: string;
}

interface RunDetail extends RunItem {
  transcript: TranscriptEntry[];
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-500/20 text-emerald-400',
  running: 'bg-blue-500/20 text-blue-400',
  failed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-amber-500/20 text-amber-400',
  pending: 'bg-gray-500/20 text-gray-400',
};

const statusDot: Record<string, string> = {
  completed: 'bg-emerald-500',
  running: 'bg-blue-500 animate-pulse',
  failed: 'bg-red-500',
  cancelled: 'bg-amber-500',
  pending: 'bg-gray-500',
};

function getDateRange(period: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  if (period === 'today') {
    return { startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() };
  }
  if (period === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startDate: weekAgo.toISOString() };
  }
  if (period === 'month') {
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate: monthAgo.toISOString() };
  }
  return {};
}

function formatDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedTranscript, setExpandedTranscript] = useState<TranscriptEntry[] | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;

  // Filters
  const [filterAgentType, setFilterAgentType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('all');

  useEffect(() => {
    setOffset(0);
    setRuns([]);
    fetchRuns(0);
  }, [filterAgentType, filterStatus, filterPeriod]);

  const fetchRuns = async (currentOffset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(currentOffset));
      if (filterAgentType) params.set('agent_type', filterAgentType);
      if (filterStatus) params.set('status', filterStatus);
      const dateRange = getDateRange(filterPeriod);
      if (dateRange.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange.endDate) params.set('endDate', dateRange.endDate);

      const res = await fetch(`/api/runs?${params.toString()}`);
      const data = await res.json();

      if (currentOffset === 0) {
        setRuns(data.runs);
      } else {
        setRuns(prev => [...prev, ...data.runs]);
      }
      setTotal(data.pagination.total);
      setHasMore(data.pagination.hasMore);
    } catch (error) {
      console.error('Error fetching runs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    const newOffset = offset + limit;
    setOffset(newOffset);
    fetchRuns(newOffset);
  };

  const toggleTranscript = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setExpandedTranscript(null);
      return;
    }

    setExpandedRunId(runId);
    setLoadingTranscript(true);
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = await res.json();
      setExpandedTranscript(data.transcript || []);
    } catch (error) {
      console.error('Error fetching transcript:', error);
      setExpandedTranscript([]);
    } finally {
      setLoadingTranscript(false);
    }
  };

  const totalCost = runs.reduce((sum, r) => sum + r.costCents, 0);
  const totalTokens = runs.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <h1 className="text-xl sm:text-2xl font-bold gradient-text">Agent Runs</h1>
        <p className="text-white/50 text-xs sm:text-sm mt-1">
          {total} runs &middot; {totalTokens.toLocaleString()} tokens &middot; ${(totalCost / 100).toFixed(2)} total cost
        </p>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <select
            value={filterAgentType}
            onChange={(e) => setFilterAgentType(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-blue-500/50 cursor-pointer [&>option]:bg-slate-800"
          >
            <option value="">All Agents</option>
            <option value="developer">Developer</option>
            <option value="qa">QA</option>
            <option value="reviewer">Reviewer</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-blue-500/50 cursor-pointer [&>option]:bg-slate-800"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-blue-500/50 cursor-pointer [&>option]:bg-slate-800"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

      {/* Runs Table */}
      <div className="glass rounded-2xl overflow-hidden animate-fade-in">
        {/* Table Header */}
        <div className="hidden sm:grid grid-cols-[1fr_120px_100px_100px_90px_90px] gap-3 px-4 py-3 border-b border-white/10 text-xs text-white/50 font-medium">
          <span>Task</span>
          <span>Agent</span>
          <span>Status</span>
          <span>Duration</span>
          <span>Tokens</span>
          <span>Cost</span>
        </div>

        {/* Runs List */}
        {loading && runs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-white/40 text-sm">Loading runs...</span>
            </div>
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-3xl mb-2">📊</div>
            <p className="text-white/40 text-sm">No agent runs found</p>
          </div>
        ) : (
          <div>
            {runs.map((run) => (
              <div key={run.id}>
                {/* Run Row */}
                <div
                  onClick={() => toggleTranscript(run.id)}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_120px_100px_100px_90px_90px] gap-1 sm:gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  {/* Task info */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[run.status]}`} />
                    <span className="text-sm text-white/80 truncate">{run.taskTitle}</span>
                    <span className="text-[10px] text-white/30 font-mono flex-shrink-0">#{run.taskId.slice(0, 8)}</span>
                  </div>

                  {/* Agent type */}
                  <div className="text-xs text-white/60 capitalize flex items-center">
                    {run.agentType}
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[run.status]}`}>
                      {run.status}
                    </span>
                  </div>

                  {/* Duration */}
                  <div className="text-xs text-white/50 flex items-center">
                    {run.startedAt && run.completedAt
                      ? formatDuration(run.startedAt, run.completedAt)
                      : run.status === 'running'
                      ? 'In progress...'
                      : '-'}
                  </div>

                  {/* Tokens */}
                  <div className="text-xs text-white/50 flex items-center">
                    {(run.inputTokens + run.outputTokens).toLocaleString()}
                  </div>

                  {/* Cost */}
                  <div className="text-xs text-emerald-400 flex items-center">
                    ${(run.costCents / 100).toFixed(3)}
                  </div>
                </div>

                {/* Error message */}
                {run.error && expandedRunId !== run.id && (
                  <div className="px-4 pb-2 -mt-1">
                    <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 truncate">
                      {run.error}
                    </div>
                  </div>
                )}

                {/* Expanded Transcript */}
                {expandedRunId === run.id && (
                  <div className="border-b border-white/10 bg-black/20 px-4 py-4">
                    {run.error && (
                      <div className="text-xs text-red-400 bg-red-500/10 rounded px-3 py-2 mb-3">
                        Error: {run.error}
                      </div>
                    )}

                    <div className="text-xs font-medium text-white/50 mb-3">
                      Transcript &middot; {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'N/A'}
                    </div>

                    {loadingTranscript ? (
                      <div className="text-white/40 text-xs text-center py-4">Loading transcript...</div>
                    ) : !expandedTranscript || expandedTranscript.length === 0 ? (
                      <div className="text-white/40 text-xs text-center py-4">No transcript available</div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {expandedTranscript.map((entry, i) => (
                          <div
                            key={i}
                            className={`text-xs rounded p-2 ${
                              entry.role === 'assistant'
                                ? 'border-l-2 border-purple-500/50 bg-purple-500/5 pl-3'
                                : entry.role === 'tool' || entry.role === 'toolResult'
                                ? 'border-l-2 border-amber-500/50 bg-amber-500/5 pl-3'
                                : entry.role === 'system'
                                ? 'border-l-2 border-slate-500/50 bg-slate-500/5 pl-3'
                                : 'border-l-2 border-blue-500/50 bg-blue-500/5 pl-3'
                            }`}
                          >
                            <div className="flex items-center gap-2 text-white/40 mb-1">
                              <span className="font-medium capitalize">{entry.role}</span>
                              {entry.timestamp && (
                                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                              )}
                            </div>
                            <div className="text-white/70 whitespace-pre-wrap font-mono text-[11px]">
                              {entry.content.length > 2000
                                ? entry.content.slice(0, 2000) + '...[truncated]'
                                : entry.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="p-4 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/60 hover:text-white/80 transition-all disabled:opacity-50"
            >
              {loading ? 'Loading...' : `Load more (${total - runs.length} remaining)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
