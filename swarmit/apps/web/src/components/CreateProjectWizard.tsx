'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { api, type Project } from '@/lib/api';

interface WizardFormData {
  title: string;
  projectType: string;
  goal: string;
  targetUsers: string;
  mustHaves: string[];
  deadline: string;
  budgetRange: string;
  contactEmail: string;
  niceToHaves: string[];
  referenceLinks: string[];
  constraints: string;
  comms: string;
  dataSensitivity: string;
  description: string;
  prd: string;
}

const INITIAL_FORM: WizardFormData = {
  title: '',
  projectType: '',
  goal: '',
  targetUsers: '',
  mustHaves: [],
  deadline: '',
  budgetRange: '',
  contactEmail: '',
  niceToHaves: [],
  referenceLinks: [],
  constraints: '',
  comms: '',
  dataSensitivity: '',
  description: '',
  prd: '',
};

const PROJECT_TYPES = ['Web App', 'API/Backend', 'Mobile App', 'Data Pipeline', 'AI/ML', 'Full Stack', 'Other'];
const BUDGET_RANGES = ['< $100', '$100-$500', '$500-$1000', '$1000+'];
const SENSITIVITY_OPTIONS = ['Public', 'Internal', 'Confidential', 'Restricted'];

interface Props {
  onCreated: (project: Project) => void;
  onClose: () => void;
}

