'use client';

import { useState, useEffect } from 'react';

interface Specialization {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  icon: string;
  user_email: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  agent_count?: number;
}

export default function SpecializationsPage() {
  const [specs, setSpecs] = useState<Specialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSpec, setEditingSpec] = useState<Specialization | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: '',
    icon: '🤖',
  });

  const ICON_OPTIONS = ['🤖', '🚀', '🎨', '⚙️', '🔧', '🧪', '📊', '🔒', '📱', '📝', '📋', '✨', '🧠', '💡', '🛠️', '🎯'];

  useEffect(() => {
    fetchSpecs();
  }, []);

  const fetchSpecs = async () => {
    try {
      const res = await fetch('/api/specializations');
      if (res.ok) setSpecs(await res.json());
    } catch (error) {
      console.error('Error fetching specializations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingSpec ? `/api/specializations/${editingSpec.id}` : '/api/specializations';
      const method = editingSpec ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        fetchSpecs();
        closeModal();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to save specialization');
      }
    } catch (error) {
      console.error('Error saving specialization:', error);
      alert('Failed to save specialization');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/specializations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSpecs();
        setDeleteConfirm(null);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to delete specialization');
      }
    } catch (error) {
      console.error('Error deleting specialization:', error);
    }
  };

  const openCreateModal = () => {
    setEditingSpec(null);
    setFormData({ name: '', description: '', system_prompt: '', icon: '🤖' });
    setShowModal(true);
  };

  const openEditModal = (spec: Specialization) => {
    setEditingSpec(spec);
    setFormData({
      name: spec.name,
      description: spec.description || '',
      system_prompt: spec.system_prompt || '',
      icon: spec.icon,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSpec(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-white/60">Loading specializations...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Actions bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={openCreateModal}
          className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg sm:rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105 active:scale-95 text-xs sm:text-sm"
        >
          <span className="text-base sm:text-lg group-hover:rotate-90 transition-transform duration-200">+</span>
          <span>Add Specialization</span>
        </button>
        <div className="text-white/50 text-sm">
          <span className="font-medium text-white">{specs.length}</span> specializations
        </div>
      </div>

      {/* Specializations Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3 w-10">Icon</th>
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Name</th>
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3 hidden sm:table-cell">Description</th>
                <th className="text-right text-xs text-white/50 font-medium px-4 py-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {specs.map((spec) => (
                <>
                  <tr
                    key={spec.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === spec.id ? null : spec.id)}
                  >
                    <td className="px-4 py-3 text-xl">{spec.icon}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{spec.name}</span>
                        {spec.is_default && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-400 border border-blue-500/30">Default</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50 hidden sm:table-cell max-w-md truncate">
                      {spec.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(spec); }}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(spec.id); }}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Expanded row for system prompt */}
                  {expandedId === spec.id && (
                    <tr key={`${spec.id}-expanded`}>
                      <td colSpan={4} className="px-4 py-3 bg-white/5">
                        <div className="text-xs text-white/40 mb-1">System Prompt</div>
                        <div className="text-sm text-white/70 whitespace-pre-wrap font-mono bg-black/20 rounded-lg p-3 max-h-40 overflow-y-auto">
                          {spec.system_prompt || '(No system prompt defined)'}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {specs.length === 0 && (
          <div className="text-center py-12 text-white/40">
            <p className="text-4xl mb-4">🔧</p>
            <p>No specializations yet.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-sm animate-fade-in">
            <h3 className="text-lg font-bold text-white mb-2">Delete Specialization?</h3>
            <p className="text-sm text-white/60 mb-4">
              This action cannot be undone. Agents using this specialization will need to be reassigned.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-500/80 text-white rounded-lg hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingSpec ? 'Edit Specialization' : 'Add Specialization'}
            </h2>

            {editingSpec?.is_default && (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                This is a default specialization. Changes will only affect your account.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Icon Selection */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon })}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${
                        formData.icon === icon ? 'bg-white/20 ring-2 ring-blue-500 scale-110' : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                  placeholder="e.g., Blockchain Developer"
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
                  placeholder="Brief description of this specialization..."
                  rows={2}
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm text-white/70 mb-1">System Prompt</label>
                <textarea
                  value={formData.system_prompt}
                  onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none font-mono text-sm"
                  placeholder="Default instructions for agents with this specialization..."
                  rows={6}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
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
                  {editingSpec ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
