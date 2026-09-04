import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectsLifecycleChart } from './ProjectsLifecycleChart';
import type { ProjectLifecycleWeek } from '@/lib/types';

function makeWeek(overrides: Partial<ProjectLifecycleWeek> = {}): ProjectLifecycleWeek {
  return {
    week: '2026-01-05',
    active: 1,
    reactivated: 0,
    dropped: 0,
    started: 1,
    newly_dropped: 0,
    ...overrides,
  };
}

describe('ProjectsLifecycleChart', () => {
  it('shows a loading message while isLoading is true', () => {
    render(<ProjectsLifecycleChart weeks={[]} isLoading />);
    expect(screen.getByText(/loading project lifecycle/i)).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no weeks', () => {
    render(<ProjectsLifecycleChart weeks={[]} />);
    expect(screen.getByText(/no project history yet/i)).toBeInTheDocument();
  });

  it('renders the chart title and legend when data is present', () => {
    render(<ProjectsLifecycleChart weeks={[makeWeek(), makeWeek({ week: '2026-01-12' })]} />);
    expect(screen.getByText('Project Lifecycle')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Reactivated')).toBeInTheDocument();
    expect(screen.getByText('Dropped')).toBeInTheDocument();
  });
});
