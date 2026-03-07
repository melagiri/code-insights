import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CompactSessionRow } from './CompactSessionRow';
import { getSessionTitle, getDateGroup, sortDateGroups } from '@/lib/utils';
import { parseJsonField } from '@/lib/types';
import type { Session, Insight, InsightMetadata } from '@/lib/types';
import { SearchX, Terminal, EyeOff } from 'lucide-react';
import { useDeletedSessionCount } from '@/hooks/useSessions';

const SESSION_CHARACTERS = [
  'deep_focus',
  'bug_hunt',
  'feature_build',
  'exploration',
  'refactor',
  'learning',
  'quick_task',
] as const;

interface SessionListPanelProps {
  sessions: Session[];
  insights: Insight[];
  selectedSessionId: string;
  showProject: boolean;
  projectId?: string;
  filters: {
    q: string;
    character: string;
    status: string;
  };
  onFilterChange: (key: 'q' | 'character' | 'status', value: string) => void;
  onClearFilters: () => void;
  onSelectSession: (sessionId: string) => void;
  loading: boolean;
  missingFacetIds?: Set<string>;
}

export function SessionListPanel({
  sessions,
  insights,
  selectedSessionId,
  showProject,
  projectId,
  filters,
  onFilterChange,
  onClearFilters,
  onSelectSession,
  loading,
  missingFacetIds,
}: SessionListPanelProps) {
  const { data: deletedCount = 0 } = useDeletedSessionCount(projectId);
  const analyzedSessionIds = useMemo(
    () => new Set(insights.map((i) => i.session_id)),
    [insights]
  );

  const insightCountsBySession = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const insight of insights) {
      const counts = map.get(insight.session_id) || {};
      counts[insight.type] = (counts[insight.type] || 0) + 1;
      map.set(insight.session_id, counts);
    }
    return map;
  }, [insights]);

  const sessionOutcomes = useMemo(() => {
    const map = new Map<string, string>();
    for (const insight of insights) {
      if (insight.type === 'summary') {
        const metadata = parseJsonField<InsightMetadata>(insight.metadata, {});
        if (metadata.outcome) {
          map.set(insight.session_id, metadata.outcome);
        }
      }
    }
    return map;
  }, [insights]);

  const promptQualityScores = useMemo(() => {
    const map = new Map<string, number>();
    for (const insight of insights) {
      if (insight.type === 'prompt_quality') {
        const metadata = parseJsonField<Record<string, unknown>>(insight.metadata, {});
        if (typeof metadata.efficiencyScore === 'number') {
          map.set(insight.session_id, metadata.efficiencyScore);
        }
      }
    }
    return map;
  }, [insights]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filters.character !== 'all' && s.session_character !== filters.character) return false;
      if (filters.status === 'analyzed' && !analyzedSessionIds.has(s.id)) return false;
      if (filters.status === 'unanalyzed' && analyzedSessionIds.has(s.id)) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const title = getSessionTitle(s).toLowerCase();
        if (!title.includes(q) && !s.project_name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sessions, filters.character, filters.status, filters.q, analyzedSessionIds]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, Session[]>();
    for (const s of filteredSessions) {
      const group = getDateGroup(s.started_at);
      const arr = groups.get(group) || [];
      arr.push(s);
      groups.set(group, arr);
    }
    return sortDateGroups([...groups.entries()]).map(([group, sessions]) => ({
      group,
      sessions,
    }));
  }, [filteredSessions]);

  const hasClientFilters =
    filters.character !== 'all' || filters.status !== 'all' || !!filters.q;

  return (
    <div className="flex flex-col h-full">
      {/* Search + filters */}
      <div className="shrink-0 p-3 space-y-2 border-b">
        <Input
          placeholder="Search sessions..."
          value={filters.q}
          onChange={(e) => onFilterChange('q', e.target.value)}
          className="h-8 text-xs"
        />
        <div className="flex gap-2">
          <Select
            value={filters.character}
            onValueChange={(v) => onFilterChange('character', v)}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {SESSION_CHARACTERS.map((c) => (
                <SelectItem key={c} value={c} className="capitalize text-xs">
                  {c.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.status}
            onValueChange={(v) => onFilterChange('status', v)}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="analyzed">Analyzed</SelectItem>
              <SelectItem value="unanalyzed">Not Analyzed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5 px-3 py-2.5">
                <div className="h-4 bg-muted rounded w-4/5" />
                <div className="h-3 bg-muted rounded w-2/5" />
                <div className="h-3 bg-muted rounded w-3/5" />
              </div>
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          hasClientFilters ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4 space-y-2">
              <SearchX className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No matching sessions</p>
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4 space-y-2">
              <Terminal className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No sessions yet</p>
              <p className="text-xs text-muted-foreground">
                Run code-insights sync to get started.
              </p>
            </div>
          )
        ) : (
          <div>
            {groupedSessions.map(({ group, sessions: groupSessions }) => (
              <div key={group}>
                <div className="px-3 pt-3 pb-1">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </h3>
                </div>
                {groupSessions.map((session) => (
                  <CompactSessionRow
                    key={session.id}
                    session={session}
                    isActive={session.id === selectedSessionId}
                    showProject={showProject}
                    insightCounts={insightCountsBySession.get(session.id)}
                    outcome={sessionOutcomes.get(session.id)}
                    promptQualityScore={promptQualityScores.get(session.id)}
                    missingFacets={analyzedSessionIds.has(session.id) && (missingFacetIds?.has(session.id) ?? false)}
                    onClick={() => onSelectSession(session.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden sessions footer — only shown when a project is selected and some sessions are hidden */}
      {projectId && deletedCount > 0 && (
        <div className="shrink-0 border-t px-3 py-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <EyeOff className="h-3 w-3 shrink-0" />
          <span>{deletedCount} hidden session{deletedCount !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}
