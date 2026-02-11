'use client';

import { useState, useEffect } from 'react';

interface ProjectStat {
  id: string;
  title: string;
  todo: number;
  in_progress: number;
  testing: number;
  in_review: number;
  done: number;
  total: number;
}

interface AgentStat {
  agentType: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number;
  avgTokens: number;
  totalCost: number;
}

interface CostPoint {
  date: string;
  cost: number;
}

interface ActivityItem {
  id: string;
  taskId: string;
  taskTitle: string;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  actor: string;
  createdAt: string;
}

interface DashboardData {
  projects: ProjectStat[];
  agents: AgentStat[];
  costTrends: CostPoint[];
  activity: ActivityItem[];
}

const statusColors: Record<string, string> = {
  todo: '#64748b',
  in_progress: '#3b82f6',
  testing: '#a855f7',
  in_review: '#f59e0b',
  done: '#10b981',
};

const statusLabels: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  testing: 'Testing',
  in_review: 'In Review',
  done: 'Done',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-white/60">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxCost = Math.max(...data.costTrends.map(c => c.cost), 1);

  // Build SVG polyline for cost chart
  const chartWidth = 600;
  const chartHeight = 150;
  const chartPadding = 20;
  const points = data.costTrends.map((c, i) => {
    const x = chartPadding + (i / Math.max(data.costTrends.length - 1, 1)) * (chartWidth - chartPadding * 2);
    const y = chartHeight - chartPadding - ((c.cost / maxCost) * (chartHeight - chartPadding * 2));
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <h1 className="text-xl sm:text-2xl font-bold gradient-text">Dashboard</h1>
        <p className="text-white/50 text-xs sm:text-sm mt-1">Project stats, agent performance & cost trends</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 1. Project Completion */}
        <div className="glass rounded-2xl p-4 sm:p-6 animate-fade-in">
          <h2 className="text-sm font-semibold text-white/80 mb-4">Project Completion</h2>
          {data.projects.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-4">No projects yet</p>
          ) : (
            <div className="space-y-4">
              {data.projects.map((project) => (
                <div key={project.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-white/70 truncate">{project.title}</span>
                    <span className="text-[10px] text-white/40 flex-shrink-0 ml-2">
                      {project.done}/{project.total}
                    </span>
                  </div>
                  {/* Stacked bar */}
                  <div className="h-4 rounded-full bg-white/5 overflow-hidden flex">
                    {project.total > 0 && (['done', 'in_review', 'testing', 'in_progress', 'todo'] as const).map((status) => {
                      const count = project[status];
                      if (count === 0) return null;
                      const pct = (count / project.total) * 100;
                      return (
                        <div
                          key={status}
                          className="h-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: statusColors[status],
                          }}
                          title={`${statusLabels[status]}: ${count}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center gap-3 flex-wrap pt-2">
                {Object.entries(statusLabels).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: statusColors[key] }}
                    />
                    <span className="text-[10px] text-white/40">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. Agent Performance */}
        <div className="glass rounded-2xl p-4 sm:p-6 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <h2 className="text-sm font-semibold text-white/80 mb-4">Agent Performance</h2>
          {data.agents.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-4">No agent runs yet</p>
          ) : (
            <div className="space-y-3">
              {data.agents.map((agent) => (
                <div key={agent.agentType} className="bg-black/20 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white/80 capitalize">{agent.agentType}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      agent.successRate >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
                      agent.successRate >= 50 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {agent.successRate}% success
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className="text-xs text-white/40">Runs</div>
                      <div className="text-sm font-medium text-white/80">{agent.totalRuns}</div>
                    </div>
                    <div>
                      <div className="text-xs text-white/40">Passed</div>
                      <div className="text-sm font-medium text-emerald-400">{agent.completedRuns}</div>
                    </div>
                    <div>
                      <div className="text-xs text-white/40">Avg Tokens</div>
                      <div className="text-sm font-medium text-white/80">{agent.avgTokens.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-white/40">Cost</div>
                      <div className="text-sm font-medium text-emerald-400">${(agent.totalCost / 100).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Cost Trends */}
        <div className="glass rounded-2xl p-4 sm:p-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <h2 className="text-sm font-semibold text-white/80 mb-4">Cost Trends (30 days)</h2>
          {data.costTrends.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-4">No cost data yet</p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2 text-xs text-white/40">
                <span>Max: ${(maxCost / 100).toFixed(2)}/day</span>
                <span>Total: ${(data.costTrends.reduce((s, c) => s + c.cost, 0) / 100).toFixed(2)}</span>
              </div>
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full"
                preserveAspectRatio="none"
              >
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map(ratio => {
                  const y = chartHeight - chartPadding - ratio * (chartHeight - chartPadding * 2);
                  return (
                    <line key={ratio} x1={chartPadding} y1={y} x2={chartWidth - chartPadding} y2={y}
                      stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  );
                })}

                {/* Fill area */}
                {data.costTrends.length > 1 && (
                  <polygon
                    points={`${chartPadding},${chartHeight - chartPadding} ${points} ${chartWidth - chartPadding},${chartHeight - chartPadding}`}
                    fill="url(#costGradient)"
                    opacity="0.3"
                  />
                )}

                {/* Line */}
                {data.costTrends.length > 1 && (
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Dots */}
                {data.costTrends.map((c, i) => {
                  const x = chartPadding + (i / Math.max(data.costTrends.length - 1, 1)) * (chartWidth - chartPadding * 2);
                  const y = chartHeight - chartPadding - ((c.cost / maxCost) * (chartHeight - chartPadding * 2));
                  return (
                    <circle key={i} cx={x} cy={y} r="3" fill="#3b82f6">
                      <title>{c.date}: ${(c.cost / 100).toFixed(2)}</title>
                    </circle>
                  );
                })}

                <defs>
                  <linearGradient id="costGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>

              {/* X-axis labels */}
              <div className="flex justify-between text-[10px] text-white/30 mt-1 px-5">
                <span>{data.costTrends[0]?.date.slice(5)}</span>
                {data.costTrends.length > 2 && (
                  <span>{data.costTrends[Math.floor(data.costTrends.length / 2)]?.date.slice(5)}</span>
                )}
                <span>{data.costTrends[data.costTrends.length - 1]?.date.slice(5)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 4. Recent Activity */}
        <div className="glass rounded-2xl p-4 sm:p-6 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <h2 className="text-sm font-semibold text-white/80 mb-4">Recent Activity</h2>
          {data.activity.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-4">No activity yet</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.activity.map((item) => (
                <div key={item.id} className="flex gap-2 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-white/70">
                      <span className="font-medium text-white/90">{item.actor}</span>
                      {' '}{item.action === 'updated' ? 'changed' : item.action}{' '}
                      {item.fieldChanged && (
                        <span className="text-blue-400">{item.fieldChanged}</span>
                      )}
                      {item.newValue && (
                        <> to <span className="text-white/90">{item.newValue}</span></>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-white/40 mt-0.5">
                      <span className="truncate">{item.taskTitle}</span>
                      <span className="flex-shrink-0">&middot;</span>
                      <span className="flex-shrink-0">{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
