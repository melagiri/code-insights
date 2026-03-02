import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats, fetchUsageStats } from '@/lib/api';

type Range = '7d' | '30d' | '90d' | 'all';

export function useDashboardStats(range: Range = '7d') {
  return useQuery({
    queryKey: ['analytics', 'dashboard', range],
    queryFn: () => fetchDashboardStats(range).then((r) => r.stats),
    refetchInterval: 60_000,
  });
}

export function useUsageStats() {
  return useQuery({
    queryKey: ['analytics', 'usage'],
    queryFn: () => fetchUsageStats().then((r) => r.stats),
    refetchInterval: 60_000,
  });
}
