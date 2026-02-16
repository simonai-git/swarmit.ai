'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  User,
  Mail,
  Calendar,
  Crown,
  Key,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Unlink,
  Github,
  Train,
  Trash2,
  LogIn,
  Bot,
} from 'lucide-react';
import { api, ApiError, type UserProfile, type IntegrationToken } from '@/lib/api';
import ClaudeOAuthModal from '@/components/ClaudeOAuthModal';

type Tab = 'general' | 'integrations';

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // General tab state
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Integrations tab state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [integrationTokens, setIntegrationTokens] = useState<IntegrationToken[]>([]);
  const [showClaudeOAuth, setShowClaudeOAuth] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await api.profile.get();
        setProfile(data);
        setName(data.name || '');
      } catch (err) {
        console.error('Failed to fetch profile:', err);
        if (err instanceof ApiError && err.status === 401) {
          setAuthError(true);
        } else {
          setFeedback({ type: 'error', message: 'Failed to load profile. Make sure the API server is running.' });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Fetch integration tokens independently
  useEffect(() => {
    api.integrations.listTokens()
      .then(data => setIntegrationTokens(data.tokens))
      .catch(() => {});
  }, []);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    if (type === 'success') {
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleSaveName = async () => {
    setSavingName(true);
    setFeedback(null);
    try {
      await api.profile.update({ name: name.trim() || undefined });
      setProfile((prev) => (prev ? { ...prev, name: name.trim() || null } : prev));
      showFeedback('success', 'Name updated successfully.');
    } catch (err) {
      console.error('Failed to update name:', err);
      showFeedback('error', 'Failed to update name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    setFeedback(null);
    try {
      await api.profile.update({ claudeApiKey: apiKeyInput.trim() });
      setProfile((prev) =>
        prev ? { ...prev, claudeApiKey: maskKey(apiKeyInput.trim()) } : prev,
      );
      setApiKeyInput('');
      showFeedback('success', 'API key saved successfully.');
    } catch (err) {
      console.error('Failed to save API key:', err);
      showFeedback('error', 'Failed to save API key.');
    } finally {
      setSavingKey(false);
    }
  };

  const handleDisconnectKey = async () => {
    if (!confirm('Remove your Claude API key? Agents will not be able to run until a new key is provided.')) {
      return;
    }
    setDisconnecting(true);
    setFeedback(null);
    try {
      await api.profile.update({ claudeApiKey: null });
      setProfile((prev) => (prev ? { ...prev, claudeApiKey: null } : prev));
      showFeedback('success', 'API key removed.');
    } catch (err) {
      console.error('Failed to remove API key:', err);
      showFeedback('error', 'Failed to remove API key.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDisconnectIntegration = async (provider: string) => {
    if (!confirm(`Disconnect ${provider}? You will need to reconnect to run agents.`)) {
      return;
    }
    try {
      await api.integrations.deleteToken(provider);
      setIntegrationTokens(prev => prev.filter(t => t.provider !== provider));
      showFeedback('success', `${provider.charAt(0).toUpperCase() + provider.slice(1)} disconnected.`);
      // Re-fetch to confirm deletion
      api.integrations.listTokens()
        .then(data => setIntegrationTokens(data.tokens))
        .catch(() => {});
    } catch (err) {
      console.error(`Failed to disconnect ${provider}:`, err);
      showFeedback('error', `Failed to disconnect ${provider}.`);
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

  if (authError) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <User className="w-7 h-7 text-zinc-400" />
          <h1 className="text-2xl font-bold text-white">Profile</h1>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <AlertCircle className="w-10 h-10 text-zinc-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Not signed in</h2>
          <p className="text-sm text-zinc-400 mb-6">
            Sign in to view your profile and manage integrations.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <User className="w-7 h-7 text-zinc-400" />
        <h1 className="text-2xl font-bold text-white">Profile</h1>
      </div>

      {feedback && (
        <div
          className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            feedback.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'general'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'integrations'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Integrations
        </button>
      </div>

      {/* General Tab */}
      {activeTab === 'general' && profile && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-white">General Information</h2>
          </div>

          <div className="p-6 space-y-6">
            {/* Email (read-only) */}
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

            {/* Name (editable) */}
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Plan badge */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-1.5">
                <Crown className="w-3.5 h-3.5" />
                Plan
              </label>
              <span className="inline-flex items-center px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-medium rounded-full capitalize">
                {profile.plan}
              </span>
            </div>

            {/* Member since */}
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
              {savingName ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {savingName ? 'Saving...' : 'Save Name'}
            </button>
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          {/* Claude API Key */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-zinc-400" />
                Claude API Key
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                Required for running agents. Connect via OAuth or paste an API key.
              </p>
            </div>

            <div className="p-6 space-y-5">
              {/* Current key status */}
              {(profile?.claudeApiKey || integrationTokens.some(t => t.provider === 'anthropic')) && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                    Current Key
                  </label>
                  {integrationTokens.some(t => t.provider === 'anthropic') ? (
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-green-400 text-sm">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Connected via OAuth
                      </span>
                      <button
                        onClick={() => handleDisconnectIntegration('anthropic')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm rounded-lg transition-colors"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Disconnect
                      </button>
                    </div>
                  ) : profile?.claudeApiKey ? (
                    <div className="flex items-center gap-3">
                      <code className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-green-400 text-sm font-mono">
                        {profile.claudeApiKey}
                      </code>
                      <button
                        onClick={handleDisconnectKey}
                        disabled={disconnecting}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        {disconnecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Unlink className="w-3.5 h-3.5" />
                        )}
                        Disconnect
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Connect with Claude (OAuth) */}
              {!integrationTokens.some(t => t.provider === 'anthropic') && (
                <div>
                  <button
                    onClick={() => setShowClaudeOAuth(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Bot className="w-4 h-4" />
                    Connect with Claude
                  </button>
                  <p className="text-xs text-zinc-500 mt-2">
                    Recommended — uses your Claude Pro/Max subscription.
                  </p>
                </div>
              )}

              {/* Divider */}
              {!integrationTokens.some(t => t.provider === 'anthropic') && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-zinc-700" />
                  <span className="text-xs text-zinc-500">or</span>
                  <div className="flex-1 border-t border-zinc-700" />
                </div>
              )}

              {/* Paste API key */}
              {!integrationTokens.some(t => t.provider === 'anthropic') && (
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    Paste API Key
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="sk-ant-api..."
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm font-mono placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                    />
                    <button
                      onClick={handleSaveApiKey}
                      disabled={savingKey || !apiKeyInput.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {savingKey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Get an API key from <code className="text-zinc-400">console.anthropic.com</code>.
                  </p>
                </div>
              )}
            </div>
          </div>

          <ClaudeOAuthModal
            open={showClaudeOAuth}
            onClose={() => setShowClaudeOAuth(false)}
            onConnected={() => {
              api.integrations.listTokens()
                .then(data => setIntegrationTokens(data.tokens))
                .catch(() => {});
            }}
          />

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
                  <button
                    onClick={() => handleDisconnectIntegration('github')}
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
              <p className="text-xs text-zinc-500 mt-2">
                Connect your GitHub account via OAuth. Enables agents to clone, push, and create PRs.
              </p>
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
                  <button
                    onClick={() => handleDisconnectIntegration('railway')}
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
              <p className="text-xs text-zinc-500 mt-2">
                Connect your Railway account via OAuth to let agents deploy and manage services.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function maskKey(key: string): string {
  if (key.length <= 12) return key;
  const prefix = key.slice(0, 10);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}
