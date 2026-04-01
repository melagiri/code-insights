import { useQuery } from '@tanstack/react-query';
import { fetchAnalysisQueue } from '@/lib/api';
import type { AnalysisQueueStatus } from '@/lib/api';

/**
 * Polls GET /api/analysis/queue to track async analysis progress.
 *
 * Polling behavior:
 * - Refetches every 5s when there are pending or processing items.
 * - Stops polling (refetchInterval = false) when both reach 0.
 * - Always fetches once on mount to check initial state.
 */
export function useAnalysisQueue() {
  return useQuery<AnalysisQueueStatus>({
    queryKey: ['analysisQueue'],
    queryFn: fetchAnalysisQueue,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000; // Fetch once on mount, then poll if needed
      const isActive = data.pending > 0 || data.processing > 0;
      return isActive ? 5000 : false;
    },
    // Stale immediately so each manual refetch gets fresh data
    staleTime: 0,
  });
}

/**
 * Returns the set of session IDs currently in the queue (pending or processing).
 * Used by session list/detail to show "Analyzing..." badges.
 */
export function useQueuedSessionIds(): Set<string> {
  const { data } = useAnalysisQueue();
  if (!data) return new Set();
  return new Set(
    data.items
      .filter(item => item.status === 'pending' || item.status === 'processing')
      .map(item => item.session_id)
  );
}
