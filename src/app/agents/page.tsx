'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Agent {
  id: string;
  name: string;
  specialization: string;
  description: string | null;
  system_prompt: string | null;
  memory: string | null;
  avatar_emoji: string;
  avatar_color: string;
  is_active: boolean;
  tasks_completed: number;
  created_at: string;
  updated_at: string;
}

interface ReportData {
  total_tasks: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_assignee: Record<string, number>;
  by_contributor: Record<string, number>;
  completed_by_contributor: Record<string, number>;
  completed_this_week: number;
  avg_cycle_time_hours: number | null;
  velocity_per_day: number;
  overdue_count: number;
  blocked_count: number;
}

interface WatcherData {
  id: string;
  is_running: boolean;
  last_run: string | null;
  current_task_id: string | null;
  updated_at: string;
  active_task_ids: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  assignee: string;
}

interface AgentMetrics {
  assigned: number;
  worked: number;
  completed: number;
  isWorking: boolean;
  activeTaskTitle?: string;
}

const SPECIALIZATIONS = [
  { value: 'Full Stack Developer', label: 'Full Stack Developer', emoji: '🚀' },
  { value: 'Frontend Developer', label: 'Frontend / UI Developer', emoji: '🎨' },
  { value: 'Backend Developer', label: 'Backend Developer', emoji: '⚙️' },
  { value: 'DevOps Engineer', label: 'DevOps Engineer', emoji: '🔧' },
  { value: 'AI Engineer', label: 'AI / ML Engineer', emoji: '🤖' },
  { value: 'Graphic Designer', label: 'Graphic Designer', emoji: '✨' },
  { value: 'QA Engineer', label: 'QA / Test Engineer', emoji: '🧪' },
  { value: 'Data Engineer', label: 'Data Engineer', emoji: '📊' },
  { value: 'Security Engineer', label: 'Security Engineer', emoji: '🔒' },
  { value: 'Mobile Developer', label: 'Mobile Developer', emoji: '📱' },
  { value: 'Technical Writer', label: 'Technical Writer', emoji: '📝' },
  { value: 'Project Manager', label: 'Project Manager', emoji: '📋' },
];

const AVATAR_COLORS = [
  'from-blue-500 to-purple-500',
  'from-orange-500 to-amber-500',
  'from-emerald-500 to-teal-500',
  'from-pink-500 to-rose-500',
  'from-cyan-500 to-blue-500',
  'from-violet-500 to-purple-500',
  'from-red-500 to-orange-500',
  'from-lime-500 to-green-500',
];

const AVATAR_EMOJIS = ['🤖', '🦊', '🐙', '🦾', '🧠', '⚡', '🔮', '🎯', '🛠️', '💡', '🚀', '🎨'];

