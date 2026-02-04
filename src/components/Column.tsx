'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task } from '@/lib/db';
import TaskCard from './TaskCard';

const INITIAL_VISIBLE = 6;
const LOAD_MORE_COUNT = 6;

interface ColumnProps {
  id: string;
  title: string;
  icon: string;
  gradient: string;
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onViewTask: (task: Task) => void;
  activeTaskIds?: string[];
  projectNames?: Map<string, string>;
}

export default function Column({ id, title, icon, gradient, tasks, onEditTask, onDeleteTask, onViewTask, activeTaskIds = [], projectNames }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // Reset visible count when tasks change significantly (new column, etc.)
  useEffect(() => {
    // Keep expanded if we have more tasks visible than initial
    if (visibleCount > tasks.length) {
      setVisibleCount(Math.max(INITIAL_VISIBLE, tasks.length));
    }
  }, [tasks.length, visibleCount]);

  const visibleTasks = tasks.slice(0, visibleCount);
  const hasMore = visibleCount < tasks.length;
  const remainingCount = tasks.length - visibleCount;

  // Infinite scroll using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount(prev => Math.min(prev + LOAD_MORE_COUNT, tasks.length));
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const loadMoreEl = loadMoreRef.current;
    if (loadMoreEl && hasMore) {
      observer.observe(loadMoreEl);
    }

    return () => {
      if (loadMoreEl) {
        observer.unobserve(loadMoreEl);
      }
    };
  }, [hasMore, tasks.length]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + LOAD_MORE_COUNT, tasks.length));
  }, [tasks.length]);

  return (
    <div className="flex flex-col h-full w-[85vw] sm:w-full min-w-[280px] sm:min-w-0">
      {/* Column Header */}
      <div className={`bg-gradient-to-r ${gradient} rounded-t-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between shadow-lg`}>
        <div className="flex items-center gap-2">
          <span className="text-lg sm:text-xl">{icon}</span>
          <h2 className="font-semibold text-white text-sm sm:text-base">{title}</h2>
        </div>
        <span className="bg-white/20 backdrop-blur-sm text-white text-xs sm:text-sm px-2 sm:px-2.5 py-0.5 rounded-full font-medium">
          {tasks.length}
        </span>
      </div>
      
      {/* Column Body */}
      <div
        ref={(el) => {
          setNodeRef(el);
          (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        className={`flex-1 glass rounded-b-xl p-2 sm:p-3 space-y-2 sm:space-y-3 min-h-[280px] sm:min-h-[320px] max-h-[50vh] overflow-y-auto transition-all duration-200 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent ${
          isOver ? 'bg-white/[0.06] scale-[1.02]' : ''
        }`}
      >
        <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {visibleTasks.map((task, index) => (
            <div key={task.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(index, 5) * 50}ms` }}>
              <TaskCard
                task={task}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onView={onViewTask}
                isActive={activeTaskIds.includes(task.id)}
                projectName={(task.project_id && projectNames?.get(task.project_id)) || "General Task"}
              />
            </div>
          ))}
        </SortableContext>
        
        {/* Load more trigger / button */}
        {hasMore && (
          <div ref={loadMoreRef} className="pt-2">
            <button
              onClick={handleLoadMore}
              className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/60 hover:text-white/80 text-xs sm:text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
            >
              <span>↓</span>
              <span>Load {Math.min(LOAD_MORE_COUNT, remainingCount)} more ({remainingCount} remaining)</span>
            </button>
          </div>
        )}
        
        {tasks.length === 0 && (
          <div className={`flex flex-col items-center justify-center py-8 sm:py-12 text-white/30 transition-all ${isOver ? 'scale-105 text-white/50' : ''}`}>
            <div className="text-3xl sm:text-4xl mb-2">{isOver ? '📥' : '📭'}</div>
            <span className="text-xs sm:text-sm">{isOver ? 'Drop it here!' : 'No tasks yet'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
