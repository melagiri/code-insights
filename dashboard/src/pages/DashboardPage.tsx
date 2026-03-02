import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useDashboardStats, useUsageStats } from '@/hooks/useAnalytics';
import { useSessions } from '@/hooks/useSessions';
import { useInsights } from '@/hooks/useInsights';
import { useProjects } from '@/hooks/useProjects';
import { StatsHero } from '@/components/dashboard/StatsHero';
import { DashboardActivityChart } from '@/components/dashboard/DashboardActivityChart';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { BulkAnalyzeButton } from '@/components/analysis/BulkAnalyzeButton';
import { StatsHeroSkeleton } from '@/components/skeletons/StatsHeroSkeleton';
import { ErrorCard } from '@/components/ErrorCard';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DailyStats } from '@/lib/types';
import { Sparkles, ArrowRight } from 'lucide-react';

type DashboardRange = '30d' | '90d' | 'all';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>('30d');

  const { data: dashStats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useDashboardStats(range);
  const { data: usageStats } = useUsageStats();
  const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useSessions({ limit: 500 });
  const { data: insights = [], isLoading: insightsLoading } = useInsights();
  const { data: projects = [] } = useProjects();

  const loading = statsLoading || sessionsLoading || insightsLoading;
  const hasError = statsError || sessionsError;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });

  // Sessions not yet analyzed
  const analyzedSessionIds = new Set(insights.map((i) => i.session_id));
  const unanalyzedSessions = sessions.filter((s) => !analyzedSessionIds.has(s.id));

  // Build daily stats for activity chart
  const dailyStats: DailyStats[] = useMemo(() => {
    const now = Date.now();
    const rangeDays = range === '30d' ? 30 : range === '90d' ? 90 : Infinity;
    const cutoff = rangeDays === Infinity ? 0 : now - rangeDays * 86_400_000;

    const grouped: Record<string, { session_count: number; insight_count: number }> = {};
    for (const s of sessions) {
      if (new Date(s.started_at).getTime() < cutoff) continue;
      const date = s.started_at.slice(0, 10);
      if (!grouped[date]) grouped[date] = { session_count: 0, insight_count: 0 };
      grouped[date].session_count++;
    }
    for (const i of insights) {
      if (new Date(i.timestamp).getTime() < cutoff) continue;
      const date = i.timestamp.slice(0, 10);
      if (!grouped[date]) grouped[date] = { session_count: 0, insight_count: 0 };
      grouped[date].insight_count++;
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        session_count: counts.session_count,
        message_count: 0,
        insight_count: counts.insight_count,
      }));
  }, [sessions, insights, range]);

  // Compute stats for hero
  const usageStatsData = usageStats as {
    total_input_tokens?: number;
    total_output_tokens?: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
    estimated_cost_usd?: number;
  } | null;

  const totalTokens = usageStatsData
    ? (usageStatsData.total_input_tokens ?? 0) +
      (usageStatsData.total_output_tokens ?? 0) +
      (usageStatsData.cache_creation_tokens ?? 0) +
      (usageStatsData.cache_read_tokens ?? 0)
    : (dashStats?.total_input_tokens ?? 0) + (dashStats?.total_output_tokens ?? 0);

  const totalCost =
    usageStatsData?.estimated_cost_usd ?? dashStats?.estimated_cost_usd ?? 0;

  const tokenBreakdown = usageStatsData
    ? {
        inputTokens: usageStatsData.total_input_tokens ?? 0,
        outputTokens: usageStatsData.total_output_tokens ?? 0,
        cacheCreationTokens: usageStatsData.cache_creation_tokens ?? 0,
        cacheReadTokens: usageStatsData.cache_read_tokens ?? 0,
      }
    : undefined;

  return (
    <div className="p-4 lg:p-6 space-y-3">
      {/* Greeting header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{getGreeting()}.</h1>
          {!loading && (
            <p className="text-muted-foreground text-sm mt-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} loaded
              {' '}&middot; {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <span className="text-sm text-muted-foreground">{todayLabel}</span>
      </div>

      {/* Error state */}
      {hasError && !loading && (
        <ErrorCard
          message="Failed to load dashboard data"
          onRetry={() => { refetchStats(); refetchSessions(); }}
        />
      )}

      {/* All-time stats hero */}
      {loading ? (
        <StatsHeroSkeleton />
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75">
          <StatsHero
            totalSessions={dashStats?.session_count ?? sessions.length}
            totalMessages={dashStats?.total_messages ?? 0}
            totalToolCalls={dashStats?.total_tool_calls ?? 0}
            totalDurationMin={dashStats?.total_duration_min ?? 0}
            totalProjects={projects.length}
            isExact={true}
            totalTokens={totalTokens > 0 ? totalTokens : undefined}
            totalCost={totalCost > 0 ? totalCost : undefined}
            tokenBreakdown={tokenBreakdown}
          />
        </div>
      )}

      {/* Activity chart */}
      {loading ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <Skeleton className="h-4 w-16" />
            <div className="flex gap-1">
              <Skeleton className="h-7 w-10 rounded" />
              <Skeleton className="h-7 w-10 rounded" />
              <Skeleton className="h-7 w-8 rounded" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full rounded" />
          </CardContent>
        </Card>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150">
          <DashboardActivityChart data={dailyStats} range={range} onRangeChange={setRange} />
        </div>
      )}

      {/* Needs Attention banner */}
      {unanalyzedSessions.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5 hover:shadow-md transition-shadow animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-sm font-medium">
                  {unanalyzedSessions.length} session{unanalyzedSessions.length !== 1 ? 's' : ''}{' '}
                  without analysis
                </p>
                <p className="text-xs text-muted-foreground">
                  Generate AI insights to extract learnings and decisions
                </p>
              </div>
            </div>
            <BulkAnalyzeButton sessions={unanalyzedSessions} />
          </CardContent>
        </Card>
      )}

      {/* Unified activity feed */}
      <div
        className={
          loading ? '' : 'animate-in fade-in slide-in-from-bottom-2 duration-300 delay-300'
        }
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Recent Activity</h2>
          <Link
            to="/sessions"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <Card>
          <CardContent className="px-4 py-2">
            {loading ? (
              <div className="divide-y divide-border">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Skeleton className="h-6 w-6 rounded-md shrink-0" />
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3.5 w-20" />
                      </div>
                      <Skeleton className="h-3.5 w-16 shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ActivityFeed sessions={sessions} insights={insights} limit={7} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
