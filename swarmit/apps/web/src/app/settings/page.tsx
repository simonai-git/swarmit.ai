'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, Github, Trash2, Bot, Train } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api, type AutomationSettings, type IntegrationToken, type UserProfile } from '@/lib/api';

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const [, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [autoAssign, setAutoAssign] = useState(false);
  const [autoSpawn, setAutoSpawn] = useState(false);
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4-20250514');
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3);
  const [dailyBudgetCents, setDailyBudgetCents] = useState(1000);

  // Integration state
  const [integrationTokens, setIntegrationTokens] = useState<IntegrationToken[]>([]);

  // Claude AI state
  const [claudeKey, setClaudeKey] = useState('');
  const [savingClaude, setSavingClaude] = useState(false);
  const [claudeConnected, setClaudeConnected] = useState(false);
  const [claudeMaskedKey, setClaudeMaskedKey] = useState('');
  const [disconnectingClaude, setDisconnectingClaude] = useState(false);

  // Handle URL params for OAuth callbacks
  useEffect(() => {
    const railwayParam = searchParams.get('railway');
    const githubParam = searchParams.get('github');
    const errorParam = searchParams.get('error');
    if (railwayParam === 'connected') {
      toast.success('Railway account connected');
      // Refresh integration tokens
      api.integrations.listTokens().then(data => setIntegrationTokens(data.tokens)).catch(() => {});
      window.history.replaceState({}, '', '/settings');
    }
    if (githubParam === 'connected') {
      toast.success('GitHub account connected');
      api.integrations.listTokens().then(data => setIntegrationTokens(data.tokens)).catch(() => {});
      window.history.replaceState({}, '', '/settings');
    }
    if (errorParam) {
      toast.error(`OAuth error: ${errorParam}`);
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams]);

  // Fetch profile for Claude API key status
  useEffect(() => {
    api.profile.get()
      .then((profile: UserProfile) => {
        if (profile.claudeApiKey) {
          setClaudeConnected(true);
          // Show masked key: first 8 chars + dots
          const key = profile.claudeApiKey;
          setClaudeMaskedKey(key.length > 8 ? `${key.slice(0, 8)}${'*'.repeat(20)}` : '*'.repeat(20));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.integrations.listTokens()
      .then(data => setIntegrationTokens(data.tokens))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await api.profile.getAutomation();
        setSettings(data);
        setAutoAssign(data.autoAssign);
        setAutoSpawn(data.autoSpawn);
        setDefaultModel(data.defaultModel);
        setMaxConcurrentAgents(data.maxConcurrentAgents);
        setDailyBudgetCents(data.dailyBudgetCents);
      } catch (err) {
        console.error('Failed to fetch automation settings:', err);
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);

    try {
      await api.profile.updateAutomation({
        autoAssign,
        autoSpawn,
        defaultModel,
        maxConcurrentAgents,
        dailyBudgetCents,
      });
      toast.success('Settings saved');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="h-64 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="w-7 h-7 text-zinc-400" />
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Automation</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Configure how agents are assigned and triggered automatically.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Auto-Assign */}
          <label className="flex items-start gap-4 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoAssign}
              onChange={(e) => setAutoAssign(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
            />
            <div>
              <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                Auto-Assign
              </span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Automatically assign agents to new tasks based on their specialization.
              </p>
            </div>
          </label>

          {/* Auto-Spawn */}
          <label className="flex items-start gap-4 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoSpawn}
              onChange={(e) => setAutoSpawn(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
            />
            <div>
              <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                Auto-Spawn
              </span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Automatically trigger agent runs when tasks are assigned.
              </p>
            </div>
          </label>

          {/* Default Model */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Default Model
            </label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              The Claude model used for new agent runs by default.
            </p>
          </div>

          {/* Max Concurrent Agents */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Max Concurrent Agents
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxConcurrentAgents}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 10) {
                  setMaxConcurrentAgents(val);
                }
              }}
              className="w-32 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Maximum number of agents that can run simultaneously (1-10).
            </p>
          </div>

          {/* Daily Budget */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Daily Budget
            </label>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-sm">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={(dailyBudgetCents / 100).toFixed(2)}
                onChange={(e) => {
                  const dollars = parseFloat(e.target.value);
                  if (!isNaN(dollars) && dollars >= 0) {
                    setDailyBudgetCents(Math.round(dollars * 100));
                  }
                }}
                className="w-40 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Maximum daily spend across all agent runs. Stored as {dailyBudgetCents} cents.
            </p>
          </div>
        </div>

        {/* Save */}
        <div className="p-6 border-t border-zinc-800 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
      {/* Integrations */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg mt-8">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Integrations</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Connect external services to enable agent tools.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Claude AI */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bot className="w-5 h-5 text-zinc-300" />
              <span className="text-sm font-medium text-white">Claude AI</span>
              {claudeConnected && (
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Connected</span>
              )}
            </div>

            {claudeConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400 font-mono">{claudeMaskedKey}</span>
                <button
                  onClick={async () => {
                    setDisconnectingClaude(true);
                    try {
                      await api.profile.update({ claudeApiKey: null });
                      setClaudeConnected(false);
                      setClaudeMaskedKey('');
                      toast.success('Claude API key removed');
                    } catch {
                      toast.error('Failed to remove Claude API key');
                    } finally {
                      setDisconnectingClaude(false);
                    }
                  }}
                  disabled={disconnectingClaude}
                  className="p-1 text-red-400 hover:text-red-300 transition-colors"
                  title="Remove"
                >
                  {disconnectingClaude ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-... or anthropic OAT token"
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={async () => {
                    if (!claudeKey.trim()) return;
                    setSavingClaude(true);
                    try {
                      await api.profile.update({ claudeApiKey: claudeKey });
                      setClaudeConnected(true);
                      const key = claudeKey;
                      setClaudeMaskedKey(key.length > 8 ? `${key.slice(0, 8)}${'*'.repeat(20)}` : '*'.repeat(20));
                      setClaudeKey('');
                      toast.success('Claude API key saved');
                    } catch {
                      toast.error('Failed to save Claude API key');
                    } finally {
                      setSavingClaude(false);
                    }
                  }}
                  disabled={savingClaude || !claudeKey.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {savingClaude ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </button>
              </div>
            )}
            <p className="text-xs text-zinc-500 mt-1">
              Your Anthropic API key or OAT token. Used by agents to call Claude.
            </p>
          </div>

          {/* GitHub */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Github className="w-5 h-5 text-zinc-300" />
              <span className="text-sm font-medium text-white">GitHub</span>
              {integrationTokens.some(t => t.provider === 'github') && (
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Connected</span>
              )}
            </div>

            {integrationTokens.some(t => t.provider === 'github') ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">GitHub account connected</span>
                <button
                  onClick={async () => {
                    await api.integrations.deleteToken('github').catch(() => {});
                    setIntegrationTokens(prev => prev.filter(t => t.provider !== 'github'));
                    toast.success('GitHub disconnected');
                  }}
                  className="p-1 text-red-400 hover:text-red-300 transition-colors"
                  title="Disconnect"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <a
                href="/api/integrations/github/connect"
                className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Github className="w-4 h-4" />
                Connect GitHub
              </a>
            )}
            <p className="text-xs text-zinc-500 mt-1">
              Connect your GitHub account via OAuth. Enables agents to clone, push, and create PRs.
            </p>
          </div>

          {/* Railway */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Train className="w-5 h-5 text-zinc-300" />
              <span className="text-sm font-medium text-white">Railway</span>
              {integrationTokens.some(t => t.provider === 'railway') && (
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Connected</span>
              )}
            </div>

            {integrationTokens.some(t => t.provider === 'railway') ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">Railway account connected</span>
                <button
                  onClick={async () => {
                    await api.integrations.deleteToken('railway').catch(() => {});
                    setIntegrationTokens(prev => prev.filter(t => t.provider !== 'railway'));
                    toast.success('Railway disconnected');
                  }}
                  className="p-1 text-red-400 hover:text-red-300 transition-colors"
                  title="Disconnect"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <a
                href="/api/integrations/railway/connect"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Train className="w-4 h-4" />
                Connect Railway
              </a>
            )}
            <p className="text-xs text-zinc-500 mt-1">
              Connect your Railway account via OAuth to let agents deploy and manage services.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="h-64 bg-zinc-800 rounded" />
        </div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
