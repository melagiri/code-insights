import { useQuery } from '@tanstack/react-query';
import { fetchSearch } from '@/lib/api';

/**
 * React Query wrapper for GET /api/search.
 * query must be at least 2 chars to fire a network request.
 */
export function useSearch(query: string, limit = 20) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['search', trimmed, limit],
    queryFn: () => fetchSearch({ q: trimmed, limit }),
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });
}
