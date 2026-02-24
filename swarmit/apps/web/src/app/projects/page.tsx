'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FolderOpen,
  Plus,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Trash2,
  Calendar,
  ListTodo,
  FileText,
  Loader2,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import { api, type Project, type Task } from '@/lib/api';
import { useProjectUpdates } from '@/hooks/useSocket';
import ConfirmDialog from '@/components/ConfirmDialog';
import CreateProjectWizard from '@/components/CreateProjectWizard';
import CreateProjectChat from '@/components/CreateProjectChat';
import { StatusBadge, TaskStatusBadge } from '@/components/StatusBadge';
import { ProjectInfoGrid } from '@/components/ProjectInfoGrid';

interface ProjectDetailProps {
  project: Project;
  onAction: (action: string) => void;
  onDelete: () => void;
  acting: boolean;
}

function ProjectDetail({ project, onAction, onDelete, acting }: ProjectDetailProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchTasks() {
      setLoadingTasks(true);
      try {
        const data = await api.tasks.list({ projectId: project.id, limit: 100 });
        if (!cancelled) setTasks(data.tasks);
      } catch (err) {
        console.error('Failed to fetch project tasks:', err);
      } finally {
        if (!cancelled) setLoadingTasks(false);
      }
    }
    fetchTasks();
    return () => { cancelled = true; };
  }, [project.id]);

  const availableActions: Array<{ key: string; label: string; icon: React.ReactNode; color: string }> = [];

  if (project.status === 'DRAFT' || project.status === 'PLANNING') {
    availableActions.push({ key: 'start', label: 'Start', icon: <Play className="w-4 h-4" />, color: 'bg-green-600 hover:bg-green-700' });
  }
  if (project.status === 'ACTIVE') {
    availableActions.push({ key: 'pause', label: 'Pause', icon: <Pause className="w-4 h-4" />, color: 'bg-yellow-600 hover:bg-yellow-700' });
    availableActions.push({ key: 'complete', label: 'Complete', icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-blue-600 hover:bg-blue-700' });
  }
  if (project.status === 'PAUSED') {
    availableActions.push({ key: 'resume', label: 'Resume', icon: <RotateCcw className="w-4 h-4" />, color: 'bg-green-600 hover:bg-green-700' });
  }
  if (project.status !== 'COMPLETED' && project.status !== 'CANCELLED') {
    availableActions.push({ key: 'cancel', label: 'Cancel', icon: <XCircle className="w-4 h-4" />, color: 'bg-red-600 hover:bg-red-700' });
  }

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800 space-y-4">
      {/* Full description */}
      {project.description && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-1">Description</h4>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      {/* Project Info */}
      <ProjectInfoGrid project={project} />

      {/* PRD */}
      {project.prd && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-1 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            PRD
          </h4>
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 max-h-48 overflow-y-auto">
            <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">{project.prd}</pre>
          </div>
        </div>
      )}

      {/* Tasks */}
      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
          <ListTodo className="w-3.5 h-3.5" />
          Tasks ({loadingTasks ? '...' : tasks.length})
        </h4>
        {loadingTasks ? (
          <div className="animate-pulse space-y-2">
            <div className="h-8 bg-zinc-800 rounded" />
            <div className="h-8 bg-zinc-800 rounded" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tasks yet</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {tasks.map(task => (
              <div
                key={task.id}
                className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700/50 rounded px-3 py-2"
              >
                <span className="text-sm text-zinc-300 truncate flex-1 mr-3">{task.title}</span>
                <TaskStatusBadge status={task.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap pt-2">
        {availableActions.map(action => (
          <button
            key={action.key}
            onClick={() => onAction(action.key)}
            disabled={acting}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-colors disabled:opacity-50 ${action.color}`}
          >
            {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : action.icon}
            {action.label}
          </button>
        ))}
        <button
          onClick={onDelete}
          disabled={acting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50 ml-auto"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [acting, setActing] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.projects.list();
      setProjects(data.projects);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Real-time updates
  useProjectUpdates(
    useCallback(() => {
      fetchProjects();
    }, [fetchProjects]),
  );

  const handleProjectCreated = (project: Project) => {
    setProjects(prev => [project, ...prev]);
    setShowWizard(false);
    setShowChat(false);
    setExpandedId(project.id);
  };

  const handleAction = async (projectId: string, action: string) => {
    setActing(true);
    try {
      const actionMap: Record<string, (id: string) => Promise<unknown>> = {
        start: api.projects.start,
        pause: api.projects.pause,
        resume: api.projects.resume,
        cancel: api.projects.cancel,
        complete: api.projects.complete,
      };
      const fn = actionMap[action];
      if (fn) {
        await fn(projectId);
        await fetchProjects();
      }
    } catch (err) {
      console.error(`Failed to ${action} project:`, err);
    } finally {
      setActing(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    try {
      await api.projects.delete(deleteId);
      setProjects(prev => prev.filter(p => p.id !== deleteId));
      if (expandedId === deleteId) setExpandedId(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 bg-zinc-950 min-h-screen">
        <div className="animate-pulse space-y-4 max-w-6xl mx-auto">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-zinc-800 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-zinc-950 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-zinc-400 mt-1 hidden sm:block">Manage your agent orchestration projects</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChat(true)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors border border-zinc-700"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Create with Chat</span>
            </button>
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Creation modals */}
        {showWizard && (
          <CreateProjectWizard onCreated={handleProjectCreated} onClose={() => setShowWizard(false)} />
        )}
        {showChat && (
          <CreateProjectChat onCreated={handleProjectCreated} onClose={() => setShowChat(false)} />
        )}

        {/* Project cards grid */}
        {projects.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900 border border-zinc-800 rounded-xl">
            <FolderOpen className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 text-lg">No projects yet</p>
            <p className="text-zinc-500 mt-1 text-sm">Create a project to start orchestrating your agents</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => {
              const isExpanded = expandedId === project.id;
              return (
                <div
                  key={project.id}
                  className={`bg-zinc-900 border rounded-xl transition-all ${
                    isExpanded
                      ? 'border-blue-500/50 col-span-1 md:col-span-2 lg:col-span-3'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div
                    className="p-5 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : project.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                          <h3 className="text-base font-semibold text-white truncate">
                            {project.title}
                          </h3>
                          <Link
                            href={`/projects/${project.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Details
                          </Link>
                        </div>
                        {project.description && (
                          <p className="text-sm text-zinc-400 line-clamp-2 ml-6">
                            {project.description}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={project.status} />
                    </div>

                    <div className="flex items-center gap-4 mt-3 ml-6 text-xs text-zinc-500">
                      {project._count && (
                        <span className="flex items-center gap-1">
                          <ListTodo className="w-3 h-3" />
                          {project._count.tasks} tasks
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-5">
                      <ProjectDetail
                        project={project}
                        onAction={(action) => handleAction(project.id, action)}
                        onDelete={() => setDeleteId(project.id)}
                        acting={acting}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <ConfirmDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={handleDeleteConfirm}
          title="Delete Project"
          message="Are you sure you want to delete this project? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
        />
      </div>
    </div>
  );
}
