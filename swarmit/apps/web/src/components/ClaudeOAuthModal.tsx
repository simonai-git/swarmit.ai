'use client';

import { useState } from 'react';
import { X, ExternalLink, Loader2, CheckCircle, AlertCircle, ClipboardPaste } from 'lucide-react';
import { generatePKCE } from '@/lib/pkce';

const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_AUTH_URL = 'https://console.anthropic.com/oauth/authorize';
const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';

interface ClaudeOAuthModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export default function ClaudeOAuthModal({ open, onClose, onConnected }: ClaudeOAuthModalProps) {
  const [codeVerifier, setCodeVerifier] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpened, setAuthOpened] = useState(false);

  const handleStartAuth = async () => {
    setError(null);
    const pkce = await generatePKCE();
    setCodeVerifier(pkce.codeVerifier);

    const params = new URLSearchParams({
      client_id: ANTHROPIC_CLIENT_ID,
      response_type: 'code',
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      scope: 'user:inference',
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
    });

    window.open(`${ANTHROPIC_AUTH_URL}?${params.toString()}`, '_blank');
    setAuthOpened(true);
  };

  const handleExchange = async () => {
    if (!codeInput.trim() || !codeVerifier) return;

    setExchanging(true);
    setError(null);

    try {
      const res = await fetch('/api/integrations/claude/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeInput.trim(), codeVerifier }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Exchange failed (${res.status})`);
      }

      onConnected();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token exchange failed');
    } finally {
      setExchanging(false);
    }
  };

  const handleClose = () => {
    setCodeVerifier(null);
    setCodeInput('');
    setExchanging(false);
    setError(null);
    setAuthOpened(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold text-white mb-1">Connect Claude via OAuth</h2>
        <p className="text-sm text-zinc-400 mb-6">
          Authorize with your Anthropic account to get an OAuth Access Token.
        </p>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="flex items-start gap-3">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
              authOpened ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-300'
            }`}>
              {authOpened ? <CheckCircle className="w-4 h-4" /> : '1'}
            </span>
            <div className="flex-1">
              <p className="text-sm text-white font-medium">Authorize with Anthropic</p>
              <p className="text-xs text-zinc-500 mt-0.5 mb-2">
                Opens Anthropic&apos;s consent page in a new tab.
              </p>
              <button
                onClick={handleStartAuth}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Anthropic Authorization
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 bg-zinc-700 text-zinc-300">
              2
            </span>
            <div className="flex-1">
              <p className="text-sm text-white font-medium">Paste the authorization code</p>
              <p className="text-xs text-zinc-500 mt-0.5 mb-2">
                After authorizing, Anthropic will show you a code. Copy and paste it below.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Paste authorization code..."
                  disabled={!authOpened}
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm font-mono placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => e.key === 'Enter' && handleExchange()}
                />
                <button
                  onClick={handleExchange}
                  disabled={exchanging || !codeInput.trim() || !codeVerifier}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {exchanging ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ClipboardPaste className="w-4 h-4" />
                  )}
                  {exchanging ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
