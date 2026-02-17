'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Bot,
  Cpu,
  Wrench,
  Tag,
  Search,
  X,
  Trash2,
  Save,
  ChevronDown,
  ListFilter,
  Puzzle,
  Link as LinkIcon,
  Users,
} from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Agent, type Skill, type Workflow, type Specialization } from '@/lib/api';
import ConfirmDialog from '@/components/ConfirmDialog';

// ─── Constants ──────────────────────────────────────────────

const MODEL_OPTIONS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-haiku-4-5-20251001',
];

const DOCKER_IMAGE_OPTIONS = [
  'swarmitai/swarmit-base',
  'swarmitai/swarmit-developer',
  'swarmitai/swarmit-reviewer',
  'swarmitai/swarmit-backend',
  'swarmitai/swarmit-devops',
  'swarmitai/swarmit-frontend',
  'swarmitai/swarmit-qa',
  'swarmitai/sandbox',
];

type TabId = 'agents' | 'specializations' | 'skills';

// ─── Main Page ──────────────────────────────────────────────

export default function AgentsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('agents');

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'agents', label: 'Agents', icon: <Bot className="w-4 h-4" /> },
    { id: 'specializations', label: 'Specializations', icon: <Tag className="w-4 h-4" /> },
    { id: 'skills', label: 'Skills', icon: <Puzzle className="w-4 h-4" /> },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-zinc-400 mt-1 hidden sm:block">Manage your AI agents, specializations, and skills</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'agents' && <AgentsTab />}
      {activeTab === 'specializations' && <SpecializationsTab />}
      {activeTab === 'skills' && <SkillsTab />}
    </div>
  );
}

// ─── Agents Tab ─────────────────────────────────────────────

