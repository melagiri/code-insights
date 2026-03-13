/**
 * WeekAtAGlanceStrip (rewritten as WeekHeroCard) — richer hero section above the tabs.
 * Shows: tagline, 3-stat row (sessions, coverage, successful), character distribution badges,
 * streak badge, wider outcome bar with percentage labels, and optional rate limit badge.
 *
 * Outcome keys match DB outcome_satisfaction values: 'high' | 'medium' | 'low' | 'abandoned'
 */

import { Activity, CheckCircle2, LayoutGrid, Flame, Zap } from 'lucide-react';
import { SESSION_CHARACTER_COLORS, SESSION_CHARACTER_LABELS } from '@/lib/constants/colors';

interface WeekAtAGlanceStripProps {
  tagline?: string;
  totalSessions: number;
  totalAllSessions: number;
  outcomeDistribution: Record<string, number>;
  hasGenerated: boolean;
  characterDistribution?: Record<string, number>;
  streak?: number;
  rateLimitCount?: number;
}

// DB outcome_satisfaction values: 'high' | 'medium' | 'low' | 'abandoned'
const OUTCOME_COLORS: Record<string, string> = {
  high: '#22c55e',      // green-500
  medium: '#f59e0b',    // amber-500
  low: '#f97316',       // orange-500
  abandoned: '#ef4444', // red-500
};

const OUTCOME_LABELS: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  abandoned: 'Abandoned',
};

const MAX_TAGLINE_CHARS = 80;
const MAX_CHARACTER_BADGES = 3;

export function WeekAtAGlanceStrip({
  tagline,
  totalSessions,
  totalAllSessions,
  outcomeDistribution,
  hasGenerated,
  characterDistribution,
  streak,
  rateLimitCount,
}: WeekAtAGlanceStripProps) {
  const outcomeTotal = Object.values(outcomeDistribution).reduce((s, v) => s + v, 0);
  const hasOutcomes = outcomeTotal > 0;

  const segments = Object.entries(outcomeDistribution)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ key, value, pct: (value / outcomeTotal) * 100 }));

  const successCount = outcomeDistribution['high'] ?? 0;

  const coveragePct = totalAllSessions > 0
    ? Math.round((totalSessions / totalAllSessions) * 100)
    : 0;

  const displayTagline = tagline
    ? tagline.length > MAX_TAGLINE_CHARS
      ? tagline.slice(0, MAX_TAGLINE_CHARS - 1) + '…'
      : tagline
    : null;

  // Top character badges sorted by count descending
  const characterEntries = characterDistribution
    ? Object.entries(characterDistribution)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_CHARACTER_BADGES)
    : [];

  const showStreak = (streak ?? 0) >= 2;

  return (
    <div className="rounded-lg border bg-gradient-to-br from-blue-500/5 to-violet-500/5 dark:from-blue-500/10 dark:to-violet-500/10 p-4 space-y-3">
      {/* Top row: tagline + streak/rate-limit badges */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {hasGenerated && displayTagline ? (
            <p
              className="text-base font-semibold leading-snug"
              style={{
                color: '#60a5fa',
                background: 'linear-gradient(to right, #3b82f6, #a855f7)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {displayTagline}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Generate patterns to discover your working style
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {showStreak && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-xs font-medium border border-amber-500/20">
              <Flame className="h-3 w-3" />
              {streak}w streak
            </span>
          )}
          {(rateLimitCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-xs font-medium border border-amber-500/20">
              <Zap className="h-3 w-3" />
              {rateLimitCount} rate limit{rateLimitCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xl font-bold tabular-nums">{totalSessions}</span>
          <span className="text-xs text-muted-foreground">
            {totalSessions === 1 ? 'session' : 'sessions'}
            {totalAllSessions > totalSessions && (
              <> of {totalAllSessions}</>
            )}
          </span>
        </div>
        {totalAllSessions > 0 && (
          <div className="flex items-center gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xl font-bold tabular-nums">{coveragePct}%</span>
            <span className="text-xs text-muted-foreground">analyzed</span>
          </div>
        )}
        {totalSessions > 0 && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xl font-bold tabular-nums">{successCount}</span>
            <span className="text-xs text-muted-foreground">high-quality</span>
          </div>
        )}
      </div>

      {/* Character distribution badges */}
      {characterEntries.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {characterEntries.map(([key, count]) => (
            <span
              key={key}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${SESSION_CHARACTER_COLORS[key] ?? 'bg-muted text-muted-foreground border-border'}`}
            >
              {SESSION_CHARACTER_LABELS[key] ?? key} {count}
            </span>
          ))}
        </div>
      )}

      {/* Outcome stacked bar */}
      {hasOutcomes && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Outcomes</p>
          <div className="flex h-2 rounded-full overflow-hidden" role="img" aria-label="Outcome distribution">
            {segments.map(({ key, pct }) => (
              <div
                key={key}
                title={`${OUTCOME_LABELS[key] ?? key}: ${outcomeDistribution[key]} (${Math.round(pct)}%)`}
                style={{
                  flexBasis: `${pct}%`,
                  backgroundColor: OUTCOME_COLORS[key] ?? '#94a3b8',
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
            {segments.map(({ key, value, pct }) => (
              <span key={key} className="text-xs text-muted-foreground whitespace-nowrap">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-0.5 align-middle"
                  style={{ backgroundColor: OUTCOME_COLORS[key] ?? '#94a3b8' }}
                />
                {value} {OUTCOME_LABELS[key] ?? key} ({Math.round(pct)}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
