// ──────────────────────────────────────────────────────
// Stats command — Pure aggregation layer
//
// All functions operate on SessionRow[] and produce
// aggregated output types.  Completely data-source agnostic.
//
// Generic helpers → aggregation-helpers.ts
// Time-series / bucket logic → time-series.ts
// ──────────────────────────────────────────────────────

import type {
  Period,
  SessionRow,
  StatsOverview,
  CostBreakdown,
  ProjectStatsEntry,
  TodayStats,
  TodaySession,
  ModelStatsEntry,
} from './types.js';
import { getModelPricing } from '../../../utils/pricing.js';
import {
  sum,
  diffMinutes,
  groupBy,
  findMostFrequent,
  today,
  yesterday,
  startOfWeek,
  periodStartDate,
  resolveTitle,
  shortenModelName,
} from './aggregation-helpers.js';
import {
  bucketKey,
  createBuckets,
  groupByDay,
  computeDayStats,
  computeRangeStats,
} from './time-series.js';

// Re-export helpers so existing imports from aggregation.ts continue to work.
export { periodStartDate, resolveTitle, shortenModelName } from './aggregation-helpers.js';
export { bucketKey, createBuckets, groupByDay, computeDayStats, computeRangeStats } from './time-series.js';

// ──────────────────────────────────────────────────────
// Top N
// ──────────────────────────────────────────────────────

/**
 * Compute top projects by session count.
 */
export function computeTopProjects(
  sessions: SessionRow[],
  limit: number,
): import('./types.js').GroupedMetric[] {
  const groups = groupBy(sessions, (s) => s.projectName);
  const total = sessions.length;

  const metrics: import('./types.js').GroupedMetric[] = [];
  for (const [name, group] of groups) {
    metrics.push({
      name,
      count: group.length,
      cost: sum(group, (s) => s.estimatedCostUsd ?? 0),
      percent: total > 0 ? (group.length / total) * 100 : 0,
    });
  }

  metrics.sort((a, b) => b.count - a.count);
  return metrics.slice(0, limit);
}

// ──────────────────────────────────────────────────────
// Helper: number of days in a period
// ──────────────────────────────────────────────────────

function daysInPeriod(period: Period, sessions: SessionRow[]): number {
  switch (period) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case 'all': {
      if (sessions.length === 0) return 1; // avoid division by zero
      const dates = sessions.map((s) => s.startedAt.getTime());
      const earliest = Math.min(...dates);
      const latest = Math.max(...dates);
      const days = Math.ceil((latest - earliest) / 86_400_000) + 1;
      return Math.max(days, 1);
    }
  }
}

// ──────────────────────────────────────────────────────
// Main aggregation functions
// ──────────────────────────────────────────────────────

/**
 * High-level overview of all sessions in the period.
 */
export function computeOverview(
  sessions: SessionRow[],
  period: Period,
): StatsOverview {
  const sessionsWithCost = sessions.filter(
    (s) => s.estimatedCostUsd != null,
  );

  const totalCost = sum(sessionsWithCost, (s) => s.estimatedCostUsd!);

  const totalTokens = sum(sessionsWithCost, (s) =>
    (s.totalInputTokens ?? 0) +
    (s.totalOutputTokens ?? 0) +
    (s.cacheCreationTokens ?? 0) +
    (s.cacheReadTokens ?? 0),
  );

  const uniqueProjects = new Set(sessions.map((s) => s.projectId));

  // Source tools — only populate if 2+ distinct sources exist
  const sourceToolNames = sessions
    .map((s) => s.sourceTool)
    .filter((t): t is string => t != null);
  const uniqueSourceTools = new Set(sourceToolNames);
  let sourceTools: import('./types.js').GroupedMetric[] = [];
  if (uniqueSourceTools.size >= 2) {
    const groups = groupBy(
      sessions.filter((s) => s.sourceTool != null),
      (s) => s.sourceTool!,
    );
    for (const [name, group] of groups) {
      sourceTools.push({
        name,
        count: group.length,
        cost: sum(group, (s) => s.estimatedCostUsd ?? 0),
        percent:
          sessions.length > 0 ? (group.length / sessions.length) * 100 : 0,
      });
    }
    sourceTools.sort((a, b) => b.count - a.count);
  }

  // Week range: Monday of current week through end of today
  const weekStart = startOfWeek();
  const tomorrow = today();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    sessionCount: sessions.length,
    messageCount: sum(sessions, (s) => s.messageCount),
    totalCost,
    sessionsWithCostCount: sessionsWithCost.length,
    totalTimeMinutes: sum(sessions, (s) => diffMinutes(s.startedAt, s.endedAt)),
    totalTokens,
    projectCount: uniqueProjects.size,
    activityByDay: groupByDay(sessions, period),
    todayStats: computeDayStats(sessions, today()),
    yesterdayStats: computeDayStats(sessions, yesterday()),
    weekStats: computeRangeStats(sessions, weekStart, tomorrow),
    topProjects: computeTopProjects(sessions, 5),
    sourceTools,
  };
}

