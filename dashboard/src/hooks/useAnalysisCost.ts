import { useQuery } from '@tanstack/react-query';

export interface AnalysisUsageRow {
  session_id: string;
  analysis_type: string;          // 'session' | 'prompt_quality' | 'facet'
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number | null;
  chunk_count: number;
  analyzed_at: string;            // ISO 8601
}

export interface AnalysisCostData {
  usage: AnalysisUsageRow[];
  totalCostUsd: number;
  cacheSavingsUsd: number;
}

/**
 * Fetch recorded analysis cost data for a session from GET /api/analysis/usage.
 * Returns an empty usage array for sessions with no recorded usage (pre-V7 or unanalyzed).
 * Enabled only when sessionId is provided.
 */
export function useAnalysisCost(sessionId: string | null | undefined) {
  return useQuery<AnalysisCostData>({
    queryKey: ['analysis-cost', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/usage?sessionId=${encodeURIComponent(sessionId!)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch analysis cost: ${res.status}`);
      }
      return res.json() as Promise<AnalysisCostData>;
    },
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}
