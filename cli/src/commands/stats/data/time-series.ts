// Time-series utilities — bucket generation and time-series grouping for stats charts.
// Extracted from aggregation.ts to keep date/time logic in a focused module.

import type { Period, SessionRow, TimeSeriesPoint, DayStats } from './types.js';
import { pad2, today, sum, diffMinutes } from './aggregation-helpers.js';

// ─── ISO week helpers ─────────────────────────────────────────────────────────

/** Get ISO week number for a date */
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Set to nearest Thursday: current date + 4 - dayOfWeek (Mon=1, Sun=7)
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Get ISO week year for a date (may differ from calendar year at year boundaries) */
function isoWeekYear(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  return date.getUTCFullYear();
}

// ─── Bucket helpers ───────────────────────────────────────────────────────────

/**
 * Returns the bucket key for a given date based on period granularity.
 */
export function bucketKey(date: Date, period: Period): string {
  switch (period) {
    case '7d':
    case '30d': {
      const y = date.getFullYear();
      const m = pad2(date.getMonth() + 1);
      const d = pad2(date.getDate());
      return `${y}-${m}-${d}`;
    }
    case '90d': {
      const wy = isoWeekYear(date);
      const wk = isoWeek(date);
      return `${wy}-W${pad2(wk)}`;
    }
    case 'all': {
      const y = date.getFullYear();
      const m = pad2(date.getMonth() + 1);
      return `${y}-${m}`;
    }
  }
}

/**
 * Create empty time-series buckets for the full date range.
 * Uses an optional referenceDate for deterministic testing (defaults to today).
 */
export function createBuckets(
  period: Period,
  referenceDate?: Date,
): Map<string, TimeSeriesPoint> {
  const ref = referenceDate ?? today();
  const buckets = new Map<string, TimeSeriesPoint>();

  switch (period) {
    case '7d': {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(ref);
        d.setDate(d.getDate() - i);
        const key = bucketKey(d, period);
        buckets.set(key, { date: key, value: 0 });
      }
      break;
    }
    case '30d': {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(ref);
        d.setDate(d.getDate() - i);
        const key = bucketKey(d, period);
        buckets.set(key, { date: key, value: 0 });
      }
      break;
    }
    case '90d': {
      // 13 weekly buckets ending at the current week
      for (let i = 12; i >= 0; i--) {
        const d = new Date(ref);
        d.setDate(d.getDate() - i * 7);
        const key = bucketKey(d, period);
        if (!buckets.has(key)) {
          buckets.set(key, { date: key, value: 0 });
        }
      }
      break;
    }
    case 'all': {
      // 12 monthly buckets ending at the current month
      for (let i = 11; i >= 0; i--) {
        const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
        const key = bucketKey(d, period);
        buckets.set(key, { date: key, value: 0 });
      }
      break;
    }
  }

  return buckets;
}

/**
 * Group sessions into time-series buckets.
 * Returns an array sorted oldest-first with gap-filling (zero values).
 */
export function groupByDay(
  sessions: SessionRow[],
  period: Period,
  metric: 'sessions' | 'cost' | 'tokens' = 'sessions',
): TimeSeriesPoint[] {
  const buckets = createBuckets(period);

  for (const s of sessions) {
    const key = bucketKey(s.startedAt, period);
    const bucket = buckets.get(key);
    if (bucket) {
      switch (metric) {
        case 'sessions':
          bucket.value += 1;
          break;
        case 'cost':
          bucket.value += s.estimatedCostUsd ?? 0;
          break;
        case 'tokens':
          bucket.value +=
            (s.totalInputTokens ?? 0) +
            (s.totalOutputTokens ?? 0) +
            (s.cacheCreationTokens ?? 0) +
            (s.cacheReadTokens ?? 0);
          break;
      }
    }
  }

  // Return sorted oldest-first (Map insertion order is already oldest-first)
  return Array.from(buckets.values());
}

// ─── Day / range stats ────────────────────────────────────────────────────────

/**
 * Compute stats for sessions starting on a specific calendar day.
 */
export function computeDayStats(sessions: SessionRow[], dayStart: Date): DayStats {
  const dayYear = dayStart.getFullYear();
  const dayMonth = dayStart.getMonth();
  const dayDate = dayStart.getDate();

  const daySessions = sessions.filter((s) => {
    const d = s.startedAt;
    return (
      d.getFullYear() === dayYear &&
      d.getMonth() === dayMonth &&
      d.getDate() === dayDate
    );
  });

  return {
    sessionCount: daySessions.length,
    totalCost: sum(daySessions, (s) => s.estimatedCostUsd ?? 0),
    totalMinutes: sum(daySessions, (s) => diffMinutes(s.startedAt, s.endedAt)),
  };
}

/**
 * Compute stats for sessions in a [from, to) date range.
 */
export function computeRangeStats(
  sessions: SessionRow[],
  from: Date,
  to: Date,
): DayStats {
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const rangeSessions = sessions.filter((s) => {
    const t = s.startedAt.getTime();
    return t >= fromMs && t < toMs;
  });

  return {
    sessionCount: rangeSessions.length,
    totalCost: sum(rangeSessions, (s) => s.estimatedCostUsd ?? 0),
    totalMinutes: sum(rangeSessions, (s) => diffMinutes(s.startedAt, s.endedAt)),
  };
}
