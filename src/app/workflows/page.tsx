'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, GitBranch, Calendar, Layers } from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  nodes: Array<{ id: string; type: string }>;
  edges: Array<{ id: string }>;
  lock_version: number;
  published_version_id: string | null;
  user_email: string;
  created_at: string;
  updated_at: string;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch('/api/workflows');
      if (res.ok) {
        setWorkflows(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWorkflows(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          nodes: [
            { id: 'start-1', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Start' } },
            { id: 'end-1', type: 'end', position: { x: 250, y: 400 }, data: { label: 'End' } },
          ],
          edges: [],
        }),
      });
      if (res.ok) {
        const workflow = await res.json();
        setWorkflows(prev => [workflow, ...prev]);
        setShowCreate(false);
        setNewName('');
        setNewDescription('');
      }
    } catch (err) {
      console.error('Failed to create workflow:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workflow? Any agents using it will be unassigned.')) return;
    try {
      const res = await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setWorkflows(prev => prev.filter(w => w.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="h-32 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="text-zinc-400 mt-1">Visual step-by-step instructions for your agents</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Workflow
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-zinc-900 border border-zinc-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create New Workflow</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g., Code Review Process"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Description (optional)</label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={2}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 text-white rounded transition-colors"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(''); setNewDescription(''); }}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {workflows.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-700 rounded-lg">
          <GitBranch className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">No workflows yet</p>
          <p className="text-zinc-500 mt-1">Create a workflow to give agents step-by-step instructions</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {workflows.map(workflow => (
            <Link
              key={workflow.id}
              href={`/workflows/${workflow.id}`}
              className="block bg-zinc-900 border border-zinc-700 rounded-lg p-6 hover:border-zinc-500 transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <GitBranch className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                      {workflow.name}
                    </h3>
                    {workflow.published_version_id ? (
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                        Published
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                        Draft
                      </span>
                    )}
                  </div>
                  {workflow.description && (
                    <p className="text-zinc-400 mt-2 text-sm">{workflow.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {workflow.nodes.length} nodes
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Updated {new Date(workflow.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={e => { e.preventDefault(); handleDelete(workflow.id); }}
                  className="text-zinc-500 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
                  title="Delete workflow"
                >
                  &times;
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
