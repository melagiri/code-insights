// Date utilities for the dashboard.
// ISO week helpers are duplicated from server/src/routes/shared-aggregation.ts
// to avoid a server-side import in the dashboard bundle.

// Compute the current ISO week identifier (YYYY-WNN) in UTC.
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

// Parse an ISO week string into UTC Monday/Sunday boundaries.
// Uses inclusive end (Sunday) for display instead of exclusive end (next Monday) for SQL queries.
export function parseIsoWeekBounds(weekStr: string): { start: Date; end: Date } | null {
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

/**
 * Format an ISO timestamp as a human-readable relative time string.
 * Used in session and snapshot metadata lines.
 */
export function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
