'use client';

import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Task, WatcherConfig } from '@/lib/db';
import Column from './Column';
import TaskModal from './TaskModal';
import TaskDetailModal from './TaskDetailModal';
import MetricsPanel from './MetricsPanel';
import ConfirmModal from './ConfirmModal';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

const columns = [
  { id: 'todo', title: 'To Do', icon: '📋', gradient: 'from-slate-500 to-slate-600' },
  { id: 'in_progress', title: 'In Progress', icon: '⚡', gradient: 'from-blue-500 to-indigo-600' },
  { id: 'testing', title: 'Testing', icon: '🧪', gradient: 'from-purple-500 to-violet-600' },
  { id: 'in_review', title: 'In Review', icon: '👀', gradient: 'from-amber-500 to-orange-600' },
  { id: 'done', title: 'Done', icon: '✅', gradient: 'from-emerald-500 to-teal-600' },
];

// Sort by updated_at in descending order (most recent first)
const sortByUpdatedAt = (tasks: Task[]): Task[] => {
  return [...tasks].sort((a, b) => {
    const aDate = new Date(a.updated_at || a.created_at).getTime();
    const bDate = new Date(b.updated_at || b.created_at).getTime();
    return bDate - aDate; // Descending order (most recent first)
  });
};

// Deep equality check for tasks to avoid unnecessary re-renders
// Compare user-visible task fields only (exclude updated_at to prevent timestamp-induced flicker)
const tasksAreEqual = (a: Task, b: Task): boolean => {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.description === b.description &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.assignee === b.assignee &&
    a.due_date === b.due_date &&
    a.estimated_hours === b.estimated_hours &&
    a.time_spent === b.time_spent &&
    a.progress === b.progress &&
    a.is_blocked === b.is_blocked &&
    a.blocked_reason === b.blocked_reason &&
    a.project_id === b.project_id &&
    a.agent_context === b.agent_context
  );
};

// Smart merge: only update tasks that actually changed
const mergeTaskUpdates = (currentTasks: Task[], newTasks: Task[]): Task[] => {
  // Quick check: if lengths differ, something definitely changed
  if (currentTasks.length !== newTasks.length) {
    return newTasks;
  }
  
  // Build a map of current tasks by ID
  const currentMap = new Map(currentTasks.map(t => [t.id, t]));
  
  // Check if any task has actually changed
  let hasChanges = false;
  const merged = newTasks.map(newTask => {
    const currentTask = currentMap.get(newTask.id);
    if (!currentTask) {
      // New task added
      hasChanges = true;
      return newTask;
    }
    if (tasksAreEqual(currentTask, newTask)) {
      // No change - keep the current reference to prevent re-render
      return currentTask;
    }
    // Task changed
    hasChanges = true;
    return newTask;
  });
  
  // If nothing changed, return the original array to maintain reference equality
  return hasChanges ? merged : currentTasks;
};

// Interactive Live Indicator toggle - controls SSE updates
interface LiveIndicatorProps {
  enabled: boolean;
  onToggle: () => void;
}

const LiveIndicator = ({ enabled, onToggle }: LiveIndicatorProps) => (
  <button
    onClick={onToggle}
    className={`group flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-medium transition-all text-xs sm:text-sm ${
      enabled
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70'
    }`}
    title={enabled ? 'Live updates enabled - click to disable' : 'Live updates disabled - click to enable'}
  >
    {enabled ? (
      <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500"></span>
      </span>
    ) : (
      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 bg-white/30" />
    )}
    <span className="hidden sm:inline">{enabled ? 'Live On' : 'Live Off'}</span>
    <span className="sm:hidden">{enabled ? 'Live' : 'Off'}</span>
  </button>
);

