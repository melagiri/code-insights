import { useQuery } from '@tanstack/react-query';
import { fetchFacetAggregation, fetchReflectSnapshot, fetchReflectWeeks } from '@/lib/api';
import type { FacetAggregation, ReflectSnapshot, WeekInfo } from '@/lib/api';

export function useFacetAggregation(params?: {
  project?: string;
  period?: string;
  source?: string;
}) {
  return useQuery<FacetAggregation>({
    queryKey: ['facets', 'aggregated', params?.project, params?.period, params?.source],
    queryFn: () => fetchFacetAggregation(params),
    staleTime: 30_000,
  });
}

export function useReflectSnapshot(params?: {
  period?: string;
  project?: string;
}) {
  return useQuery<{ snapshot: ReflectSnapshot | null }>({
    queryKey: ['reflect', 'snapshot', params?.period, params?.project],
    queryFn: () => fetchReflectSnapshot(params),
    staleTime: 30_000,
  });
}

export function useReflectWeeks(params?: { project?: string }) {
  return useQuery<{ weeks: WeekInfo[] }>({
    queryKey: ['reflect', 'weeks', params?.project],
    queryFn: () => fetchReflectWeeks(params),
    staleTime: 60_000,
  });
}
