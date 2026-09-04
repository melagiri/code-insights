import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProjectLifecycleStatus, ProjectLifecycleSummary } from '@/lib/types';

const STATUS_BADGE: Record<ProjectLifecycleStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  reactivated: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  dropped: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

const STATUS_LABEL: Record<ProjectLifecycleStatus, string> = {
  active: 'Active',
  reactivated: 'Reactivated',
  dropped: 'Dropped',
};

interface ProjectsStatusTableProps {
  projects: ProjectLifecycleSummary[];
}

export function ProjectsStatusTable({ projects }: ProjectsStatusTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Projects</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 text-left font-medium">Project</th>
                <th className="py-3 text-left font-medium">Status</th>
                <th className="py-3 text-right font-medium">Sessions</th>
                <th className="py-3 text-right font-medium">First Seen</th>
                <th className="py-3 text-right font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={`${p.name}:${p.path}`} className="border-b last:border-0">
                  <td className="py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="max-w-md truncate text-xs text-muted-foreground">{p.path}</div>
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="py-3 text-right">{p.session_count}</td>
                  <td className="py-3 text-right text-muted-foreground">{p.first_seen}</td>
                  <td className="py-3 text-right text-muted-foreground">{p.last_seen}</td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No project history yet. Sync sessions to see projects.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
