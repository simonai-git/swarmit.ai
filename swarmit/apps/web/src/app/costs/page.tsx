'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Coins,
  Hash,
  Activity,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { api, type CostSummary } from '@/lib/api';

type Period = '7d' | '30d' | '90d';

function formatUsd(dollars: number): string {
  return `$${dollars.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function CostsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.costs.get(period);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch costs:', err);
      setError('Failed to load cost data.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  // Find the max cost among agents for the bar chart scale
  const maxAgentCost =
    data?.byAgent.reduce((max, agent) => {
      const cost = agent._sum.cost ?? 0;
      return cost > max ? cost : max;
    }, 0) ?? 0;

  // Budget percentage
  const budgetPercent =
    data?.budget && data.budget.dailyLimitCents > 0
      ? Math.min(
          100,
          (data.budget.todaySpendCents / data.budget.dailyLimitCents) * 100
        )
      : 0;

  const budgetBarColor =
    budgetPercent >= 90
      ? 'bg-red-500'
      : budgetPercent >= 70
        ? 'bg-yellow-500'
        : 'bg-green-500';

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Cost Tracking</h1>
          <p className="text-zinc-400 mt-1">
            Monitor spend, tokens, and budget across agents
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && !data && (
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-zinc-800 rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-zinc-800 rounded-lg" />
          <div className="h-48 bg-zinc-800 rounded-lg" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-lg">
          <DollarSign className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <p className="text-red-400 text-lg">{error}</p>
          <button
            onClick={fetchCosts}
            className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Cost */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <div className="flex items-center gap-2 text-zinc-400 mb-3">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm font-medium">Total Cost</span>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {formatUsd(data.totals.cost)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Last {period}
              </p>
            </div>

            {/* Total Tokens */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <div className="flex items-center gap-2 text-zinc-400 mb-3">
                <Coins className="w-4 h-4" />
                <span className="text-sm font-medium">Total Tokens</span>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {formatTokens(data.totals.tokens)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {data.totals.tokens.toLocaleString()} tokens
              </p>
            </div>

            {/* Total Runs */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <div className="flex items-center gap-2 text-zinc-400 mb-3">
                <Hash className="w-4 h-4" />
                <span className="text-sm font-medium">Total Runs</span>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {data.totals.runs.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Last {period}
              </p>
            </div>

            {/* Budget Usage */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <div className="flex items-center gap-2 text-zinc-400 mb-3">
                <Activity className="w-4 h-4" />
                <span className="text-sm font-medium">Budget Usage</span>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {budgetPercent.toFixed(0)}%
              </p>
              {/* Progress Bar */}
              <div className="mt-2 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${budgetBarColor}`}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {(data.budget.todaySpendCents / 100).toFixed(4)} /{' '}
                {(data.budget.dailyLimitCents / 100).toFixed(4)} USD today
              </p>
            </div>
          </div>

          {/* Cost by Agent Type */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-semibold text-white">
                Cost by Agent Type
              </h2>
            </div>

            {data.byAgent.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                No agent cost data for this period.
              </p>
            ) : (
              <div className="space-y-4">
                {data.byAgent.map((agent) => {
                  const cost = agent._sum.cost ?? 0;
                  const barWidth =
                    maxAgentCost > 0 ? (cost / maxAgentCost) * 100 : 0;

                  return (
                    <div key={agent.agentType} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-300 capitalize font-medium">
                          {agent.agentType}
                        </span>
                        <div className="flex items-center gap-4 text-zinc-400 tabular-nums">
                          <span>{agent._count} runs</span>
                          <span>
                            {formatTokens(agent._sum.tokens ?? 0)} tokens
                          </span>
                          <span className="text-white font-medium">
                            {formatUsd(cost)}
                          </span>
                        </div>
                      </div>
                      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(barWidth, 1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Daily Breakdown Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">
                Daily Breakdown
              </h2>
            </div>

            {data.byDay.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-zinc-500 text-sm">
                  No daily data for this period.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-right px-6 py-3">Runs</th>
                    <th className="text-right px-6 py-3">Tokens</th>
                    <th className="text-right px-6 py-3">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDay.map((day) => (
                    <tr
                      key={day.day}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm text-zinc-300">
                        {formatDate(day.day)}
                      </td>
                      <td className="px-6 py-3 text-sm text-zinc-400 text-right tabular-nums">
                        {day.runs}
                      </td>
                      <td className="px-6 py-3 text-sm text-zinc-400 text-right tabular-nums">
                        {formatTokens(day.tokens)}
                      </td>
                      <td className="px-6 py-3 text-sm text-white text-right tabular-nums font-medium">
                        {formatUsd(day.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Refresh indicator */}
          {loading && (
            <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Refreshing...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
