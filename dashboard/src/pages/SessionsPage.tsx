import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { useSessions } from '@/hooks/useSessions';
import { useProjects } from '@/hooks/useProjects';
import { useInsights } from '@/hooks/useInsights';
import { SESSION_CHARACTER_COLORS, SOURCE_TOOL_COLORS } from '@/lib/constants/colors';
import { formatDuration, getSessionTitle } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  Wrench,
  Clock,
  CheckCircle2,
  Circle,
  SearchX,
  Terminal,
} from 'lucide-react';
import type { Session } from '@/lib/types';

const SESSION_CHARACTERS = [
  'deep_focus',
  'bug_hunt',
  'feature_build',
  'exploration',
  'refactor',
  'learning',
  'quick_task',
] as const;

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - 7);

  const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (sessionDay.getTime() === today.getTime()) return 'Today';
  if (sessionDay.getTime() === yesterday.getTime()) return 'Yesterday';
  if (sessionDay >= thisWeekStart) return 'This Week';
  return 'Earlier';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'];

export default function SessionsPage() {
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [characterFilter, setCharacterFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: projects = [], isLoading: projectsLoading } = useProjects();

  const sessionParams = useMemo(() => {
    const params: { projectId?: string; sourceTool?: string; limit?: number } = { limit: 200 };
    if (projectFilter !== 'all') params.projectId = projectFilter;
    if (sourceFilter !== 'all') params.sourceTool = sourceFilter;
    return params;
  }, [projectFilter, sourceFilter]);

  const { data: sessions = [], isLoading: sessionsLoading } = useSessions(sessionParams);
  const { data: insights = [], isLoading: insightsLoading } = useInsights();

  const analyzedSessionIds = useMemo(
    () => new Set(insights.map((i) => i.session_id)),
    [insights]
  );

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (characterFilter !== 'all' && s.session_character !== characterFilter) return false;
      if (statusFilter === 'analyzed' && !analyzedSessionIds.has(s.id)) return false;
      if (statusFilter === 'unanalyzed' && analyzedSessionIds.has(s.id)) return false;
      if (search) {
        const q = search.toLowerCase();
        const title = getSessionTitle(s).toLowerCase();
        if (!title.includes(q) && !s.project_name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sessions, characterFilter, statusFilter, search, analyzedSessionIds]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {};
    for (const s of filteredSessions) {
      const group = getDateGroup(s.started_at);
      if (!groups[group]) groups[group] = [];
      groups[group].push(s);
    }
    return GROUP_ORDER.filter((g) => groups[g]).map((g) => ({ group: g, sessions: groups[g] }));
  }, [filteredSessions]);

  const loading = sessionsLoading || projectsLoading || insightsLoading;
  const hasClientFilters = characterFilter !== 'all' || statusFilter !== 'all' || !!search;
  const hasAnyFilter = hasClientFilters || projectFilter !== 'all' || sourceFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setProjectFilter('all');
    setSourceFilter('all');
    setCharacterFilter('all');
    setStatusFilter('all');
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Sessions</h1>
        {!loading && (
          <p className="text-muted-foreground text-sm">
            {hasClientFilters
              ? `${filteredSessions.length} matching of `
              : ''}
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} across {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <Input
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={characterFilter} onValueChange={setCharacterFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {SESSION_CHARACTERS.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="analyzed">Analyzed</SelectItem>
              <SelectItem value="unanalyzed">Not Analyzed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="claude-code">Claude Code</SelectItem>
              <SelectItem value="cursor">Cursor</SelectItem>
              <SelectItem value="codex-cli">Codex CLI</SelectItem>
              <SelectItem value="copilot-cli">Copilot CLI</SelectItem>
              <SelectItem value="copilot">Copilot</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Session groups */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-20 rounded-full" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-14" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        hasAnyFilter ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <SearchX className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No sessions match your filters</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting or clearing your search and filter criteria.
            </p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <Terminal className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No sessions yet</p>
            <p className="text-sm text-muted-foreground">
              Install the CLI and run code-insights sync to get started.
            </p>
            <Link to="/settings">
              <Button variant="outline" size="sm">
                Go to Settings
              </Button>
            </Link>
          </div>
        )
      ) : (
        <div className="space-y-6">
          {groupedSessions.map(({ group, sessions: groupSessions }) => (
            <div key={group}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group}
              </h2>
              <div className="space-y-2">
                {groupSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    isAnalyzed={analyzedSessionIds.has(session.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({ session, isAnalyzed }: { session: Session; isAnalyzed: boolean }) {
  const startedAt = new Date(session.started_at);
  const endedAt = new Date(session.ended_at);
  const displayTitle = getSessionTitle(session);
  const characterColor = session.session_character
    ? (SESSION_CHARACTER_COLORS[session.session_character] ?? 'bg-muted text-muted-foreground')
    : null;

  return (
    <Link to={`/sessions/${session.id}`} className="block group">
      <div className="rounded-lg border bg-card px-4 py-3 hover:bg-accent/40 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
              {displayTitle}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {session.session_character && characterColor && (
                <Badge variant="outline" className={`text-xs capitalize ${characterColor}`}>
                  {session.session_character.replace(/_/g, ' ')}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{session.project_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {session.source_tool && session.source_tool !== 'claude-code' && (
              <Badge
                variant="outline"
                className={`text-xs capitalize ${SOURCE_TOOL_COLORS[session.source_tool] ?? 'bg-muted text-muted-foreground'}`}
              >
                {session.source_tool}
              </Badge>
            )}
            {isAnalyzed ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                analyzed
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Circle className="h-3 w-3" />
                not analyzed
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(startedAt, { addSuffix: true })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {session.message_count} messages
          </span>
          <span className="flex items-center gap-1">
            <Wrench className="h-3 w-3" />
            {session.tool_call_count} tools
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(startedAt, endedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
