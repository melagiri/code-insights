import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectsStatusTable } from './ProjectsStatusTable';
import type { ProjectLifecycleSummary } from '@/lib/types';

function makeProject(overrides: Partial<ProjectLifecycleSummary> = {}): ProjectLifecycleSummary {
  return {
    name: 'har-cleaner',
    path: '/home/dev/repos/har-cleaner',
    first_seen: '2026-01-01',
    last_seen: '2026-01-10',
    session_count: 5,
    status: 'active',
    ...overrides,
  };
}

describe('ProjectsStatusTable', () => {
  it('shows an empty-state message when there are no projects', () => {
    render(<ProjectsStatusTable projects={[]} />);
    expect(screen.getByText(/no project history yet/i)).toBeInTheDocument();
  });

  it('renders a row per project with name, status badge, and session count', () => {
    render(
      <ProjectsStatusTable
        projects={[makeProject(), makeProject({ name: 'zoom-scheduler', status: 'dropped', session_count: 2 })]}
      />
    );
    expect(screen.getByText('har-cleaner')).toBeInTheDocument();
    expect(screen.getByText('zoom-scheduler')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Dropped')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
