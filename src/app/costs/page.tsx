'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface CostSummary {
  totalCostCents: number;
  totalCostDollars: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: string;
}

interface Budget {
  dailyLimitCents: number;
  todaySpentCents: number;
  todayRemainingCents: number;
  percentUsed: string;
}

interface BreakdownItem {
  agent_type?: string;
  date?: string;
  task_id?: string;
  task_title?: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  runs: number;
}

interface CostData {
  period: string;
  startDate: string;
  endDate: string;
  summary: CostSummary;
  budget: Budget;
  breakdown?: BreakdownItem[];
}

export default function CostsPage() {
  const [costData, setCostData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [groupBy, setGroupBy] = useState<'agent' | 'day' | 'task' | ''>('day');

  useEffect(() => {
    fetchCosts();
  }, [period, groupBy]);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (groupBy) params.append('groupBy', groupBy);
      
      const res = await fetch(`/api/costs?${params}`);
      const data = await res.json();
      setCostData(data);
    } catch (error) {
      console.error('Error fetching costs:', error);
    } finally {
      setLoading(false);
    }
  };

  const budgetPercent = costData ? parseFloat(costData.budget.percentUsed) : 0;
  const isOverBudget = budgetPercent >= 100;
  const isWarning = budgetPercent >= 80 && budgetPercent < 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <span>💰</span>
              Agent Costs & Usage
            </h1>
            <p className="text-white/50 mt-1">Monitor LLM usage and spending</p>
          </div>
          <Link 
            href="/"
            className="px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all text-sm"
          >
            ← Back to Board
          </Link>
        </div>

        {/* Budget Alert */}
        {costData && (
          <div className={`mb-6 p-4 rounded-xl border ${
            isOverBudget ? 'bg-red-500/10 border-red-500/30' :
            isWarning ? 'bg-amber-500/10 border-amber-500/30' :
            'bg-emerald-500/10 border-emerald-500/30'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-sm font-medium ${
                isOverBudget ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {isOverBudget ? '🚨 Daily Budget Exceeded!' : 
                 isWarning ? '⚠️ Approaching Budget Limit' : 
                 '✅ Within Budget'}
              </span>
              <span className="text-white/60 text-sm">
                ${(costData.budget.todaySpentCents / 100).toFixed(2)} / ${(costData.budget.dailyLimitCents / 100).toFixed(2)}
              </span>
            </div>
            <div className="w-full bg-black/30 rounded-full h-3 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  isOverBudget ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, budgetPercent)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-white/40">
              <span>Remaining: ${(costData.budget.todayRemainingCents / 100).toFixed(2)}</span>
              <span>{costData.budget.percentUsed} used</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex bg-black/30 rounded-xl p-1 border border-white/10">
            {(['today', 'week', 'month', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 text-sm rounded-lg transition-all ${
                  period === p 
                    ? 'bg-blue-500 text-white' 
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex bg-black/30 rounded-xl p-1 border border-white/10">
            {([
              { key: 'day', label: 'By Day' },
              { key: 'agent', label: 'By Agent' },
              { key: 'task', label: 'By Task' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setGroupBy(key)}
                className={`px-4 py-2 text-sm rounded-lg transition-all ${
                  groupBy === key 
                    ? 'bg-purple-500 text-white' 
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-white/40 text-center py-12">Loading costs...</div>
        ) : costData ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-black/30 border border-white/10 rounded-xl p-4">
                <div className="text-white/50 text-xs mb-1">Total Cost</div>
                <div className="text-2xl font-bold text-emerald-400">
                  ${costData.summary.totalCostDollars}
                </div>
              </div>
              <div className="bg-black/30 border border-white/10 rounded-xl p-4">
                <div className="text-white/50 text-xs mb-1">Total Runs</div>
                <div className="text-2xl font-bold text-blue-400">
                  {costData.summary.totalRuns}
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {costData.summary.successfulRuns} ✓ / {costData.summary.failedRuns} ✗
                </div>
              </div>
              <div className="bg-black/30 border border-white/10 rounded-xl p-4">
                <div className="text-white/50 text-xs mb-1">Success Rate</div>
                <div className="text-2xl font-bold text-purple-400">
                  {costData.summary.successRate}
                </div>
              </div>
              <div className="bg-black/30 border border-white/10 rounded-xl p-4">
                <div className="text-white/50 text-xs mb-1">Tokens Used</div>
                <div className="text-2xl font-bold text-amber-400">
                  {((costData.summary.totalInputTokens + costData.summary.totalOutputTokens) / 1000).toFixed(1)}K
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {(costData.summary.totalInputTokens / 1000).toFixed(1)}K in / {(costData.summary.totalOutputTokens / 1000).toFixed(1)}K out
                </div>
              </div>
            </div>

            {/* Breakdown Table */}
            {costData.breakdown && costData.breakdown.length > 0 && (
              <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-white">
                    Breakdown by {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-black/20">
                      <tr className="text-white/50 text-xs">
                        <th className="text-left p-4">
                          {groupBy === 'agent' ? 'Agent' : groupBy === 'day' ? 'Date' : 'Task'}
                        </th>
                        <th className="text-right p-4">Runs</th>
                        <th className="text-right p-4">Tokens</th>
                        <th className="text-right p-4">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costData.breakdown.map((item, i) => (
                        <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                          <td className="p-4 text-white/80">
                            {item.agent_type || item.date || item.task_title || item.task_id || 'Unknown'}
                          </td>
                          <td className="p-4 text-right text-white/60">{item.runs}</td>
                          <td className="p-4 text-right text-white/60">
                            {((item.input_tokens + item.output_tokens) / 1000).toFixed(1)}K
                          </td>
                          <td className="p-4 text-right text-emerald-400 font-medium">
                            ${(item.cost / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-white/40 text-center py-12">No cost data available</div>
        )}
      </div>
    </div>
  );
}
