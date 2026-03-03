import { useMemo } from 'react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router';
import { useInsights } from '@/hooks/useInsights';
import { useFilterParams } from '@/hooks/useFilterParams';
import { useProjects } from '@/hooks/useProjects';
import { buildPatternGroups } from '@/lib/pattern-grouping';
import { InsightListItem } from '@/components/insights/InsightListItem';
import { PromptQualityCard } from '@/components/insights/PromptQualityCard';
import { RecurringPatternsSection } from '@/components/insights/RecurringPatternsSection';
import { InsightCardSkeleton } from '@/components/skeletons/InsightCardSkeleton';
import { ErrorCard } from '@/components/ErrorCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, SearchX, X } from 'lucide-react';
import { getDateGroup, sortDateGroups } from '@/lib/utils';
import { INSIGHT_TYPE_LABELS } from '@/lib/constants/colors';
import type { Insight, InsightType } from '@/lib/types';

const INSIGHT_TYPES: InsightType[] = ['summary', 'decision', 'learning', 'technique', 'prompt_quality'];

const VIEW_MODES = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'type', label: 'By Type' },
  { value: 'project', label: 'By Project' },
  { value: 'session', label: 'By Session' },
] as const;

interface InsightGroup {
  key: string;
  label: string;
  count: number;
  insights: Insight[];
}

export default function InsightsPage() {
  const [filters, setFilter, , clearFilters] = useFilterParams({
    q: '',
    project: 'all',
    type: 'all',
    view: 'timeline',
    pattern: '',
  });

  const [searchParams] = useSearchParams();
  const highlightedInsightId = searchParams.get('insight') || null;

  const { data: projects = [] } = useProjects();
  const { data: insights = [], isLoading, isError, refetch } = useInsights(
    filters.project !== 'all' ? { projectId: filters.project } : undefined
  );

  const allInsightIds = useMemo(() => new Set(insights.map((i) => i.id)), [insights]);

  const patternGroups = useMemo(() => buildPatternGroups(insights), [insights]);

  const patternInsightIds = useMemo(() => {
    if (!filters.pattern) return null;
    return patternGroups.get(filters.pattern) ?? null;
  }, [filters.pattern, patternGroups]);

  const filtered = useMemo(() => {
    return insights.filter((i) => {
      if (patternInsightIds && !patternInsightIds.has(i.id)) return false;
      if (filters.type !== 'all' && i.type !== filters.type) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        if (!i.title.toLowerCase().includes(q) && !i.content.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [insights, filters.type, filters.q, patternInsightIds]);

  const hasFilters = !!filters.q || filters.type !== 'all' || filters.project !== 'all' || !!filters.pattern;

  const grouped = useMemo((): InsightGroup[] => {
    const view = filters.view;
    const groups = new Map<string, Insight[]>();

    for (const insight of filtered) {
      let key: string;
      if (view === 'type') {
        key = insight.type;
      } else if (view === 'project') {
        key = insight.project_name;
      } else if (view === 'session') {
        key = insight.session_id;
      } else {
        key = getDateGroup(insight.created_at);
      }
      const arr = groups.get(key) || [];
      arr.push(insight);
      groups.set(key, arr);
    }

    const entries = [...groups.entries()];

    if (view === 'timeline') {
      const sorted = sortDateGroups(entries);
      return sorted.map(([key, items]) => ({
        key,
        label: key,
        count: items.length,
        insights: items,
      }));
    }

    if (view === 'type') {
      return entries.map(([key, items]) => ({
        key,
        label: INSIGHT_TYPE_LABELS[key as InsightType] || key,
        count: items.length,
        insights: items,
      }));
    }

    if (view === 'project') {
      entries.sort((a, b) => b[1].length - a[1].length);
      return entries.map(([key, items]) => ({
        key,
        label: key,
        count: items.length,
        insights: items,
      }));
    }

    // session view
    entries.sort((a, b) => {
      const aTime = Math.max(...a[1].map((i) => new Date(i.created_at).getTime()));
      const bTime = Math.max(...b[1].map((i) => new Date(i.created_at).getTime()));
      return bTime - aTime;
    });
    return entries.map(([key, items]) => {
      const first = items[0];
      const sessionDate = format(new Date(first.created_at), 'MMM d, h:mm a');
      return {
        key,
        label: `${first.project_name} -- ${sessionDate}`,
        count: items.length,
        insights: items,
      };
    });
  }, [filtered, filters.view]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Insights</h1>
        {!isLoading && (
          <p className="text-muted-foreground text-sm">
            {filtered.length} insight{filtered.length !== 1 ? 's' : ''}
            {hasFilters ? ' matching filters' : ''}
          </p>
        )}
      </div>

      {/* Pattern filter banner */}
      {filters.pattern && (
        <div className="flex items-center gap-2 rounded-lg border bg-amber-500/5 border-amber-500/20 px-3 py-2">
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
            Pattern
          </Badge>
          <span className="text-sm text-muted-foreground">
            Showing {filtered.length} insight{filtered.length !== 1 ? 's' : ''} in this recurring pattern
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto shrink-0"
            onClick={() => setFilter('pattern', '')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Filters + View Mode */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search insights..."
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            className="max-w-sm"
          />
          <Tabs
            value={filters.view}
            onValueChange={(v) => setFilter('view', v)}
          >
            <TabsList variant="default" className="h-9">
              {VIEW_MODES.map((mode) => (
                <TabsTrigger key={mode.value} value={mode.value} className="text-xs px-3">
                  {mode.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filters.project} onValueChange={(v) => setFilter('project', v)}>
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

          <Select
            value={filters.type}
            onValueChange={(v) => setFilter('type', v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {INSIGHT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {INSIGHT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {isError && !isLoading ? (
        <ErrorCard message="Failed to load insights" onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <InsightCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <SearchX className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No insights match your search</p>
            <p className="text-sm text-muted-foreground">
              Try different keywords or clear the search to see all insights.
            </p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No insights yet</p>
            <p className="text-sm text-muted-foreground">
              Analyze your sessions to generate AI insights like learnings, decisions, and summaries.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-6">
          {!filters.pattern && (
            <RecurringPatternsSection insights={insights} />
          )}

          {grouped.map((group) => (
            <div key={group.key}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.label} ({group.count})
              </h2>
              <div className="space-y-3">
                {group.insights.map((insight) =>
                  insight.type === 'prompt_quality' ? (
                    <PromptQualityCard key={insight.id} insight={insight} />
                  ) : (
                    <InsightListItem
                      key={insight.id}
                      insight={insight}
                      showProject={filters.view !== 'project'}
                      allInsightIds={allInsightIds}
                      highlighted={insight.id === highlightedInsightId}
                      defaultExpanded={insight.id === highlightedInsightId}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
