import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useProjects } from '@/hooks/useProjects';
import { useFacetAggregation, useReflectSnapshot, useReflectWeeks } from '@/hooks/useReflect';
import { reflectGenerateStream, fetchOutdatedFacetCount } from '@/lib/api';
import { WeekSelector } from '@/components/patterns/WeekSelector';
import { parseSSEStream } from '@/lib/sse';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorCard } from '@/components/ErrorCard';
import { WorkingStyleHeroCard } from '@/components/patterns/WorkingStyleHeroCard';
import { useThemeColors } from '@/lib/hooks/useThemeColors';
import { CHART_COLORS } from '@/lib/constants/colors';
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle, Sparkles, Shield, Brain, Copy, Check, Loader2, Zap,
} from 'lucide-react';

// CHART_COLORS.models is the shared hex color array for multi-series charts
const PALETTE = CHART_COLORS.models;

// Returns the dominant driver key from a driver breakdown record.
// Used to show a single pill label rather than a full breakdown.
// Returns null when no driver data exists (pre-driver sessions).
function getDominantDriver(drivers: Record<string, number> | undefined): string | null {
  if (!drivers) return null;
  const entries = Object.entries(drivers);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

const DRIVER_LABELS: Record<string, string> = {
  'user-driven': 'User',
  'ai-driven': 'AI',
  'collaborative': 'Collab',
};

const DRIVER_STYLES: Record<string, string> = {
  'user-driven': 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  'ai-driven': 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  'collaborative': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
};

// Friction bar severity color based on avg_severity (1=low, 2=medium, 3=high)
function frictionBarColor(avgSeverity: number): string {
  if (avgSeverity >= 2.5) return '#ef4444'; // red-500 (high)
  if (avgSeverity >= 2.0) return '#f97316'; // orange-500
  if (avgSeverity >= 1.5) return '#f59e0b'; // amber-500
  return '#22c55e'; // green-500 (low)
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}


// Compute the current ISO week identifier (YYYY-WNN) in UTC.
// Mirrors formatIsoWeek/parseIsoWeek in server/src/routes/shared-aggregation.ts
// -- kept here to avoid a server-side import in the dashboard bundle.
// IMPORTANT: keep in sync with the canonical server implementation.
function getCurrentIsoWeek(): string {
  const now = new Date();
  const nowDay = now.getUTCDay();
  const daysToMonday = nowDay === 0 ? 6 : nowDay - 1;
  const monday = new Date(now.getTime() - daysToMonday * 86400000);

  // Thursday of this week determines the ISO year
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const year = thursday.getUTCFullYear();

  // Find Monday of week 1 for this ISO year
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay();
  const daysToW1Monday = jan4Day === 0 ? 6 : jan4Day - 1;
  const week1Monday = new Date(jan4.getTime() - daysToW1Monday * 86400000);

  const weekNum = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

export default function PatternsPage() {
  const [currentWeek, setCurrentWeek] = useState<string>(() => getCurrentIsoWeek());
  const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [reflectResults, setReflectResults] = useState<Record<string, unknown> | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { tooltipBg, tooltipBorder } = useThemeColors();
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const { data: projects = [] } = useProjects();

  const { data: weeksData } = useReflectWeeks({ project: selectedProject });
  const weeks = weeksData?.weeks ?? [];

  const { data: snapshotData } = useReflectSnapshot({
    period: currentWeek,
    project: selectedProject,
  });

  const { data: aggregation, isLoading, isError, refetch } = useFacetAggregation({
    period: currentWeek,
    project: selectedProject,
  });

  const { data: outdatedData } = useQuery({
    queryKey: ['facets', 'outdated', selectedProject, currentWeek],
    queryFn: () => fetchOutdatedFacetCount({ project: selectedProject, period: currentWeek }),
    staleTime: 5 * 60 * 1000,
  });

  const outdatedCount = outdatedData?.count ?? 0;

  // Abort in-flight generation on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // On initial load, jump to the most recent week that has a snapshot.
  // This avoids showing the current week with no data when reflections exist for recent weeks.
  // Only runs once (when weeks first loads) — tracked by whether currentWeek is still the computed default.
  const initialWeekRef = useRef<string>(getCurrentIsoWeek());
  useEffect(() => {
    if (!weeksData?.weeks.length) return;
    if (currentWeek !== initialWeekRef.current) return; // user already navigated
    const mostRecentWithSnapshot = weeksData.weeks.find(w => w.hasSnapshot);
    if (mostRecentWithSnapshot && mostRecentWithSnapshot.week !== currentWeek) {
      handleWeekChange(mostRecentWithSnapshot.week);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeksData]);

  // Auto-load cached snapshot when it arrives and no local results exist yet
  useEffect(() => {
    if (snapshotData?.snapshot?.results && !reflectResults && !generating) {
      setReflectResults(snapshotData.snapshot.results);
    }
  }, [snapshotData, reflectResults, generating]);

  const handleWeekChange = useCallback((week: string) => {
    setCurrentWeek(week);
    setReflectResults(null);
  }, []);

  const handleProjectChange = useCallback((projectId: string | undefined) => {
    setSelectedProject(projectId);
    setReflectResults(null);
    // Reset to current week so auto-navigation re-fires for the new project context.
    // The initialWeekRef guard in the auto-navigate effect uses getCurrentIsoWeek(),
    // so resetting currentWeek to that value re-enables the "jump to most recent snapshot" logic.
    setCurrentWeek(getCurrentIsoWeek());
    initialWeekRef.current = getCurrentIsoWeek();
  }, []);

  const handleGenerate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setGenerationProgress('Starting...');
    setReflectResults(null);

    try {
      const response = await reflectGenerateStream(
        { period: currentWeek, project: selectedProject },
        controller.signal
      );

      if (!response.body) throw new Error('No response body');

      for await (const event of parseSSEStream(response.body)) {
        if (event.event === 'progress') {
          try {
            const data = JSON.parse(event.data) as { message?: string };
            setGenerationProgress(data.message || 'Processing...');
          } catch { /* skip malformed event */ }
        } else if (event.event === 'complete') {
          try {
            const data = JSON.parse(event.data) as { results?: Record<string, unknown> };
            setReflectResults(data.results ?? null);
            queryClient.invalidateQueries({ queryKey: ['reflect', 'snapshot'] });
          } catch { /* skip malformed event */ }
        } else if (event.event === 'error') {
          try {
            const data = JSON.parse(event.data) as { error?: string };
            setGenerationProgress(`Error: ${data.error ?? 'Unknown error'}`);
          } catch { /* skip malformed event */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setGenerationProgress(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [currentWeek, selectedProject]);

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 lg:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorCard message="Failed to load patterns data" onRetry={refetch} />
      </div>
    );
  }

  const frictionData = (aggregation?.frictionCategories || []).slice(0, 10).map(fc => ({
    category: fc.category,
    count: fc.count,
    severity: Math.round(fc.avg_severity * 10) / 10,
    color: frictionBarColor(fc.avg_severity),
    examples: fc.examples,
  }));

  const outcomeData = Object.entries(aggregation?.outcomeDistribution || {}).map(([name, value]) => ({
    name,
    value,
  }));

  const workflowData = Object.entries(aggregation?.workflowDistribution || {}).map(([name, value]) => ({
    name: name.replace(/-/g, ' '),
    value,
  }));

  const characterData = Object.entries(aggregation?.characterDistribution || {}).map(([name, value]) => ({
    name: name.replace(/_/g, ' '),
    value,
  }));

  const hasEnoughFacets = (aggregation?.totalSessions ?? 0) >= 8;
  const coverageRatio = aggregation && aggregation.totalAllSessions > 0
    ? aggregation.totalSessions / aggregation.totalAllSessions
    : 0;

  const frictionWinsResult = reflectResults?.['friction-wins'] as Record<string, unknown> | undefined;
  const rulesSkillsResult = reflectResults?.['rules-skills'] as Record<string, unknown> | undefined;
  const workingStyleResult = reflectResults?.['working-style'] as Record<string, unknown> | undefined;

  const tagline = workingStyleResult?.tagline as string | undefined;
  const narrative = workingStyleResult?.narrative as string | undefined;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patterns</h1>
          <p className="text-sm text-muted-foreground">
            Cross-session analysis — friction, wins, and working style
          </p>
          {/* Snapshot metadata line — shown when a reflection exists for this week */}
          {snapshotData?.snapshot && reflectResults && (
            <p className="text-xs text-muted-foreground mt-1">
              Generated {formatRelativeDate(snapshotData.snapshot.generatedAt)}
              {' · '}
              {snapshotData.snapshot.sessionCount} sessions analyzed
              {aggregation && aggregation.totalSessions > snapshotData.snapshot.sessionCount && (
                <> — <span className="text-amber-500">{aggregation.totalSessions - snapshotData.snapshot.sessionCount} new since</span></>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Week selector replaces the 7d/30d/90d/all button group */}
          <WeekSelector
            currentWeek={currentWeek}
            weeks={weeks}
            onWeekChange={handleWeekChange}
          />
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {projects.length > 1 && (
              <select
                value={selectedProject || ''}
                onChange={(e) => handleProjectChange(e.target.value || undefined)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <Button
              onClick={handleGenerate}
              disabled={generating || !hasEnoughFacets}
              size="sm"
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating...</>
              ) : reflectResults ? (
                <><Sparkles className="h-4 w-4 mr-1.5" />Regenerate</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1.5" />Generate</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Threshold gate */}
      {!hasEnoughFacets && aggregation && (
        <div className="flex items-start gap-3 rounded-lg border border-muted bg-muted/30 p-3">
          <AlertTriangle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            {aggregation.totalAllSessions === 0 ? (
              <>
                <p className="text-sm font-medium">No sessions in this week</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Navigate to a week with sessions using the arrows above.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">
                  Not enough analyzed sessions for pattern synthesis
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Need at least 8 sessions with facets this week (currently {aggregation.totalSessions}).
                  Run session analysis to extract facets from more sessions.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Coverage warning */}
      {hasEnoughFacets && coverageRatio > 0 && coverageRatio < 0.5 && aggregation && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">
              {aggregation.totalSessions} of {aggregation.totalAllSessions} sessions analyzed
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Results may not represent your full patterns. Analyze more sessions for better accuracy.
            </p>
          </div>
        </div>
      )}

      {/* Generation progress */}
      {generating && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{generationProgress}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hero card — always visible above tabs */}
      <WorkingStyleHeroCard
        tagline={tagline}
        sessionsAnalyzed={aggregation?.totalSessions ?? 0}
        streak={aggregation?.streak ?? 0}
        toolsUsed={aggregation?.sourceToolCount ?? 0}
        characterDistribution={aggregation?.characterDistribution ?? {}}
        hasGenerated={!!reflectResults}
      />

      {/* 2-tab layout */}
      <Tabs defaultValue="insights">
        <TabsList variant="line" className="w-full justify-start border-b rounded-none px-0 h-auto pb-0">
          <TabsTrigger value="insights" className="flex items-center gap-1.5 pb-2.5">
            <Brain className="h-4 w-4" />
            Insights
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="flex items-center gap-1.5 pb-2.5">
            <Shield className="h-4 w-4" />
            Artifacts
          </TabsTrigger>
        </TabsList>

        {/* INSIGHTS TAB */}
        <TabsContent value="insights" className="mt-4 space-y-4">
          {/* Working style narrative */}
          {narrative && (
            <Card className="border-l-2 border-primary">
              <CardHeader>
                <CardTitle className="text-base">Working Style</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{narrative}</p>
              </CardContent>
            </Card>
          )}

          {/* Distribution pie charts */}
          {(outcomeData.length > 0 || workflowData.length > 0 || characterData.length > 0) && (
            <div className="grid gap-4 md:grid-cols-3">
              {outcomeData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Outcome Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={outcomeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}>
                          {outcomeData.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {workflowData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Workflow Patterns</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={workflowData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}>
                          {workflowData.map((_, i) => (
                            <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {characterData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Session Types</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={characterData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}>
                          {characterData.map((_, i) => (
                            <Cell key={i} fill={PALETTE[(i + 4) % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Friction & Wins section */}
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Friction &amp; Wins</h3>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Friction category list */}
            <div className="lg:col-span-3">
              {frictionData.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Friction Categories</CardTitle>
                    <CardDescription>Most common blockers across sessions — badge color indicates severity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {frictionWinsResult?.narrative && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground mb-4">
                        {String(frictionWinsResult.narrative)}
                      </p>
                    )}
                    <ul className="divide-y">
                      {frictionData.map((fc) => (
                        <li key={fc.category} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-3 hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors">
                            <span
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold shrink-0 mt-0.5"
                              style={{ backgroundColor: `${fc.color}20`, color: fc.color }}
                            >
                              {fc.count}x
                            </span>
                            <span className="text-sm font-medium">{fc.category}</span>
                          </div>
                          {fc.examples.length > 0 && (
                            <ul className="ml-10 mt-1.5 space-y-1">
                              {fc.examples.slice(0, 3).map((ex, j) => (
                                <li key={j} className="text-xs text-muted-foreground">{ex}</li>
                              ))}
                              {fc.examples.length > 3 && (
                                <li className="text-xs text-muted-foreground italic">
                                  +{fc.examples.length - 3} more
                                </li>
                              )}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No friction data yet. Analyze sessions to extract facets.
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Effective patterns */}
            <div className="lg:col-span-2">
              {(aggregation?.effectivePatterns || []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Effective Patterns</CardTitle>
                    <CardDescription>Techniques that work well across sessions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {outdatedCount > 0 && (
                      <Alert className="mb-4 border-amber-500/30 bg-amber-50 dark:bg-amber-950/20">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                          {outdatedCount} session{outdatedCount !== 1 ? 's have' : ' has'} outdated insight formats. Re-analyze them from the Session Insights page to improve pattern accuracy.
                        </AlertDescription>
                      </Alert>
                    )}
                    <ul className="divide-y">
                      {aggregation!.effectivePatterns.slice(0, 8).map((ep) => {
                        const dominantDriver = getDominantDriver(ep.drivers);
                        return (
                        <li key={ep.category} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-3 hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors">
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary shrink-0 mt-0.5">
                              {ep.frequency}x
                            </span>
                            <span className="text-sm font-medium flex-1">{ep.label}</span>
                            {dominantDriver && (
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium shrink-0 mt-0.5 ${DRIVER_STYLES[dominantDriver] ?? 'bg-muted text-muted-foreground'}`}>
                                {DRIVER_LABELS[dominantDriver] ?? dominantDriver}
                              </span>
                            )}
                          </div>
                          {ep.descriptions.length > 0 && (
                            <ul className="ml-10 mt-1.5 space-y-1">
                              {ep.descriptions.slice(0, 3).map((desc, j) => (
                                <li key={j} className="text-xs text-muted-foreground">{desc}</li>
                              ))}
                              {ep.descriptions.length > 3 && (
                                <li className="text-xs text-muted-foreground italic">
                                  +{ep.descriptions.length - 3} more
                                </li>
                              )}
                            </ul>
                          )}
                        </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Rate limit usage insight — moved to bottom of insights tab */}
          {aggregation?.rateLimitInfo && aggregation.rateLimitInfo.count > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4">
              <Zap className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Usage Insight: API Rate Limits
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  You hit API rate limits {aggregation.rateLimitInfo.count} time{aggregation.rateLimitInfo.count !== 1 ? 's' : ''} this week ({aggregation.rateLimitInfo.sessionsAffected} session{aggregation.rateLimitInfo.sessionsAffected !== 1 ? 's' : ''} affected). Consider upgrading your subscription or checking your API rate limits — your usage may exceed your current plan's token or request limits.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ARTIFACTS TAB */}
        <TabsContent value="artifacts" className="mt-4 space-y-4">
          {rulesSkillsResult ? (
            <>
              {/* CLAUDE.md Rules */}
              {Array.isArray(rulesSkillsResult.claudeMdRules) && (rulesSkillsResult.claudeMdRules as Array<{ rule: string; rationale: string; frictionSource: string }>).length > 0 && (
                <Card className="border-l-2 border-primary">
                  <CardHeader>
                    <CardTitle className="text-base">CLAUDE.md Rules</CardTitle>
                    <CardDescription>Add these to your AI assistant configuration</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(rulesSkillsResult.claudeMdRules as Array<{ rule: string; rationale: string; frictionSource: string }>).map((r, i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <code className="text-sm font-mono flex-1">{r.rule}</code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handleCopy(r.rule, `rule-${i}`)}
                          >
                            {copiedKey === `rule-${i}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">{r.rationale}</p>
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs">{r.frictionSource}</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Hook Configurations */}
              {Array.isArray(rulesSkillsResult.hookConfigs) && (rulesSkillsResult.hookConfigs as Array<{ event: string; command: string; rationale: string }>).length > 0 && (
                <Card className="border-l-2 border-primary">
                  <CardHeader>
                    <CardTitle className="text-base">Hook Configurations</CardTitle>
                    <CardDescription>Automation triggers</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(rulesSkillsResult.hookConfigs as Array<{ event: string; command: string; rationale: string }>).map((h, i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{h.event}</span>
                            <code className="block text-sm font-mono mt-2">{h.command}</code>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handleCopy(h.command, `hook-${i}`)}
                          >
                            {copiedKey === `hook-${i}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">{h.rationale}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            /* Pattern Ingredients fallback — before generation */
            aggregation && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pattern Ingredients</CardTitle>
                  <CardDescription>
                    {hasEnoughFacets
                      ? 'Click Generate to create rules and hooks from these patterns.'
                      : 'Analyze more sessions to unlock pattern synthesis.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aggregation.frictionCategories.filter(fc => fc.count >= 3).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Recurring friction (3+ occurrences):</p>
                      <ul className="space-y-1">
                        {aggregation.frictionCategories.filter(fc => fc.count >= 3).map((fc, i) => (
                          <li key={i} className="text-sm flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">{fc.count}x</span>
                            {fc.category}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aggregation.effectivePatterns.filter(ep => ep.frequency >= 2).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Effective patterns (2+ occurrences):</p>
                      <ul className="space-y-1">
                        {aggregation.effectivePatterns.filter(ep => ep.frequency >= 2).map((ep, i) => (
                          <li key={i} className="text-sm flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">{ep.frequency}x</span>
                            {ep.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aggregation.frictionCategories.filter(fc => fc.count >= 3).length === 0 &&
                   aggregation.effectivePatterns.filter(ep => ep.frequency >= 2).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No recurring patterns yet. Analyze more sessions to detect patterns.
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
