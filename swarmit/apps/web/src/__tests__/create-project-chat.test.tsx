import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockProjectsCreate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: {
    projects: {
      create: mockProjectsCreate,
    },
  },
}));

import CreateProjectChat from '@/components/CreateProjectChat';

describe('CreateProjectChat', () => {
  const mockOnCreated = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderChat() {
    return render(
      <CreateProjectChat onCreated={mockOnCreated} onClose={mockOnClose} />
    );
  }

  function sendMessage(text: string) {
    const input = screen.getByPlaceholderText('Type your answer...');
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  // ─── Rendering ─────────────────────────────────────────────

  it('renders with greeting and first question', () => {
    renderChat();
    expect(screen.getByText('Create with Chat')).toBeInTheDocument();
    expect(screen.getByText(/help you create/)).toBeInTheDocument();
    expect(screen.getByText(/name your project/)).toBeInTheDocument();
  });

  it('shows checklist panel on desktop', () => {
    renderChat();
    expect(screen.getByText('Project Checklist')).toBeInTheDocument();
    expect(screen.getByText('Basics (0 of 8)')).toBeInTheDocument();
    expect(screen.getByText(/Details \(0 of 6\)/)).toBeInTheDocument();
  });

  it('calls onClose when X button is clicked', () => {
    renderChat();
    const closeButtons = screen.getAllByRole('button');
    const closeBtn = closeButtons.find(btn => btn.querySelector('.lucide-x'));
    fireEvent.click(closeBtn!);
    expect(mockOnClose).toHaveBeenCalled();
  });

  // ─── Chat flow ─────────────────────────────────────────────

  it('advances to next field after valid answer', () => {
    renderChat();
    sendMessage('My Project');

    // Should show user's answer in chat (appears in both chat bubble and checklist)
    expect(screen.getAllByText('My Project').length).toBeGreaterThanOrEqual(1);

    // Should ask next question (project type)
    expect(screen.getByText(/type of project/)).toBeInTheDocument();

    // Checklist should update
    expect(screen.getByText('Basics (1 of 8)')).toBeInTheDocument();
  });

  it('shows validation error for invalid email', () => {
    renderChat();
    // Navigate through all fields to email
    sendMessage('My Project');           // title
    sendMessage('web-app');              // type
    sendMessage('Build something');       // goal
    sendMessage('Developers');            // target users
    sendMessage('Search, Filter');        // must-haves
    sendMessage('2026-06-01');           // deadline
    sendMessage('$100-$500');            // budget
    sendMessage('not-an-email');          // invalid email

    expect(screen.getByText(/valid email/)).toBeInTheDocument();
  });

  it('accepts valid email and completes basics', () => {
    renderChat();
    fillBasics();

    // Should ask about optional details
    expect(screen.getByText(/optional details/)).toBeInTheDocument();
  });

  it('skips optional details when user types skip', () => {
    renderChat();
    fillBasics();

    sendMessage('skip');

    // Should show summary
    expect(screen.getByText(/summary/i)).toBeInTheDocument();
  });

  it('enters details phase when user types yes', () => {
    renderChat();
    fillBasics();

    sendMessage('yes');

    // Should ask about nice-to-haves (use specific question text to avoid matching checklist label)
    expect(screen.getByText(/nice-to-have features\? List/i)).toBeInTheDocument();
  });

  it('updates checklist as fields are filled', () => {
    renderChat();
    sendMessage('My Project');
    expect(screen.getByText('Basics (1 of 8)')).toBeInTheDocument();

    sendMessage('web-app');
    expect(screen.getByText('Basics (2 of 8)')).toBeInTheDocument();
  });

  it('shows validation error for invalid date', () => {
    renderChat();
    sendMessage('My Project');
    sendMessage('web-app');
    sendMessage('Build something');
    sendMessage('Developers');
    sendMessage('Search');
    sendMessage('not-a-date');

    expect(screen.getByText(/valid date/)).toBeInTheDocument();
  });

  it('shows validation error for invalid select option', () => {
    renderChat();
    sendMessage('My Project');
    sendMessage('invalid-type');

    expect(screen.getByText(/choose one of/i)).toBeInTheDocument();
  });

  it('rejects empty messages', () => {
    renderChat();
    const input = screen.getByPlaceholderText('Type your answer...');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Should still be on first question
    expect(screen.getByText('Basics (0 of 8)')).toBeInTheDocument();
  });

  // ─── Submission ────────────────────────────────────────────

  it('shows create/draft buttons after confirmation', () => {
    renderChat();
    fillBasics();
    sendMessage('skip');

    // Should show create/draft buttons
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save as Draft/i })).toBeInTheDocument();
  });

  it('creates project on Create Project click', async () => {
    mockProjectsCreate.mockResolvedValueOnce({
      id: 'proj-chat',
      title: 'My Project',
      status: 'PLANNING',
    });

    renderChat();
    fillBasics();
    sendMessage('skip');

    fireEvent.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockProjectsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Project',
          isDraft: false,
          projectType: 'web-app',
          goal: 'Build something',
          targetUsers: 'Developers',
          mustHaves: ['Search', 'Filter'],
          budgetRange: '$100-$500',
          contactEmail: 'test@example.com',
        })
      );
    });

    expect(mockOnCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'proj-chat' })
    );
  });

  it('saves as draft on Save as Draft click', async () => {
    mockProjectsCreate.mockResolvedValueOnce({
      id: 'proj-draft',
      title: 'My Project',
      status: 'DRAFT',
    });

    renderChat();
    fillBasics();
    sendMessage('skip');

    fireEvent.click(screen.getByRole('button', { name: /Save as Draft/i }));

    await waitFor(() => {
      expect(mockProjectsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          isDraft: true,
        })
      );
    });
  });

  it('shows error on submission failure', async () => {
    mockProjectsCreate.mockRejectedValueOnce(new Error('Network error'));

    renderChat();
    fillBasics();
    sendMessage('skip');

    fireEvent.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  // ─── Details flow ──────────────────────────────────────────

  it('completes full flow with details', () => {
    renderChat();
    fillBasics();
    sendMessage('yes');

    // Nice-to-haves
    sendMessage('Social sharing, Calendar');

    // Reference links
    sendMessage('https://example.com');

    // Constraints
    sendMessage('Must work offline');

    // Comms
    sendMessage('Async updates');

    // Data sensitivity
    sendMessage('internal');

    // PRD
    sendMessage('skip');

    // Should be at confirmation
    expect(screen.getByText(/summary/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
  });

  it('skips optional fields with skip', () => {
    renderChat();
    fillBasics();
    sendMessage('yes');

    sendMessage('skip'); // nice-to-haves
    sendMessage('skip'); // references
    sendMessage('skip'); // constraints
    sendMessage('skip'); // comms
    sendMessage('skip'); // data sensitivity
    sendMessage('skip'); // PRD

    expect(screen.getByText(/summary/i)).toBeInTheDocument();
  });

  // ─── Helper ────────────────────────────────────────────────

  function fillBasics() {
    sendMessage('My Project');         // title
    sendMessage('web-app');            // type
    sendMessage('Build something');     // goal
    sendMessage('Developers');          // target users
    sendMessage('Search, Filter');      // must-haves
    sendMessage('2026-06-01');         // deadline
    sendMessage('$100-$500');          // budget
    sendMessage('test@example.com');    // email
  }
});
