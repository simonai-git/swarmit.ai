'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsed: string | null;
}

interface ClaudeConnection {
  connected: boolean;
  maskedKey?: string;
  connectedAt?: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [claudeConnection, setClaudeConnection] = useState<ClaudeConnection>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Claude API key input state
  const [showClaudeInput, setShowClaudeInput] = useState(false);
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [savingClaude, setSavingClaude] = useState(false);

  useEffect(() => {
    fetchKeys();
    fetchClaudeConnection();
  }, []);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/profile/api-keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClaudeConnection = async () => {
    try {
      const res = await fetch('/api/profile/claude-key');
      if (res.ok) {
        const data = await res.json();
        setClaudeConnection(data);
      }
    } catch (error) {
      console.error('Failed to fetch Claude connection:', error);
    }
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    
    try {
      const res = await fetch('/api/profile/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedKey(data.key);
        setKeys(prev => [data.keyInfo, ...prev]);
        setNewKeyName('');
      }
    } catch (error) {
      console.error('Failed to create API key:', error);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;
    
    try {
      const res = await fetch(`/api/profile/api-keys/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setKeys(prev => prev.filter(k => k.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete API key:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveClaudeKey = async () => {
    if (!claudeApiKey.trim()) return;
    
    setSavingClaude(true);
    try {
      const res = await fetch('/api/profile/claude-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: claudeApiKey }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setClaudeConnection({
          connected: true,
          maskedKey: data.maskedKey,
          connectedAt: new Date().toISOString(),
        });
        setClaudeApiKey('');
        setShowClaudeInput(false);
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to save Claude API key');
      }
    } catch (error) {
      console.error('Failed to save Claude key:', error);
      alert('Failed to save Claude API key');
    } finally {
      setSavingClaude(false);
    }
  };

  const disconnectClaude = async () => {
    if (!confirm('Are you sure you want to disconnect Claude?')) return;
    
    try {
      const res = await fetch('/api/profile/claude-key', {
        method: 'DELETE',
      });
      if (res.ok) {
        setClaudeConnection({ connected: false });
      }
    } catch (error) {
      console.error('Failed to disconnect Claude:', error);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">API Keys & Authentication</h1>

      {/* Claude Token Section */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-white">Claude by Anthropic</h2>
              <p className="text-sm text-gray-400">Connect your Claude API key or OAuth token</p>
            </div>
          </div>
          
          {claudeConnection.connected ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                Connected
              </span>
              <button
                onClick={disconnectClaude}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClaudeInput(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <Key className="w-4 h-4" />
              Add Token
            </button>
          )}
        </div>

        {/* Claude Token Input */}
        {showClaudeInput && !claudeConnection.connected && (
          <div className="p-4 bg-gray-700/50 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Claude API Key or OAuth Token
              </label>
              <p className="text-xs text-gray-500 mb-3">
                <strong>API Key:</strong> Get from{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Anthropic Console
                  <ExternalLink className="w-3 h-3 inline ml-1" />
                </a>
                {' '}(starts with <code className="text-orange-400">sk-ant-api</code>)
                <br />
                <strong>OAuth Token:</strong> From apps like OpenClaw (starts with <code className="text-orange-400">sk-ant-oat</code>)
              </p>
              <input
                type="password"
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder="sk-ant-api03-... or sk-ant-oat01-..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveClaudeKey}
                disabled={!claudeApiKey.trim() || savingClaude}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingClaude ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>Save Key</>
                )}
              </button>
              <button
                onClick={() => {
                  setShowClaudeInput(false);
                  setClaudeApiKey('');
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {claudeConnection.connected && (
          <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">API Key:</span>
                <p className="text-white font-mono">{claudeConnection.maskedKey || 'sk-ant-***'}</p>
              </div>
              <div>
                <span className="text-gray-400">Connected Since:</span>
                <p className="text-white">
                  {claudeConnection.connectedAt 
                    ? new Date(claudeConnection.connectedAt).toLocaleDateString()
                    : 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="mt-4 text-sm text-gray-500">
          Your token is encrypted and securely stored. Agents will use this for AI operations.
          OAuth tokens (OAT) from services like OpenClaw may have usage included in that service's billing.
        </p>
      </div>

      {/* API Keys Section */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Swarm It API Keys</h2>
            <p className="text-sm text-gray-400">Manage API keys for external integrations</p>
          </div>
          <button
            onClick={() => setShowNewKey(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Key
          </button>
        </div>

        {/* New Key Form */}
        {showNewKey && (
          <div className="px-6 py-4 border-b border-gray-700 bg-gray-750">
            {generatedKey ? (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-yellow-400 mb-2">
                    ⚠️ Copy this key now. You won't be able to see it again!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 bg-gray-900 rounded text-green-400 font-mono text-sm break-all">
                      {generatedKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(generatedKey)}
                      className="p-2 text-gray-400 hover:text-white transition-colors"
                    >
                      {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setGeneratedKey(null);
                    setShowNewKey(false);
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex gap-4">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g., Production, Development)"
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={createKey}
                  disabled={!newKeyName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewKey(false);
                    setNewKeyName('');
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Keys List */}
        <div className="divide-y divide-gray-700">
          {loading ? (
            <div className="px-6 py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          ) : keys.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-sm">Create a key to get started with the API</p>
            </div>
          ) : (
            keys.map((key) => (
              <div key={key.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-750">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
                    <Key className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{key.name}</p>
                    <p className="text-sm text-gray-500 font-mono">{key.prefix}...</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <p className="text-gray-400">Created {new Date(key.createdAt).toLocaleDateString()}</p>
                    <p className="text-gray-500">
                      {key.lastUsed 
                        ? `Last used ${new Date(key.lastUsed).toLocaleDateString()}`
                        : 'Never used'}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteKey(key.id)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
