'use client';

import { useState, useEffect } from 'react';

interface ReportData {
  total_tasks: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_assignee: Record<string, number>;
  by_contributor: Record<string, number>;
  completed_by_contributor: Record<string, number>;
  completed_this_week: number;
  avg_cycle_time_hours: number;
  velocity_per_day: number;
  overdue_count: number;
  blocked_count: number;
}

export default function MetricsPanel() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchMetrics();
    // Refresh metrics every 5 minutes
    const interval = setInterval(fetchMetrics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="glass rounded-2xl p-4 sm:p-6 mt-4 sm:mt-8 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-32 mb-4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const formatTime = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const metrics = [
    {
      label: 'Cycle Time',
      value: formatTime(data.avg_cycle_time_hours),
      subtext: 'avg completion',
      icon: '⏱️',
      gradient: 'from-blue-500/20 to-cyan-500/20',
      border: 'border-blue-500/30',
    },
    {
      label: 'Velocity',
      value: data.velocity_per_day.toFixed(1),
      subtext: 'tasks/day',
      icon: '🚀',
      gradient: 'from-purple-500/20 to-pink-500/20',
      border: 'border-purple-500/30',
    },
    {
      label: 'This Week',
      value: data.completed_this_week,
      subtext: 'completed',
      icon: '✅',
      gradient: 'from-emerald-500/20 to-teal-500/20',
      border: 'border-emerald-500/30',
    },
    {
      label: 'Overdue',
      value: data.overdue_count,
      subtext: data.overdue_count === 0 ? 'all on track!' : 'need attention',
      icon: data.overdue_count === 0 ? '🎯' : '⚠️',
      gradient: data.overdue_count === 0 ? 'from-slate-500/20 to-slate-600/20' : 'from-red-500/20 to-orange-500/20',
      border: data.overdue_count === 0 ? 'border-slate-500/30' : 'border-red-500/30',
    },
  ];

  const priorityColors: Record<string, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-emerald-500',
  };

  return (
    <div className="glass rounded-xl p-2 sm:p-3 mt-4 sm:mt-6 animate-fade-in">
      {/* Compact metrics bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 sm:gap-4"
      >
        <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto scrollbar-hide">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0"
            >
              <span className="text-sm sm:text-base">{metric.icon}</span>
              <span className="text-sm sm:text-base font-semibold text-white">{metric.value}</span>
              <span className="text-xs text-white/50 hidden sm:inline">{metric.label}</span>
            </div>
          ))}
        </div>
        <span className={`text-white/40 text-xs transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/10 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* By Priority */}
            <div className="bg-white/5 rounded-xl p-4">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
                <span>🎯</span> By Priority
              </h3>
              <div className="space-y-2">
                {Object.entries(data.by_priority).map(([priority, count]) => (
                  <div key={priority} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${priorityColors[priority] || 'bg-white/50'}`}></div>
                      <span className="text-white/80 text-sm capitalize">{priority}</span>
                    </div>
                    <span className="text-white font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By Assignee */}
            <div className="bg-white/5 rounded-xl p-4">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
                <span>👤</span> By Assignee
              </h3>
              <div className="space-y-2">
                {Object.entries(data.by_assignee).map(([assignee, count]) => (
                  <div key={assignee} className="flex items-center justify-between">
                    <span className="text-white/80 text-sm">{assignee}</span>
                    <span className="text-white font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Work Distribution - Who did the work */}
            <div className="bg-white/5 rounded-xl p-4">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
                <span>💪</span> Work Done
              </h3>
              <div className="space-y-2">
                {Object.keys(data.by_contributor || {}).length > 0 ? (
                  Object.entries(data.by_contributor)
                    .sort(([, a], [, b]) => b - a) // Sort by count descending
                    .map(([contributor, count]) => (
                      <div key={contributor} className="flex items-center justify-between">
                        <span className="text-white/80 text-sm">{contributor}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{count}</span>
                          <span className="text-emerald-400 text-xs">
                            ({data.completed_by_contributor?.[contributor] || 0} ✓)
                          </span>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-white/40 text-sm italic">No work tracked yet</div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white/5 rounded-xl p-4">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
                <span>📈</span> Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Total Tasks</span>
                  <span className="text-white font-medium">{data.total_tasks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Blocked</span>
                  <span className={`font-medium ${data.blocked_count > 0 ? 'text-amber-400' : 'text-white'}`}>
                    {data.blocked_count}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Done</span>
                  <span className="text-emerald-400 font-medium">{data.by_status.done || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">In Progress</span>
                  <span className="text-blue-400 font-medium">{data.by_status.in_progress || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
