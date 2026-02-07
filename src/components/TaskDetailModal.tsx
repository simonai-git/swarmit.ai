'use client';

import { useState, useEffect, memo } from 'react';
import { useSession } from 'next-auth/react';
import { Task } from '@/lib/db';
import TaskLogsPanel from './TaskLogsPanel';

interface Comment {
  id: string;
  task_id: string;
  author: string;
  content: string;
  created_at: string;
}

interface Activity {
  id: string;
  task_id: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  actor: string;
  created_at: string;
}

interface AgentRun {
  id: string;
  taskId: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string | null;
  completedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  error?: string;
  hasTranscript?: boolean;
  transcript?: Array<{ role: string; content: string; timestamp: string }>;
}

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  isActive?: boolean;
  projectName?: string;
}

const statusConfig = {
  todo: { label: 'To Do', color: 'bg-slate-500', icon: '📋' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500', icon: '⚡' },
  testing: { label: 'Testing', color: 'bg-purple-500', icon: '🧪' },
  in_review: { label: 'In Review', color: 'bg-amber-500', icon: '👀' },
  done: { label: 'Done', color: 'bg-emerald-500', icon: '✅' },
};

const priorityConfig = {
  low: { label: 'Low', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  medium: { label: 'Medium', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  high: { label: 'High', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const assigneeConfig: Record<string, { color: string; emoji: string }> = {
  Bogdan: { color: 'from-blue-500 to-cyan-500', emoji: '👤' },
  Simon: { color: 'from-orange-500 to-amber-500', emoji: '🦊' },
  Sam: { color: 'from-purple-500 to-pink-500', emoji: '📋' },
  Casey: { color: 'from-cyan-500 to-blue-500', emoji: '🎨' },
  Riley: { color: 'from-emerald-500 to-teal-500', emoji: '⚙️' },
  Jordan: { color: 'from-violet-500 to-purple-500', emoji: '🔧' },
  Morgan: { color: 'from-rose-500 to-pink-500', emoji: '🤖' },
  Alex: { color: 'from-amber-500 to-orange-500', emoji: '🧪' },
};

const defaultAssigneeConfig = { color: 'from-slate-500 to-slate-600', emoji: '🤖' };
const unassignedConfig = { color: 'from-slate-600 to-slate-700', emoji: '❓' };

// Compare due date (YYYY-MM-DD string) against today in local time
function isDateOverdue(dueDateStr: string): boolean {
  // Parse the due date as local midnight (not UTC)
  const [year, month, day] = dueDateStr.split('-').map(Number);
  const dueDate = new Date(year, month - 1, day); // month is 0-indexed
  
  // Get today's date at local midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Due date is overdue if it's before today
  return dueDate < today;
}

// Get today's date as YYYY-MM-DD in local time
function getTodayString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  emoji?: string;
}

interface DependencyItem {
  id: string;
  task_id: string;
  depends_on_id: string;
  title: string;
  status: string;
}

function TaskDetailModal({ task, isOpen, onClose, onUpdate, onDelete, isActive = false, projectName }: TaskDetailModalProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'activity' | 'agent_context' | 'runs' | 'logs'>('details');
  const [dependencies, setDependencies] = useState<DependencyItem[]>([]);
  const [dependents, setDependents] = useState<DependencyItem[]>([]);
  const [depSearchQuery, setDepSearchQuery] = useState('');
  const [depSearchResults, setDepSearchResults] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [allTasks, setAllTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  // Defer overdue check to client-side only to avoid hydration mismatch
  // (server runs in UTC, client runs in user's local time)
  const [isOverdue, setIsOverdue] = useState(false);
  
  useEffect(() => {
    if (task?.due_date && task.status !== 'done') {
      setIsOverdue(isDateOverdue(task.due_date));
    } else {
      setIsOverdue(false);
    }
  }, [task?.due_date, task?.status]);

  useEffect(() => {
    if (task && isOpen) {
      fetchComments();
      fetchActivity();
      fetchRuns();
      fetchDependencies();
      fetchAllTasks();
      fetchGithubRepo();
    }
  }, [task, isOpen]);

  const fetchGithubRepo = async () => {
    if (!task?.project_id) {
      setGithubRepo(null);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${task.project_id}`);
      if (res.ok) {
        const data = await res.json();
        setGithubRepo(data.github_repo || null);
      }
    } catch {
      // ignore
    }
  };

  // Fetch available agents for assignment
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch('/api/agents');
        const data = await res.json();
        setAgents(data);
      } catch (error) {
        console.error('Error fetching agents:', error);
      }
    };
    fetchAgents();
  }, []);

  const fetchDependencies = async () => {
    if (!task) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies`);
      const data = await res.json();
      setDependencies(data.dependencies || []);
      setDependents(data.dependents || []);
    } catch (error) {
      console.error('Error fetching dependencies:', error);
    }
  };

  const fetchAllTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setAllTasks(data.map((t: { id: string; title: string; status: string }) => ({ id: t.id, title: t.title, status: t.status })));
    } catch (error) {
      console.error('Error fetching tasks for search:', error);
    }
  };

  const handleAddDependency = async (dependsOnId: string) => {
    if (!task) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depends_on_id: dependsOnId }),
      });
      if (res.ok) {
        setDepSearchQuery('');
        setDepSearchResults([]);
        fetchDependencies();
        // Refresh task to get updated blocked status
        const taskRes = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        if (taskRes.ok) {
          const updated = await taskRes.json();
          onUpdate(updated);
        }
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to add dependency');
      }
    } catch (error) {
      console.error('Error adding dependency:', error);
    }
  };

  const handleRemoveDependency = async (dependsOnId: string) => {
    if (!task) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies?depends_on_id=${dependsOnId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchDependencies();
        // Refresh task to get updated blocked status
        const taskRes = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        if (taskRes.ok) {
          const updated = await taskRes.json();
          onUpdate(updated);
        }
      }
    } catch (error) {
      console.error('Error removing dependency:', error);
    }
  };

  // Filter search results based on query
  useEffect(() => {
    if (!depSearchQuery.trim() || !task) {
      setDepSearchResults([]);
      return;
    }
    const query = depSearchQuery.toLowerCase();
    const existingDepIds = new Set(dependencies.map(d => d.depends_on_id));
    const filtered = allTasks.filter(t =>
      t.id !== task.id &&
      !existingDepIds.has(t.id) &&
      (t.title.toLowerCase().includes(query) || t.id.toLowerCase().includes(query))
    ).slice(0, 5);
    setDepSearchResults(filtered);
  }, [depSearchQuery, allTasks, dependencies, task]);

  const fetchComments = async () => {
    if (!task) return;
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`);
      const data = await res.json();
      setComments(data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const fetchActivity = async () => {
    if (!task) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/activity`);
      const data = await res.json();
      setActivities(data);
    } catch (error) {
      console.error('Error fetching activity:', error);
    }
  };

  const fetchRuns = async () => {
    if (!task) return;
    setLoadingRuns(true);
    try {
      const res = await fetch(`/api/runs?taskId=${task.id}`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (error) {
      console.error('Error fetching runs:', error);
    } finally {
      setLoadingRuns(false);
    }
  };

  const fetchRunTranscript = async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = await res.json();
      setSelectedRun(data);
    } catch (error) {
      console.error('Error fetching run transcript:', error);
    }
  };

  const cancelRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.ok) {
        fetchRuns(); // Refresh runs list
      }
    } catch (error) {
      console.error('Error cancelling run:', error);
    }
  };

  const [triggeringRun, setTriggeringRun] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<'developer' | 'qa' | 'reviewer'>('developer');

  const triggerAgentRun = async () => {
    if (!task) return;
    setTriggeringRun(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentType: selectedAgentType }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('Agent run triggered:', data);
        // Refresh runs list after a short delay
        setTimeout(() => fetchRuns(), 1000);
      } else {
        const error = await res.json();
        console.error('Failed to trigger agent run:', error);
      }
    } catch (error) {
      console.error('Error triggering agent run:', error);
    } finally {
      setTriggeringRun(false);
    }
  };

  const handleAddComment = async () => {
    if (!task || !newComment.trim() || !session?.user?.email) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: session.user.name || session.user.email,
          content: newComment.trim(),
        }),
      });
      const comment = await res.json();
      setComments(prev => [...prev, comment]);
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleFieldUpdate = async (field: string, value: any) => {
    if (!task) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const updatedTask = await res.json();
      onUpdate(updatedTask);
      fetchActivity(); // Refresh activity log
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
    }
  };

  if (!isOpen || !task) return null;

  const status = statusConfig[task.status];
  const priority = priorityConfig[task.priority];

  return (
    <div className="fixed inset-0 modal-backdrop flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div 
        className="bg-[#1e1e2f]/95 backdrop-blur-xl border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/50 w-full sm:max-w-[63rem] max-h-[95vh] sm:max-h-[90vh] overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 flex items-start justify-between gap-3 sm:gap-4 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-white/40 font-mono">Task #{task.id.slice(0, 8)}</span>
              <span className={`text-[10px] px-1.5 py-0.5 ${projectName === "General Task" ? "bg-gray-500/15 text-gray-300 border-gray-500/20" : "bg-blue-500/15 text-blue-300 border-blue-500/20"} border rounded flex items-center gap-1`}>
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  {projectName}
                </span>
              {githubRepo && (
                <a
                  href={`https://github.com/${githubRepo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-1.5 py-0.5 bg-gray-500/15 text-gray-300 border border-gray-500/20 rounded flex items-center gap-1 hover:text-white hover:border-gray-400/40 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  {githubRepo}
                </a>
              )}
            </div>
            <div className="flex items-start sm:items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-semibold text-white">{task.title}</h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isActive && (
                  <span className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] sm:text-xs rounded-full">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    ACTIVE
                  </span>
                )}
                {!isActive && task.status === 'in_progress' && (
                  <span className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] sm:text-xs rounded-full">
                    <span className="h-2 w-2 rounded-full bg-gray-500"></span>
                    IDLE
                  </span>
                )}
                {task.is_blocked && (
                  <span className="px-1.5 sm:px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] sm:text-xs rounded-full">BLOCKED</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 mt-2 flex-wrap text-xs sm:text-sm">
              <span className={`inline-flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border ${priority.color}`}>
                {priority.label}
              </span>
              <span className="flex items-center gap-1.5 text-white/50">
                <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${(task.assignee ? (assigneeConfig[task.assignee] || defaultAssigneeConfig) : unassignedConfig).color} flex items-center justify-center text-[10px] shadow-sm`}>
                  {(task.assignee ? (assigneeConfig[task.assignee] || defaultAssigneeConfig) : unassignedConfig).emoji}
                </span>
                <span className="text-white/60">{task.assignee || 'Unassigned'}</span>
              </span>
              {task.due_date && (
                <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-white/40'}`}>
                  📅 {(() => {
                    const [year, month, day] = task.due_date!.split('-').map(Number);
                    return new Date(year, month - 1, day).toLocaleDateString();
                  })()}
                  {isOverdue && <span className="hidden sm:inline"> (OVERDUE)</span>}
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 sm:p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs - horizontal scroll on mobile */}
        <div className="flex border-b border-white/10 overflow-x-auto scrollbar-hide flex-shrink-0">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'details' ? 'text-white border-b-2 border-blue-500' : 'text-white/50 hover:text-white/70'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'activity' ? 'text-white border-b-2 border-blue-500' : 'text-white/50 hover:text-white/70'
            }`}
          >
            Activity ({activities.length})
          </button>
          <button
            onClick={() => setActiveTab('agent_context')}
            className={`px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'agent_context' ? 'text-white border-b-2 border-purple-500' : 'text-white/50 hover:text-white/70'
            }`}
          >
            <span>🤖</span>
            <span>Agent</span>
          </button>
          <button
            onClick={() => setActiveTab('runs')}
            className={`px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'runs' ? 'text-white border-b-2 border-green-500' : 'text-white/50 hover:text-white/70'
            }`}
          >
            <span>📊</span>
            <span>Runs{runs.length > 0 ? ` (${runs.length})` : ''}</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'logs' ? 'text-white border-b-2 border-emerald-500' : 'text-white/50 hover:text-white/70'
            }`}
          >
            {isActive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
            <span>Run Logs</span>
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4 sm:space-y-6">
          {activeTab === 'details' ? (
            <>
              {/* Time Tracking */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-white/70 mb-1.5 sm:mb-2">Estimated Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={task.estimated_hours || ''}
                    onChange={(e) => handleFieldUpdate('estimated_hours', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="e.g., 2.5"
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-white/70 mb-1.5 sm:mb-2">Time Spent (hours)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={task.time_spent || ''}
                    onChange={(e) => handleFieldUpdate('time_spent', e.target.value ? parseFloat(e.target.value) : 0)}
                    placeholder="0"
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 text-sm"
                  />
                </div>
              </div>

              {/* Blocked Status */}
              <div>
                <label className="flex items-center gap-2 sm:gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={task.is_blocked || false}
                    onChange={(e) => handleFieldUpdate('is_blocked', e.target.checked)}
                    className="w-5 h-5 rounded border-white/20 bg-black/30 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-xs sm:text-sm font-medium text-white/70">Task is blocked</span>
                </label>
                {task.is_blocked && (
                  <textarea
                    value={task.blocked_reason || ''}
                    onChange={(e) => handleFieldUpdate('blocked_reason', e.target.value)}
                    placeholder="Describe what's blocking this task..."
                    rows={2}
                    className="w-full mt-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-white placeholder-white/40 focus:border-red-500/50 resize-none text-sm"
                  />
                )}
              </div>

              {/* Dependencies */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2 sm:mb-3">
                  Dependencies ({dependencies.length})
                </label>

                {/* Current dependencies */}
                {dependencies.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {dependencies.map((dep) => (
                      <div key={dep.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dep.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span className="text-xs sm:text-sm text-white/80 truncate">{dep.title}</span>
                          <span className="text-[10px] text-white/40 flex-shrink-0">#{dep.depends_on_id.slice(0, 8)}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveDependency(dep.depends_on_id)}
                          className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors flex-shrink-0"
                          title="Remove dependency"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add dependency search */}
                <div className="relative">
                  <input
                    type="text"
                    value={depSearchQuery}
                    onChange={(e) => setDepSearchQuery(e.target.value)}
                    placeholder="Search tasks to add as dependency..."
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/40 text-xs sm:text-sm focus:outline-none focus:border-blue-500/50"
                  />
                  {depSearchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-[#1e1e2f] border border-white/10 rounded-xl shadow-lg overflow-hidden">
                      {depSearchResults.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleAddDependency(t.id)}
                          className="w-full text-left px-3 py-2 hover:bg-white/10 text-xs sm:text-sm text-white/80 flex items-center gap-2 transition-colors"
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'done' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                          <span className="truncate">{t.title}</span>
                          <span className="text-[10px] text-white/40 ml-auto flex-shrink-0">#{t.id.slice(0, 8)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dependents (read-only) */}
                {dependents.length > 0 && (
                  <div className="mt-3">
                    <label className="block text-[10px] sm:text-xs font-medium text-white/50 mb-1.5">
                      Blocked by this task ({dependents.length})
                    </label>
                    <div className="space-y-1">
                      {dependents.map((dep) => (
                        <div key={dep.id} className="flex items-center gap-2 px-3 py-1.5 bg-black/10 rounded-lg">
                          <svg className="w-3 h-3 text-white/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <span className="text-xs text-white/60 truncate">{dep.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2 sm:mb-3">Priority</label>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {(Object.keys(priorityConfig) as Task['priority'][]).map((p) => {
                    const config = priorityConfig[p];
                    const isActive = task.priority === p;
                    return (
                      <button
                        key={p}
                        onClick={() => handleFieldUpdate('priority', p)}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border transition-all ${
                          isActive
                            ? config.color
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        <span className="text-xs sm:text-sm font-medium">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-1.5 sm:mb-2">Due Date</label>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <input
                    type="date"
                    value={task.due_date || ''}
                    onChange={(e) => handleFieldUpdate('due_date', e.target.value || null)}
                    className="flex-1 min-w-[150px] px-3 sm:px-4 py-2 sm:py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] text-sm"
                  />
                  <button
                    onClick={() => handleFieldUpdate('due_date', getTodayString())}
                    className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-blue-500/30 rounded-xl transition-all text-xs sm:text-sm font-medium"
                  >
                    Today
                  </button>
                  {task.due_date && (
                    <button
                      onClick={() => handleFieldUpdate('due_date', null)}
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-white/50 hover:text-white/80 hover:bg-white/10 rounded-xl transition-all text-xs sm:text-sm"
                    >
                      Clear
                    </button>
                  )}
                  {isOverdue && (
                    <span className="text-red-400 text-xs sm:text-sm font-medium">⚠️ Overdue</span>
                  )}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2 sm:mb-3">Status</label>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
                  {(Object.keys(statusConfig) as Task['status'][]).map((s) => {
                    const config = statusConfig[s];
                    const isActive = task.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => handleFieldUpdate('status', s)}
                        className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2 rounded-xl border transition-all ${
                          isActive
                            ? `${config.color} border-transparent text-white`
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        <span className="text-sm sm:text-base">{config.icon}</span>
                        <span className="text-xs sm:text-sm font-medium">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2 sm:mb-3">Assignee</label>
                <div className="flex flex-wrap gap-2">
                  {/* Unassigned option */}
                  <button
                    onClick={() => handleFieldUpdate('assignee', null)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border transition-all ${
                      task.assignee === null
                        ? 'bg-slate-500/20 border-slate-500/50 text-slate-300'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    <span>❓</span>
                    <span className="text-xs sm:text-sm font-medium">Unassigned</span>
                  </button>
                  {/* Bogdan (owner) */}
                  <button
                    onClick={() => handleFieldUpdate('assignee', 'Bogdan')}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border transition-all ${
                      task.assignee === 'Bogdan'
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    <span>👤</span>
                    <span className="text-xs sm:text-sm font-medium">Bogdan</span>
                  </button>
                  {/* AI Agents */}
                  {agents.map((agent) => {
                    const isActive = task.assignee === agent.name;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => handleFieldUpdate('assignee', agent.name)}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border transition-all ${
                          isActive
                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        <span>{agent.emoji || '🤖'}</span>
                        <span className="text-xs sm:text-sm font-medium">{agent.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contributors (who worked on this task) */}
              {(() => {
                const workedBy: string[] = task.worked_by ? JSON.parse(task.worked_by) : [];
                if (workedBy.length === 0) return null;
                return (
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2 sm:mb-3">
                      💪 Contributors
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {workedBy.map((contributor) => (
                        <span
                          key={contributor}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs sm:text-sm"
                        >
                          <span>✓</span>
                          {contributor}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Description */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-1.5 sm:mb-2">Description</label>
                <div className="bg-black/20 rounded-xl p-3 sm:p-4 text-white/80 text-xs sm:text-sm whitespace-pre-wrap">
                  {task.description || 'No description provided.'}
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                <div className="bg-black/20 rounded-xl p-2.5 sm:p-3">
                  <span className="text-white/50">Created</span>
                  <p className="text-white/80 mt-0.5 sm:mt-1 text-[10px] sm:text-sm">
                    {new Date(task.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="bg-black/20 rounded-xl p-2.5 sm:p-3">
                  <span className="text-white/50">Last Updated</span>
                  <p className="text-white/80 mt-0.5 sm:mt-1 text-[10px] sm:text-sm">
                    {new Date(task.updated_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Comments Section */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2 sm:mb-3">
                  Comments ({comments.length})
                </label>
                
                <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4 max-h-40 sm:max-h-48 overflow-y-auto">
                  {loadingComments ? (
                    <div className="text-white/40 text-xs sm:text-sm text-center py-4">Loading comments...</div>
                  ) : comments.length === 0 ? (
                    <div className="text-white/40 text-xs sm:text-sm text-center py-4">No comments yet</div>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className="bg-black/20 rounded-xl p-2.5 sm:p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white/80 text-xs sm:text-sm font-medium">{comment.author}</span>
                          <span className="text-white/40 text-[10px] sm:text-xs">
                            {new Date(comment.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-white/70 text-xs sm:text-sm whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment */}
                <div className="flex gap-2">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={2}
                    className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:bg-black/40 focus:ring-2 focus:ring-blue-500/20 resize-none text-xs sm:text-sm"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || submittingComment}
                    className="px-3 sm:px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all self-end text-xs sm:text-sm"
                  >
                    {submittingComment ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          ) : activeTab === 'activity' ? (
            /* Activity Tab */
            <div className="space-y-3">
              {activities.length === 0 ? (
                <div className="text-white/40 text-sm text-center py-8">No activity recorded yet</div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-white/80">
                        <span className="font-medium">{activity.actor}</span>
                        {' '}changed{' '}
                        <span className="text-blue-400">{activity.field_changed}</span>
                        {activity.old_value && (
                          <>
                            {' '}from <span className="text-white/50">{activity.old_value}</span>
                          </>
                        )}
                        {' '}to <span className="text-white">{activity.new_value}</span>
                      </div>
                      <div className="text-white/40 text-xs mt-0.5">
                        {new Date(activity.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : activeTab === 'agent_context' ? (
            /* Agent Context Tab */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <span>🤖</span>
                <span>AI working context — updated by agents via API</span>
              </div>
              {task.agent_context ? (
                <div className="bg-black/30 border border-purple-500/20 rounded-xl p-4 font-mono text-sm text-white/80 whitespace-pre-wrap overflow-x-auto">
                  {task.agent_context}
                </div>
              ) : (
                <div className="text-white/40 text-sm text-center py-8 bg-black/20 rounded-xl">
                  No agent context set for this task
                </div>
              )}
            </div>
          ) : activeTab === 'logs' ? (
            /* Live Logs Tab */
            <TaskLogsPanel taskId={task.id} isActive={activeTab === 'logs'} />
          ) : (
            /* Agent Runs Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-white/50 text-sm">
                  <span>📊</span>
                  <span>LLM agent execution history</span>
                </div>
                <div className="flex items-center gap-2">
                  {runs.length > 0 && (
                    <div className="text-xs text-white/40">
                      Total: ${(runs.reduce((sum, r) => sum + r.costCents, 0) / 100).toFixed(2)}
                    </div>
                  )}
                  {/* Run Agent Button */}
                  <div className="flex items-center gap-1 bg-black/30 rounded-lg p-1">
                    <select
                      value={selectedAgentType}
                      onChange={(e) => setSelectedAgentType(e.target.value as 'developer' | 'qa' | 'reviewer')}
                      className="bg-transparent text-xs text-white/70 border-none focus:outline-none cursor-pointer"
                    >
                      <option value="developer" className="bg-slate-800">Developer</option>
                      <option value="qa" className="bg-slate-800">QA</option>
                      <option value="reviewer" className="bg-slate-800">Reviewer</option>
                    </select>
                    <button
                      onClick={triggerAgentRun}
                      disabled={triggeringRun || runs.some(r => r.status === 'running')}
                      className={`px-3 py-1 text-xs rounded-md transition-all ${
                        triggeringRun || runs.some(r => r.status === 'running')
                          ? 'bg-white/10 text-white/30 cursor-not-allowed'
                          : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      }`}
                    >
                      {triggeringRun ? '⏳ Starting...' : runs.some(r => r.status === 'running') ? '🔄 Running' : '▶ Run Agent'}
                    </button>
                  </div>
                </div>
              </div>
              
              {loadingRuns ? (
                <div className="text-white/40 text-sm text-center py-8">Loading runs...</div>
              ) : runs.length === 0 ? (
                <div className="text-white/40 text-sm text-center py-8 bg-black/20 rounded-xl">
                  No agent runs recorded for this task
                </div>
              ) : (
                <div className="space-y-3">
                  {runs.map((run) => (
                    <div key={run.id} className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                      {/* Run Header */}
                      <div 
                        className="p-3 sm:p-4 cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => {
                          if (selectedRun?.id === run.id) {
                            setSelectedRun(null);
                          } else {
                            fetchRunTranscript(run.id);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <span className={`w-2 h-2 rounded-full ${
                              run.status === 'completed' ? 'bg-emerald-500' :
                              run.status === 'running' ? 'bg-blue-500 animate-pulse' :
                              run.status === 'failed' ? 'bg-red-500' :
                              run.status === 'cancelled' ? 'bg-amber-500' :
                              'bg-gray-500'
                            }`} />
                            <span className="text-sm font-medium text-white/80">{run.agentType}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              run.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                              run.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                              run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                              run.status === 'cancelled' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {run.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-white/40">
                            <span>{run.inputTokens + run.outputTokens} tokens</span>
                            <span className="text-emerald-400">${(run.costCents / 100).toFixed(3)}</span>
                            <span className="text-white/20">{selectedRun?.id === run.id ? '▼' : '▶'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                          {run.startedAt && (
                            <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
                          )}
                          {run.completedAt && (
                            <span>Duration: {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt!).getTime()) / 1000)}s</span>
                          )}
                        </div>
                        {run.error && (
                          <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
                            Error: {run.error}
                          </div>
                        )}
                      </div>
                      
                      {/* Expanded Transcript */}
                      {selectedRun?.id === run.id && selectedRun.transcript && (
                        <div className="border-t border-white/10 p-3 sm:p-4 bg-black/20">
                          <div className="text-xs font-medium text-white/50 mb-3">Transcript</div>
                          <div className="space-y-3 max-h-96 overflow-y-auto">
                            {selectedRun.transcript.map((entry, i) => (
                              <div key={i} className={`text-xs ${
                                entry.role === 'assistant' ? 'pl-4 border-l-2 border-purple-500/50' :
                                entry.role === 'tool' ? 'pl-4 border-l-2 border-amber-500/50 bg-amber-500/5 rounded' :
                                'pl-4 border-l-2 border-blue-500/50'
                              }`}>
                                <div className="flex items-center gap-2 text-white/40 mb-1">
                                  <span className="font-medium">{entry.role}</span>
                                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="text-white/70 whitespace-pre-wrap font-mono text-[11px]">
                                  {entry.content.length > 1000 
                                    ? entry.content.slice(0, 1000) + '...[truncated]' 
                                    : entry.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Cancel button for running agents */}
                      {run.status === 'running' && (
                        <div className="border-t border-white/10 p-2 flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelRun(run.id);
                            }}
                            className="px-3 py-1 text-xs text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          >
                            Cancel Run
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-white/10 flex justify-between flex-shrink-0">
          <button
            onClick={() => onDelete(task.id)}
            className="px-3 sm:px-4 py-2 text-red-400 hover:bg-red-500/20 rounded-xl transition-all text-xs sm:text-sm"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all text-xs sm:text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Memoize to prevent re-renders when parent state changes but task hasn't
export default memo(TaskDetailModal, (prevProps, nextProps) => {
  // Only re-render if these props actually changed
  if (prevProps.isOpen !== nextProps.isOpen) return false;
  if (prevProps.isActive !== nextProps.isActive) return false;
  if (prevProps.projectName !== nextProps.projectName) return false;
  if (prevProps.task?.id !== nextProps.task?.id) return false;
  // For task content, check user-visible fields
  if (prevProps.task && nextProps.task) {
    if (prevProps.task.title !== nextProps.task.title) return false;
    if (prevProps.task.description !== nextProps.task.description) return false;
    if (prevProps.task.status !== nextProps.task.status) return false;
    if (prevProps.task.priority !== nextProps.task.priority) return false;
    if (prevProps.task.assignee !== nextProps.task.assignee) return false;
    if (prevProps.task.due_date !== nextProps.task.due_date) return false;
    if (prevProps.task.progress !== nextProps.task.progress) return false;
    if (prevProps.task.is_blocked !== nextProps.task.is_blocked) return false;
  }
  return true; // Props are equal, don't re-render
});
