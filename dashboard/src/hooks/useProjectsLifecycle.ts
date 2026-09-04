import { useQuery } from '@tanstack/react-query';
import { fetchProjectsLifecycle } from '@/lib/api';

// All-time weekly project lifecycle series + status table. No range switcher —
// the chart always shows full history, so this is a single fixed query.
export function useProjectsLifecycle() {
  return useQuery({
    queryKey: ['analytics', 'projects-lifecycle'],
    queryFn: () => fetchProjectsLifecycle(),
    refetchInterval: 60_000,
  });
}
