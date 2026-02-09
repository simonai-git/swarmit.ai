'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import UserMenu from '@/components/UserMenu';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ProjectStatus = 'defined' | 'in_progress' | 'paused' | 'canceled' | 'completed';

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  owner: string;
  reviewer: string;
  product_manager: string;
  project_manager: string;
  prd: string | null;
  goals: string | null;
  requirements: string | null;
  constraints: string | null;
  tech_stack: string | null;
  timeline: string | null;
  deadline: string | null;
  deploy_to_railway: boolean;
  push_to_github: boolean;
  github_repo: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  task_count: number;
  completed_task_count: number;
}

interface Agent {
  id: string;
  name: string;
  specialization: string;
  avatar_emoji: string;
  is_active: boolean;
}

interface IntegrationStatus {
  railway: { connected: boolean; account?: { name: string } | null };
  github: { connected: boolean; username?: string | null };
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; emoji: string; color: string; bgColor: string }> = {
  defined: { label: 'Defined', emoji: '📋', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  in_progress: { label: 'In Progress', emoji: '🚀', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  paused: { label: 'Paused', emoji: '⏸️', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  canceled: { label: 'Canceled', emoji: '❌', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  completed: { label: 'Completed', emoji: '✅', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    reviewer: 'Simon',
    product_manager: 'Sam',
    project_manager: 'Taylor',
    goals: '',
    requirements: '',
    constraints: '',
    tech_stack: '',
    timeline: '',
    deadline: '',
    deploy_to_railway: false,
    push_to_github: false,
    github_repo_name: '',
  });

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents?active=true');
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/integrations');
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data);
      }
    } catch (error) {
      console.error('Error fetching integrations:', error);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchProjects();
  }, []);

  // Fetch agents when modal opens
  useEffect(() => {
    if (showModal) {
      fetchAgents();
      fetchIntegrations();
    }
  }, [showModal, fetchIntegrations]);

  // Poll integrations when needed (toggle on but not connected)
  useEffect(() => {
    const needsPoll =
      (formData.deploy_to_railway && !integrations?.railway?.connected) ||
      (formData.push_to_github && !integrations?.github?.connected);
    if (!needsPoll || !showModal) return;

    const interval = setInterval(fetchIntegrations, 3000);
    return () => clearInterval(interval);
  }, [showModal, formData.deploy_to_railway, formData.push_to_github, integrations, fetchIntegrations]);

  const ownerName = session?.user?.name || session?.user?.email || 'Bogdan';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
      const method = editingProject ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          owner: ownerName,
          reviewer: formData.reviewer,
          product_manager: formData.product_manager,
          project_manager: formData.project_manager,
          goals: formData.goals || null,
          requirements: formData.requirements || null,
          constraints: formData.constraints || null,
          tech_stack: formData.tech_stack || null,
          timeline: formData.timeline || null,
          deadline: formData.deadline || null,
          deploy_to_railway: formData.deploy_to_railway,
          push_to_github: formData.push_to_github,
          github_repo: formData.push_to_github && formData.github_repo_name
            ? formData.github_repo_name
            : null,
        }),
      });

      if (res.ok) {
        fetchProjects();
        closeModal();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to save project');
      }
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Failed to save project');
    }
  };

  const handleAction = async (id: string, action: 'start' | 'pause' | 'resume' | 'cancel' | 'complete') => {
    const confirmMessages: Record<string, string> = {
      start: 'Start this project?',
      pause: 'Pause this project?',
      resume: 'Resume this project?',
      cancel: 'Cancel this project? This action cannot be undone easily.',
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
        fetchProjects();
      } else {
        const error = await res.json();
        alert(error.error || `Failed to ${action} project`);
      }
    } catch (error) {
      console.error(`Error ${action}ing project:`, error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project? Tasks will be unlinked but not deleted.')) return;

    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });

      if (res.ok) {
        fetchProjects();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const openCreateModal = () => {
    setEditingProject(null);
    setFormData({
      title: '',
      description: '',
      reviewer: 'Simon',
      product_manager: 'Sam',
      project_manager: 'Taylor',
      goals: '',
      requirements: '',
      constraints: '',
      tech_stack: '',
      timeline: '',
      deadline: '',
      deploy_to_railway: false,
      push_to_github: false,
      github_repo_name: '',
    });
    setShowModal(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setFormData({
      title: project.title,
      description: project.description || '',
      reviewer: project.reviewer || 'Simon',
      product_manager: project.product_manager || 'Sam',
      project_manager: project.project_manager || 'Taylor',
      goals: project.goals || '',
      requirements: project.requirements || '',
      constraints: project.constraints || '',
      tech_stack: project.tech_stack || '',
      timeline: project.timeline || '',
      deadline: project.deadline ? project.deadline.split('T')[0] : '',
      deploy_to_railway: project.deploy_to_railway || false,
      push_to_github: project.push_to_github || false,
      github_repo_name: project.github_repo || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProject(null);
  };

  const filteredProjects = filterStatus === 'all'
    ? projects
    : projects.filter(p => p.status === filterStatus);

  // Filter Product Manager agents
  const productManagerAgents = agents.filter(a => {
    const spec = a.specialization?.toLowerCase() || '';
    return spec.includes('product manager') || spec === 'product management';
  });

  // Filter Project Manager agents
  const projectManagerAgents = agents.filter(a => {
    const spec = a.specialization?.toLowerCase() || '';
    return spec.includes('project manager') && !spec.includes('product');
  });

  const getActionButtons = (project: Project) => {
    const buttons: React.ReactElement[] = [];

    switch (project.status) {
      case 'defined':
        buttons.push(
          <button
            key="start"
            onClick={() => handleAction(project.id, 'start')}
            className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
          >
            🚀 Start
          </button>
        );
        break;
      case 'in_progress':
        buttons.push(
          <button
            key="pause"
            onClick={() => handleAction(project.id, 'pause')}
            className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-sm hover:bg-amber-500/30 transition-colors"
          >
            ⏸️ Pause
          </button>,
          <button
            key="complete"
            onClick={() => handleAction(project.id, 'complete')}
            className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-sm hover:bg-purple-500/30 transition-colors"
          >
            ✅ Complete
          </button>
        );
        break;
      case 'paused':
        buttons.push(
          <button
            key="resume"
            onClick={() => handleAction(project.id, 'resume')}
            className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
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
          onClick={() => handleAction(project.id, 'cancel')}
          className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
        >
          ❌ Cancel
        </button>
      );
    }

    return buttons;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-white/60">Loading projects...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-8 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text truncate">
              📁 Projects
            </h1>
            <p className="text-white/50 text-xs sm:text-sm hidden md:block">
              Define, plan, and manage projects from inception to delivery
            </p>
          </div>

          {session && <UserMenu session={session} />}
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            {/* New Project Button - First */}
            <button
              onClick={openCreateModal}
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg sm:rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105 active:scale-95 text-xs sm:text-sm"
            >
              <span className="text-base sm:text-lg group-hover:rotate-90 transition-transform duration-200">+</span>
              <span className="hidden sm:inline">New Project</span>
            </button>

            <Link
              href="/"
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium hover:bg-white/20 hover:scale-105 active:scale-95 text-xs sm:text-sm transition-all border border-white/10"
            >
              <span className="text-base sm:text-lg">📋</span>
              <span className="hidden sm:inline">Tasks</span>
            </Link>

            <Link
              href="/agents"
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium hover:bg-white/20 hover:scale-105 active:scale-95 text-xs sm:text-sm transition-all border border-white/10"
            >
              <span className="text-base sm:text-lg">🤖</span>
              <span className="hidden sm:inline">Agents</span>
            </Link>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2 py-1 text-xs rounded-lg transition-colors whitespace-nowrap ${
                filterStatus === 'all' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'
              }`}
            >
              All ({projects.length})
            </button>
            {(Object.keys(STATUS_CONFIG) as ProjectStatus[]).map((s) => {
              const count = projects.filter(p => p.status === s).length;
              if (count === 0) return null;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors whitespace-nowrap ${
                    filterStatus === s ? STATUS_CONFIG[s].bgColor + ' ' + STATUS_CONFIG[s].color : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  {STATUS_CONFIG[s].emoji} {count}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredProjects.map((project) => {
          const statusConfig = STATUS_CONFIG[project.status];
          const progress = project.task_count > 0
            ? Math.round((project.completed_task_count / project.task_count) * 100)
            : 0;

          return (
            <div
              key={project.id}
              className="glass rounded-xl p-4 sm:p-5 animate-fade-in transition-all hover:scale-[1.01]"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-lg text-xs ${statusConfig.bgColor} ${statusConfig.color}`}>
                      {statusConfig.emoji} {statusConfig.label}
                    </span>
                    {project.deadline && (
                      <span className="text-xs text-white/40">
                        📅 {new Date(project.deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-white/30 font-mono mb-0.5">#{project.id.slice(0, 8)}</div>
                  <h3 className="font-semibold text-white text-lg truncate">{project.title}</h3>
                  {project.description && (
                    <p className="text-sm text-white/50 line-clamp-2 mt-1">{project.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEditModal(project)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    title="Edit project"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                    title="Delete project"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {project.task_count > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                    <span>Progress</span>
                    <span>{project.completed_task_count}/{project.task_count} tasks ({progress}%)</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Meta Info */}
              <div className="flex flex-wrap gap-2 mb-4 text-xs text-white/40">
                {project.tech_stack && (
                  <span className="px-2 py-1 bg-white/5 rounded-lg">🛠️ {project.tech_stack}</span>
                )}
                {project.timeline && (
                  <span className="px-2 py-1 bg-white/5 rounded-lg">⏱️ {project.timeline}</span>
                )}
                <span className="px-2 py-1 bg-white/5 rounded-lg">👤 {project.owner}</span>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-3 border-t border-white/10">
                {getActionButtons(project)}
                <Link
                  href={`/projects/${project.id}`}
                  className="px-3 py-1.5 bg-white/10 text-white/70 rounded-lg text-sm hover:bg-white/20 transition-colors"
                >
                  📄 View Details
                </Link>
              </div>
            </div>
          );
        })}

        {filteredProjects.length === 0 && (
          <div className="col-span-full text-center py-12 text-white/40">
            <p className="text-4xl mb-4">📁</p>
            <p>No projects found. Create your first project!</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="mb-4">
              {editingProject && (
                <div className="text-xs text-white/40 font-mono mb-1">#{editingProject.id.slice(0, 8)}</div>
              )}
              <h2 className="text-xl font-bold text-white">
                {editingProject ? 'Edit Project' : 'Create New Project'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Project Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      title: newTitle,
                      // Auto-update repo name if user hasn't manually changed it
                      github_repo_name: prev.github_repo_name === slugify(prev.title) || prev.github_repo_name === ''
                        ? slugify(newTitle)
                        : prev.github_repo_name,
                    }));
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  placeholder="e.g., Task Management System v2"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="High-level description of the project..."
                  rows={3}
                />
              </div>

              {/* Team Section */}
              <div>
                <label className="block text-sm text-white/50 mb-2 uppercase tracking-wider text-xs font-medium">Team</label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Product Manager */}
                  <div>
                    <label className="block text-sm text-white/70 mb-1">Product Manager</label>
                    <select
                      value={formData.product_manager}
                      onChange={(e) => setFormData({ ...formData, product_manager: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                    >
                      {productManagerAgents.length > 0 ? (
                        productManagerAgents.map(a => (
                          <option key={a.id} value={a.name} className="bg-gray-900">
                            {a.avatar_emoji} {a.name}
                          </option>
                        ))
                      ) : (
                        <option value="Sam" className="bg-gray-900">📋 Sam</option>
                      )}
                    </select>
                  </div>

                  {/* Project Manager */}
                  <div>
                    <label className="block text-sm text-white/70 mb-1">Project Manager</label>
                    <select
                      value={formData.project_manager}
                      onChange={(e) => setFormData({ ...formData, project_manager: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                    >
                      {projectManagerAgents.length > 0 ? (
                        projectManagerAgents.map(a => (
                          <option key={a.id} value={a.name} className="bg-gray-900">
                            {a.avatar_emoji} {a.name}
                          </option>
                        ))
                      ) : (
                        <option value="Taylor" className="bg-gray-900">📊 Taylor</option>
                      )}
                    </select>
                  </div>

                  {/* Reviewer */}
                  <div>
                    <label className="block text-sm text-white/70 mb-1">Reviewer</label>
                    <select
                      value={formData.reviewer}
                      onChange={(e) => setFormData({ ...formData, reviewer: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                    >
                      {agents.length > 0 ? (
                        agents.map(a => (
                          <option key={a.id} value={a.name} className="bg-gray-900">
                            {a.avatar_emoji} {a.name}
                          </option>
                        ))
                      ) : (
                        <option value="Simon" className="bg-gray-900">🤖 Simon</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Deadline */}
                <div>
                  <label className="block text-sm text-white/70 mb-1">Deadline</label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                {/* Tech Stack */}
                <div>
                  <label className="block text-sm text-white/70 mb-1">Tech Stack</label>
                  <input
                    type="text"
                    value={formData.tech_stack}
                    onChange={(e) => setFormData({ ...formData, tech_stack: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                    placeholder="e.g., Next.js, PostgreSQL"
                  />
                </div>
              </div>

              {/* Goals */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Goals & Objectives</label>
                <textarea
                  value={formData.goals}
                  onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="What are the main goals of this project?"
                  rows={2}
                />
              </div>

              {/* Timeline */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Timeline</label>
                <input
                  type="text"
                  value={formData.timeline}
                  onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  placeholder="e.g., 2 weeks, Q1 2025"
                />
              </div>

              {/* Requirements */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Requirements</label>
                <textarea
                  value={formData.requirements}
                  onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="Key requirements and features..."
                  rows={3}
                />
              </div>

              {/* Constraints */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Constraints</label>
                <textarea
                  value={formData.constraints}
                  onChange={(e) => setFormData({ ...formData, constraints: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="Any limitations, budget constraints, or technical constraints..."
                  rows={2}
                />
              </div>

              {/* Deployment & Integrations Section */}
              <div className="border-t border-white/10 pt-4">
                <label className="block text-sm text-white/50 mb-3 uppercase tracking-wider text-xs font-medium">Deployment & Integrations</label>

                {/* Railway Toggle */}
                <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🚂</span>
                      <span className="text-sm text-white">Deploy to Railway</span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.deploy_to_railway}
                        onChange={(e) => setFormData({ ...formData, deploy_to_railway: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/50 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
                    </div>
                  </label>
                  {formData.deploy_to_railway && (
                    <div className="mt-2 text-xs">
                      {integrations?.railway?.connected ? (
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          Connected{integrations.railway.account?.name ? ` (${integrations.railway.account.name})` : ''}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                          Not connected —{' '}
                          <a
                            href="/profile/integrations"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-300"
                          >
                            Connect Railway
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* GitHub Toggle */}
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🐙</span>
                      <span className="text-sm text-white">Push to GitHub</span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.push_to_github}
                        onChange={(e) => setFormData({ ...formData, push_to_github: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/50 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
                    </div>
                  </label>
                  {formData.push_to_github && (
                    <div className="mt-2">
                      {integrations?.github?.connected ? (
                        <>
                          <div className="flex items-center gap-1.5 text-emerald-400 text-xs mb-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            Connected as {integrations.github.username}
                          </div>
                          <input
                            type="text"
                            value={formData.github_repo_name}
                            onChange={(e) => setFormData({ ...formData, github_repo_name: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                            placeholder="repository-name"
                          />
                          {formData.github_repo_name && integrations.github.username && (
                            <p className="text-xs text-white/30 mt-1">
                              {integrations.github.username}/{formData.github_repo_name}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-400 text-xs">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                          Not connected —{' '}
                          <a
                            href="/profile/integrations"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-300"
                          >
                            Connect GitHub
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-white/10">
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
                  {editingProject ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
