import { useMemo } from 'react';
import { useSessions } from '@/hooks/useSessions';
import { useInsights } from '@/hooks/useInsights';
import { useProjects } from '@/hooks/useProjects';
import { ActivityChart } from '@/components/charts/ActivityChart';
import { InsightTypeChart } from '@/components/charts/InsightTypeChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTokenCount, formatModelName } from '@/lib/utils';
import { CHART_COLORS } from '@/lib/constants/colors';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DailyStats } from '@/lib/types';
import { useThemeColors } from '@/lib/hooks/useThemeColors';

export default function AnalyticsPage() {
  const { data: sessions = [], isLoading: sessionsLoading } = useSessions({ limit: 500 });
  const { data: insights = [], isLoading: insightsLoading } = useInsights();
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { tooltipBg, tooltipBorder } = useThemeColors();

  const loading = sessionsLoading || insightsLoading || projectsLoading;

  // Build daily stats from sessions
  const dailyStats: DailyStats[] = useMemo(() => {
    const grouped: Record<string, { session_count: number; insight_count: number }> = {};
    for (const s of sessions) {
      const date = s.started_at.slice(0, 10);
      if (!grouped[date]) grouped[date] = { session_count: 0, insight_count: 0 };
      grouped[date].session_count++;
    }
    for (const i of insights) {
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
  }, [sessions, insights]);

  // Insight type breakdown
  const insightsByType = useMemo(() => ({
    summary: insights.filter((i) => i.type === 'summary').length,
    decision: insights.filter((i) => i.type === 'decision').length,
    learning: insights.filter((i) => i.type === 'learning' || i.type === 'technique').length,
    prompt_quality: insights.filter((i) => i.type === 'prompt_quality').length,
  }), [insights]);

  // Project stats
  const projectStats = useMemo(() => {
    const statsMap: Record<
      string,
      {
        projectId: string;
        projectName: string;
        sessionCount: number;
        insightCounts: { summary: number; decision: number; learning: number; prompt_quality: number };
        totalInputTokens: number;
        totalOutputTokens: number;
        estimatedCostUsd: number;
      }
    > = {};

    for (const s of sessions) {
      if (!statsMap[s.project_id]) {
        statsMap[s.project_id] = {
          projectId: s.project_id,
          projectName: s.project_name,
          sessionCount: 0,
          insightCounts: { summary: 0, decision: 0, learning: 0, prompt_quality: 0 },
          totalInputTokens: 0,
          totalOutputTokens: 0,
          estimatedCostUsd: 0,
        };
      }
      statsMap[s.project_id].sessionCount++;
      statsMap[s.project_id].totalInputTokens += s.total_input_tokens ?? 0;
      statsMap[s.project_id].totalOutputTokens += s.total_output_tokens ?? 0;
      statsMap[s.project_id].estimatedCostUsd += s.estimated_cost_usd ?? 0;
    }

    for (const i of insights) {
      if (statsMap[i.project_id]) {
        const type = i.type === 'technique' ? 'learning' : i.type;
        if (type in statsMap[i.project_id].insightCounts) {
          statsMap[i.project_id].insightCounts[type as keyof typeof statsMap[string]['insightCounts']]++;
        }
      }
    }

    return Object.values(statsMap).sort((a, b) => b.sessionCount - a.sessionCount);
  }, [sessions, insights]);

  // Model distribution
  const modelDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const s of sessions) {
      if (s.primary_model) {
        dist[s.primary_model] = (dist[s.primary_model] ?? 0) + 1;
      }
    }
    return dist;
  }, [sessions]);

  const totalSessions = sessions.length;
  const totalInsights = insights.length;
  const totalCost = sessions.reduce((sum, s) => sum + (s.estimated_cost_usd ?? 0), 0);
  const totalTokens = sessions.reduce(
    (sum, s) =>
      sum +
      (s.total_input_tokens ?? 0) +
      (s.total_output_tokens ?? 0) +
      (s.cache_creation_tokens ?? 0) +
      (s.cache_read_tokens ?? 0),
    0
  );

  // Top projects chart data
  const projectChartData = projectStats
    .slice(0, 10)
    .map((p) => ({
      name: p.projectName.length > 15 ? p.projectName.slice(0, 15) + '...' : p.projectName,
      sessions: p.sessionCount,
    }));

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Visualize your AI coding usage patterns</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Visualize your AI coding usage patterns</p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSessions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalInsights}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{projects.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {totalCost > 0 ? 'Estimated Cost' : 'Total Tokens'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {totalCost > 0
                ? `$${totalCost.toFixed(2)}`
                : totalTokens > 0
                  ? formatTokenCount(totalTokens)
                  : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Over Time */}
      <ActivityChart data={dailyStats} />

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <InsightTypeChart data={insightsByType} />

        {/* Sessions by Project */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {projectChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        borderColor: tooltipBorder,
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="sessions"
                      fill={CHART_COLORS.projects.sessions}
                      name="Sessions"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">No project data yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model Distribution */}
      {Object.keys(modelDistribution).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Model Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(modelDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([model, count], i) => (
                  <div key={model} className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          CHART_COLORS.models[i % CHART_COLORS.models.length],
                      }}
                    />
                    <span className="text-sm flex-1">{formatModelName(model)}</span>
                    <span className="text-sm font-medium">{count}</span>
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {totalSessions > 0
                        ? `${Math.round((count / totalSessions) * 100)}%`
                        : '—'}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-3 text-left font-medium">Project</th>
                  <th className="py-3 text-right font-medium">Sessions</th>
                  <th className="py-3 text-right font-medium">Summaries</th>
                  <th className="py-3 text-right font-medium">Decisions</th>
                  <th className="py-3 text-right font-medium">Learnings</th>
                  <th className="py-3 text-right font-medium">Est. Cost</th>
                  <th className="py-3 text-right font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {projectStats.map((project) => {
                  const tokens =
                    project.totalInputTokens + project.totalOutputTokens;
                  return (
                    <tr key={project.projectId} className="border-b last:border-0">
                      <td className="py-3">{project.projectName}</td>
                      <td className="py-3 text-right">{project.sessionCount}</td>
                      <td className="py-3 text-right">{project.insightCounts.summary}</td>
                      <td className="py-3 text-right">{project.insightCounts.decision}</td>
                      <td className="py-3 text-right">{project.insightCounts.learning}</td>
                      <td className="py-3 text-right">
                        {project.estimatedCostUsd > 0
                          ? `$${project.estimatedCostUsd.toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="py-3 text-right">
                        {tokens > 0 ? formatTokenCount(tokens) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {projectStats.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                      No project data yet. Sync sessions to see analytics.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
