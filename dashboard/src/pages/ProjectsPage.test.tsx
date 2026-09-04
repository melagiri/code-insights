import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProjectsPage from './ProjectsPage';
import type { useProjectsLifecycle } from '@/hooks/useProjectsLifecycle';

vi.mock('@/hooks/useProjectsLifecycle', () => ({
  useProjectsLifecycle: vi.fn(),
}));

import { useProjectsLifecycle as mockedHook } from '@/hooks/useProjectsLifecycle';
const mockUseProjectsLifecycle = vi.mocked(mockedHook);

type HookReturn = ReturnType<typeof useProjectsLifecycle>;

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeletons while data is loading', () => {
    mockUseProjectsLifecycle.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as HookReturn);

    render(<ProjectsPage />);
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', () => {
    const refetch = vi.fn();
    mockUseProjectsLifecycle.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as HookReturn);

    render(<ProjectsPage />);
    expect(screen.getByText(/failed to load project lifecycle data/i)).toBeInTheDocument();
  });

  it('renders the chart and status table once data loads', () => {
    mockUseProjectsLifecycle.mockReturnValue({
      data: {
        weeks: [{ week: '2026-01-05', active: 1, reactivated: 0, dropped: 0, started: 1, newly_dropped: 0 }],
        projects: [
          {
            name: 'har-cleaner',
            path: '/repos/har-cleaner',
            first_seen: '2026-01-01',
            last_seen: '2026-01-05',
            session_count: 3,
            status: 'active',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as HookReturn);

    render(<ProjectsPage />);
    expect(screen.getByText('Project Lifecycle')).toBeInTheDocument();
    expect(screen.getByText('har-cleaner')).toBeInTheDocument();
  });
});
