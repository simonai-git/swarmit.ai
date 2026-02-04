'use client';

import React, { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ProjectStatus = 'defined' | 'in_progress' | 'paused' | 'canceled' | 'completed';
type TaskStatus = 'todo' | 'in_progress' | 'testing' | 'in_review' | 'done';
type FeedbackType = 'suggestion' | 'improvement' | 'bug' | 'feature' | 'question';
type FeedbackStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'wont_fix';

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  owner: string;
  reviewer: string;
  product_manager: string;
  prd: string | null;
  goals: string | null;
  requirements: string | null;
  constraints: string | null;
  tech_stack: string | null;
  timeline: string | null;
  deadline: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  task_count: number;
  completed_task_count: number;
  tasks?: Task[];
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: string;
  priority: 'low' | 'medium' | 'high';
  project_id: string | null;
  created_at: string;
}

interface Feedback {
  id: string;
  project_id: string;
  author: string;
  type: FeedbackType;
  title: string;
  content: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; emoji: string; color: string; bgColor: string }> = {
  defined: { label: 'Defined', emoji: '📋', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  in_progress: { label: 'In Progress', emoji: '🚀', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  paused: { label: 'Paused', emoji: '⏸️', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  canceled: { label: 'Canceled', emoji: '❌', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  completed: { label: 'Completed', emoji: '✅', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
};

const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'To Do', color: 'text-blue-400' },
  in_progress: { label: 'In Progress', color: 'text-amber-400' },
  testing: { label: 'Testing', color: 'text-violet-400' },
  in_review: { label: 'In Review', color: 'text-purple-400' },
  done: { label: 'Done', color: 'text-emerald-400' },
};

const FEEDBACK_TYPE_CONFIG: Record<FeedbackType, { label: string; emoji: string; color: string }> = {
  suggestion: { label: 'Suggestion', emoji: '💡', color: 'text-yellow-400' },
  improvement: { label: 'Improvement', emoji: '📈', color: 'text-blue-400' },
  bug: { label: 'Bug', emoji: '🐛', color: 'text-red-400' },
  feature: { label: 'Feature', emoji: '✨', color: 'text-purple-400' },
  question: { label: 'Question', emoji: '❓', color: 'text-cyan-400' },
};

const FEEDBACK_STATUS_CONFIG: Record<FeedbackStatus, { label: string; color: string; bgColor: string }> = {
  open: { label: 'Open', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  acknowledged: { label: 'Acknowledged', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  in_progress: { label: 'In Progress', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  resolved: { label: 'Resolved', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  wont_fix: { label: "Won't Fix", color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'prd' | 'tasks' | 'feedback'>('overview');
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  
  // Feedback state
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [showAddFeedbackModal, setShowAddFeedbackModal] = useState(false);
  const [newFeedbackTitle, setNewFeedbackTitle] = useState('');
  const [newFeedbackContent, setNewFeedbackContent] = useState('');
  const [newFeedbackType, setNewFeedbackType] = useState<FeedbackType>('suggestion');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [authStatus, router]);

  useEffect(() => {
    fetchProject();
    fetchFeedback();
  }, [id]);

  const fetchFeedback = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/feedback`);
      if (res.ok) {
        const data = await res.json();
        setFeedback(data);
      }
    } catch (error) {
      console.error('Error fetching feedback:', error);
    }
  };

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}?include_tasks=true`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      } else if (res.status === 404) {
        router.push('/projects');
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'start' | 'pause' | 'resume' | 'cancel' | 'complete') => {
    const confirmMessages: Record<string, string> = {
      start: 'Start this project?',
      pause: 'Pause this project?',
      resume: 'Resume this project?',
      cancel: 'Cancel this project?',
      complete: 'Mark this project as completed?',
    };
    
    if (!confirm(confirmMessages[action])) return;
    
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        fetchProject();
      } else {
        const error = await res.json();
        alert(error.error || `Failed to ${action} project`);
      }
    } catch (error) {
      console.error(`Error ${action}ing project:`, error);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const res = await fetch(`/api/projects/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDescription || null,
          priority: newTaskPriority,
        }),
      });

      if (res.ok) {
        setNewTaskTitle('');
        setNewTaskDescription('');
        setNewTaskPriority('medium');
        setShowAddTaskModal(false);
        fetchProject();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to add task');
      }
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };

  const handleAddFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedbackTitle.trim() || !newFeedbackContent.trim()) return;
    
    setSubmittingFeedback(true);
    try {
      const res = await fetch(`/api/projects/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newFeedbackTitle,
          content: newFeedbackContent,
          type: newFeedbackType,
          author: session?.user?.name || session?.user?.email || 'User',
        }),
      });

      if (res.ok) {
        setNewFeedbackTitle('');
        setNewFeedbackContent('');
        setNewFeedbackType('suggestion');
        setShowAddFeedbackModal(false);
        fetchFeedback();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to add feedback');
      }
    } catch (error) {
      console.error('Error adding feedback:', error);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleUpdateFeedbackStatus = async (feedbackId: string, newStatus: FeedbackStatus) => {
    try {
      const res = await fetch(`/api/projects/${id}/feedback/${feedbackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        fetchFeedback();
      }
    } catch (error) {
      console.error('Error updating feedback:', error);
    }
  };

  const handleConvertToTask = async (feedbackId: string) => {
    if (!confirm('Convert this feedback to a task?')) return;
    
    try {
      const res = await fetch(`/api/projects/${id}/feedback/${feedbackId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Task created: ${data.task.title}`);
        fetchFeedback();
        fetchProject(); // Refresh tasks count
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to convert feedback to task');
      }
    } catch (error) {
      console.error('Error converting feedback:', error);
    }
  };

  if (authStatus === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-white/60">Loading project...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-white/60">Project not found</p>
          <Link href="/projects" className="text-blue-400 hover:underline mt-2 inline-block">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[project.status];
  const progress = project.task_count > 0 
    ? Math.round((project.completed_task_count / project.task_count) * 100) 
    : 0;

  const getActionButtons = () => {
    const buttons: React.ReactElement[] = [];
    
    switch (project.status) {
      case 'defined':
        buttons.push(
          <button
            key="start"
            onClick={() => handleAction('start')}
            className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
          >
            🚀 Start Project
          </button>
        );
        break;
      case 'in_progress':
        buttons.push(
          <button
            key="pause"
            onClick={() => handleAction('pause')}
            className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors"
          >
            ⏸️ Pause
          </button>,
          <button
            key="complete"
            onClick={() => handleAction('complete')}
            className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            ✅ Complete
          </button>
        );
        break;
      case 'paused':
        buttons.push(
          <button
            key="resume"
            onClick={() => handleAction('resume')}
            className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
          >
            ▶️ Resume
          </button>
        );
        break;
    }
    
    if (!['completed', 'canceled'].includes(project.status)) {
      buttons.push(
        <button
          key="cancel"
          onClick={() => handleAction('cancel')}
          className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          ❌ Cancel
        </button>
      );
    }
    
    return buttons;
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Link
                href="/projects"
                className="text-white/50 hover:text-white transition-colors"
              >
                ← Projects
              </Link>
              <span className="text-white/30">/</span>
              <span className={`px-2 py-0.5 rounded-lg text-xs ${statusConfig.bgColor} ${statusConfig.color}`}>
                {statusConfig.emoji} {statusConfig.label}
              </span>
            </div>
            <div className="text-xs text-white/40 font-mono mb-1">#{project.id.slice(0, 8)}</div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">
              {project.title}
            </h1>
            {project.description && (
              <p className="text-white/50 mt-2">{project.description}</p>
            )}
          </div>
          
          <Link
            href={`/projects/${id}/edit`}
            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
          >
            ✏️ Edit
          </Link>
        </div>

        {/* Progress */}
        {project.task_count > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-white/50 mb-2">
              <span>Overall Progress</span>
              <span>{project.completed_task_count}/{project.task_count} tasks ({progress}%)</span>
            </div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Meta Info */}
        <div className="flex flex-wrap gap-3 text-sm text-white/50 mb-4">
          <span className="px-3 py-1 bg-white/5 rounded-lg">👤 {project.owner}</span>
          {project.tech_stack && (
            <span className="px-3 py-1 bg-white/5 rounded-lg">🛠️ {project.tech_stack}</span>
          )}
          {project.timeline && (
            <span className="px-3 py-1 bg-white/5 rounded-lg">⏱️ {project.timeline}</span>
          )}
          {project.deadline && (
            <span className="px-3 py-1 bg-white/5 rounded-lg">📅 Due: {new Date(project.deadline).toLocaleDateString()}</span>
          )}
          {project.started_at && (
            <span className="px-3 py-1 bg-white/5 rounded-lg">🚀 Started: {new Date(project.started_at).toLocaleDateString()}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {getActionButtons()}
        </div>
      </div>

      {/* Tabs */}
      <div className="glass rounded-2xl overflow-hidden animate-fade-in">
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'overview' 
                ? 'text-white bg-white/10 border-b-2 border-blue-500' 
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            📋 Overview
          </button>
          <button
            onClick={() => setActiveTab('prd')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'prd' 
                ? 'text-white bg-white/10 border-b-2 border-blue-500' 
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            📄 PRD
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'tasks' 
                ? 'text-white bg-white/10 border-b-2 border-blue-500' 
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            ✅ Tasks ({project.task_count})
          </button>
          <button
            onClick={() => setActiveTab('feedback')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'feedback' 
                ? 'text-white bg-white/10 border-b-2 border-blue-500' 
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            💬 Feedback {feedback.length > 0 && `(${feedback.length})`}
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {project.goals && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">🎯 Goals & Objectives</h3>
                  <div className="text-white/70 whitespace-pre-wrap">{project.goals}</div>
                </div>
              )}
              
              {project.requirements && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">📝 Requirements</h3>
                  <div className="text-white/70 whitespace-pre-wrap">{project.requirements}</div>
                </div>
              )}
              
              {project.constraints && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">⚠️ Constraints</h3>
                  <div className="text-white/70 whitespace-pre-wrap">{project.constraints}</div>
                </div>
              )}
              
              {!project.goals && !project.requirements && !project.constraints && (
                <div className="text-center py-8 text-white/40">
                  <p className="text-2xl mb-2">📋</p>
                  <p>No details added yet. Edit the project to add goals, requirements, and constraints.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'prd' && (
            <div>
              {project.prd ? (
                <div className="prose prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap text-white/80 font-sans text-sm leading-relaxed">
                    {project.prd}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-12 text-white/40">
                  <p className="text-4xl mb-4">📄</p>
                  <p>No PRD created yet.</p>
                  <p className="text-sm mt-2">Edit the project to add a Product Requirements Document.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Project Tasks</h3>
                <button
                  onClick={() => setShowAddTaskModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-sm hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                >
                  + Add Task
                </button>
              </div>

              {project.tasks && project.tasks.length > 0 ? (
                <div className="space-y-2">
                  {project.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <span className={`text-sm ${TASK_STATUS_CONFIG[task.status].color}`}>
                        {task.status === 'done' ? '✅' : task.status === 'in_progress' ? '🔄' : task.status === 'in_review' ? '👀' : '○'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-white truncate ${task.status === 'done' ? 'line-through opacity-60' : ''}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-white/40 truncate">{task.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-white/40">{task.assignee}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        task.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                        task.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-white/40">
                  <p className="text-4xl mb-4">✅</p>
                  <p>No tasks yet. Add tasks to track work for this project.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'feedback' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Feedback & Suggestions</h3>
                <button
                  onClick={() => setShowAddFeedbackModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-sm hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                >
                  + Add Feedback
                </button>
              </div>

              {feedback.length > 0 ? (
                <div className="space-y-3">
                  {feedback.map((item) => {
                    const typeConfig = FEEDBACK_TYPE_CONFIG[item.type];
                    const statusConfig = FEEDBACK_STATUS_CONFIG[item.status];
                    return (
                      <div
                        key={item.id}
                        className="p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <span className={typeConfig.color}>{typeConfig.emoji}</span>
                            <h4 className="font-medium text-white">{item.title}</h4>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <select
                              value={item.status}
                              onChange={(e) => handleUpdateFeedbackStatus(item.id, e.target.value as FeedbackStatus)}
                              className={`text-xs px-2 py-1 rounded-lg border-0 cursor-pointer ${statusConfig.bgColor} ${statusConfig.color} bg-opacity-50`}
                            >
                              {Object.entries(FEEDBACK_STATUS_CONFIG).map(([value, config]) => (
                                <option key={value} value={value} className="bg-slate-800 text-white">
                                  {config.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <p className="text-white/70 text-sm whitespace-pre-wrap mb-3">{item.content}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs text-white/40">
                            <span>By {item.author}</span>
                            <span>•</span>
                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                            <span className={`px-2 py-0.5 rounded ${typeConfig.color} bg-white/5`}>
                              {typeConfig.label}
                            </span>
                          </div>
                          {item.status === 'open' && (
                            <button
                              onClick={() => handleConvertToTask(item.id)}
                              className="text-xs px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                            >
                              📋 Convert to Task
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-white/40">
                  <p className="text-4xl mb-4">💬</p>
                  <p>No feedback yet.</p>
                  <p className="text-sm mt-2">Share your suggestions and ideas to improve this project!</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddTaskModal(false)} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-md animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-4">Add Task to Project</h2>
            
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Task Title *</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  placeholder="What needs to be done?"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Description</label>
                <textarea
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Priority</label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as 'low' | 'medium' | 'high')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                >
                  <option value="low" className="bg-slate-800">Low</option>
                  <option value="medium" className="bg-slate-800">Medium</option>
                  <option value="high" className="bg-slate-800">High</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Feedback Modal */}
      {showAddFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddFeedbackModal(false)} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-lg animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-4">Share Feedback</h2>
            
            <form onSubmit={handleAddFeedback} className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Type</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(FEEDBACK_TYPE_CONFIG).map(([type, config]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewFeedbackType(type as FeedbackType)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                        newFeedbackType === type
                          ? `${config.color} bg-white/20 ring-1 ring-current`
                          : 'text-white/60 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      {config.emoji} {config.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Title *</label>
                <input
                  type="text"
                  value={newFeedbackTitle}
                  onChange={(e) => setNewFeedbackTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  placeholder="Brief summary of your feedback"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Details *</label>
                <textarea
                  value={newFeedbackContent}
                  onChange={(e) => setNewFeedbackContent(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="Describe your suggestion, improvement idea, or question..."
                  rows={5}
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddFeedbackModal(false)}
                  className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50"
                >
                  {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
