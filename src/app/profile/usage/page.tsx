'use client';

import { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, Activity, Cpu, DollarSign, Clock } from 'lucide-react';

interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  dailyUsage: Array<{
    date: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    runs: number;
  }>;
}

export default function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profile/usage?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatCost = (cents: number) => {
    return '$' + (cents / 100).toFixed(2);
  };

  // Simple SVG chart component
  const TokenChart = ({ data }: { data: UsageStats['dailyUsage'] }) => {
    if (!data || data.length === 0) return null;
    
    const maxTokens = Math.max(
      ...data.map(d => Math.max(d.inputTokens, d.outputTokens))
    );
    const width = 600;
    const height = 200;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const getX = (i: number) => padding + (i / (data.length - 1 || 1)) * chartWidth;
    const getY = (value: number) => height - padding - (value / (maxTokens || 1)) * chartHeight;

    const inputPath = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.inputTokens)}`)
      .join(' ');
    const outputPath = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.outputTokens)}`)
      .join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <line
            key={i}
            x1={padding}
            y1={height - padding - ratio * chartHeight}
            x2={width - padding}
            y2={height - padding - ratio * chartHeight}
            stroke="#374151"
            strokeDasharray="4"
          />
        ))}
        
        {/* Input tokens line */}
        <path
          d={inputPath}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Output tokens line */}
        <path
          d={outputPath}
          fill="none"
          stroke="#10B981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={getX(i)} cy={getY(d.inputTokens)} r="4" fill="#3B82F6" />
            <circle cx={getX(i)} cy={getY(d.outputTokens)} r="4" fill="#10B981" />
          </g>
        ))}

        {/* Y-axis labels */}
        <text x={padding - 10} y={height - padding} textAnchor="end" fill="#9CA3AF" fontSize="12">0</text>
        <text x={padding - 10} y={padding} textAnchor="end" fill="#9CA3AF" fontSize="12">
          {formatNumber(maxTokens)}
        </text>

        {/* X-axis labels */}
        {data.length > 0 && (
          <>
            <text x={padding} y={height - 10} textAnchor="start" fill="#9CA3AF" fontSize="12">
              {data[0].date}
            </text>
            <text x={width - padding} y={height - 10} textAnchor="end" fill="#9CA3AF" fontSize="12">
              {data[data.length - 1].date}
            </text>
          </>
        )}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Usage & Metrics</h1>
        
        <div className="flex bg-gray-800 rounded-lg border border-gray-700">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              } ${p === '7d' ? 'rounded-l-lg' : ''} ${p === '90d' ? 'rounded-r-lg' : ''}`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <ArrowDownRight className="w-4 h-4 text-blue-500" />
            <span className="text-sm">Input Tokens</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatNumber(stats?.totalInputTokens || 0)}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <ArrowUpRight className="w-4 h-4 text-green-500" />
            <span className="text-sm">Output Tokens</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatNumber(stats?.totalOutputTokens || 0)}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <DollarSign className="w-4 h-4 text-yellow-500" />
            <span className="text-sm">Total Cost</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatCost(stats?.totalCostCents || 0)}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Activity className="w-4 h-4 text-purple-500" />
            <span className="text-sm">Total Runs</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats?.totalRuns || 0}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats?.completedRuns || 0} completed · {stats?.failedRuns || 0} failed
          </div>
        </div>
      </div>

      {/* Token Usage Chart */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
        <h2 className="text-lg font-medium text-white mb-4">Token Usage Over Time</h2>
        <div className="flex gap-6 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-sm text-gray-400">Input Tokens</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-sm text-gray-400">Output Tokens</span>
          </div>
        </div>
        {stats?.dailyUsage && stats.dailyUsage.length > 0 ? (
          <TokenChart data={stats.dailyUsage} />
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No usage data for this period
          </div>
        )}
      </div>

      {/* Usage Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-medium text-white">Daily Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Input</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Output</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Cost</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Runs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {stats?.dailyUsage?.map((day, i) => (
                <tr key={i} className="hover:bg-gray-750">
                  <td className="px-6 py-4 text-sm text-gray-300">{day.date}</td>
                  <td className="px-6 py-4 text-sm text-right text-blue-400">{formatNumber(day.inputTokens)}</td>
                  <td className="px-6 py-4 text-sm text-right text-green-400">{formatNumber(day.outputTokens)}</td>
                  <td className="px-6 py-4 text-sm text-right text-yellow-400">{formatCost(day.costCents)}</td>
                  <td className="px-6 py-4 text-sm text-right text-gray-300">{day.runs}</td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No usage data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
