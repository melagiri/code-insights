import { useState, useMemo } from 'react';
import { useInsights } from '@/hooks/useInsights';
import { useProjects } from '@/hooks/useProjects';
import { InsightCard } from '@/components/insights/InsightCard';
import { InsightListItem } from '@/components/insights/InsightListItem';
import { PromptQualityCard } from '@/components/insights/PromptQualityCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, SearchX, LayoutGrid, List } from 'lucide-react';
import type { InsightType } from '@/lib/types';

const INSIGHT_TYPES: InsightType[] = ['summary', 'decision', 'learning', 'technique', 'prompt_quality'];
const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  summary: 'Summary',
  decision: 'Decision',
  learning: 'Learning',
  technique: 'Technique',
  prompt_quality: 'Prompt Quality',
};

export default function InsightsPage() {
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<InsightType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const { data: projects = [] } = useProjects();
  const { data: insights = [], isLoading } = useInsights(
    projectFilter !== 'all' ? { projectId: projectFilter } : undefined
  );

  const allInsightIds = useMemo(() => new Set(insights.map((i) => i.id)), [insights]);

  const filtered = useMemo(() => {
    return insights.filter((i) => {
      if (typeFilter !== 'all' && i.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!i.title.toLowerCase().includes(q) && !i.content.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [insights, typeFilter, search]);

  const hasFilters = !!search || typeFilter !== 'all' || projectFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setProjectFilter('all');
  };

  const promptQuality = filtered.filter((i) => i.type === 'prompt_quality');
  const other = filtered.filter((i) => i.type !== 'prompt_quality');

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          {!isLoading && (
            <p className="text-muted-foreground text-sm">
              {filtered.length} insight{filtered.length !== 1 ? 's' : ''}
              {hasFilters ? ' matching filters' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
            <span className="sr-only">List view</span>
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="sr-only">Grid view</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <Input
          placeholder="Search insights..."
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

          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as InsightType | 'all')}
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
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-24 mt-1" />
            </div>
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
      ) : viewMode === 'grid' ? (
        <div className="space-y-6">
          {promptQuality.map((insight) => (
            <PromptQualityCard key={insight.id} insight={insight} />
          ))}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {other.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                showProject
                allInsightIds={allInsightIds}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {promptQuality.map((insight) => (
            <PromptQualityCard key={insight.id} insight={insight} />
          ))}
          {other.map((insight) => (
            <InsightListItem
              key={insight.id}
              insight={insight}
              showProject
              allInsightIds={allInsightIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
