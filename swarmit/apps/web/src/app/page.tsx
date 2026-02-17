'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  MessageSquare,
  ShieldAlert,
  X,
  ChevronDown,
  Terminal,
  FileText,
  Loader2,
  GripVertical,
  Send,
  Trash2,
} from 'lucide-react';
import { api, type Task, type TaskComment, type TaskLog } from '@/lib/api';
import {
  useTaskUpdates,
  useTaskLogs,
  type TaskLogEvent,
} from '@/hooks/useSocket';
import ConfirmDialog from '@/components/ConfirmDialog';

// ─── Constants ──────────────────────────────────────────────

const COLUMNS: { id: Task['status']; label: string }[] = [
  { id: 'TODO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'TESTING', label: 'Testing' },
  { id: 'IN_REVIEW', label: 'In Review' },
  { id: 'DONE', label: 'Done' },
];

const PRIORITY_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-zinc-700 text-zinc-300',
  1: 'bg-blue-500/20 text-blue-400',
  2: 'bg-yellow-500/20 text-yellow-400',
  3: 'bg-red-500/20 text-red-400',
};

const COLUMN_ACCENT: Record<Task['status'], string> = {
  TODO: 'border-t-zinc-500',
  IN_PROGRESS: 'border-t-blue-500',
  TESTING: 'border-t-purple-500',
  IN_REVIEW: 'border-t-yellow-500',
  DONE: 'border-t-green-500',
};

// ─── Sortable Task Card ─────────────────────────────────────

function SortableTaskCard({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskCard task={task} onClick={onClick} dragListeners={listeners} />
    </div>
  );
}

// ─── Task Card (shared between list + overlay) ──────────────

