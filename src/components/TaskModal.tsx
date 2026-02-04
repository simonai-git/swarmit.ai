'use client';

import { useState, useEffect } from 'react';
import { Task } from '@/lib/db';

interface Agent {
  id: string;
  name: string;
  specialization: string;
  avatar_emoji: string;
  avatar_color: string;
  is_active: boolean;
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  task?: Task | null;
}

// Get today's date as YYYY-MM-DD in local time
function getTodayString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TaskModal({ isOpen, onClose, onSave, task }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);  // Default to unassigned
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Fetch agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch('/api/agents?active=true', {
          headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '' },
        });
        if (res.ok) {
          const data = await res.json();
          setAgents(data);
        }
      } catch (error) {
        console.error('Error fetching agents:', error);
        // Fallback to default agents
        setAgents([
          { id: 'agent-simon', name: 'Simon', specialization: 'Full Stack Developer', avatar_emoji: '🦊', avatar_color: 'from-orange-500 to-amber-500', is_active: true },
          { id: 'agent-bogdan', name: 'Bogdan', specialization: 'Project Manager', avatar_emoji: '👤', avatar_color: 'from-blue-500 to-purple-500', is_active: true },
        ]);
      } finally {
        setLoadingAgents(false);
      }
    };
    fetchAgents();
  }, []);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setAssignee(task.assignee);
      setPriority(task.priority);
      setDueDate(task.due_date || '');
    } else {
      setTitle('');
      setDescription('');
      setAssignee(null);  // Default to unassigned
      setPriority('medium');
      setDueDate('');
    }
  }, [task, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...(task?.id && { id: task.id }),
      title,
      description: description || null,
      assignee: assignee as any,
      priority,
      due_date: dueDate || null,
    });
    onClose();
  };

  const selectedAgent = assignee ? agents.find(a => a.name === assignee) : null;

  return (
    <div className="fixed inset-0 modal-backdrop flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div 
        className="bg-[#1e1e2f]/95 backdrop-blur-xl border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/50 w-full sm:max-w-md animate-slide-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#1e1e2f]/95 backdrop-blur-xl z-10">
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            {task ? '✏️ Edit Task' : '✨ New Task'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 sm:p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:bg-black/40 focus:ring-2 focus:ring-blue-500/20"
              placeholder="What needs to be done?"
            />
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:bg-black/40 focus:ring-2 focus:ring-blue-500/20 resize-none"
              placeholder="Add more details..."
            />
          </div>
          
          {/* Assignee */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Assign to Agent
            </label>
            {loadingAgents ? (
              <div className="flex gap-2">
                <div className="flex-1 h-12 bg-white/5 rounded-xl animate-pulse" />
                <div className="flex-1 h-12 bg-white/5 rounded-xl animate-pulse" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {/* Unassigned option */}
                <button
                  type="button"
                  onClick={() => setAssignee(null)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                    assignee === null
                      ? 'bg-slate-500/20 border-slate-500/50 text-slate-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                  }`}
                >
                  <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-sm">
                    ❓
                  </span>
                  <span className="text-sm font-medium">Unassigned</span>
                </button>
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setAssignee(agent.name)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                      assignee === agent.name
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-lg bg-gradient-to-br ${agent.avatar_color} flex items-center justify-center text-sm`}>
                      {agent.avatar_emoji}
                    </span>
                    <span className="text-sm font-medium">{agent.name}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedAgent && (
              <p className="text-xs text-white/40 mt-1.5">{selectedAgent.specialization}</p>
            )}
          </div>
          
          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Priority
            </label>
            <div className="flex gap-1">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 px-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    priority === p
                      ? p === 'low' 
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : p === 'medium'
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                        : 'bg-red-500/20 border-red-500/50 text-red-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {p === 'low' ? '🟢 Low' : p === 'medium' ? '🟡 Med' : '🔴 High'}
                </button>
              ))}
            </div>
          </div>
          
          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Due Date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50 focus:bg-black/40 focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="button"
                onClick={() => setDueDate(getTodayString())}
                className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all text-sm"
              >
                Today
              </button>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all text-sm"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white/70 rounded-xl hover:bg-white/10 hover:text-white transition-all font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all font-medium"
            >
              {task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
