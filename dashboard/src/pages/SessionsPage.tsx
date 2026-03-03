import { useMemo, useCallback, useSyncExternalStore } from 'react';
import { useSessions } from '@/hooks/useSessions';
import { useProjects } from '@/hooks/useProjects';
import { useInsights } from '@/hooks/useInsights';
import { useFilterParams } from '@/hooks/useFilterParams';
import { ProjectNav } from '@/components/sessions/ProjectNav';
import { SessionListPanel } from '@/components/sessions/SessionListPanel';
import { SessionDetailPanel } from '@/components/sessions/SessionDetailPanel';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ArrowLeft, ChevronDown, MousePointerClick } from 'lucide-react';

const lgQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null;
function subscribeLg(cb: () => void) {
  lgQuery?.addEventListener('change', cb);
  return () => lgQuery?.removeEventListener('change', cb);
}
function getIsLg() {
  return lgQuery?.matches ?? true;
}

export default function SessionsPage() {
  const [filters, setFilter, setFilters, clearFilters] = useFilterParams({
    q: '',
    project: 'all',
    source: 'all',
    character: 'all',
    status: 'all',
    session: '',
  });

  const { data: projects = [], isLoading: projectsLoading } = useProjects();

  const sessionParams = useMemo(() => {
    const params: { projectId?: string; sourceTool?: string; limit?: number } = { limit: 200 };
    if (filters.project !== 'all') params.projectId = filters.project;
    if (filters.source !== 'all') params.sourceTool = filters.source;
    return params;
  }, [filters.project, filters.source]);

  const { data: sessions = [], isLoading: sessionsLoading } = useSessions(sessionParams);
  const { data: insights = [], isLoading: insightsLoading } = useInsights();

  const loading = sessionsLoading || projectsLoading || insightsLoading;

  const handleSelectProject = useCallback(
    (projectId: string) => {
      const currentSessionId = filters.session;
      if (currentSessionId && projectId !== 'all') {
        const currentSession = sessions.find((s) => s.id === currentSessionId);
        if (currentSession && currentSession.project_id !== projectId) {
          setFilters({ project: projectId, session: '' });
          return;
        }
      }
      setFilter('project', projectId);
    },
    [filters.session, sessions, setFilter, setFilters]
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setFilter('session', sessionId);
    },
    [setFilter]
  );

  const handleFilterChange = useCallback(
    (key: 'q' | 'character' | 'status', value: string) => {
      setFilter(key, value);
    },
    [setFilter]
  );

  const handleClearFilters = useCallback(() => {
    setFilters({ q: '', character: 'all', status: 'all' });
  }, [setFilters]);

  const selectedProjectName = useMemo(() => {
    if (filters.project === 'all') return 'All Projects';
    return projects.find((p) => p.id === filters.project)?.name ?? 'Project';
  }, [filters.project, projects]);

  const showProject = filters.project === 'all';
  const isLg = useSyncExternalStore(subscribeLg, getIsLg);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Panel A: Project Nav — visible at xl, Sheet at lg, hidden below */}
      <aside className="hidden xl:flex w-[220px] shrink-0 border-r bg-background overflow-y-auto">
        <div className="w-full">
          <ProjectNav
            projects={projects}
            selectedProject={filters.project}
            selectedSource={filters.source}
            onSelectProject={handleSelectProject}
            onSelectSource={(source) => setFilter('source', source)}
          />
        </div>
      </aside>

      {/* Panel B: Session List */}
      <div className="w-full lg:w-80 shrink-0 lg:border-r bg-background flex flex-col overflow-hidden">
        {/* Project selector for lg (Sheet trigger) and below xl */}
        <div className="xl:hidden shrink-0 px-3 pt-3 pb-1">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between text-xs h-8">
                <span className="truncate">{selectedProjectName}</span>
                <ChevronDown className="h-3 w-3 shrink-0 ml-1" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0">
              <SheetHeader className="px-4 py-3 border-b">
                <SheetTitle className="text-sm font-semibold">Projects</SheetTitle>
                <SheetDescription className="sr-only">Select a project</SheetDescription>
              </SheetHeader>
              <ProjectNav
                projects={projects}
                selectedProject={filters.project}
                selectedSource={filters.source}
                onSelectProject={handleSelectProject}
                onSelectSource={(source) => setFilter('source', source)}
              />
            </SheetContent>
          </Sheet>
        </div>

        <SessionListPanel
          sessions={sessions}
          insights={insights}
          selectedSessionId={filters.session}
          showProject={showProject}
          filters={{
            q: filters.q,
            character: filters.character,
            status: filters.status,
          }}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          onSelectSession={handleSelectSession}
          loading={loading}
        />
      </div>

      {/* Panel C: Session Detail — visible at lg+, Sheet at md, hidden below */}
      <div className="hidden lg:flex flex-1 min-w-0 bg-background overflow-hidden">
        {filters.session ? (
          <div className="flex-1 overflow-y-auto" key={filters.session}>
            <SessionDetailPanel sessionId={filters.session} />
          </div>
        ) : (
          <EmptyDetailState />
        )}
      </div>

      {/* Below lg: Session detail as Sheet from right */}
      {!isLg && filters.session && (
        <Sheet
          open={!!filters.session}
          onOpenChange={(open) => {
            if (!open) setFilter('session', '');
          }}
        >
          <SheetContent side="right" className="w-full sm:w-[85vw] p-0 flex flex-col">
            <SheetHeader className="sr-only">
              <SheetTitle>Session Detail</SheetTitle>
              <SheetDescription>Session detail view</SheetDescription>
            </SheetHeader>
            <div className="shrink-0 px-3 pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setFilter('session', '')}
              >
                <ArrowLeft className="h-3 w-3" />
                Back to list
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SessionDetailPanel sessionId={filters.session} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function EmptyDetailState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <MousePointerClick className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">Select a session to view details</p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        Choose a session from the list to see its overview, insights, and conversation.
      </p>
    </div>
  );
}
