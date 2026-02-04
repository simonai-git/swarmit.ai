'use client';

import { useState, useEffect, memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/db';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onView: (task: Task) => void;
  isActive?: boolean;
  projectName?: string;
}

const priorityConfig = {
  low: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  medium: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' },
  high: { color: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-400' },
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

const defaultAssignee = { color: 'from-slate-500 to-slate-600', emoji: '👤' };
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

// Memoized TaskCard to prevent re-renders when task data hasn't changed
const TaskCard = memo(function TaskCard({ task, onEdit, onDelete, onView, isActive = false, projectName }: TaskCardProps) {
  // Defer overdue check to client-side only to avoid hydration mismatch
  // (server runs in UTC, client runs in user's local time)
  const [isOverdue, setIsOverdue] = useState(false);
  
  useEffect(() => {
    if (task.due_date && task.status !== 'done') {
      setIsOverdue(isDateOverdue(task.due_date));
    } else {
      setIsOverdue(false);
    }
  }, [task.due_date, task.status]);

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
  };

  const priority = priorityConfig[task.priority];
  const assignee = task.assignee ? (assigneeConfig[task.assignee] || defaultAssignee) : unassignedConfig;
  const progress = task.progress || 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onView(task)}
      className={`group relative bg-white/[0.03] hover:bg-white/[0.06] border rounded-xl p-3 sm:p-4 cursor-pointer active:cursor-grabbing transition-all duration-200 touch-manipulation hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/10 ${
        isDragging ? 'opacity-50 scale-105 shadow-2xl shadow-purple-500/20 border-purple-500/30' : ''
      } ${task.is_blocked ? 'border-red-500/30 hover:border-red-500/50 hover:shadow-red-500/10' : isOverdue ? 'border-orange-500/30 hover:border-orange-500/50 hover:shadow-orange-500/10' : 'border-white/[0.06] hover:border-purple-500/30 hover:shadow-purple-500/15'}`}
    >
      {/* Blocked/Overdue indicator */}
      {(task.is_blocked || isOverdue) && (
        <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${task.is_blocked ? 'bg-red-500' : 'bg-orange-500'}`} />
      )}

      {/* Action buttons - always visible on mobile (touch devices), hover on desktop */}
      <div className="absolute top-2.5 sm:top-3 right-8 sm:right-3 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(task);
          }}
          className="p-2 sm:p-1.5 rounded-lg bg-white/10 sm:bg-white/5 hover:bg-white/15 sm:hover:bg-white/10 text-white/60 sm:text-white/40 hover:text-blue-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="p-2 sm:p-1.5 rounded-lg bg-white/10 sm:bg-white/5 hover:bg-red-500/20 text-white/60 sm:text-white/40 hover:text-red-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Task ID */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-white/30 font-mono">#{task.id.slice(0, 8)}</span>
      </div>

      {/* Title with badges */}
      <div className="flex items-start gap-2 pr-20 sm:pr-16 mb-1">
        <h3 className="font-medium text-white flex-1 text-sm sm:text-base">{task.title}</h3>
        {task.is_blocked && (
          <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded flex-shrink-0">BLOCKED</span>
        )}
      </div>
      
      {/* Project name under title */}
      <div className="flex items-center gap-1 mb-2">
        <svg className="w-3 h-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className={`text-xs ${projectName === "General Task" ? "text-white/40 italic" : "text-white/50"}`}>
          {projectName || "General Task"}
        </span>
      </div>
      
      {/* Description */}
      {task.description && (
        <p className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 line-clamp-2">{task.description}</p>
      )}

      {/* Progress bar (if > 0) */}
      {progress > 0 && (
        <div className="mb-2 sm:mb-3">
          <div className="h-1 sm:h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-white/40 mt-1">{progress}%</span>
        </div>
      )}
      
      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
          {/* Priority badge */}
          <span className={`inline-flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border ${priority.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
            <span className="hidden xs:inline">{task.priority}</span>
          </span>
          
          {/* Time estimate */}
          {task.estimated_hours && (
            <span className="text-[10px] sm:text-xs text-white/40">
              {task.time_spent || 0}/{task.estimated_hours}h
            </span>
          )}
          
          {/* Due date */}
          {task.due_date && (
            <span className={`text-[10px] sm:text-xs flex items-center gap-0.5 sm:gap-1 ${isOverdue ? 'text-orange-400' : 'text-white/40'}`}>
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {(() => {
                const [year, month, day] = task.due_date!.split('-').map(Number);
                return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })()}
            </span>
          )}
        </div>
        
        {/* Assignee with active indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="relative">
            <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br ${assignee.color} flex items-center justify-center text-xs sm:text-sm shadow-lg`}>
              {assignee.emoji}
            </div>
            {/* Active work indicator - shows when agent is actively working */}
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5" title="Agent actively working on this task">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-[#0d0d0f]"></span>
              </span>
            )}
          </div>
          <span className="text-[10px] sm:text-xs text-white/50 font-medium">
            {task.assignee || 'Unassigned'}
          </span>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if task data or isActive changes
  const prevTask = prevProps.task;
  const nextTask = nextProps.task;
  
  return (
    prevProps.isActive === nextProps.isActive &&
    prevProps.projectName === nextProps.projectName &&
    prevTask.id === nextTask.id &&
    prevTask.title === nextTask.title &&
    prevTask.description === nextTask.description &&
    prevTask.status === nextTask.status &&
    prevTask.priority === nextTask.priority &&
    prevTask.assignee === nextTask.assignee &&
    prevTask.due_date === nextTask.due_date &&
    prevTask.estimated_hours === nextTask.estimated_hours &&
    prevTask.time_spent === nextTask.time_spent &&
    prevTask.progress === nextTask.progress &&
    prevTask.is_blocked === nextTask.is_blocked &&
    prevTask.updated_at === nextTask.updated_at
  );
});

export default TaskCard;
