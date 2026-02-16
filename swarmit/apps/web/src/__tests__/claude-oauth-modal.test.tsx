import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClaudeOAuthModal from '../components/ClaudeOAuthModal';

// Mock PKCE
vi.mock('@/lib/pkce', () => ({
  generatePKCE: vi.fn().mockResolvedValue({
    codeVerifier: 'test-verifier',
    codeChallenge: 'test-challenge',
  }),
}));

// Capture window.open calls
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true });

describe('ClaudeOAuthModal', () => {
  const mockOnClose = vi.fn();
  const mockOnConnected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowOpen.mockReset();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <ClaudeOAuthModal open={false} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders modal with title when open', () => {
    render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );
    expect(screen.getByRole('heading', { name: 'Connect with Claude' })).toBeInTheDocument();
  });

  it('has a single "Connect with Claude" button (no Console/Pro split)', () => {
    render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    const connectButtons = screen.getAllByRole('button', { name: /Connect with Claude/i });
    expect(connectButtons).toHaveLength(1);

    // No "API Console" or "Claude Pro/Max" buttons
    expect(screen.queryByText('API Console')).not.toBeInTheDocument();
    expect(screen.queryByText('Claude Pro/Max')).not.toBeInTheDocument();
  });

  it('opens claude.ai/oauth/authorize when Connect is clicked', async () => {
    render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));

    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    });

    const openedUrl = new URL(mockWindowOpen.mock.calls[0][0]);
    expect(openedUrl.origin).toBe('https://claude.ai');
    expect(openedUrl.pathname).toBe('/oauth/authorize');
    expect(openedUrl.searchParams.get('client_id')).toBe('9d1c250a-e61b-44d9-88ed-5944d1962f5e');
    expect(openedUrl.searchParams.get('scope')).toContain('user:inference');
  });

  it('enables code input after clicking Connect', async () => {
    render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    const input = screen.getByPlaceholderText('Paste authorization code...');
    expect(input).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));

    await waitFor(() => {
      expect(input).not.toBeDisabled();
    });
  });

  it('shows green success with tokenPrefix for sk-ant-oat tokens', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, tokenPrefix: 'sk-ant-oat-a' }),
    });
    global.fetch = mockFetch;

    render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    // Step 1: click Connect to generate PKCE
    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste authorization code...')).not.toBeDisabled();
    });

    // Step 2: paste code and submit
    const input = screen.getByPlaceholderText('Paste authorization code...');
    fireEvent.change(input, { target: { value: 'test-auth-code#state123' } });
    fireEvent.click(screen.getByRole('button', { name: /^Connect$/ }));

    await waitFor(() => {
      expect(screen.getByText(/Connected!/)).toBeInTheDocument();
      expect(screen.getByText('sk-ant-oat-a...')).toBeInTheDocument();
    });

    expect(mockOnConnected).toHaveBeenCalled();
  });

  it('shows yellow warning for non-OAT tokens', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, tokenPrefix: 'some-other-t' }),
    });
    global.fetch = mockFetch;

    render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste authorization code...')).not.toBeDisabled();
    });

    const input = screen.getByPlaceholderText('Paste authorization code...');
    fireEvent.change(input, { target: { value: 'test-code' } });
    fireEvent.click(screen.getByRole('button', { name: /^Connect$/ }));

    await waitFor(() => {
      expect(screen.getByText(/Connected!/)).toBeInTheDocument();
      expect(screen.getByText('some-other-t...')).toBeInTheDocument();
      expect(screen.getByText(/Expected sk-ant-oat prefix/)).toBeInTheDocument();
    });
  });

  it('shows error message when exchange fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid authorization code' }),
    });
    global.fetch = mockFetch;

    render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste authorization code...')).not.toBeDisabled();
    });

    const input = screen.getByPlaceholderText('Paste authorization code...');
    fireEvent.change(input, { target: { value: 'bad-code' } });
    fireEvent.click(screen.getByRole('button', { name: /^Connect$/ }));

    await waitFor(() => {
      expect(screen.getByText('Invalid authorization code')).toBeInTheDocument();
    });

    expect(mockOnConnected).not.toHaveBeenCalled();
  });

  it('hides step UI after successful connection (shows success instead)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, tokenPrefix: 'sk-ant-oat-x' }),
    });
    global.fetch = mockFetch;

    render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste authorization code...')).not.toBeDisabled();
    });

    const input = screen.getByPlaceholderText('Paste authorization code...');
    fireEvent.change(input, { target: { value: 'code' } });
    fireEvent.click(screen.getByRole('button', { name: /^Connect$/ }));

    await waitFor(() => {
      expect(screen.getByText(/Connected!/)).toBeInTheDocument();
    });

    // Step UI should be hidden
    expect(screen.queryByText('Authorize with Anthropic')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Paste authorization code...')).not.toBeInTheDocument();
  });

  it('resets state when closed', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, tokenPrefix: 'sk-ant-oat-x' }),
    });
    global.fetch = mockFetch;

    const { rerender } = render(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    // Complete the flow
    fireEvent.click(screen.getByRole('button', { name: /Connect with Claude/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste authorization code...')).not.toBeDisabled();
    });
    fireEvent.change(screen.getByPlaceholderText('Paste authorization code...'), {
      target: { value: 'code' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Connect$/ }));
    await waitFor(() => {
      expect(screen.getByText(/Connected!/)).toBeInTheDocument();
    });

    // Close the modal via X button
    fireEvent.click(screen.getByRole('button', { name: '' })); // X button has no text
    expect(mockOnClose).toHaveBeenCalled();

    // Reopen — should show fresh state
    rerender(
      <ClaudeOAuthModal open={true} onClose={mockOnClose} onConnected={mockOnConnected} />,
    );

    expect(screen.queryByText(/Connected!/)).not.toBeInTheDocument();
    expect(screen.getByText('Authorize with Anthropic')).toBeInTheDocument();
  });
});