export default function CreateProjectWizard({ onCreated, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [niceTagInput, setNiceTagInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState('');

  const isStep1Valid =
    form.title.trim() !== '' &&
    form.projectType !== '' &&
    form.goal.trim() !== '' &&
    form.targetUsers.trim() !== '' &&
    form.mustHaves.length > 0 &&
    form.deadline !== '' &&
    form.budgetRange !== '' &&
    form.contactEmail.trim() !== '' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail);

  const handleSubmit = async (isDraft: boolean) => {
    setError('');
    if (!isDraft && !isStep1Valid) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        isDraft,
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.prd.trim()) payload.prd = form.prd.trim();
      if (form.projectType) payload.projectType = form.projectType;
      if (form.goal.trim()) payload.goal = form.goal.trim();
      if (form.targetUsers.trim()) payload.targetUsers = form.targetUsers.trim();
      if (form.mustHaves.length > 0) payload.mustHaves = form.mustHaves;
      if (form.deadline) payload.deadline = new Date(form.deadline).toISOString();
      if (form.budgetRange) payload.budgetRange = form.budgetRange;
      if (form.contactEmail.trim()) payload.contactEmail = form.contactEmail.trim();
      if (form.niceToHaves.length > 0) payload.niceToHaves = form.niceToHaves;
      if (form.referenceLinks.length > 0) payload.referenceLinks = form.referenceLinks;
      if (form.constraints.trim()) payload.constraints = form.constraints.trim();
      if (form.comms.trim()) payload.comms = form.comms.trim();
      if (form.dataSensitivity) payload.dataSensitivity = form.dataSensitivity;

      const project = await api.projects.create(payload as Parameters<typeof api.projects.create>[0]);
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const addTag = (field: 'mustHaves' | 'niceToHaves', value: string, clearFn: (v: string) => void) => {
    const trimmed = value.trim();
    if (trimmed && !form[field].includes(trimmed)) {
      setForm(prev => ({ ...prev, [field]: [...prev[field], trimmed] }));
    }
    clearFn('');
  };

  const removeTag = (field: 'mustHaves' | 'niceToHaves', index: number) => {
    setForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
  };

  const addLink = () => {
    const trimmed = linkInput.trim();
    if (trimmed && !form.referenceLinks.includes(trimmed)) {
      setForm(prev => ({ ...prev, referenceLinks: [...prev.referenceLinks, trimmed] }));
    }
    setLinkInput('');
  };

  const removeLink = (index: number) => {
    setForm(prev => ({ ...prev, referenceLinks: prev.referenceLinks.filter((_, i) => i !== index) }));
  };

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-sm font-medium text-zinc-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Create New Project</h2>
            <div className="flex items-center gap-2 mt-2">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 1 ? 'text-blue-400' : 'text-zinc-500'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 1 ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>1</span>
                Basics
              </div>
              <div className="w-8 h-px bg-zinc-700" />
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 2 ? 'text-blue-400' : 'text-zinc-500'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 2 ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>2</span>
                Details
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {step === 1 && (
            <>
              {/* Title */}
              <div>
                <label htmlFor="wizard-title" className={labelClass}>Title *</label>
                <input
                  id="wizard-title"
                  type="text"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., AI-Powered Recipe App"
                  className={inputClass}
                  autoFocus
                />
              </div>

              {/* Project Type */}
              <div>
                <label htmlFor="wizard-project-type" className={labelClass}>Project Type *</label>
                <select
                  id="wizard-project-type"
                  value={form.projectType}
                  onChange={e => setForm(prev => ({ ...prev, projectType: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select type...</option>
                  {PROJECT_TYPES.map(t => <option key={t} value={t.toLowerCase().replace(/[\s/]+/g, '-')}>{t}</option>)}
                </select>
              </div>

              {/* Goal */}
              <div>
                <label htmlFor="wizard-goal" className={labelClass}>Goal *</label>
                <textarea
                  id="wizard-goal"
                  value={form.goal}
                  onChange={e => setForm(prev => ({ ...prev, goal: e.target.value }))}
                  placeholder="What should this project accomplish?"
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Target Users */}
              <div>
                <label htmlFor="wizard-target-users" className={labelClass}>Target Users *</label>
                <textarea
                  id="wizard-target-users"
                  value={form.targetUsers}
                  onChange={e => setForm(prev => ({ ...prev, targetUsers: e.target.value }))}
                  placeholder="Who are the end users?"
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Must-Haves */}
              <div>
                <label className={labelClass}>Must-Have Features * ({form.mustHaves.length})</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('mustHaves', tagInput, setTagInput); } }}
                    placeholder="Add a feature and press Enter"
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => addTag('mustHaves', tagInput, setTagInput)}
                    className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {form.mustHaves.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.mustHaves.map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500/20 text-blue-300 text-sm rounded-full">
                        {tag}
                        <button onClick={() => removeTag('mustHaves', i)} className="hover:text-blue-100"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Deadline */}
              <div>
                <label htmlFor="wizard-deadline" className={labelClass}>Deadline *</label>
                <input
                  id="wizard-deadline"
                  type="date"
                  value={form.deadline}
                  onChange={e => setForm(prev => ({ ...prev, deadline: e.target.value }))}
                  className={inputClass}
                />
              </div>

              {/* Budget Range */}
              <div>
                <label htmlFor="wizard-budget" className={labelClass}>Budget Range *</label>
                <select
                  id="wizard-budget"
                  value={form.budgetRange}
                  onChange={e => setForm(prev => ({ ...prev, budgetRange: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select budget...</option>
                  {BUDGET_RANGES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* Contact Email */}
              <div>
                <label htmlFor="wizard-email" className={labelClass}>Contact Email *</label>
                <input
                  id="wizard-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={e => setForm(prev => ({ ...prev, contactEmail: e.target.value }))}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Description */}
              <div>
                <label htmlFor="wizard-description" className={labelClass}>Description</label>
                <textarea
                  id="wizard-description"
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the project..."
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Nice-to-Haves */}
              <div>
                <label className={labelClass}>Nice-to-Have Features</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={niceTagInput}
                    onChange={e => setNiceTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('niceToHaves', niceTagInput, setNiceTagInput); } }}
                    placeholder="Add an optional feature"
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => addTag('niceToHaves', niceTagInput, setNiceTagInput)}
                    className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {form.niceToHaves.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.niceToHaves.map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-600/40 text-zinc-300 text-sm rounded-full">
                        {tag}
                        <button onClick={() => removeTag('niceToHaves', i)} className="hover:text-zinc-100"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Reference Links */}
              <div>
                <label className={labelClass}>Reference Links</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={linkInput}
                    onChange={e => setLinkInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                    placeholder="https://example.com"
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={addLink}
                    className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {form.referenceLinks.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {form.referenceLinks.map((link, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                        <span className="truncate flex-1">{link}</span>
                        <button onClick={() => removeLink(i)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Constraints */}
              <div>
                <label className={labelClass}>Constraints</label>
                <textarea
                  value={form.constraints}
                  onChange={e => setForm(prev => ({ ...prev, constraints: e.target.value }))}
                  placeholder="Known constraints or limitations..."
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Communication Preferences */}
              <div>
                <label className={labelClass}>Communication Preferences</label>
                <textarea
                  value={form.comms}
                  onChange={e => setForm(prev => ({ ...prev, comms: e.target.value }))}
                  placeholder="How you prefer to receive updates..."
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Data Sensitivity */}
              <div>
                <label htmlFor="wizard-sensitivity" className={labelClass}>Data Sensitivity</label>
                <select
                  id="wizard-sensitivity"
                  value={form.dataSensitivity}
                  onChange={e => setForm(prev => ({ ...prev, dataSensitivity: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  {SENSITIVITY_OPTIONS.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                </select>
              </div>

              {/* PRD */}
              <div>
                <label htmlFor="wizard-prd" className={labelClass}>PRD</label>
                <textarea
                  id="wizard-prd"
                  value={form.prd}
                  onChange={e => setForm(prev => ({ ...prev, prd: e.target.value }))}
                  placeholder="Paste product requirements document..."
                  rows={5}
                  className={`${inputClass} resize-none font-mono text-sm`}
                />
              </div>
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={() => form.title.trim() ? handleSubmit(true) : undefined}
            disabled={submitting || !form.title.trim()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save as Draft
          </button>
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step === 1 && (
              <button
                onClick={() => setStep(2)}
                disabled={!isStep1Valid}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 2 && (
              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting || !isStep1Valid}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg transition-colors"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Create Project
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
