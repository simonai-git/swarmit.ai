'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Check, X, RefreshCw, Plug, Train, Github, Cloud, Sparkles, Key } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  account?: string;
  connectedAt?: string;
  features: string[];
}

interface RailwayProject {
  id: string;
  name: string;
  environments: { id: string; name: string }[];
}

export default function IntegrationsPage() {
  // Railway state
  const [railwayConnected, setRailwayConnected] = useState(false);
  const [railwayProjects, setRailwayProjects] = useState<RailwayProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [railwayToken, setRailwayToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Claude state
  const [claudeConnected, setClaudeConnected] = useState(false);
  const [claudeMaskedKey, setClaudeMaskedKey] = useState('');
  const [claudeToken, setClaudeToken] = useState('');
  const [showClaudeInput, setShowClaudeInput] = useState(false);
  const [connectingClaude, setConnectingClaude] = useState(false);

  // GitHub state
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [connectingGithub, setConnectingGithub] = useState(false);

  useEffect(() => {
    fetchIntegrations();
    fetchClaudeConnection();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch('/api/profile/integrations');
      if (res.ok) {
        const data = await res.json();
        setRailwayConnected(data.railway?.connected || false);
        setRailwayProjects(data.railway?.projects || []);
        setSelectedProject(data.railway?.selectedProject || '');
        setGithubConnected(data.github?.connected || false);
        setGithubUsername(data.github?.username || '');
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClaudeConnection = async () => {
    try {
      const res = await fetch('/api/profile/claude-key');
      if (res.ok) {
        const data = await res.json();
        setClaudeConnected(data.connected || false);
        setClaudeMaskedKey(data.maskedKey || '');
      }
    } catch (error) {
      console.error('Failed to fetch Claude connection:', error);
    }
  };

  const connectClaude = async () => {
    if (!claudeToken.trim()) return;
    
    setConnectingClaude(true);
    try {
      const res = await fetch('/api/profile/claude-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: claudeToken }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setClaudeConnected(true);
        setClaudeMaskedKey(data.maskedKey || '');
        setShowClaudeInput(false);
        setClaudeToken('');
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to connect Claude');
      }
    } catch (error) {
      console.error('Failed to connect Claude:', error);
      alert('Failed to connect Claude');
    } finally {
      setConnectingClaude(false);
    }
  };

  const disconnectClaude = async () => {
    if (!confirm('Are you sure you want to disconnect Claude?')) return;
    
    try {
      const res = await fetch('/api/profile/claude-key', {
        method: 'DELETE',
      });
      if (res.ok) {
        setClaudeConnected(false);
        setClaudeMaskedKey('');
      }
    } catch (error) {
      console.error('Failed to disconnect Claude:', error);
    }
  };

  const connectRailway = async () => {
    if (!railwayToken.trim()) return;
    
    setConnecting(true);
    try {
      const res = await fetch('/api/profile/integrations/railway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: railwayToken }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setRailwayConnected(true);
        setRailwayProjects(data.projects || []);
        setShowTokenInput(false);
        setRailwayToken('');
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to connect to Railway');
      }
    } catch (error) {
      console.error('Failed to connect Railway:', error);
      alert('Failed to connect to Railway');
    } finally {
      setConnecting(false);
    }
  };

  const disconnectRailway = async () => {
    if (!confirm('Are you sure you want to disconnect Railway?')) return;
    
    try {
      const res = await fetch('/api/profile/integrations/railway', {
        method: 'DELETE',
      });
      if (res.ok) {
        setRailwayConnected(false);
        setRailwayProjects([]);
        setSelectedProject('');
      }
    } catch (error) {
      console.error('Failed to disconnect Railway:', error);
    }
  };

  const connectGithub = async () => {
    if (!githubToken.trim()) return;

    setConnectingGithub(true);
    try {
      const res = await fetch('/api/profile/integrations/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken }),
      });

      if (res.ok) {
        const data = await res.json();
        setGithubConnected(true);
        setGithubUsername(data.username || '');
        setShowGithubInput(false);
        setGithubToken('');
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to connect GitHub');
      }
    } catch (error) {
      console.error('Failed to connect GitHub:', error);
      alert('Failed to connect GitHub');
    } finally {
      setConnectingGithub(false);
    }
  };

  const disconnectGithub = async () => {
    if (!confirm('Are you sure you want to disconnect GitHub?')) return;

    try {
      const res = await fetch('/api/profile/integrations/github', {
        method: 'DELETE',
      });
      if (res.ok) {
        setGithubConnected(false);
        setGithubUsername('');
      }
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error);
    }
  };

  const selectProject = async (projectId: string) => {
    try {
      const res = await fetch('/api/profile/integrations/railway/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        setSelectedProject(projectId);
      }
    } catch (error) {
      console.error('Failed to select project:', error);
    }
  };

  const integrations = [
    {
      id: 'claude',
      name: 'Claude by Anthropic',
      description: 'AI-powered agents for autonomous task execution',
      icon: <Sparkles className="w-6 h-6" />,
      color: 'from-orange-500 to-pink-500',
      connected: claudeConnected,
      features: [
        'Autonomous task execution',
        'Code generation and review',
        'Natural language understanding',
        'Multi-step reasoning',
      ],
    },
    {
      id: 'railway',
      name: 'Railway',
      description: 'Deploy and manage applications directly from Swarm It',
      icon: <Train className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      connected: railwayConnected,
      features: [
        'Automatic deployments on task completion',
        'Environment management',
        'Deploy previews for code changes',
        'Resource monitoring',
      ],
    },
    {
      id: 'github',
      name: 'GitHub',
      description: 'Push agent code to GitHub repositories',
      icon: <Github className="w-6 h-6" />,
      color: 'from-gray-600 to-gray-800',
      connected: githubConnected,
      features: [
        'Auto-push code after agent runs',
        'Per-project repo configuration',
        'Auto-create repos for general tasks',
        'Workspace persistence via snapshots',
      ],
    },
    {
      id: 'vercel',
      name: 'Vercel',
      description: 'Deploy frontend applications seamlessly',
      icon: <Cloud className="w-6 h-6" />,
      color: 'from-gray-800 to-black',
      connected: false,
      features: [
        'Automatic preview deployments',
        'Production deployments',
        'Environment variables sync',
        'Analytics integration',
      ],
      comingSoon: true,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-2">Integrations</h1>
      <p className="text-gray-400 mb-6">Connect external services to enhance your workflow</p>

      <div className="space-y-6">
        {integrations.map((integration) => (
          <div
            key={integration.id}
            className={`bg-gray-800 rounded-lg border border-gray-700 overflow-hidden ${
              integration.comingSoon ? 'opacity-60' : ''
            }`}
          >
            {/* Header */}
            <div className="p-6 flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${integration.color} flex items-center justify-center text-white`}>
                  {integration.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium text-white">{integration.name}</h3>
                    {integration.comingSoon && (
                      <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{integration.description}</p>
                </div>
              </div>

              {!integration.comingSoon && (
                integration.connected ? (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm">
                      <Check className="w-4 h-4" />
                      Connected
                    </span>
                    {integration.id === 'railway' && (
                      <button
                        onClick={disconnectRailway}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Disconnect
                      </button>
                    )}
                    {integration.id === 'claude' && (
                      <button
                        onClick={disconnectClaude}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Disconnect
                      </button>
                    )}
                    {integration.id === 'github' && (
                      <button
                        onClick={disconnectGithub}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (integration.id === 'railway') {
                        setShowTokenInput(true);
                      } else if (integration.id === 'claude') {
                        setShowClaudeInput(true);
                      } else if (integration.id === 'github') {
                        setShowGithubInput(true);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    <Plug className="w-4 h-4" />
                    Connect
                  </button>
                )
              )}
            </div>

            {/* Railway Token Input */}
            {integration.id === 'railway' && showTokenInput && !railwayConnected && (
              <div className="px-6 pb-6">
                <div className="p-4 bg-gray-700/50 rounded-lg space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Railway API Token
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Get your API token from{' '}
                      <a
                        href="https://railway.app/account/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        Railway Account Settings
                        <ExternalLink className="w-3 h-3 inline ml-1" />
                      </a>
                    </p>
                    <input
                      type="password"
                      value={railwayToken}
                      onChange={(e) => setRailwayToken(e.target.value)}
                      placeholder="Enter your Railway API token"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={connectRailway}
                      disabled={!railwayToken.trim() || connecting}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {connecting && <RefreshCw className="w-4 h-4 animate-spin" />}
                      {connecting ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      onClick={() => {
                        setShowTokenInput(false);
                        setRailwayToken('');
                      }}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Claude Token Input */}
            {integration.id === 'claude' && showClaudeInput && !claudeConnected && (
              <div className="px-6 pb-6">
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
                      value={claudeToken}
                      onChange={(e) => setClaudeToken(e.target.value)}
                      placeholder="sk-ant-api03-... or sk-ant-oat01-..."
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={connectClaude}
                      disabled={!claudeToken.trim() || connectingClaude}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {connectingClaude && <RefreshCw className="w-4 h-4 animate-spin" />}
                      {connectingClaude ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      onClick={() => {
                        setShowClaudeInput(false);
                        setClaudeToken('');
                      }}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Claude Connected Info */}
            {integration.id === 'claude' && claudeConnected && (
              <div className="px-6 pb-6">
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-300">Token: <code className="text-orange-400">{claudeMaskedKey}</code></p>
                      <p className="text-xs text-gray-500 mt-1">Your agents will use this token for AI operations</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* GitHub Token Input */}
            {integration.id === 'github' && showGithubInput && !githubConnected && (
              <div className="px-6 pb-6">
                <div className="p-4 bg-gray-700/50 rounded-lg space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      GitHub Personal Access Token
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Create a fine-grained PAT at{' '}
                      <a
                        href="https://github.com/settings/tokens?type=beta"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        GitHub Settings
                        <ExternalLink className="w-3 h-3 inline ml-1" />
                      </a>
                      {' '}with <code className="text-gray-300">repo</code> scope (full control of private repos)
                    </p>
                    <input
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="ghp_... or github_pat_..."
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={connectGithub}
                      disabled={!githubToken.trim() || connectingGithub}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {connectingGithub && <RefreshCw className="w-4 h-4 animate-spin" />}
                      {connectingGithub ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      onClick={() => {
                        setShowGithubInput(false);
                        setGithubToken('');
                      }}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* GitHub Connected Info */}
            {integration.id === 'github' && githubConnected && (
              <div className="px-6 pb-6">
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Github className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-300">
                        Connected as <a href={`https://github.com/${githubUsername}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-medium">@{githubUsername}</a>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Agent code will be pushed to GitHub after successful runs</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Railway Project Selection */}
            {integration.id === 'railway' && railwayConnected && railwayProjects.length > 0 && (
              <div className="px-6 pb-6">
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Select Default Project
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {railwayProjects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => selectProject(project.id)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          selectedProject === project.id
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <p className="text-white font-medium">{project.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {project.environments.length} environment{project.environments.length !== 1 ? 's' : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Features */}
            <div className="px-6 pb-6">
              <p className="text-sm font-medium text-gray-400 mb-3">Features</p>
              <div className="grid grid-cols-2 gap-2">
                {integration.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-500">
                    <Check className="w-4 h-4 text-green-500" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