function TaskCard({
  task,
  onClick,
  dragListeners,
}: {
  task: Task;
  onClick: () => void;
  dragListeners?: Record<string, unknown>;
}) {
  const commentCount = task._count?.comments ?? 0;

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-pointer hover:border-zinc-600 transition-colors group"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          className="mt-0.5 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          {...dragListeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <p className="text-sm font-medium text-zinc-100 truncate">
            {task.title}
          </p>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {/* Priority */}
            <span
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[0]}`}
            >
              {PRIORITY_LABELS[task.priority] ?? 'P' + task.priority}
            </span>

            {/* Blocked */}
            {task.isBlocked && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-500/20 text-red-400">
                <ShieldAlert className="w-3 h-3" />
                Blocked
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500">
            {task.assignee && (
              <span className="truncate max-w-[100px]">
                {task.assignee.name}
              </span>
            )}
            {task.project && (
              <span className="truncate max-w-[100px] text-zinc-600">
                {task.project.title}
              </span>
            )}
            {commentCount > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                <MessageSquare className="w-3 h-3" />
                {commentCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Droppable Column ───────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  onTaskClick,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  return (
    <div
      className={`flex flex-col bg-zinc-950 border border-zinc-800 border-t-2 ${COLUMN_ACCENT[column.id]} rounded-lg min-w-[280px] w-[280px] shrink-0`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-300">
            {column.label}
          </h2>
          <span className="text-xs text-zinc-600 bg-zinc-800 rounded-full px-2 py-0.5">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
        {tasks.map((task) => (
          <SortableTaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Create Task Form ───────────────────────────────────────

function CreateTaskForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(0);
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await api.tasks.create({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">New Task</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Priority
            </label>
            <div className="relative">
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>None</option>
                <option value={1}>Low</option>
                <option value={2}>Medium</option>
                <option value={3}>High</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors"
          >
            {creating ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Task Detail Panel ──────────────────────────────────────

function TaskDetailPanel({
  task,
  onClose,
  onUpdated,
}: {
  task: Task;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'logs'>('details');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [liveLogs, setLiveLogs] = useState<TaskLogEvent[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [fullTask, setFullTask] = useState<Task>(task);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Fetch full task detail
  useEffect(() => {
    let cancelled = false;
    api.tasks.get(task.id).then((t) => {
      if (!cancelled) {
        setFullTask(t);
        // Populate comments from backend
        if (t.comments) setComments(t.comments);
      }
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [task.id]);

  // Keep title in sync
  useEffect(() => {
    setTitleValue(fullTask.title);
  }, [fullTask.title]);

  // Determine which run to show logs for:
  // 1. User-selected run, 2. currentRunId (active run), 3. most recent completed run
  const availableRuns = fullTask.runs ?? [];
  const effectiveRunId = selectedRunId
    ?? fullTask.currentRunId
    ?? availableRuns[0]?.id
    ?? null;

  // Fetch logs for the effective run
  useEffect(() => {
    if (activeTab !== 'logs') return;
    if (!effectiveRunId) return;
    setLoadingLogs(true);
    setLogs([]);
    api.tasks
      .getRunLogs(fullTask.id, effectiveRunId)
      .then((data) => {
        setLogs(data);
      })
      .catch(console.error)
      .finally(() => setLoadingLogs(false));
  }, [activeTab, fullTask.id, effectiveRunId]);

  // Real-time log streaming
  const handleLogEvent = useCallback((event: TaskLogEvent) => {
    setLiveLogs((prev) => [...prev, event]);
  }, []);

  // Only subscribe to live logs when viewing the current active run
  const isLiveRun = fullTask.currentRunId && effectiveRunId === fullTask.currentRunId;
  useTaskLogs(activeTab === 'logs' && isLiveRun ? task.id : null, handleLogEvent);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, liveLogs]);

  // Save title on blur / enter
  const saveTitle = async () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue.trim() !== fullTask.title) {
      try {
        await api.tasks.update(fullTask.id, { title: titleValue.trim() });
        onUpdated();
      } catch (err) {
        console.error('Failed to update title:', err);
        setTitleValue(fullTask.title);
      }
    } else {
      setTitleValue(fullTask.title);
    }
  };

  // Add comment
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setAddingComment(true);
    try {
      const comment = await api.tasks.addComment(fullTask.id, {
        author: 'User',
        content: newComment.trim(),
      });
      setComments((prev) => [...prev, comment]);
      setNewComment('');
      onUpdated();
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setAddingComment(false);
    }
  };

  // Change status
  const handleStatusChange = async (status: string) => {
    try {
      await api.tasks.update(fullTask.id, { status });
      setFullTask((prev) => ({ ...prev, status: status as Task['status'] }));
      onUpdated();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Delete task
  const handleDeleteConfirm = async () => {
    try {
      await api.tasks.delete(fullTask.id);
      onClose();
      onUpdated();
    } catch (err) {
      console.error('Failed to delete task:', err);
    } finally {
      setConfirmDelete(false);
    }
  };

  // Change priority
  const handlePriorityChange = async (priority: number) => {
    try {
      await api.tasks.update(fullTask.id, { priority });
      setFullTask((prev) => ({ ...prev, priority }));
      onUpdated();
    } catch (err) {
      console.error('Failed to update priority:', err);
    }
  };

  const allLogs = [
    ...logs.map((l) => ({
      stream: l.stream,
      content: l.content,
      timestamp: l.createdAt,
    })),
    ...liveLogs.map((l) => ({
      stream: l.stream,
      content: l.content,
      timestamp: l.timestamp,
    })),
  ];

  const streamColor: Record<string, string> = {
    stdout: 'text-zinc-300',
    stderr: 'text-red-400',
    system: 'text-blue-400',
    tool: 'text-yellow-400',
    assistant: 'text-green-400',
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-zinc-950 border-l border-zinc-800 h-full overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex-1 min-w-0 mr-3">
            {editingTitle ? (
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') {
                    setTitleValue(fullTask.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                className="w-full text-lg font-semibold text-white bg-transparent border-b border-blue-500 focus:outline-none pb-0.5"
              />
            ) : (
              <h2
                className="text-lg font-semibold text-white truncate cursor-pointer hover:text-blue-400 transition-colors"
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
              >
                {fullTask.title}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Metadata bar */}
        <div className="px-5 py-3 border-b border-zinc-800 shrink-0">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {/* Status */}
            <div>
              <span className="text-zinc-500 text-xs block mb-1">Status</span>
              <div className="relative">
                <select
                  value={fullTask.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
              </div>
            </div>

            {/* Priority */}
            <div>
              <span className="text-zinc-500 text-xs block mb-1">
                Priority
              </span>
              <div className="relative">
                <select
                  value={fullTask.priority}
                  onChange={(e) =>
                    handlePriorityChange(Number(e.target.value))
                  }
                  className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={0}>None</option>
                  <option value={1}>Low</option>
                  <option value={2}>Medium</option>
                  <option value={3}>High</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
              </div>
            </div>

            {/* Assignee */}
            <div>
              <span className="text-zinc-500 text-xs block mb-1">
                Assignee
              </span>
              <span className="text-zinc-300 text-xs">
                {fullTask.assignee?.name ?? 'Unassigned'}
              </span>
            </div>

            {/* Project */}
            <div>
              <span className="text-zinc-500 text-xs block mb-1">Project</span>
              <span className="text-zinc-300 text-xs">
                {fullTask.project?.title ?? 'None'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 shrink-0">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'details'
                ? 'text-white border-blue-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            Details
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'logs'
                ? 'text-white border-blue-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Logs
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'details' ? (
            <div className="p-5 space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Description
                </h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                  {fullTask.description || (
                    <span className="text-zinc-600 italic">
                      No description
                    </span>
                  )}
                </p>
              </div>

              {/* Dependencies */}
              {fullTask.dependsOn && fullTask.dependsOn.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Dependencies
                  </h3>
                  <div className="space-y-1.5">
                    {fullTask.dependsOn.map((dep) => (
                      <div
                        key={dep.dependsOn.id}
                        className="flex items-center gap-2 text-sm px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            dep.dependsOn.status === 'DONE'
                              ? 'bg-green-500'
                              : 'bg-zinc-500'
                          }`}
                        />
                        <span className="text-zinc-300 truncate">
                          {dep.dependsOn.title}
                        </span>
                        <span className="text-xs text-zinc-600 ml-auto shrink-0">
                          {dep.dependsOn.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blocked badge */}
              {fullTask.isBlocked && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  This task is blocked by unfinished dependencies
                </div>
              )}

              {/* Comments */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Comments
                </h3>

                {comments.length === 0 && (
                  <p className="text-sm text-zinc-600 italic mb-3">
                    No comments yet
                  </p>
                )}

                <div className="space-y-3 mb-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-zinc-300">
                          {comment.author}
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400 whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Add comment form */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={addingComment || !newComment.trim()}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Logs tab */
            <div className="flex flex-col h-full">
              {/* Run selector */}
              {availableRuns.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 shrink-0">
                  <span className="text-xs text-zinc-500">Run:</span>
                  <div className="relative flex-1">
                    <select
                      value={effectiveRunId ?? ''}
                      onChange={(e) => {
                        setSelectedRunId(e.target.value || null);
                        setLiveLogs([]);
                      }}
                      className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {availableRuns.map((run) => (
                        <option key={run.id} value={run.id}>
                          {run.agentType} — {run.status.toLowerCase()} — {new Date(run.createdAt).toLocaleString()}
                          {run.id === fullTask.currentRunId ? ' (live)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                  </div>
                  {isLiveRun && (
                    <span className="flex items-center gap-1 text-[10px] text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
              )}

              {loadingLogs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : !effectiveRunId ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-zinc-600 italic">
                    No runs yet for this task
                  </p>
                </div>
              ) : allLogs.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-zinc-600 italic">
                    No log output yet
                  </p>
                </div>
              ) : (
                <div className="font-mono text-xs p-4 space-y-0.5 bg-zinc-950">
                  {allLogs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-zinc-700 shrink-0 select-none w-[70px] text-right">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={
                          streamColor[log.stream] ?? 'text-zinc-400'
                        }
                      >
                        {log.content}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDeleteConfirm}
          title="Delete Task"
          message={`Delete "${fullTask.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
        />
      </div>
    </div>
  );
}

// ─── Main Kanban Page ───────────────────────────────────────

export default function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const data = await api.tasks.list({ limit: 100 });
      setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Real-time updates
  const handleTaskUpdate = useCallback(() => {
    fetchTasks();
  }, [fetchTasks]);

  useTaskUpdates(handleTaskUpdate);

  // Group tasks by status
  const tasksByColumn = useMemo(() => {
    const grouped: Record<Task['status'], Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      TESTING: [],
      IN_REVIEW: [],
      DONE: [],
    };
    for (const task of tasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    }
    // Sort by priority desc within each column
    for (const key of Object.keys(grouped) as Task['status'][]) {
      grouped[key].sort((a, b) => b.priority - a.priority);
    }
    return grouped;
  }, [tasks]);

  // DnD sensors — add activation constraint so clicks work
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Find which column a task or column id belongs to
  const findColumnForId = useCallback(
    (id: string): Task['status'] | null => {
      // Is it a column id?
      const col = COLUMNS.find((c) => c.id === id);
      if (col) return col.id;

      // Is it a task id?
      for (const [status, columnTasks] of Object.entries(tasksByColumn)) {
        if (columnTasks.some((t) => t.id === id)) {
          return status as Task['status'];
        }
      }
      return null;
    },
    [tasksByColumn],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (_event: DragOverEvent) => {
      // DragOver tracked for potential visual feedback
    },
    [],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const taskId = String(active.id);
      const targetColumn = findColumnForId(String(over.id));

      if (!targetColumn) return;

      // Find the task's current column
      const currentColumn = findColumnForId(taskId);
      if (!currentColumn || currentColumn === targetColumn) return;

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: targetColumn } : t,
        ),
      );

      // Persist
      try {
        await api.tasks.update(taskId, { status: targetColumn });
      } catch (err) {
        console.error('Failed to update task status:', err);
        // Revert on error
        fetchTasks();
      }
    },
    [findColumnForId, fetchTasks],
  );

  const activeTask = activeId
    ? tasks.find((t) => t.id === activeId) ?? null
    : null;

  // Handle task click from detail panel update
  const handleDetailUpdated = useCallback(() => {
    fetchTasks();
  }, [fetchTasks]);

  if (loading) {
    return (
      <div className="h-full bg-zinc-950 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-[280px] h-[400px] bg-zinc-900 border border-zinc-800 rounded-lg shrink-0"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Kanban Board</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full">
            {COLUMNS.map((column) => (
              <SortableContext
                key={column.id}
                id={column.id}
                items={tasksByColumn[column.id].map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <KanbanColumn
                  column={column}
                  tasks={tasksByColumn[column.id]}
                  onTaskClick={(task) => setSelectedTask(task)}
                />
              </SortableContext>
            ))}
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeTask ? (
              <div className="w-[260px]">
                <TaskCard
                  task={activeTask}
                  onClick={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <CreateTaskForm
          onClose={() => setShowCreate(false)}
          onCreated={fetchTasks}
        />
      )}

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleDetailUpdated}
        />
      )}
    </div>
  );
}
