/**
 * Shared constants and helpers for the Patterns page and its components.
 * Centralizes driver badge styles, friction severity colors, and driver aggregation
 * so that PatternsPage.tsx, CollapsibleCategoryList, and WeekAtAGlanceStrip
 * all use the same values.
 */

/** Short display labels for the driver attribution field on effective patterns. */
export const DRIVER_LABELS: Record<string, string> = {
  'user-driven': 'User',
  'ai-driven': 'AI',
  'collaborative': 'Collab',
};

/** Tailwind badge classes keyed by driver value. */
export const DRIVER_STYLES: Record<string, string> = {
  'user-driven': 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  'ai-driven': 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  'collaborative': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
};

/**
 * Returns a hex color for a friction bar based on avg_severity (1=low, 3=high).
 * Mirrors the thresholds used in the original PatternsPage.tsx.
 */
export function frictionBarColor(avgSeverity: number): string {
  if (avgSeverity >= 2.5) return '#ef4444'; // red-500 (high)
  if (avgSeverity >= 2.0) return '#f97316'; // orange-500
  if (avgSeverity >= 1.5) return '#f59e0b'; // amber-500
  return '#22c55e'; // green-500 (low)
}

/**
 * Returns the key with the highest count from a driver breakdown record.
 * Returns null when no driver data exists (pre-driver sessions).
 */
export function getDominantDriver(drivers: Record<string, number> | undefined): string | null {
  if (!drivers) return null;
  const entries = Object.entries(drivers);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