export default function AgentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [watcherData, setWatcherData] = useState<WatcherData | null>(null);
  const [inProgressTasks, setInProgressTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    specialization: 'Full Stack Developer',
    description: '',
    system_prompt: '',
    memory: '',
    avatar_emoji: '🤖',
    avatar_color: 'from-blue-500 to-purple-500',
    is_active: true,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [agentsRes, reportsRes, watcherRes, tasksRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/reports'),
        fetch('/api/watcher'),
        fetch('/api/tasks?status=in_progress'),
      ]);
      
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data);
      }
      
      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReportData(data);
      }
      
      if (watcherRes.ok) {
        const data = await watcherRes.json();
        setWatcherData(data);
      }
      
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setInProgressTasks(data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get metrics for a specific agent by name
  const getAgentMetrics = (agentName: string): AgentMetrics => {
    const assigned = reportData?.by_assignee[agentName] || 0;
    const worked = reportData?.by_contributor[agentName] || 0;
    const completed = reportData?.completed_by_contributor[agentName] || 0;
    
    // Check if agent is currently working on any in-progress task
    const agentActiveTask = inProgressTasks.find(task => task.assignee === agentName);
    const isWorking = !!agentActiveTask;
    const activeTaskTitle = agentActiveTask?.title;
    
    return { assigned, worked, completed, isWorking, activeTaskTitle };
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = editingAgent ? `/api/agents/${editingAgent.id}` : '/api/agents';
      const method = editingAgent ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        fetchAgents();
        closeModal();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to save agent');
      }
    } catch (error) {
      console.error('Error saving agent:', error);
      alert('Failed to save agent');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;
    
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchAgents();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to delete agent');
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
    }
  };

  const openCreateModal = () => {
    setEditingAgent(null);
    setFormData({
      name: '',
      specialization: 'Full Stack Developer',
      description: '',
      system_prompt: '',
      memory: '',
      avatar_emoji: '🤖',
      avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      is_active: true,
    });
    setShowModal(true);
  };

  const openEditModal = (agent: Agent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      specialization: agent.specialization,
      description: agent.description || '',
      system_prompt: agent.system_prompt || '',
      memory: agent.memory || '',
      avatar_emoji: agent.avatar_emoji,
      avatar_color: agent.avatar_color,
      is_active: agent.is_active,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAgent(null);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-white/60">Loading agents...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-8 animate-fade-in">
        {/* Row 1: Title left, User info right */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text truncate">
              AI Agent Team
            </h1>
            <p className="text-white/50 text-xs sm:text-sm hidden md:block">
              Create and manage specialized AI agents for your team
            </p>
          </div>
          
          {/* User info */}
          {session?.user && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {session.user.image && (
                <img src={session.user.image} alt="" className="w-6 h-6 sm:w-8 sm:h-8 rounded-full" />
              )}
              <button
                onClick={() => signOut()}
                className="text-white/40 hover:text-white/70 text-xs transition-colors hidden sm:block"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
        
        {/* Row 2: Navigation + Actions */}
        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            {/* New Agent Button - First */}
            <button
              onClick={openCreateModal}
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg sm:rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105 active:scale-95 text-xs sm:text-sm"
            >
              <span className="text-base sm:text-lg group-hover:rotate-90 transition-transform duration-200">+</span>
              <span className="hidden sm:inline">New Agent</span>
            </button>
            
            {/* Tasks */}
            <Link
              href="/"
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium hover:bg-white/20 hover:scale-105 active:scale-95 text-xs sm:text-sm transition-all border border-white/10"
            >
              <span className="text-base sm:text-lg">📋</span>
              <span className="hidden sm:inline">Tasks</span>
            </Link>
            
            {/* Projects */}
            <Link
              href="/projects"
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium hover:bg-white/20 hover:scale-105 active:scale-95 text-xs sm:text-sm transition-all border border-white/10"
            >
              <span className="text-base sm:text-lg">📁</span>
              <span className="hidden sm:inline">Projects</span>
            </Link>
          </div>
          
          {/* Agent count */}
          <div className="text-white/50 text-sm">
            <span className="font-medium text-white">{agents.filter(a => a.is_active).length}</span> active agents
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const metrics = getAgentMetrics(agent.name);
          return (
            <div
              key={agent.id}
              className={`glass rounded-xl p-4 sm:p-5 animate-fade-in transition-all hover:scale-[1.02] ${
                !agent.is_active ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${agent.avatar_color} flex items-center justify-center text-2xl shadow-lg flex-shrink-0`}>
                    {agent.avatar_emoji}
                  </div>
                  {/* Availability indicator */}
                  {agent.is_active && (
                    <div 
                      className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                        metrics.isWorking ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                      }`}
                      title={metrics.isWorking ? 'Working on a task' : 'Available'}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white truncate">{agent.name}</h3>
                    {!agent.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-white/50">Inactive</span>
                    )}
                    {agent.is_active && metrics.isWorking && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 rounded text-amber-400 border border-amber-500/30" title={metrics.activeTaskTitle}>Working</span>
                    )}
                    {agent.is_active && !metrics.isWorking && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 rounded text-emerald-400 border border-emerald-500/30">Available</span>
                    )}
                  </div>
                  <p className="text-sm text-white/60">{agent.specialization}</p>
                </div>
              </div>
              
              {agent.description && !metrics.isWorking && (
                <p className="mt-3 text-sm text-white/50 line-clamp-2">{agent.description}</p>
              )}
              
              {/* Active task indicator */}
              {metrics.isWorking && metrics.activeTaskTitle && (
                <div className="mt-3 p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div className="text-[10px] text-amber-400/60 uppercase tracking-wider mb-0.5">Working on</div>
                  <div className="text-xs text-white/70 line-clamp-1">{metrics.activeTaskTitle}</div>
                </div>
              )}
              
              {/* Metrics row */}
              <div className="mt-3 flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1 text-white/50" title="Tasks assigned">
                  <span>📋</span>
                  <span>{metrics.assigned}</span>
                </div>
                <div className="flex items-center gap-1 text-white/50" title="Tasks worked on">
                  <span>🔧</span>
                  <span>{metrics.worked}</span>
                </div>
                <div className="flex items-center gap-1 text-emerald-400" title="Tasks completed">
                  <span>✅</span>
                  <span>{metrics.completed}</span>
                </div>
              </div>
              
              <div className="mt-3 flex items-center justify-between pt-3 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs text-white/40">
                  {metrics.completed > 0 ? (
                    <span className="text-emerald-400/70">
                      {Math.round((metrics.completed / Math.max(metrics.worked, 1)) * 100)}% completion rate
                    </span>
                  ) : (
                    <span>No tasks completed yet</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(agent)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    title="Edit agent"
                  >
                    ✏️
                  </button>
                  {agent.id !== 'agent-simon' && (
                    <button
                      onClick={() => handleDelete(agent.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                      title="Delete agent"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        
        {agents.length === 0 && (
          <div className="col-span-full text-center py-12 text-white/40">
            <p className="text-4xl mb-4">🤖</p>
            <p>No agents yet. Create your first AI team member!</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingAgent ? 'Edit Agent' : 'Create New Agent'}
            </h2>
            
            {/* Metrics Section - Only show when editing */}
            {editingAgent && (
              <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
                <h3 className="text-sm font-medium text-white/70 mb-3">📊 Performance Metrics</h3>
                {(() => {
                  const metrics = getAgentMetrics(editingAgent.name);
                  return (
                    <div className="space-y-3">
                      {/* Availability Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/50">Status</span>
                        {editingAgent.is_active ? (
                          metrics.isWorking ? (
                            <span className="flex items-center gap-1.5 text-sm text-amber-400">
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                              Working
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Available for work
                            </span>
                          )
                        ) : (
                          <span className="flex items-center gap-1.5 text-sm text-white/40">
                            <span className="w-2 h-2 rounded-full bg-white/30" />
                            Inactive
                          </span>
                        )}
                      </div>
                      
                      {/* Current Task - only show when working */}
                      {metrics.isWorking && metrics.activeTaskTitle && (
                        <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                          <div className="text-[10px] text-amber-400/60 uppercase tracking-wider mb-1">Currently Working On</div>
                          <div className="text-sm text-white/80 line-clamp-2">{metrics.activeTaskTitle}</div>
                        </div>
                      )}
                      
                      {/* Stats Grid */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-2 bg-white/5 rounded-lg">
                          <div className="text-lg font-bold text-white">{metrics.assigned}</div>
                          <div className="text-[10px] text-white/40 uppercase tracking-wider">Assigned</div>
                        </div>
                        <div className="text-center p-2 bg-white/5 rounded-lg">
                          <div className="text-lg font-bold text-white">{metrics.worked}</div>
                          <div className="text-[10px] text-white/40 uppercase tracking-wider">Worked</div>
                        </div>
                        <div className="text-center p-2 bg-emerald-500/20 rounded-lg">
                          <div className="text-lg font-bold text-emerald-400">{metrics.completed}</div>
                          <div className="text-[10px] text-emerald-400/60 uppercase tracking-wider">Done</div>
                        </div>
                      </div>
                      
                      {/* Completion Rate Bar */}
                      {metrics.worked > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-white/40 mb-1">
                            <span>Completion Rate</span>
                            <span>{Math.round((metrics.completed / metrics.worked) * 100)}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                              style={{ width: `${Math.round((metrics.completed / metrics.worked) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Avatar Preview & Selection */}
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${formData.avatar_color} flex items-center justify-center text-3xl shadow-lg`}>
                  {formData.avatar_emoji}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {AVATAR_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setFormData({ ...formData, avatar_emoji: emoji })}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          formData.avatar_emoji === emoji ? 'bg-white/20 scale-110' : 'hover:bg-white/10'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, avatar_color: color })}
                        className={`w-6 h-6 rounded-full bg-gradient-to-br ${color} transition-all ${
                          formData.avatar_color === color ? 'ring-2 ring-white scale-110' : ''
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  placeholder="e.g., Alex"
                  required
                />
              </div>

              {/* Specialization */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Specialization *</label>
                <select
                  value={formData.specialization}
                  onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                >
                  {SPECIALIZATIONS.map((spec) => (
                    <option key={spec.value} value={spec.value} className="bg-slate-800">
                      {spec.emoji} {spec.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="Brief description of this agent's capabilities..."
                  rows={2}
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm text-white/70 mb-1">System Prompt</label>
                <textarea
                  value={formData.system_prompt}
                  onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none font-mono text-sm"
                  placeholder="Instructions for how this agent should behave..."
                  rows={4}
                />
              </div>

              {/* Memory */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Memory / Context</label>
                <textarea
                  value={formData.memory}
                  onChange={(e) => setFormData({ ...formData, memory: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none font-mono text-sm"
                  placeholder="Persistent knowledge or context for this agent..."
                  rows={3}
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    formData.is_active ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    formData.is_active ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className="text-sm text-white/70">
                  {formData.is_active ? 'Active' : 'Inactive'} - {formData.is_active ? 'Can receive tasks' : 'Will not receive tasks'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                >
                  {editingAgent ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
