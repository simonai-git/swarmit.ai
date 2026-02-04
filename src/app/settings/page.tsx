'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AutomationSettings {
  autoAssign: boolean;
  autoSpawnAgents: boolean;
  defaultModel: string;
  maxConcurrentAgents: number;
  dailyBudgetCents: number;
  alertThresholdPercent: number;
}

interface AgentConfig {
  id: string;
  name: string;
  specialization: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AutomationSettings>({
    autoAssign: true,
    autoSpawnAgents: true,
    defaultModel: 'claude-sonnet-4-20250514',
    maxConcurrentAgents: 3,
    dailyBudgetCents: 1000,
    alertThresholdPercent: 80,
  });
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<AgentConfig | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchAgentConfigs();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings/automation');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchAgentConfigs = async () => {
    try {
      const res = await fetch('/api/agent-configs');
      if (res.ok) {
        const data = await res.json();
        setAgentConfigs(data);
      }
    } catch (error) {
      console.error('Error fetching agent configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving settings' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const saveAgentConfig = async (config: AgentConfig) => {
    try {
      const res = await fetch(`/api/agent-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Agent config saved!' });
        fetchAgentConfigs();
        setSelectedConfig(null);
      } else {
        setMessage({ type: 'error', text: 'Failed to save agent config' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving agent config' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <span>⚙️</span>
              Settings
            </h1>
            <p className="text-white/50 mt-1">Configure automation and agent behavior</p>
          </div>
          <Link 
            href="/"
            className="px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all text-sm"
          >
            ← Back to Board
          </Link>
        </div>

        {/* Message Toast */}
        {message && (
          <div className={`fixed top-4 right-4 px-4 py-3 rounded-xl shadow-lg z-50 ${
            message.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
          } text-white text-sm`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="text-white/40 text-center py-12">Loading settings...</div>
        ) : (
          <div className="space-y-6">
            {/* Automation Settings */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>🤖</span>
                Automation
              </h2>
              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <div>
                    <div className="text-white/80">Auto-assign tasks</div>
                    <div className="text-xs text-white/40">Automatically assign new tasks to specialists based on keywords</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoAssign}
                    onChange={(e) => setSettings({ ...settings, autoAssign: e.target.checked })}
                    className="w-5 h-5 rounded border-white/20 bg-black/30 text-blue-500 focus:ring-blue-500"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <div>
                    <div className="text-white/80">Auto-spawn agents</div>
                    <div className="text-xs text-white/40">Automatically start LLM agents when tasks change status</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoSpawnAgents}
                    onChange={(e) => setSettings({ ...settings, autoSpawnAgents: e.target.checked })}
                    className="w-5 h-5 rounded border-white/20 bg-black/30 text-blue-500 focus:ring-blue-500"
                  />
                </label>
                <div>
                  <label className="block text-white/80 mb-2">Default Model</label>
                  <select
                    value={settings.defaultModel}
                    onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value })}
                    className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50"
                  >
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-white/80 mb-2">Max Concurrent Agents</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.maxConcurrentAgents}
                    onChange={(e) => setSettings({ ...settings, maxConcurrentAgents: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Budget Settings */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>💰</span>
                Budget & Limits
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-white/80 mb-2">Daily Budget ($)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={settings.dailyBudgetCents / 100}
                    onChange={(e) => setSettings({ ...settings, dailyBudgetCents: Math.round(parseFloat(e.target.value) * 100) || 100 })}
                    className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50"
                  />
                  <div className="text-xs text-white/40 mt-1">Agent runs will be paused when daily limit is reached</div>
                </div>
                <div>
                  <label className="block text-white/80 mb-2">Alert Threshold (%)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={settings.alertThresholdPercent}
                    onChange={(e) => setSettings({ ...settings, alertThresholdPercent: parseInt(e.target.value) || 80 })}
                    className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50"
                  />
                  <div className="text-xs text-white/40 mt-1">Show warning when budget usage exceeds this percentage</div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            {/* Agent Configs */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>🧠</span>
                Agent Configurations
              </h2>
              <div className="space-y-3">
                {agentConfigs.map((config) => (
                  <div
                    key={config.id}
                    className="p-4 bg-black/20 border border-white/5 rounded-xl hover:border-white/20 transition-colors cursor-pointer"
                    onClick={() => setSelectedConfig(config)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white/80 font-medium">{config.name}</div>
                        <div className="text-xs text-white/40">{config.specialization}</div>
                      </div>
                      <div className="text-xs text-white/30">{config.model}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Agent Config Modal */}
        {selectedConfig && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">Edit {selectedConfig.name}</h3>
                <button
                  onClick={() => setSelectedConfig(null)}
                  className="text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-white/70 text-sm mb-2">Specialization</label>
                  <input
                    type="text"
                    value={selectedConfig.specialization}
                    onChange={(e) => setSelectedConfig({ ...selectedConfig, specialization: e.target.value })}
                    className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Model</label>
                  <select
                    value={selectedConfig.model}
                    onChange={(e) => setSelectedConfig({ ...selectedConfig, model: e.target.value })}
                    className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50"
                  >
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Temperature</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={selectedConfig.temperature}
                      onChange={(e) => setSelectedConfig({ ...selectedConfig, temperature: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Max Tokens</label>
                    <input
                      type="number"
                      min="1000"
                      max="100000"
                      value={selectedConfig.max_tokens}
                      onChange={(e) => setSelectedConfig({ ...selectedConfig, max_tokens: parseInt(e.target.value) || 8000 })}
                      className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">System Prompt</label>
                  <textarea
                    value={selectedConfig.system_prompt || ''}
                    onChange={(e) => setSelectedConfig({ ...selectedConfig, system_prompt: e.target.value })}
                    rows={6}
                    className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white focus:border-blue-500/50 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedConfig(null)}
                  className="px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveAgentConfig(selectedConfig)}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
