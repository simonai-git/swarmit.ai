'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, Github, Trash2, Bot, Train, Mail, Crown, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api, type IntegrationToken, type UserProfile } from '@/lib/api';
import ClaudeOAuthModal from '@/components/ClaudeOAuthModal';
import ConfirmDialog from '@/components/ConfirmDialog';

type Tab = 'profile' | 'automation' | 'integrations';

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === 'integrations' ? 'integrations' : tabParam === 'automation' ? 'automation' : 'profile'
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Automation state
  const [autoAssign, setAutoAssign] = useState(false);
  const [autoSpawn, setAutoSpawn] = useState(false);
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4-20250514');
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3);
  const [dailyBudgetCents, setDailyBudgetCents] = useState(1000);

  // Integration state
  const [integrationTokens, setIntegrationTokens] = useState<IntegrationToken[]>([]);
  const [claudeKey, setClaudeKey] = useState('');
  const [savingClaude, setSavingClaude] = useState(false);
  const [claudeConnected, setClaudeConnected] = useState(false);
  const [claudeMaskedKey, setClaudeMaskedKey] = useState('');
  const [showClaudeOAuth, setShowClaudeOAuth] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);

  // Handle URL params for OAuth callbacks
  useEffect(() => {
    const railwayParam = searchParams.get('railway');
    const githubParam = searchParams.get('github');
    const errorParam = searchParams.get('error');
    if (railwayParam === 'connected' || githubParam === 'connected') {
      toast.success(railwayParam === 'connected' ? 'Railway account connected' : 'GitHub account connected');
      api.integrations.listTokens().then(data => setIntegrationTokens(data.tokens)).catch(() => {});
      setActiveTab('integrations');
      window.history.replaceState({}, '', '/settings?tab=integrations');
    }
    if (errorParam) {
      toast.error(`OAuth error: ${errorParam}`);
      window.history.replaceState({}, '', '/settings?tab=integrations');
    }
  }, [searchParams]);

  // Fetch all data
  useEffect(() => {
    async function fetchAll() {
      try {
        const [prof, automation, tokens] = await Promise.all([
          api.profile.get(),
          api.profile.getAutomation(),
          api.integrations.listTokens(),
        ]);
        setProfile(prof);
        setName(prof.name || '');
        if (prof.claudeApiKey) {
          setClaudeConnected(true);
          const key = prof.claudeApiKey;
          setClaudeMaskedKey(key.length > 8 ? `${key.slice(0, 8)}${'*'.repeat(20)}` : '*'.repeat(20));
        }
        setAutoAssign(automation.autoAssign);
        setAutoSpawn(automation.autoSpawn);
        setDefaultModel(automation.defaultModel);
        setMaxConcurrentAgents(automation.maxConcurrentAgents);
        setDailyBudgetCents(automation.dailyBudgetCents);
        setIntegrationTokens(tokens.tokens);
      } catch (err) {
        console.error('Failed to load settings:', err);
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await api.profile.update({ name: name.trim() || undefined });
      setProfile(prev => prev ? { ...prev, name: name.trim() || null } : prev);
      toast.success('Name updated');
    } catch {
      toast.error('Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveAutomation = async () => {
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
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirmDisconnect) return;
    try {
      if (confirmDisconnect === 'key') {
        await api.profile.update({ claudeApiKey: null });
        setClaudeConnected(false);
        setClaudeMaskedKey('');
        toast.success('Claude API key removed');
      } else {
        await api.integrations.deleteToken(confirmDisconnect);
        setIntegrationTokens(prev => prev.filter(t => t.provider !== confirmDisconnect));
        toast.success(`${confirmDisconnect.charAt(0).toUpperCase() + confirmDisconnect.slice(1)} disconnected`);
      }
    } catch {
      toast.error('Failed to disconnect');
    }
    setConfirmDisconnect(null);
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
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <Settings className="w-7 h-7 text-zinc-400" />
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {(['profile', 'automation', 'integrations'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              activeTab === tab ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && profile && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-white">Profile</h2>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-1.5">
                <Mail className="w-3.5 h-3.5" />
                Email
              </label>
              <input
                type="email"
                value={profile.email}
                readOnly
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-400 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-1.5">
                <Crown className="w-3.5 h-3.5" />
                Plan
              </label>
              <span className="inline-flex items-center px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-medium rounded-full capitalize">
                {profile.plan}
              </span>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Member Since
              </label>
              <p className="text-sm text-white">
                {new Date(profile.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <div className="p-6 border-t border-zinc-800 flex justify-end">
            <button
              onClick={handleSaveName}
              disabled={savingName}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingName ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Automation Tab */}
      {activeTab === 'automation' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-white">Automation</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Configure how agents are assigned and triggered automatically.
            </p>
          </div>
          <div className="p-6 space-y-6">
            <label className="flex items-start gap-4 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => setAutoAssign(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">Auto-Assign</span>
                <p className="text-xs text-zinc-500 mt-0.5">Automatically assign agents to new tasks based on their specialization.</p>
              </div>
            </label>
            <label className="flex items-start gap-4 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoSpawn}
                onChange={(e) => setAutoSpawn(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">Auto-Spawn</span>
                <p className="text-xs text-zinc-500 mt-0.5">Automatically trigger agent runs when tasks are assigned.</p>
              </div>
            </label>
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Default Model</label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">The Claude model used for new agent runs by default.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Max Concurrent Agents</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxConcurrentAgents}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 10) setMaxConcurrentAgents(val);
                }}
                className="w-32 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-zinc-500 mt-1">Maximum number of agents that can run simultaneously (1-10).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Daily Budget</label>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={(dailyBudgetCents / 100).toFixed(2)}
                  onChange={(e) => {
                    const dollars = parseFloat(e.target.value);
                    if (!isNaN(dollars) && dollars >= 0) setDailyBudgetCents(Math.round(dollars * 100));
                  }}
                  className="w-40 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">Maximum daily spend across all agent runs.</p>
            </div>
          </div>
          <div className="p-6 border-t border-zinc-800 flex justify-end">
            <button
              onClick={handleSaveAutomation}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          {/* Claude AI */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-zinc-400" />
                Claude AI
              </h2>
              <p className="text-sm text-zinc-400 mt-1">Connect via OAuth or paste an API key.</p>
            </div>
            <div className="p-6 space-y-5">
              {(claudeConnected || integrationTokens.some(t => t.provider === 'anthropic')) && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Current Connection</label>
                  {integrationTokens.some(t => t.provider === 'anthropic') ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-green-400">Connected via OAuth</span>
                      <button
                        onClick={() => setConfirmDisconnect('anthropic')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Disconnect
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <code className="text-sm text-green-400 font-mono">{claudeMaskedKey}</code>
                      <button
                        onClick={() => setConfirmDisconnect('key')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!integrationTokens.some(t => t.provider === 'anthropic') && (
                <>
                  <button
                    onClick={() => setShowClaudeOAuth(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Bot className="w-4 h-4" /> Connect with Claude
                  </button>
                  {!claudeConnected && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 border-t border-zinc-700" />
                        <span className="text-xs text-zinc-500">or paste API key</span>
                        <div className="flex-1 border-t border-zinc-700" />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={claudeKey}
                          onChange={(e) => setClaudeKey(e.target.value)}
                          placeholder="sk-ant-... or OAT token"
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
                    </>
                  )}
                </>
              )}

              <ClaudeOAuthModal
                open={showClaudeOAuth}
                onClose={() => setShowClaudeOAuth(false)}
                onConnected={() => {
                  api.integrations.listTokens().then(data => setIntegrationTokens(data.tokens)).catch(() => {});
                  toast.success('Claude connected via OAuth');
                }}
              />
            </div>
          </div>

          {/* GitHub */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="p-6">
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
                  <button onClick={() => setConfirmDisconnect('github')} className="p-1 text-red-400 hover:text-red-300 transition-colors" title="Disconnect">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <a href="/api/integrations/github/connect" className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors">
                  <Github className="w-4 h-4" /> Connect GitHub
                </a>
              )}
              <p className="text-xs text-zinc-500 mt-2">Enables agents to clone, push, and create PRs.</p>
            </div>
          </div>

          {/* Railway */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="p-6">
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
                  <button onClick={() => setConfirmDisconnect('railway')} className="p-1 text-red-400 hover:text-red-300 transition-colors" title="Disconnect">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <a href="/api/integrations/railway/connect" className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
                  <Train className="w-4 h-4" /> Connect Railway
                </a>
              )}
              <p className="text-xs text-zinc-500 mt-2">Connect Railway to let agents deploy and manage services.</p>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDisconnect}
        onClose={() => setConfirmDisconnect(null)}
        onConfirm={handleDisconnect}
        title={confirmDisconnect === 'key' ? 'Remove API Key' : `Disconnect ${confirmDisconnect ?? ''}`}
        message={
          confirmDisconnect === 'key'
            ? 'Remove your Claude API key? Agents will not be able to run until a new key is provided.'
            : `Disconnect ${confirmDisconnect}? You will need to reconnect to use this integration.`
        }
        confirmLabel={confirmDisconnect === 'key' ? 'Remove' : 'Disconnect'}
        variant="danger"
      />
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
