import { useQuery } from '@tanstack/react-query';
import { fetchProjects, fetchProject } from '@/lib/api';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchProjects().then((r) => r.projects),
    refetchInterval: 60_000,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!).then((r) => r.project),
    enabled: !!id,
  });
}