// Project name lookup type
interface Project {
  id: string;
  title: string;
}

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Map<string, string>>(new Map()); // id -> title
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [watcherConfig, setWatcherConfig] = useState<WatcherConfig | null>(null);
  const [togglingWatcher, setTogglingWatcher] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [sseEnabled, setSseEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; taskId: string | null; taskTitle: string }>({ isOpen: false, taskId: null, taskTitle: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const { data: session } = useSession();

  // Filter tasks based on search query (matches title, project name, or task ID)
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const query = searchQuery.toLowerCase().trim();
    return tasks.filter(task => {
      const titleMatch = task.title.toLowerCase().includes(query);
      const projectName = task.project_id ? projects.get(task.project_id) : '';
      const projectMatch = projectName?.toLowerCase().includes(query);
      const idMatch = task.id.toLowerCase().includes(query);
      return titleMatch || projectMatch || idMatch;
    });
  }, [tasks, searchQuery, projects]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Handle realtime task updates - smart diff/merge to prevent flicker
  const handleTasksUpdate = useCallback((newTasks: Task[]) => {
    setTasks(currentTasks => {
      // If dragging, preserve the dragged task's local status
      let tasksToMerge = newTasks;
      if (activeId) {
        const draggedTask = currentTasks.find(t => t.id === activeId);
        if (draggedTask) {
          tasksToMerge = newTasks.map(t => 
            t.id === activeId ? { ...t, status: draggedTask.status } : t
          );
        }
      }
      // Smart merge: only update tasks that actually changed
      return mergeTaskUpdates(currentTasks, tasksToMerge);
    });
    setLoading(false);
    
    // Update detail task if it's open (only if task actually changed)
    setDetailTask(current => {
      if (!current) return null;
      const updated = newTasks.find(t => t.id === current.id);
      if (!updated) return current;
      // Only update if the task actually changed
      return tasksAreEqual(current, updated) ? current : updated;
    });
  }, [activeId]);

  // Handle watcher config updates
  const handleWatcherUpdate = useCallback((watcher: WatcherConfig) => {
    setWatcherConfig(watcher);
  }, []);

  // Real-time updates via SSE
  useRealtimeUpdates({
    onTasksUpdate: handleTasksUpdate,
    onWatcherUpdate: handleWatcherUpdate,
    onConnect: () => setIsConnected(true),
    onDisconnect: () => setIsConnected(false),
    enabled: sseEnabled,
  });

  // Initial data fetch as fallback (SSE will take over once connected)
  useEffect(() => {
    fetchTasks();
    fetchWatcherConfig();
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data: Project[] = await res.json();
      setProjects(new Map(data.map(p => [p.id, p.title])));
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchWatcherConfig = async () => {
    try {
      const res = await fetch('/api/watcher');
      const data = await res.json();
      setWatcherConfig(data);
    } catch (error) {
      console.error('Error fetching watcher config:', error);
    }
  };

  const toggleWatcher = async () => {
    setTogglingWatcher(true);
    try {
      const res = await fetch('/api/watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle' }),
      });
      const data = await res.json();
      setWatcherConfig(data);
    } catch (error) {
      console.error('Error toggling watcher:', error);
    } finally {
      setTogglingWatcher(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    const overId = over.id as string;
    
    const overColumn = columns.find(c => c.id === overId);
    if (overColumn && activeTask.status !== overId) {
      setTasks(prev => prev.map(t => 
        t.id === activeTask.id ? { ...t, status: overId as Task['status'] } : t
      ));
    }
    
    const overTask = tasks.find(t => t.id === overId);
    if (overTask && activeTask.status !== overTask.status) {
      setTasks(prev => prev.map(t => 
        t.id === activeTask.id ? { ...t, status: overTask.status } : t
      ));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (!over) return;

    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    try {
      await fetch(`/api/tasks/${activeTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: activeTask.status }),
      });
    } catch (error) {
      console.error('Error updating task:', error);
      fetchTasks();
    }
  };

  const handleCreateTask = async (taskData: Partial<Task>) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      const newTask = await res.json();
      setTasks(prev => [newTask, ...prev]);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const handleEditTask = async (taskData: Partial<Task>) => {
    if (!taskData.id) return;
    try {
      const res = await fetch(`/api/tasks/${taskData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      const updatedTask = await res.json();
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const openDeleteConfirm = (id: string) => {
    const task = tasks.find(t => t.id === id);
    setDeleteConfirm({ isOpen: true, taskId: id, taskTitle: task?.title || 'this task' });
  };

  const handleDeleteTask = async () => {
    if (!deleteConfirm.taskId) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/tasks/${deleteConfirm.taskId}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== deleteConfirm.taskId));
      // Close detail modal if deleting the viewed task
      if (detailTask?.id === deleteConfirm.taskId) {
        setIsDetailOpen(false);
        setDetailTask(null);
      }
      setDeleteConfirm({ isOpen: false, taskId: null, taskTitle: '' });
    } catch (error) {
      console.error('Error deleting task:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const openDetailModal = (task: Task) => {
    setDetailTask(task);
    setIsDetailOpen(true);
  };

  const handleTaskUpdate = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setDetailTask(updatedTask);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-white/60">Loading tasks...</span>
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
          {/* Title */}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text truncate">
              Simon Task Tracker
            </h1>
            <p className="text-white/50 text-xs sm:text-sm hidden md:block">
              Drag tasks between columns to update their status
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
        
        {/* Row 2: New Task + Agents left, Search + Live + Watcher right */}
        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            {/* New Task Button */}
            <button
              onClick={openCreateModal}
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg sm:rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105 active:scale-95 text-xs sm:text-sm"
            >
              <span className="text-base sm:text-lg group-hover:rotate-90 transition-transform duration-200">+</span>
              <span className="hidden sm:inline">New Task</span>
            </button>
            
            {/* Projects Button */}
            <a
              href="/projects"
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium hover:bg-white/20 hover:scale-105 active:scale-95 text-xs sm:text-sm transition-all border border-white/10"
            >
              <span className="text-base sm:text-lg">📁</span>
              <span className="hidden sm:inline">Projects</span>
            </a>
            
            {/* Agents Button */}
            <a
              href="/agents"
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium hover:bg-white/20 hover:scale-105 active:scale-95 text-xs sm:text-sm transition-all border border-white/10"
            >
              <span className="text-base sm:text-lg">🤖</span>
              <span className="hidden sm:inline">Agents</span>
            </a>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search Bar - Hidden on mobile, visible on md+ */}
            <div className="relative hidden md:block">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search tasks or projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-80 lg:w-[420px] pl-9 pr-7 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/8 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-white/40 hover:text-white/70 transition-colors"
                  title="Clear search"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* Mobile Search Toggle Button */}
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`md:hidden flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                isSearchOpen || searchQuery
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70'
              }`}
              title="Search"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            
            {/* Live Updates Toggle */}
            <LiveIndicator enabled={sseEnabled} onToggle={() => setSseEnabled(!sseEnabled)} />
            
            {/* Watcher Toggle */}
            <button
              onClick={toggleWatcher}
              disabled={togglingWatcher}
              className={`group flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-medium transition-all text-xs sm:text-sm ${
                watcherConfig?.is_running
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                  : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70'
              }`}
              title={watcherConfig?.is_running ? 'Watcher is running - click to pause' : 'Watcher is paused - click to start'}
            >
              {togglingWatcher ? (
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : watcherConfig?.is_running ? (
                <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500"></span>
                </span>
              ) : (
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 bg-white/30" />
              )}
              <span className="hidden sm:inline">{watcherConfig?.is_running ? 'Watcher On' : 'Watcher Off'}</span>
              <span className="sm:hidden">{watcherConfig?.is_running ? 'Watch' : 'Off'}</span>
            </button>
          </div>
        </div>
        
        {/* Mobile Search Bar - Expandable row below controls */}
        {isSearchOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-white/10 animate-fade-in">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search tasks or projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/8 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/40 hover:text-white/70 transition-colors"
                  title="Clear search"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Board - horizontal scroll with snap on mobile */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible pb-4 -mx-3 px-3 sm:mx-0 sm:px-0 snap-x snap-mandatory sm:snap-none scrollbar-hide w-full">
          {columns.map((column, index) => (
            <div key={column.id} className="animate-fade-in snap-start flex-shrink-0 sm:flex-shrink sm:flex-1 sm:min-w-0 self-stretch" style={{ animationDelay: `${index * 100}ms` }}>
              <Column
                id={column.id}
                title={column.title}
                icon={column.icon}
                gradient={column.gradient}
                tasks={sortByUpdatedAt(filteredTasks.filter(t => t.status === column.id))}
                onEditTask={openEditModal}
                onDeleteTask={openDeleteConfirm}
                onViewTask={openDetailModal}
                activeTaskIds={watcherConfig?.active_task_ids ? JSON.parse(watcherConfig.active_task_ids) : []}
                projectNames={projects}
              />
            </div>
          ))}
        </div>
      </DndContext>

      {/* Metrics Panel */}
      <MetricsPanel />

      <TaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={editingTask ? handleEditTask : handleCreateTask}
        task={editingTask}
      />

      <TaskDetailModal
        task={detailTask}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onUpdate={handleTaskUpdate}
        onDelete={openDeleteConfirm}
        isActive={detailTask ? (JSON.parse(watcherConfig?.active_task_ids || '[]') as string[]).includes(detailTask.id) : false}
        projectName={(detailTask?.project_id && projects.get(detailTask.project_id)) || "General Task"}
      />

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, taskId: null, taskTitle: '' })}
        onConfirm={handleDeleteTask}
        title="Delete Task"
        message={`Are you sure you want to delete "${deleteConfirm.taskTitle}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
}