/**
 * Detailed cost breakdown across projects, models, and tokens.
 */
export function computeCostBreakdown(
  sessions: SessionRow[],
  period: Period,
): CostBreakdown {
  const costSessions = sessions.filter(
    (s) => s.estimatedCostUsd != null,
  );
  const totalCost = sum(costSessions, (s) => s.estimatedCostUsd!);
  const days = daysInPeriod(period, costSessions);
  const avgPerDay = days > 0 ? totalCost / days : 0;
  const avgPerSession =
    costSessions.length > 0 ? totalCost / costSessions.length : 0;

  // Daily cost trend
  const dailyTrend = groupByDay(sessions, period, 'cost');

  // Peak day
  let peakDay: CostBreakdown['peakDay'] = null;
  if (dailyTrend.length > 0) {
    const peak = dailyTrend.reduce((best, pt) =>
      pt.value > best.value ? pt : best,
    );
    if (peak.value > 0) {
      // Count sessions on peak day
      const peakSessions = sessions.filter(
        (s) => bucketKey(s.startedAt, period) === peak.date,
      );
      peakDay = {
        date: peak.date,
        cost: peak.value,
        sessions: peakSessions.length,
      };
    }
  }

  // By project
  const projectGroups = groupBy(costSessions, (s) => s.projectName);
  const byProject: import('./types.js').GroupedMetric[] = [];
  for (const [name, group] of projectGroups) {
    const cost = sum(group, (s) => s.estimatedCostUsd!);
    byProject.push({
      name,
      count: group.length,
      cost,
      percent: totalCost > 0 ? (cost / totalCost) * 100 : 0,
    });
  }
  byProject.sort((a, b) => b.cost - a.cost);

  // By model
  const modelSessions = costSessions.filter((s) => s.primaryModel != null);
  const modelGroups = groupBy(modelSessions, (s) => s.primaryModel!);
  const byModel: import('./types.js').GroupedMetric[] = [];
  for (const [name, group] of modelGroups) {
    const cost = sum(group, (s) => s.estimatedCostUsd!);
    byModel.push({
      name,
      count: group.length,
      cost,
      percent: totalCost > 0 ? (cost / totalCost) * 100 : 0,
    });
  }
  byModel.sort((a, b) => b.cost - a.cost);

  // Token breakdown with pricing
  const inputTokens = sum(costSessions, (s) => s.totalInputTokens ?? 0);
  const outputTokens = sum(costSessions, (s) => s.totalOutputTokens ?? 0);
  const cacheCreation = sum(costSessions, (s) => s.cacheCreationTokens ?? 0);
  const cacheReads = sum(costSessions, (s) => s.cacheReadTokens ?? 0);

  // Compute costs using weighted average pricing across models
  // For simplicity, use per-session model pricing and sum
  let inputCost = 0;
  let outputCost = 0;
  let cacheCreationCost = 0;
  let cacheReadCost = 0;

  for (const s of costSessions) {
    const pricing = getModelPricing(s.primaryModel ?? '');
    inputCost += ((s.totalInputTokens ?? 0) / 1_000_000) * pricing.input;
    outputCost += ((s.totalOutputTokens ?? 0) / 1_000_000) * pricing.output;
    cacheCreationCost +=
      ((s.cacheCreationTokens ?? 0) / 1_000_000) * pricing.input * 1.25;
    cacheReadCost +=
      ((s.cacheReadTokens ?? 0) / 1_000_000) * pricing.input * 0.1;
  }

  const cacheDenominator = inputTokens + cacheReads;
  const cacheHitRate =
    cacheDenominator > 0 ? cacheReads / cacheDenominator : 0;

  return {
    totalCost,
    avgPerDay,
    avgPerSession,
    sessionCount: sessions.length,
    sessionsWithCostCount: costSessions.length,
    dailyTrend,
    peakDay,
    byProject,
    byModel,
    tokenBreakdown: {
      inputTokens,
      outputTokens,
      cacheCreation,
      cacheReads,
      inputCost,
      outputCost,
      cacheCreationCost,
      cacheReadCost,
      cacheHitRate,
    },
  };
}

/**
 * Per-project statistics.
 */
