// ISO week date utilities for the CLI.
// Mirrors the implementation in server/src/routes/shared-aggregation.ts and
// dashboard/src/lib/date-utils.ts — kept separate so the CLI does not import
// server or dashboard code.
// IMPORTANT: keep in sync with the canonical server implementation.

/**
 * Returns the current ISO week identifier in YYYY-WNN format (e.g. "2026-W10").
 * Uses UTC to avoid timezone-dependent week boundaries.
 */
export function getCurrentIsoWeek(): string {
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
