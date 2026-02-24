'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Calendar,
  ListTodo,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  GitBranch,
} from 'lucide-react';
import { api, type Project, type Task } from '@/lib/api';
import { useProjectUpdates } from '@/hooks/useSocket';
import { StatusBadge, TaskStatusBadge } from '@/components/StatusBadge';
import { ProjectInfoGrid } from '@/components/ProjectInfoGrid';

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [prdOpen, setPrdOpen] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const [proj, taskData] = await Promise.all([
        api.projects.get(id),
        api.tasks.list({ projectId: id, limit: 100 }),
      ]);
      setProject(proj);
      setTasks(taskData.tasks);
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useProjectUpdates(useCallback(() => {
    fetchProject();
  }, [fetchProject]));

  const handleAction = async (action: string) => {
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
        await fn(id);
        await fetchProject();
      }
    } catch (err) {
      console.error(`Failed to ${action} project:`, err);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 bg-zinc-950 min-h-screen">
        <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="h-48 bg-zinc-800 rounded-lg" />
          <div className="h-64 bg-zinc-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4 md:p-8 bg-zinc-950 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <p className="text-zinc-400">Project not found</p>
          <Link href="/projects" className="text-blue-400 hover:underline mt-2 inline-block">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const doneCount = tasks.filter(t => t.status === 'DONE').length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

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
    <div className="p-4 md:p-8 bg-zinc-950 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white truncate">{project.title}</h1>
                <StatusBadge status={project.status} />
              </div>
              {project.description && (
                <p className="text-sm text-zinc-400 mt-1">{project.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <ListTodo className="w-3 h-3" />
                  {totalCount} tasks
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {availableActions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {availableActions.map(action => (
                <button
                  key={action.key}
                  onClick={() => handleAction(action.key)}
                  disabled={acting}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-colors disabled:opacity-50 ${action.color}`}
                >
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-300">Progress</span>
              <span className="text-sm text-zinc-400">{doneCount}/{totalCount} tasks ({progressPct}%)</span>
            </div>
            <div className="h-2.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-600 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Project Info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
          <ProjectInfoGrid project={project} />
        </div>

        {/* PRD */}
        {project.prd && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl mb-6">
            <button
              onClick={() => setPrdOpen(!prdOpen)}
              className="w-full flex items-center justify-between px-5 py-4"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <FileText className="w-4 h-4" />
                PRD
              </span>
              {prdOpen ? (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              )}
            </button>
            {prdOpen && (
              <div className="px-5 pb-5">
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">{project.prd}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tasks table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-zinc-400" />
              Tasks ({totalCount})
            </h2>
          </div>
          {tasks.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-zinc-500 text-sm">No tasks yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Title</th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Assignee</th>
                    <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Deps</th>
                    <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Comments</th>
                    <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Runs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {tasks.map(task => (
                    <tr key={task.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-5 py-3">
                        <span className="text-sm text-zinc-300 truncate block max-w-[300px]">{task.title}</span>
                      </td>
                      <td className="px-5 py-3">
                        <TaskStatusBadge status={task.status} />
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        <span className="text-sm text-zinc-400">{task.assignee?.name ?? '—'}</span>
                      </td>
                      <td className="px-5 py-3 text-right hidden sm:table-cell">
                        {task.dependsOn && task.dependsOn.length > 0 ? (
                          <span className="flex items-center gap-1 justify-end text-sm text-zinc-400">
                            <GitBranch className="w-3.5 h-3.5" />
                            {task.dependsOn.length}
                          </span>
                        ) : (
                          <span className="text-sm text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right hidden sm:table-cell">
                        {task._count?.comments ? (
                          <span className="flex items-center gap-1 justify-end text-sm text-zinc-400">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {task._count.comments}
                          </span>
                        ) : (
                          <span className="text-sm text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right hidden sm:table-cell">
                        <span className="text-sm text-zinc-400">{task._count?.runs ?? 0}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
