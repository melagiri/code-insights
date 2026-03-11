import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WeekInfo } from '@/lib/api';

interface WeekSelectorProps {
  currentWeek: string;      // e.g., "2026-W10"
  weeks: WeekInfo[];        // from GET /api/reflect/weeks, most recent first
  onWeekChange: (week: string) => void;
}

// Parse an ISO week string into UTC Monday/Sunday boundaries.
// Adapted from parseIsoWeek in server/src/routes/shared-aggregation.ts --
// uses inclusive end (Sunday) for display instead of exclusive end (next Monday) for SQL queries.
// Kept here to avoid a server-side import in the dashboard bundle.
function parseIsoWeekBounds(weekStr: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekStr);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay();
  const daysToMonday = jan4Day === 0 ? 6 : jan4Day - 1;
  const week1Monday = new Date(jan4.getTime() - daysToMonday * 86400000);

  const start = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000); // Sunday (inclusive for display)

  return { start, end };
}

// Format a UTC date as "Mar 4" using UTC to avoid local timezone day shift.
function formatUtcDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Format "Mar 4-10, 2026" from an ISO week string.
// Cross-month weeks (e.g., Mar 30 - Apr 5) include the month on the end date.
function formatWeekLabel(weekStr: string): string {
  const bounds = parseIsoWeekBounds(weekStr);
  if (!bounds) return weekStr;

  const startLabel = formatUtcDate(bounds.start);
  const year = bounds.end.getUTCFullYear();
  const crossMonth = bounds.start.getUTCMonth() !== bounds.end.getUTCMonth();
  const endLabel = crossMonth
    ? formatUtcDate(bounds.end)           // "Apr 5"
    : String(bounds.end.getUTCDate());    // "10"
  return `${startLabel}\u2013${endLabel}, ${year}`;
}

export function WeekSelector({ currentWeek, weeks, onWeekChange }: WeekSelectorProps) {
  // Only navigate to weeks that have sessions (or the current selected week)
  const navigableWeeks = weeks.filter(w => w.sessionCount > 0 || w.week === currentWeek);

  const currentIndex = navigableWeeks.findIndex(w => w.week === currentWeek);
  const canGoBack = currentIndex < navigableWeeks.length - 1;
  const canGoForward = currentIndex > 0;

  // If currentWeek isn't in the navigable list (e.g., weeks loaded after a project change
  // that left currentWeek pointing at a week with no sessions), fall back to the most recent
  // navigable week so the user is never trapped with non-functional arrows.
  useEffect(() => {
    if (currentIndex === -1 && navigableWeeks.length > 0) {
      onWeekChange(navigableWeeks[0].week);
    }
  }, [currentIndex, navigableWeeks, onWeekChange]);

  function handlePrev() {
    if (canGoBack && currentIndex !== -1) {
      onWeekChange(navigableWeeks[currentIndex + 1].week);
    }
  }

  function handleNext() {
    if (canGoForward && currentIndex !== -1) {
      onWeekChange(navigableWeeks[currentIndex - 1].week);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'ArrowRight') handleNext();
  }

  const bounds = parseIsoWeekBounds(currentWeek);

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="navigation"
      aria-label="Week selector"
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handlePrev}
          disabled={!canGoBack}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-[160px] text-center">
          <span className="text-sm font-medium">{formatWeekLabel(currentWeek)}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleNext}
          disabled={!canGoForward}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Dot indicators -- show up to 8 recent weeks.
          Dots are supplementary navigation; primary nav is via arrow buttons.
          tabIndex={-1} keeps dots out of the tab order while keeping them mouse-clickable. */}
      {weeks.length > 0 && (
        <div className="flex items-center gap-1">
          {weeks.map((w) => {
            const isCurrent = w.week === currentWeek;
            const dotBounds = parseIsoWeekBounds(w.week);
            const label = dotBounds
              ? `${w.week}: ${w.sessionCount} session${w.sessionCount !== 1 ? 's' : ''}${w.hasSnapshot ? ', reflection generated' : w.sessionCount > 0 ? ', no reflection yet' : ''}`
              : w.week;

            return (
              <button
                key={w.week}
                title={label}
                tabIndex={-1}
                onClick={w.sessionCount > 0 ? () => onWeekChange(w.week) : undefined}
                className={[
                  'rounded-full transition-all',
                  isCurrent ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5',
                  w.sessionCount === 0
                    ? 'bg-muted cursor-default'
                    : w.hasSnapshot
                      ? isCurrent
                        ? 'bg-primary cursor-pointer'
                        : 'bg-primary/60 cursor-pointer hover:bg-primary/80'
                      : isCurrent
                        ? 'border border-primary bg-transparent cursor-pointer'
                        : 'border border-muted-foreground/40 bg-transparent cursor-pointer hover:border-primary/60',
                ].join(' ')}
              />
            );
          })}
        </div>
      )}

      {/* Current week date range for screen readers */}
      {bounds && (
        <span className="sr-only">
          Week from {formatUtcDate(bounds.start)} to {formatUtcDate(bounds.end)}
        </span>
      )}
    </div>
  );
}
