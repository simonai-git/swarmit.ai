import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Mock API (vi.hoisted to avoid hoisting issues) ---
const { mockApiProfile, mockApiIntegrations } = vi.hoisted(() => ({
  mockApiProfile: {
    get: vi.fn(),
    update: vi.fn(),
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

import ProfilePage from '../app/profile/page';

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
  });

  it('shows unified card with OAuth button + divider + API key input when no key or OAuth connected', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());

    render(<ProfilePage />);

    // Switch to integrations tab
    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByText('Claude API Key')).toBeInTheDocument();
    });

    // Single card with OAuth button
    expect(screen.getByRole('button', { name: /Connect with Claude/i })).toBeInTheDocument();

    // "or" divider
    expect(screen.getByText('or')).toBeInTheDocument();

    // Paste API key input
    expect(screen.getByPlaceholderText('sk-ant-api...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();

    // NO separate "Claude AI (OAuth)" card heading
    expect(screen.queryByText('Claude AI (OAuth)')).not.toBeInTheDocument();
  });

  it('shows "Connected via OAuth" status when OAuth token exists', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());
    mockApiIntegrations.listTokens.mockResolvedValue({
      tokens: [{ id: 't-1', provider: 'anthropic', createdAt: '', updatedAt: '' }],
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByText('Connected via OAuth')).toBeInTheDocument();
    });

    // Should hide OAuth button and paste input when already connected
    expect(screen.queryByRole('button', { name: /Connect with Claude/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('sk-ant-api...')).not.toBeInTheDocument();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
  });

  it('shows masked API key when manual key is set (no OAuth)', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile({ claudeApiKey: 'sk-ant-api...abcd' }));

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByText('sk-ant-api...abcd')).toBeInTheDocument();
    });

    // Disconnect button for manual key
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeInTheDocument();

    // OAuth button should still be visible (can upgrade to OAuth)
    expect(screen.getByRole('button', { name: /Connect with Claude/i })).toBeInTheDocument();
  });

  it('shows OAuth status over manual key when both exist', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile({ claudeApiKey: 'sk-ant-api...abcd' }));
    mockApiIntegrations.listTokens.mockResolvedValue({
      tokens: [{ id: 't-1', provider: 'anthropic', createdAt: '', updatedAt: '' }],
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByText('Connected via OAuth')).toBeInTheDocument();
    });

    // Manual key display should be hidden when OAuth is active
    expect(screen.queryByText('sk-ant-api...abcd')).not.toBeInTheDocument();
  });

  it('opens OAuth modal when Connect with Claude is clicked', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Connect with Claude/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));

    expect(screen.getByTestId('claude-oauth-modal')).toBeInTheDocument();
  });

  it('saves pasted API key', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());
    mockApiProfile.update.mockResolvedValue({ success: true });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-ant-api...')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('sk-ant-api...');
    fireEvent.change(input, { target: { value: 'sk-ant-api03-mykey123' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockApiProfile.update).toHaveBeenCalledWith({ claudeApiKey: 'sk-ant-api03-mykey123' });
    });
  });

  it('disconnects OAuth token', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());
    mockApiIntegrations.listTokens.mockResolvedValue({
      tokens: [{ id: 't-1', provider: 'anthropic', createdAt: '', updatedAt: '' }],
    });
    mockApiIntegrations.deleteToken.mockResolvedValue({ success: true });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByText('Connected via OAuth')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }));

    await waitFor(() => {
      expect(mockApiIntegrations.deleteToken).toHaveBeenCalledWith('anthropic');
    });
  });

  it('card description mentions OAuth and paste options', async () => {
    mockApiProfile.get.mockResolvedValue(createProfile());

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Integrations'));

    await waitFor(() => {
      expect(screen.getByText(/Connect via OAuth or paste an API key/)).toBeInTheDocument();
    });
  });
});