function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api.agents.list(1, 100);
      setAgents(data.agents);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCreated = (agent: Agent) => {
    setAgents((prev) => [agent, ...prev]);
    setShowCreateModal(false);
    setSelectedAgentId(agent.id);
    toast.success(`Agent "${agent.name}" created`);
  };

  const handleUpdated = (updated: Agent) => {
    setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const handleDeleted = (id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    if (selectedAgentId === id) setSelectedAgentId(null);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-zinc-800 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-zinc-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Create Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-lg">
          <Bot className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">No agents yet</p>
          <p className="text-zinc-500 mt-1">Create an agent to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() =>
                setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id)
              }
              className={`text-left bg-zinc-900 border rounded-lg p-5 transition-colors hover:border-zinc-600 ${
                selectedAgentId === agent.id
                  ? 'border-blue-500 ring-1 ring-blue-500/30'
                  : 'border-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-400 shrink-0" />
                  <h3 className="font-semibold text-white truncate">{agent.name}</h3>
                </div>
              </div>
              {agent.specialization && (
                <span className="inline-block px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full mb-3">
                  {agent.specialization.name}
                </span>
              )}
              <div className="space-y-1.5 text-xs text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" />
                  <span className="truncate">{agent.model}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <ListFilter className="w-3 h-3" />
                    {agent._count?.tasks ?? 0} tasks
                  </span>
                  <span className="flex items-center gap-1">
                    <Wrench className="w-3 h-3" />
                    {agent.skills?.length ?? 0} skills
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Agent detail panel */}
      {selectedAgentId && (
        <AgentDetail
          agentId={selectedAgentId}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onClose={() => setSelectedAgentId(null)}
        />
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateAgentModal
          onCreated={handleCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

// ─── Agent Detail Panel ─────────────────────────────────────

function AgentDetail({
  agentId,
  onUpdated,
  onDeleted,
  onClose,
}: {
  agentId: string;
  onUpdated: (agent: Agent) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [specializationId, setSpecializationId] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [systemPrompt, setSystemPrompt] = useState('');

  // Specializations list
  const [specializations, setSpecializations] = useState<Specialization[]>([]);

  // Skill search
  const [skillSearch, setSkillSearch] = useState('');
  const [skillResults, setSkillResults] = useState<Skill[]>([]);
  const [searchingSkills, setSearchingSkills] = useState(false);

  // Workflow dropdown
  const [allWorkflows, setAllWorkflows] = useState<Workflow[]>([]);
  const [showWorkflowDropdown, setShowWorkflowDropdown] = useState(false);

  const fetchAgent = useCallback(async () => {
    setLoading(true);
    try {
      const [data, specs] = await Promise.all([
        api.agents.get(agentId),
        api.specializations.list(),
      ]);
      setAgent(data);
      setSpecializations(specs);
      setName(data.name);
      setSpecializationId(data.specializationId ?? '');
      setModel(data.model);
      setTemperature(data.temperature);
      setMaxTokens(data.maxTokens);
      setSystemPrompt(data.systemPrompt ?? '');
    } catch (err) {
      console.error('Failed to fetch agent:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      await api.agents.update(agent.id, {
        name: name.trim(),
        specializationId: specializationId || null,
        model,
        temperature,
        maxTokens,
        systemPrompt: systemPrompt.trim() || undefined,
      });
      const updated = await api.agents.get(agent.id);
      setAgent(updated);
      onUpdated(updated);
      toast.success('Agent saved');
    } catch (err) {
      console.error('Failed to update agent:', err);
      toast.error('Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agent) return;
    try {
      await api.agents.delete(agent.id);
      onDeleted(agent.id);
      toast.success('Agent deleted');
    } catch (err) {
      console.error('Failed to delete agent:', err);
      toast.error('Failed to delete agent');
    }
  };

  // Skill search
  const handleSkillSearch = async (query: string) => {
    setSkillSearch(query);
    if (query.trim().length < 2) {
      setSkillResults([]);
      return;
    }
    setSearchingSkills(true);
    try {
      const data = await api.skills.search(query.trim());
      // Filter out already-attached skills
      const attachedIds = new Set(agent?.skills?.map((s) => s.skill.id) ?? []);
      setSkillResults(data.skills.filter((s) => !attachedIds.has(s.id)));
    } catch (err) {
      console.error('Failed to search skills:', err);
    } finally {
      setSearchingSkills(false);
    }
  };

  const handleAddSkill = async (skillId: string) => {
    if (!agent) return;
    try {
      await api.agents.addSkill(agent.id, skillId);
      const updated = await api.agents.get(agent.id);
      setAgent(updated);
      onUpdated(updated);
      setSkillSearch('');
      setSkillResults([]);
    } catch (err) {
      console.error('Failed to add skill:', err);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    if (!agent) return;
    try {
      await api.agents.removeSkill(agent.id, skillId);
      const updated = await api.agents.get(agent.id);
      setAgent(updated);
      onUpdated(updated);
    } catch (err) {
      console.error('Failed to remove skill:', err);
    }
  };

  // Workflows
  const fetchWorkflows = async () => {
    try {
      const data = await api.workflows.list(1, 100);
      setAllWorkflows(data.workflows);
    } catch (err) {
      console.error('Failed to fetch workflows:', err);
    }
  };

  const handleAddWorkflow = async (workflowId: string) => {
    if (!agent) return;
    try {
      await api.agents.addWorkflow(agent.id, workflowId);
      const updated = await api.agents.get(agent.id);
      setAgent(updated);
      onUpdated(updated);
      setShowWorkflowDropdown(false);
    } catch (err) {
      console.error('Failed to add workflow:', err);
    }
  };

  const handleRemoveWorkflow = async (workflowId: string) => {
    if (!agent) return;
    try {
      await api.agents.removeWorkflow(agent.id, workflowId);
      const updated = await api.agents.get(agent.id);
      setAgent(updated);
      onUpdated(updated);
    } catch (err) {
      console.error('Failed to remove workflow:', err);
    }
  };

  if (loading) {
    return (
      <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-zinc-800 rounded w-1/3" />
          <div className="h-32 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  if (!agent) return null;

  const attachedWorkflowIds = new Set(
    agent.agentWorkflows?.map((aw) => aw.workflow.id) ?? []
  );
  const availableWorkflows = allWorkflows.filter((w) => !attachedWorkflowIds.has(w.id));

  return (
    <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Agent Details</h2>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Name */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Specialization */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Specialization</label>
          <select
            value={specializationId}
            onChange={(e) => setSpecializationId(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">None</option>
            {specializations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Temperature */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">
            Temperature: {temperature.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>0 (deterministic)</span>
            <span>1 (creative)</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Max Tokens</label>
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
            min={1}
            max={200000}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

      </div>

      {/* System Prompt */}
      <div className="mt-6">
        <label className="block text-sm text-zinc-400 mb-1">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={5}
          placeholder="Instructions for how this agent should behave..."
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
      </div>

      {/* Skills */}
      <div className="mt-6">
        <label className="block text-sm text-zinc-400 mb-2">Skills</label>
        {agent.skills && agent.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {agent.skills.map((as) => (
              <span
                key={as.skill.id}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-800 border border-zinc-700 rounded-full text-sm text-zinc-300"
              >
                <Wrench className="w-3 h-3 text-zinc-500" />
                {as.skill.name}
                <button
                  onClick={() => handleRemoveSkill(as.skill.id)}
                  className="text-zinc-500 hover:text-red-400 transition-colors ml-1"
                  title="Remove skill"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-zinc-600 text-sm mb-3">No skills attached</p>
        )}

        {/* Add skill search */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={skillSearch}
              onChange={(e) => handleSkillSearch(e.target.value)}
              placeholder="Search skills to add..."
              className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          {(skillResults.length > 0 || searchingSkills) && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {searchingSkills ? (
                <div className="p-3 text-sm text-zinc-500">Searching...</div>
              ) : (
                skillResults.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => handleAddSkill(skill.id)}
                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    <span className="font-medium">{skill.name}</span>
                    {skill.description && (
                      <span className="text-zinc-500 ml-2">{skill.description}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Workflows */}
      <div className="mt-6">
        <label className="block text-sm text-zinc-400 mb-2">Workflows</label>
        {agent.agentWorkflows && agent.agentWorkflows.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {agent.agentWorkflows.map((aw) => (
              <span
                key={aw.workflow.id}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-800 border border-zinc-700 rounded-full text-sm text-zinc-300"
              >
                {aw.workflow.name}
                <button
                  onClick={() => handleRemoveWorkflow(aw.workflow.id)}
                  className="text-zinc-500 hover:text-red-400 transition-colors ml-1"
                  title="Remove workflow"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-zinc-600 text-sm mb-3">No workflows attached</p>
        )}

        <div className="relative">
          <button
            onClick={() => {
              if (!showWorkflowDropdown) fetchWorkflows();
              setShowWorkflowDropdown(!showWorkflowDropdown);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Workflow
            <ChevronDown className="w-3 h-3" />
          </button>
          {showWorkflowDropdown && (
            <div className="absolute z-10 top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto min-w-[240px]">
              {availableWorkflows.length === 0 ? (
                <div className="p-3 text-sm text-zinc-500">No workflows available</div>
              ) : (
                availableWorkflows.map((wf) => (
                  <button
                    key={wf.id}
                    onClick={() => handleAddWorkflow(wf.id)}
                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    {wf.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-8 flex items-center gap-3 pt-4 border-t border-zinc-800">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors text-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-red-600/20 text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/50 rounded-lg transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-400">Are you sure?</span>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create Agent Modal ─────────────────────────────────────

function CreateAgentModal({
  onCreated,
  onClose,
}: {
  onCreated: (agent: Agent) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [specializationId, setSpecializationId] = useState('');
  const [model, setModel] = useState(MODEL_OPTIONS[0]);
  const [creating, setCreating] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [specializations, setSpecializations] = useState<Specialization[]>([]);

  useEffect(() => {
    api.specializations.list().then(setSpecializations).catch(console.error);
  }, []);

  const handleCreate = async () => {
    setSubmitted(true);
    if (!name.trim() || !specializationId) return;
    setCreating(true);
    try {
      const agent = await api.agents.create({
        name: name.trim(),
        specializationId,
        model,
      });
      onCreated(agent);
    } catch (err) {
      console.error('Failed to create agent:', err);
      toast.error('Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Create Agent</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Riley"
              className={`w-full px-3 py-2 bg-zinc-800 border rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                submitted && !name.trim() ? 'border-red-500' : 'border-zinc-700'
              }`}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            {submitted && !name.trim() && (
              <p className="text-xs text-red-400 mt-1">Name is required</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Specialization <span className="text-red-400">*</span>
            </label>
            <select
              value={specializationId}
              onChange={(e) => setSpecializationId(e.target.value)}
              className={`w-full px-3 py-2 bg-zinc-800 border rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                submitted && !specializationId ? 'border-red-500' : 'border-zinc-700'
              }`}
            >
              <option value="" disabled>Select a specialization...</option>
              {specializations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {submitted && !specializationId && (
              <p className="text-xs text-red-400 mt-1">Specialization is required</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors text-sm"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Specializations Tab ────────────────────────────────────

function SpecializationsTab() {
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSystemPrompt, setNewSystemPrompt] = useState('');
  const [newDockerImage, setNewDockerImage] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteSpecId, setDeleteSpecId] = useState<string | null>(null);
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);

  const fetchSpecializations = useCallback(async () => {
    try {
      const data = await api.specializations.list();
      setSpecializations(data);
    } catch (err) {
      console.error('Failed to fetch specializations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpecializations();
  }, [fetchSpecializations]);

  const handleCreate = async () => {
    if (!newName.trim() || !newDockerImage) return;
    setCreating(true);
    try {
      const keywords = newKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const created = await api.specializations.create({
        name: newName.trim(),
        keywords,
        description: newDescription.trim() || undefined,
        systemPrompt: newSystemPrompt.trim() || undefined,
        dockerImage: newDockerImage,
      });
      setSpecializations((prev) => [...prev, created]);
      setNewName('');
      setNewKeywords('');
      setNewDescription('');
      setNewSystemPrompt('');
      setNewDockerImage('');
      setShowForm(false);
      toast.success(`Specialization "${created.name}" created`);
    } catch (err) {
      console.error('Failed to create specialization:', err);
      toast.error('Failed to create specialization');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteSpecId) return;
    try {
      await api.specializations.delete(deleteSpecId);
      setSpecializations((prev) => prev.filter((s) => s.id !== deleteSpecId));
      if (selectedSpecId === deleteSpecId) setSelectedSpecId(null);
      toast.success('Specialization deleted');
    } catch (err) {
      console.error('Failed to delete specialization:', err);
      toast.error('Failed to delete specialization');
    } finally {
      setDeleteSpecId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-zinc-800 rounded w-48" />
        <div className="h-64 bg-zinc-800 rounded" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Specialization
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-white mb-4">New Specialization</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., frontend"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                placeholder="react, css, ui"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-1">Description</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this specialization cover?"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-1">System Prompt</label>
              <textarea
                value={newSystemPrompt}
                onChange={(e) => setNewSystemPrompt(e.target.value)}
                rows={3}
                placeholder="Role-specific instructions for agents with this specialization..."
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-1">
                Docker Image <span className="text-red-400">*</span>
              </label>
              <select
                value={newDockerImage}
                onChange={(e) => setNewDockerImage(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Select a sandbox image...</option>
                {DOCKER_IMAGE_OPTIONS.map((img) => (
                  <option key={img} value={img}>
                    {img}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newDockerImage}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded transition-colors text-sm"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setNewName('');
                setNewKeywords('');
                setNewDescription('');
                setNewSystemPrompt('');
                setNewDockerImage('');
              }}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {specializations.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-lg">
          <Tag className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">No specializations yet</p>
          <p className="text-zinc-500 mt-1">
            Add specializations to categorize your agents
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Keywords
                </th>
                <th className="text-left px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">
                  Description
                </th>
                <th className="text-left px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Agents
                </th>
                <th className="text-right px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {specializations.map((spec) => (
                <tr
                  key={spec.id}
                  onClick={() => setSelectedSpecId(selectedSpecId === spec.id ? null : spec.id)}
                  className={`cursor-pointer transition-colors ${
                    selectedSpecId === spec.id
                      ? 'bg-blue-500/10 border-l-2 border-l-blue-500'
                      : 'hover:bg-zinc-800/50'
                  }`}
                >
                  <td className="px-3 md:px-6 py-4 text-sm text-white font-medium">
                    {spec.name}
                  </td>
                  <td className="px-3 md:px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {spec.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-2 py-0.5 text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-full"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 md:px-6 py-4 text-sm text-zinc-400 max-w-xs truncate hidden sm:table-cell">
                    {spec.description || <span className="text-zinc-600">--</span>}
                  </td>
                  <td className="px-3 md:px-6 py-4 text-sm">
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Users className="w-3 h-3" />
                      {spec._count?.agents ?? 0}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteSpecId(spec.id); }}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                      title="Delete specialization"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Specialization detail panel */}
      {selectedSpecId && (
        <SpecializationDetail
          spec={specializations.find((s) => s.id === selectedSpecId)!}
          onSaved={() => fetchSpecializations()}
          onDelete={(id) => setDeleteSpecId(id)}
          onClose={() => setSelectedSpecId(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteSpecId}
        onClose={() => setDeleteSpecId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Specialization"
        message="Delete this specialization? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}

// ─── Specialization Detail Panel ────────────────────────────

function SpecializationDetail({
  spec,
  onSaved,
  onDelete,
  onClose,
}: {
  spec: Specialization;
  onSaved: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(spec.name);
  const [keywords, setKeywords] = useState(spec.keywords.join(', '));
  const [description, setDescription] = useState(spec.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(spec.systemPrompt ?? '');
  const [dockerImage, setDockerImage] = useState(spec.dockerImage ?? '');
  const [saving, setSaving] = useState(false);

  // Reset fields when a different spec is selected
  useEffect(() => {
    setName(spec.name);
    setKeywords(spec.keywords.join(', '));
    setDescription(spec.description ?? '');
    setSystemPrompt(spec.systemPrompt ?? '');
    setDockerImage(spec.dockerImage ?? '');
  }, [spec]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const keywordsList = keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      await api.specializations.update(spec.id, {
        name: name.trim(),
        keywords: keywordsList,
        description: description.trim() || null,
        systemPrompt: systemPrompt.trim() || null,
        dockerImage: dockerImage || null,
      });
      onSaved();
      toast.success('Specialization saved');
    } catch (err) {
      console.error('Failed to update specialization:', err);
      toast.error('Failed to save specialization');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Specialization Details</h2>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Name */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Keywords */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Keywords (comma-separated)</label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="react, css, ui"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Description */}
      <div className="mt-6">
        <label className="block text-sm text-zinc-400 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this specialization cover?"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* System Prompt */}
      <div className="mt-6">
        <label className="block text-sm text-zinc-400 mb-1">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={5}
          placeholder="Role-specific instructions for agents with this specialization..."
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
      </div>

      {/* Docker Image */}
      <div className="mt-6">
        <label className="block text-sm text-zinc-400 mb-1">Docker Image</label>
        <select
          value={dockerImage}
          onChange={(e) => setDockerImage(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">None</option>
          {DOCKER_IMAGE_OPTIONS.map((img) => (
            <option key={img} value={img}>
              {img}
            </option>
          ))}
        </select>
      </div>

      {/* Action buttons */}
      <div className="mt-8 flex items-center gap-3 pt-4 border-t border-zinc-800">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors text-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          onClick={() => onDelete(spec.id)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-red-600/20 text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/50 rounded-lg transition-colors text-sm"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Skills Tab ─────────────────────────────────────────────

function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteSkillId, setDeleteSkillId] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    try {
      const data = await api.skills.list(1, 100);
      setSkills(data.skills);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await api.skills.create({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        sourceUrl: newSourceUrl.trim() || undefined,
      });
      setSkills((prev) => [created, ...prev]);
      setNewName('');
      setNewDescription('');
      setNewSourceUrl('');
      setShowForm(false);
      toast.success(`Skill "${created.name}" created`);
    } catch (err) {
      console.error('Failed to create skill:', err);
      toast.error('Failed to create skill');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteSkillId) return;
    try {
      await api.skills.delete(deleteSkillId);
      setSkills((prev) => prev.filter((s) => s.id !== deleteSkillId));
      toast.success('Skill deleted');
    } catch (err) {
      console.error('Failed to delete skill:', err);
      toast.error('Failed to delete skill');
    } finally {
      setDeleteSkillId(null);
    }
  };

  const filteredSkills = skills.filter((skill) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      skill.name.toLowerCase().includes(q) ||
      (skill.description?.toLowerCase().includes(q) ?? false)
    );
  });

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-zinc-800 rounded w-48" />
        <div className="h-64 bg-zinc-800 rounded" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        {/* Search filter */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter skills..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Skill
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-white mb-4">New Skill</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Code Review"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Description</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this skill do?"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Source URL</label>
              <input
                type="text"
                value={newSourceUrl}
                onChange={(e) => setNewSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded transition-colors text-sm"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setNewName('');
                setNewDescription('');
                setNewSourceUrl('');
              }}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {skills.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-lg">
          <Puzzle className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">No skills yet</p>
          <p className="text-zinc-500 mt-1">Add skills that agents can use</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">
                  Description
                </th>
                <th className="text-left px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">
                  Source URL
                </th>
                <th className="text-left px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Agents
                </th>
                <th className="text-right px-3 md:px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredSkills.map((skill) => (
                <tr key={skill.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-3 md:px-6 py-4 text-sm text-white font-medium">
                    {skill.name}
                  </td>
                  <td className="px-3 md:px-6 py-4 text-sm text-zinc-400 max-w-xs truncate hidden sm:table-cell">
                    {skill.description || <span className="text-zinc-600">--</span>}
                  </td>
                  <td className="px-3 md:px-6 py-4 text-sm hidden sm:table-cell">
                    {skill.sourceUrl ? (
                      <a
                        href={skill.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors truncate max-w-xs"
                      >
                        <LinkIcon className="w-3 h-3 shrink-0" />
                        <span className="truncate">{skill.sourceUrl}</span>
                      </a>
                    ) : (
                      <span className="text-zinc-600">--</span>
                    )}
                  </td>
                  <td className="px-3 md:px-6 py-4 text-sm">
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Users className="w-3 h-3" />
                      {skill._count?.agents ?? 0}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-4 text-right">
                    <button
                      onClick={() => setDeleteSkillId(skill.id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                      title="Delete skill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSkills.length === 0 && skills.length > 0 && (
                <tr>
                  <td colSpan={5} className="px-3 md:px-6 py-8 text-center text-zinc-500 text-sm">
                    No skills match your filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteSkillId}
        onClose={() => setDeleteSkillId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Skill"
        message="Delete this skill? It will be removed from all agents."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
