import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSessions, fetchSession, patchSession, deleteSession, fetchDeletedSessionCount } from '@/lib/api';

interface SessionFilters {
  projectId?: string;
  sourceTool?: string;
  limit?: number;
  offset?: number;
}

export function useSessions(filters?: SessionFilters) {
  return useQuery({
    queryKey: ['sessions', filters],
    queryFn: () => fetchSessions(filters).then((r) => r.sessions),
    refetchInterval: 60_000,
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => fetchSession(id!).then((r) => r.session),
    enabled: !!id,
  });
}

export function useSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, customTitle }: { id: string; customTitle: string }) =>
      patchSession(id, { customTitle }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['deletedSessionCount'] });
    },
  });
}

export function useDeletedSessionCount(projectId?: string) {
  return useQuery({
    queryKey: ['deletedSessionCount', projectId],
    queryFn: () => fetchDeletedSessionCount(projectId).then((r) => r.count),
    staleTime: 30_000,
  });
}
