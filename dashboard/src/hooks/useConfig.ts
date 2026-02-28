import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchLlmConfig, saveLlmConfig } from '@/lib/api';

export function useLlmConfig() {
  return useQuery({
    queryKey: ['config', 'llm'],
    queryFn: () => fetchLlmConfig(),
    // Config rarely changes — no need to poll aggressively.
    refetchInterval: false,
  });
}

export function useSaveLlmConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      dashboardPort?: number;
      provider?: string;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
    }) => saveLlmConfig(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'llm'] });
    },
  });
}
