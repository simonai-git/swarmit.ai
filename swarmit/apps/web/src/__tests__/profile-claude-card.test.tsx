import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Mock API (vi.hoisted to avoid hoisting issues) ---
const { mockApiProfile, mockApiIntegrations } = vi.hoisted(() => ({
  mockApiProfile: {
    get: vi.fn(),
    update: vi.fn(),
    getAutomation: vi.fn(),
    updateAutomation: vi.fn(),
  },
  mockApiIntegrations: {
    listTokens: vi.fn(),
    deleteToken: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    profile: mockApiProfile,
    integrations: mockApiIntegrations,
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

// Mock ClaudeOAuthModal to a controllable stub
vi.mock('@/components/ClaudeOAuthModal', () => ({
  default: ({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected: () => void }) => {
    if (!open) return null;
    return (
      <div data-testid="claude-oauth-modal">
        <button onClick={onConnected}>mock-connect</button>
        <button onClick={onClose}>mock-close</button>
      </div>
    );
  },
}));

import SettingsPage from '../app/settings/page';

function createProfile(overrides = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    plan: 'free',
    claudeApiKey: null,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Profile page — Claude API Key card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no tokens
    mockApiIntegrations.listTokens.mockResolvedValue({ tokens: [] });
    // Default: automation settings
    mockApiProfile.getAutomation.mockResolvedValue({
      autoAssign: false,
      autoSpawn: false,
      defaultModel: 'claude-sonnet-4-20250514',
      maxConcurrentAgents: 3,
      dailyBudgetCents: 1000,
    });
  });

  it('shows unified card with OAuth button + divider + API key input when no key or OAuth connected', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());

    render(<SettingsPage />);

    // Switch to integrations tab
    await waitFor(() => {
      expect(screen.getByText('integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('integrations'));

    await waitFor(() => {
      expect(screen.getByText('Claude AI')).toBeInTheDocument();
    });

    // Single card with OAuth button
    expect(screen.getByRole('button', { name: /Connect with Claude/i })).toBeInTheDocument();

    // "or paste API key" divider
    expect(screen.getByText('or paste API key')).toBeInTheDocument();

    // Paste API key input
    expect(screen.getByPlaceholderText('sk-ant-... or OAT token')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();

    // NO separate "Claude AI (OAuth)" card heading
    expect(screen.queryByText('Claude AI (OAuth)')).not.toBeInTheDocument();
  });

  it('shows "Connected via OAuth" status when OAuth token exists', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());
    mockApiIntegrations.listTokens.mockResolvedValue({
      tokens: [{ id: 't-1', provider: 'anthropic', createdAt: '', updatedAt: '' }],
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('integrations'));

    await waitFor(() => {
      expect(screen.getByText('Connected via OAuth')).toBeInTheDocument();
    });

    // Should hide OAuth button and paste input when already connected
    expect(screen.queryByRole('button', { name: /Connect with Claude/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('sk-ant-... or OAT token')).not.toBeInTheDocument();
    expect(screen.queryByText('or paste API key')).not.toBeInTheDocument();
  });

  it('shows masked API key when manual key is set (no OAuth)', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile({ claudeApiKey: 'sk-ant-api...abcd' }));

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('integrations'));

    // Settings page masks the key: first 8 chars + 20 asterisks
    await waitFor(() => {
      expect(screen.getByText('sk-ant-a' + '*'.repeat(20))).toBeInTheDocument();
    });

    // Remove button for manual key
    expect(screen.getByRole('button', { name: /Remove/i })).toBeInTheDocument();

    // OAuth button should still be visible (can upgrade to OAuth)
    expect(screen.getByRole('button', { name: /Connect with Claude/i })).toBeInTheDocument();
  });

  it('shows OAuth status over manual key when both exist', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile({ claudeApiKey: 'sk-ant-api...abcd' }));
    mockApiIntegrations.listTokens.mockResolvedValue({
      tokens: [{ id: 't-1', provider: 'anthropic', createdAt: '', updatedAt: '' }],
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('integrations'));

    await waitFor(() => {
      expect(screen.getByText('Connected via OAuth')).toBeInTheDocument();
    });

    // Manual key display should be hidden when OAuth is active
    expect(screen.queryByText('sk-ant-api...abcd')).not.toBeInTheDocument();
  });

  it('opens OAuth modal when Connect with Claude is clicked', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('integrations'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Connect with Claude/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));

    expect(screen.getByTestId('claude-oauth-modal')).toBeInTheDocument();
  });

  it('saves pasted API key', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());
    mockApiProfile.update.mockResolvedValue({ success: true });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('integrations'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-ant-... or OAT token')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('sk-ant-... or OAT token');
    fireEvent.change(input, { target: { value: 'sk-ant-api03-mykey123' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockApiProfile.update).toHaveBeenCalledWith({ claudeApiKey: 'sk-ant-api03-mykey123' });
    });
  });

  it('disconnects OAuth token after confirm', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());
    mockApiIntegrations.listTokens
      .mockResolvedValueOnce({
        tokens: [{ id: 't-1', provider: 'anthropic', createdAt: '', updatedAt: '' }],
      })
      // Re-fetch after disconnect returns empty
      .mockResolvedValueOnce({ tokens: [] });
    mockApiIntegrations.deleteToken.mockResolvedValue({ success: true });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('integrations'));

    await waitFor(() => {
      expect(screen.getByText('Connected via OAuth')).toBeInTheDocument();
    });

    // Click the disconnect button to open the ConfirmDialog
    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }));

    // Wait for the ConfirmDialog to appear, then click its confirm button
    await waitFor(() => {
      expect(screen.getByText('Disconnect anthropic')).toBeInTheDocument();
    });

    // The ConfirmDialog has two buttons: Cancel and Disconnect (confirmLabel)
    const confirmButtons = screen.getAllByRole('button', { name: /Disconnect/i });
    // Click the confirm button in the dialog (last one)
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockApiIntegrations.deleteToken).toHaveBeenCalledWith('anthropic');
    });
  });

  it('card description mentions OAuth and paste options', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('integrations'));

    await waitFor(() => {
      expect(screen.getByText(/Connect via OAuth or paste an API key/)).toBeInTheDocument();
    });
  });
});
