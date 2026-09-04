import { useProjectsLifecycle } from '@/hooks/useProjectsLifecycle';
import { ProjectsLifecycleChart } from '@/components/projects/ProjectsLifecycleChart';
import { ProjectsStatusTable } from '@/components/projects/ProjectsStatusTable';
import { ErrorCard } from '@/components/ErrorCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectsPage() {
  const { data, isLoading, isError, refetch } = useProjectsLifecycle();

  if (isError && !isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">See which projects you're actively working on — and which have gone quiet</p>
        </div>
        <ErrorCard message="Failed to load project lifecycle data" onRetry={refetch} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">See which projects you're actively working on — and which have gone quiet</p>
        </div>
        <Skeleton className="h-[240px] w-full rounded-lg" />
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </div>
    );
  }

  const weeks = data?.weeks ?? [];
  const projects = data?.projects ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-muted-foreground">See which projects you're actively working on — and which have gone quiet</p>
      </div>
      <ProjectsLifecycleChart weeks={weeks} />
      <ProjectsStatusTable projects={projects} />
    </div>
  );
}
