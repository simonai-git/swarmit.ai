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

import CreateProjectWizard from '@/components/CreateProjectWizard';

describe('CreateProjectWizard', () => {
  const mockOnCreated = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderWizard() {
    return render(
      <CreateProjectWizard onCreated={mockOnCreated} onClose={mockOnClose} />
    );
  }

  // ─── Rendering ─────────────────────────────────────────────

  it('renders step 1 by default', () => {
    renderWizard();
    expect(screen.getByText('Create New Project')).toBeInTheDocument();
    expect(screen.getByText('Basics')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Project Type/)).toBeInTheDocument();
  });

  it('shows all Step 1 fields', () => {
    renderWizard();
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Project Type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Goal/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target Users/)).toBeInTheDocument();
    expect(screen.getByText(/Must-Have Features/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Deadline/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Budget Range/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contact Email/)).toBeInTheDocument();
  });

  // ─── Close ─────────────────────────────────────────────────

  it('calls onClose when X button is clicked', () => {
    renderWizard();
    // Find the close button (X icon button in header)
    const closeButtons = screen.getAllByRole('button');
    const closeBtn = closeButtons.find(btn => btn.querySelector('.lucide-x'));
    fireEvent.click(closeBtn!);
    expect(mockOnClose).toHaveBeenCalled();
  });

  // ─── Navigation ────────────────────────────────────────────

  it('disables Next button when Step 1 is incomplete', () => {
    renderWizard();
    const nextBtn = screen.getByRole('button', { name: /Next/i });
    expect(nextBtn).toBeDisabled();
  });

  it('enables Next button when all Step 1 fields are filled', () => {
    renderWizard();
    fillStep1();
    const nextBtn = screen.getByRole('button', { name: /Next/i });
    expect(nextBtn).not.toBeDisabled();
  });

  it('navigates to Step 2 and back', () => {
    renderWizard();
    fillStep1();

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Step 2 fields visible
    expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    expect(screen.getByText(/Nice-to-Have Features/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Data Sensitivity/)).toBeInTheDocument();
    expect(screen.getByLabelText(/PRD/)).toBeInTheDocument();

    // Back button returns to Step 1
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
  });

  // ─── Tag input ─────────────────────────────────────────────

  it('adds and removes must-have tags', () => {
    renderWizard();
    const tagInput = screen.getByPlaceholderText('Add a feature and press Enter');
    fireEvent.change(tagInput, { target: { value: 'Search' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    expect(screen.getByText('Search')).toBeInTheDocument();

    // Remove tag
    const removeButtons = screen.getAllByRole('button');
    const removeBtn = removeButtons.find(btn => {
      const parent = btn.closest('span');
      return parent?.textContent?.includes('Search');
    });
    fireEvent.click(removeBtn!);

    expect(screen.queryByText('Search')).not.toBeInTheDocument();
  });

  // ─── Save as Draft ─────────────────────────────────────────

  it('saves as draft with just title', async () => {
    mockProjectsCreate.mockResolvedValueOnce({
      id: 'proj-draft',
      title: 'My Draft',
      status: 'DRAFT',
    });

    renderWizard();
    fireEvent.change(screen.getByPlaceholderText(/AI-Powered/), {
      target: { value: 'My Draft' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save as Draft/i }));

    await waitFor(() => {
      expect(mockProjectsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Draft',
          isDraft: true,
        })
      );
    });

    expect(mockOnCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'proj-draft' })
    );
  });

  it('disables Save as Draft when title is empty', () => {
    renderWizard();
    const draftBtn = screen.getByRole('button', { name: /Save as Draft/i });
    expect(draftBtn).toBeDisabled();
  });

  // ─── Submit ────────────────────────────────────────────────

  it('submits project with all fields on Step 2', async () => {
    mockProjectsCreate.mockResolvedValueOnce({
      id: 'proj-full',
      title: 'Full Project',
      status: 'PLANNING',
    });

    renderWizard();
    fillStep1();

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Fill Step 2 optional fields
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: 'A great project' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockProjectsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Full Project',
          isDraft: false,
          projectType: 'web-app',
          goal: 'Build something',
          description: 'A great project',
        })
      );
    });

    expect(mockOnCreated).toHaveBeenCalled();
  });

  it('shows error message on API failure', async () => {
    mockProjectsCreate.mockRejectedValueOnce(new Error('Server error'));

    renderWizard();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  // ─── Helper ────────────────────────────────────────────────

  function fillStep1() {
    fireEvent.change(screen.getByPlaceholderText(/AI-Powered/), {
      target: { value: 'Full Project' },
    });

    // Project Type select
    fireEvent.change(screen.getByLabelText(/Project Type/), {
      target: { value: 'web-app' },
    });

    // Goal
    fireEvent.change(screen.getByPlaceholderText(/accomplish/), {
      target: { value: 'Build something' },
    });

    // Target Users
    fireEvent.change(screen.getByPlaceholderText(/end users/), {
      target: { value: 'Developers' },
    });

    // Must-Haves - add one tag
    const tagInput = screen.getByPlaceholderText('Add a feature and press Enter');
    fireEvent.change(tagInput, { target: { value: 'Search' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    // Deadline
    fireEvent.change(screen.getByLabelText(/Deadline/), {
      target: { value: '2026-06-01' },
    });

    // Budget Range
    fireEvent.change(screen.getByLabelText(/Budget Range/), {
      target: { value: '$100-$500' },
    });

    // Contact Email
    fireEvent.change(screen.getByPlaceholderText(/you@example/), {
      target: { value: 'test@example.com' },
    });
  }
});
