/**
 * WeekAtAGlanceStrip — compact horizontal summary bar shown above the tabs.
 * Replaces both WorkingStyleHeroCard and the 3 outcome/workflow/character pie charts.
 *
 * Displays: tagline (or placeholder) | session count | outcome stacked bar
 */

interface WeekAtAGlanceStripProps {
  tagline?: string;
  totalSessions: number;
  totalAllSessions: number;
  outcomeDistribution: Record<string, number>;
  hasGenerated: boolean;
}

// Outcome segment colors — kept as inline styles since they map to semantic outcomes
// not to Tailwind design tokens.
const OUTCOME_COLORS: Record<string, string> = {
  success: '#22c55e',   // green-500
  partial: '#f59e0b',   // amber-500
  abandoned: '#ef4444', // red-500
};

const OUTCOME_LABELS: Record<string, string> = {
  success: 'Completed',
  partial: 'Partial',
  abandoned: 'Abandoned',
};

const MAX_TAGLINE_CHARS = 60;

export function WeekAtAGlanceStrip({
  tagline,
  totalSessions,
  totalAllSessions,
  outcomeDistribution,
  hasGenerated,
}: WeekAtAGlanceStripProps) {
  const outcomeTotal = Object.values(outcomeDistribution).reduce((s, v) => s + v, 0);
  const hasOutcomes = outcomeTotal > 0;

  const segments = Object.entries(outcomeDistribution)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ key, value, pct: (value / outcomeTotal) * 100 }));

  const displayTagline = tagline
    ? tagline.length > MAX_TAGLINE_CHARS
      ? tagline.slice(0, MAX_TAGLINE_CHARS - 1) + '…'
      : tagline
    : null;

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
      {/* Left: tagline or placeholder */}
      <div className="flex-1 min-w-0">
        {hasGenerated && displayTagline ? (
          <p
            className="text-base font-semibold leading-snug truncate"
            style={{
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

      {/* Center: session count */}
      <div className="shrink-0 text-center">
        <span className="text-2xl font-bold tabular-nums">{totalSessions}</span>
        <p className="text-xs text-muted-foreground leading-tight">
          {totalSessions === 1 ? 'session' : 'sessions'}
          {totalAllSessions > totalSessions && (
            <> of {totalAllSessions}</>
          )}
        </p>
      </div>

      {/* Right: outcome stacked bar */}
      {hasOutcomes && (
        <div className="shrink-0 w-full sm:w-32">
          <p className="text-xs text-muted-foreground mb-1">Outcomes</p>
          {/* Stacked horizontal bar — each segment's width proportional to outcome count */}
          <div className="flex h-1 rounded-full overflow-hidden" role="img" aria-label="Outcome distribution">
            {segments.map(({ key, pct }) => (
              <div
                key={key}
                title={`${OUTCOME_LABELS[key] ?? key}: ${outcomeDistribution[key]}`}
                style={{
                  flexBasis: `${pct}%`,
                  backgroundColor: OUTCOME_COLORS[key] ?? '#94a3b8',
                }}
              />
            ))}
          </div>
          {/* Compact label row */}
          <div className="flex flex-wrap gap-x-2 mt-1">
            {segments.map(({ key, value }) => (
              <span key={key} className="text-xs text-muted-foreground whitespace-nowrap">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-0.5 align-middle"
                  style={{ backgroundColor: OUTCOME_COLORS[key] ?? '#94a3b8' }}
                />
                {value} {OUTCOME_LABELS[key] ?? key}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
