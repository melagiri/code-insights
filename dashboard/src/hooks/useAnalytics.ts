import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats, fetchActivity } from '@/lib/api';

type Range = '7d' | '30d' | '90d' | 'all';

export function useDashboardStats(range: Range = '7d') {
  return useQuery({
    queryKey: ['analytics', 'dashboard', range],
    queryFn: () => fetchDashboardStats(range).then((r) => r.stats),
    refetchInterval: 60_000,
  });
}

// All-time per-day activity series. Range-independent: the Activity chart slices
// the window client-side so the composite score keeps a fixed all-time reference.
export function useActivity() {
  return useQuery({
    queryKey: ['analytics', 'activity'],
    queryFn: () => fetchActivity().then((r) => r.days),
    refetchInterval: 60_000,
  });
}
