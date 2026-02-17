'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ListTodo,
  Play,
  FolderOpen,
  DollarSign,
  RefreshCw,
  Bot,
  Clock,
  Coins,
  Loader2,
} from 'lucide-react';
import { api, type DashboardData } from '@/lib/api';

const RUN_STATUS_COLORS: Record<string, string> = {
  QUEUED: 'bg-zinc-500/20 text-zinc-400',
  RUNNING: 'bg-blue-500/20 text-blue-400',
  SUCCESS: 'bg-green-500/20 text-green-400',
  FAILED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-yellow-500/20 text-yellow-400',
};

function RunStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${RUN_STATUS_COLORS[status] || 'bg-zinc-500/20 text-zinc-400'}`}
    >
      {status}
    </span>
  );
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  iconColor: string;
}

function StatCard({ title, value, subtitle, icon, iconColor }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-400">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{subtitle}</p>
          )}
        </div>
        <div className={`p-2.5 rounded-lg ${iconColor}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const result = await api.dashboard.get();
      setData(result);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-4 md:p-8 bg-zinc-950 min-h-screen">
        <div className="animate-pulse space-y-6 max-w-6xl mx-auto">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 bg-zinc-800 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-zinc-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-4 md:p-8 bg-zinc-950 min-h-screen">
        <div className="max-w-6xl mx-auto text-center py-20">
          <p className="text-red-400 text-lg">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="mt-4 px-4 py-2 text-sm text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Compute stat values
  const totalTasks = data.tasks.reduce((sum, t) => sum + t._count, 0);
  const taskBreakdown = data.tasks
    .map(t => `${t.status}: ${t._count}`)
    .join(' / ');

  const activeProjects = data.projects
    .filter(p => p.status === 'ACTIVE')
    .reduce((sum, p) => sum + p._count, 0);
  const totalProjects = data.projects.reduce((sum, p) => sum + p._count, 0);
  const projectBreakdown = data.projects
    .map(p => `${p.status}: ${p._count}`)
    .join(' / ');

  const totalCostCents = data.runs.totalCost ?? 0;
  const totalTokens = data.runs.totalTokens ?? 0;
  const totalRuns = data.runs.total ?? 0;

  return (
    <div className="p-4 md:p-8 bg-zinc-950 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-zinc-400 mt-1">Overview of your agent orchestration platform</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Tasks"
            value={totalTasks}
            subtitle={taskBreakdown || 'No tasks'}
            icon={<ListTodo className="w-5 h-5 text-blue-400" />}
            iconColor="bg-blue-500/10"
          />
          <StatCard
            title="Total Runs"
            value={totalRuns}
            subtitle={`${formatTokens(totalTokens)} tokens / ${formatCost(totalCostCents)}`}
            icon={<Play className="w-5 h-5 text-green-400" />}
            iconColor="bg-green-500/10"
          />
          <StatCard
            title="Active Projects"
            value={activeProjects}
            subtitle={totalProjects > 0 ? projectBreakdown : 'No projects'}
            icon={<FolderOpen className="w-5 h-5 text-purple-400" />}
            iconColor="bg-purple-500/10"
          />
          <StatCard
            title="Total Cost"
            value={formatCost(totalCostCents)}
            subtitle={`Across ${totalRuns} runs`}
            icon={<DollarSign className="w-5 h-5 text-yellow-400" />}
            iconColor="bg-yellow-500/10"
          />
        </div>

        {/* Recent Runs table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-base font-semibold text-white">Recent Runs</h2>
          </div>

          {data.recentRuns.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Play className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No runs yet</p>
              <p className="text-zinc-500 text-sm mt-1">Runs will appear here when agents execute tasks</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 md:px-5 py-3">
                      Task
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 md:px-5 py-3">
                      Agent Type
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 md:px-5 py-3">
                      Status
                    </th>
                    <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 md:px-5 py-3 hidden sm:table-cell">
                      Tokens
                    </th>
                    <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 md:px-5 py-3 hidden sm:table-cell">
                      Cost
                    </th>
                    <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 md:px-5 py-3 hidden sm:table-cell">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {data.recentRuns.map(run => (
                    <tr key={run.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-3 md:px-5 py-3">
                        <span className="text-sm text-zinc-300 truncate block max-w-[200px]">
                          {run.task?.title || run.taskId}
                        </span>
                      </td>
                      <td className="px-3 md:px-5 py-3">
                        <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                          <Bot className="w-3.5 h-3.5" />
                          {run.agentType}
                        </span>
                      </td>
                      <td className="px-3 md:px-5 py-3">
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td className="px-3 md:px-5 py-3 text-right hidden sm:table-cell">
                        <span className="flex items-center gap-1 justify-end text-sm text-zinc-400">
                          <Coins className="w-3.5 h-3.5" />
                          {run.tokens != null ? formatTokens(run.tokens) : '-'}
                        </span>
                      </td>
                      <td className="px-3 md:px-5 py-3 text-right hidden sm:table-cell">
                        <span className="text-sm text-zinc-400">
                          {run.cost != null ? formatCost(run.cost) : '-'}
                        </span>
                      </td>
                      <td className="px-3 md:px-5 py-3 text-right hidden sm:table-cell">
                        <span className="flex items-center gap-1 justify-end text-sm text-zinc-500">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(run.createdAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