export function computeProjectStats(
  sessions: SessionRow[],
  period: Period,
): ProjectStatsEntry[] {
  const groups = groupBy(sessions, (s) => s.projectId);
  const entries: ProjectStatsEntry[] = [];

  for (const [projectId, group] of groups) {
    if (group.length === 0) continue;

    const models = group
      .map((s) => s.primaryModel)
      .filter((m): m is string => m != null);
    const sourceTools = group
      .map((s) => s.sourceTool)
      .filter((t): t is string => t != null);

    const costSessions = group.filter((s) => s.estimatedCostUsd != null);

    entries.push({
      projectId,
      projectName: group[0].projectName,
      sessionCount: group.length,
      totalCost: sum(costSessions, (s) => s.estimatedCostUsd!),
      totalTimeMinutes: sum(group, (s) => diffMinutes(s.startedAt, s.endedAt)),
      messageCount: sum(group, (s) => s.messageCount),
      totalTokens: sum(costSessions, (s) =>
        (s.totalInputTokens ?? 0) +
        (s.totalOutputTokens ?? 0) +
        (s.cacheCreationTokens ?? 0) +
        (s.cacheReadTokens ?? 0),
      ),
      primaryModel: findMostFrequent(models),
      lastActive: group.reduce(
        (latest, s) => (s.endedAt > latest ? s.endedAt : latest),
        group[0].endedAt,
      ),
      sourceTool: findMostFrequent(sourceTools),
      activityByDay: groupByDay(group, period),
    });
  }

  entries.sort((a, b) => b.sessionCount - a.sessionCount);
  return entries;
}

/**
 * Today's session details.
 */
export function computeTodayStats(sessions: SessionRow[]): TodayStats {
  const t = today();
  const tYear = t.getFullYear();
  const tMonth = t.getMonth();
  const tDate = t.getDate();

  const todaySessions = sessions.filter((s) => {
    const d = s.startedAt;
    return (
      d.getFullYear() === tYear &&
      d.getMonth() === tMonth &&
      d.getDate() === tDate
    );
  });

  const costSessions = todaySessions.filter(
    (s) => s.estimatedCostUsd != null,
  );

  // Build TodaySession array, sorted by startedAt ASC (chronological)
  const sortedSessions = [...todaySessions].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );

  const sessionDetails: TodaySession[] = sortedSessions.map((s) => ({
    id: s.id,
    projectName: s.projectName,
    title: resolveTitle(s),
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationMinutes: diffMinutes(s.startedAt, s.endedAt),
    cost: s.estimatedCostUsd,
    model: s.primaryModel,
    messageCount: s.messageCount,
    sessionCharacter: s.sessionCharacter,
  }));

  return {
    date: t,
    sessionCount: todaySessions.length,
    totalCost: sum(costSessions, (s) => s.estimatedCostUsd!),
    totalTimeMinutes: sum(todaySessions, (s) =>
      diffMinutes(s.startedAt, s.endedAt),
    ),
    messageCount: sum(todaySessions, (s) => s.messageCount),
    totalTokens: sum(costSessions, (s) =>
      (s.totalInputTokens ?? 0) +
      (s.totalOutputTokens ?? 0) +
      (s.cacheCreationTokens ?? 0) +
      (s.cacheReadTokens ?? 0),
    ),
    sessions: sessionDetails,
  };
}

/**
 * Per-model statistics.
 */
export function computeModelStats(
  sessions: SessionRow[],
  period: Period,
): ModelStatsEntry[] {
  const withModel = sessions.filter((s) => s.primaryModel != null);
  const totalSessions = withModel.length;
  const totalCostAll = sum(
    withModel.filter((s) => s.estimatedCostUsd != null),
    (s) => s.estimatedCostUsd!,
  );

  const groups = groupBy(withModel, (s) => s.primaryModel!);
  const entries: ModelStatsEntry[] = [];

  for (const [model, group] of groups) {
    const costSessions = group.filter((s) => s.estimatedCostUsd != null);
    const modelTotalCost = sum(costSessions, (s) => s.estimatedCostUsd!);
    const pricing = getModelPricing(model);

    // Per-session token-based cost breakdown
    let inputCost = 0;
    let outputCost = 0;
    let cacheCost = 0;

    for (const s of costSessions) {
      inputCost += ((s.totalInputTokens ?? 0) / 1_000_000) * pricing.input;
      outputCost += ((s.totalOutputTokens ?? 0) / 1_000_000) * pricing.output;
      cacheCost +=
        ((s.cacheCreationTokens ?? 0) / 1_000_000) * pricing.input * 1.25 +
        ((s.cacheReadTokens ?? 0) / 1_000_000) * pricing.input * 0.1;
    }

    const totalTokens = sum(costSessions, (s) =>
      (s.totalInputTokens ?? 0) +
      (s.totalOutputTokens ?? 0) +
      (s.cacheCreationTokens ?? 0) +
      (s.cacheReadTokens ?? 0),
    );

    entries.push({
      model,
      displayName: shortenModelName(model),
      sessionCount: group.length,
      sessionPercent:
        totalSessions > 0 ? (group.length / totalSessions) * 100 : 0,
      totalCost: modelTotalCost,
      costPercent:
        totalCostAll > 0 ? (modelTotalCost / totalCostAll) * 100 : 0,
      avgCostPerSession:
        costSessions.length > 0 ? modelTotalCost / costSessions.length : 0,
      totalTokens,
      inputCost,
      outputCost,
      cacheCost,
      trend: groupByDay(group, period),
    });
  }

  entries.sort((a, b) => b.totalCost - a.totalCost);
  return entries;
}
