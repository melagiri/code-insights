// Shared aggregation logic for facets and reflect routes.
// Extracted to avoid ~150 lines of duplication between the two routes.

import { getDb } from '@code-insights/cli/db/client';
import { normalizeFrictionCategory } from '../llm/friction-normalize.js';
import { normalizePatternCategory, getPatternCategoryLabel } from '../llm/pattern-normalize.js';

// ISO week regex: matches YYYY-WNN format (e.g., 2026-W10)
const ISO_WEEK_RE = /^(\d{4})-W(\d{2})$/;

/**
 * Parse an ISO week string (YYYY-WNN) into UTC Monday/Sunday boundaries.
 * Returns { start: Monday 00:00 UTC, end: next Monday 00:00 UTC } (exclusive end).
 *
 * ISO 8601 week rules: week 1 contains the first Thursday of the year,
 * weeks start on Monday. We use the "Thursday trick": Jan 4 is always
 * in week 1, so we find that Monday, then step to the target week.
 */
export function parseIsoWeek(weekStr: string): { start: Date; end: Date } | null {
  const match = ISO_WEEK_RE.exec(weekStr);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // Jan 4 is always in ISO week 1. Find that Monday.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days to Monday of week 1: if Sunday (0), go back 6; else go back (day - 1)
  const daysToMonday = jan4Day === 0 ? 6 : jan4Day - 1;
  const week1Monday = new Date(jan4.getTime() - daysToMonday * 86400000);

  // Offset to the target week's Monday
  const start = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 7 * 86400000);

  return { start, end };
}

/**
 * Format a Date (representing a Monday) as an ISO week string (YYYY-WNN).
 * Used when generating week inventory from a list of Mondays.
 */
export function formatIsoWeek(monday: Date): string {
  // Find which ISO week number this Monday belongs to.
  // The Monday's Thursday (3 days ahead) determines the year and week.
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const year = thursday.getUTCFullYear();

  // Find the Monday of week 1 for this ISO year
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay();
  const daysToMonday = jan4Day === 0 ? 6 : jan4Day - 1;
  const week1Monday = new Date(jan4.getTime() - daysToMonday * 86400000);

  const weekNum = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

export function buildPeriodFilter(period: string): string | null {
  const now = new Date();
  if (period === '7d') return new Date(now.getTime() - 7 * 86400000).toISOString();
  if (period === '30d') return new Date(now.getTime() - 30 * 86400000).toISOString();
  if (period === '90d') return new Date(now.getTime() - 90 * 86400000).toISOString();
  return null; // 'all'
}

export function buildWhereClause(
  period: string,
  project?: string,
  source?: string
): { where: string; params: (string | number)[] } {
  // Always exclude soft-deleted sessions from aggregations
  const conditions: string[] = ['s.deleted_at IS NULL'];
  const params: (string | number)[] = [];

  // ISO week period: use precise Monday-to-Monday UTC boundaries
  const isoWeekBounds = parseIsoWeek(period);
  if (isoWeekBounds) {
    conditions.push('s.started_at >= ?');
    params.push(isoWeekBounds.start.toISOString());
    conditions.push('s.started_at < ?');
    params.push(isoWeekBounds.end.toISOString());
  } else {
    const periodStart = buildPeriodFilter(period);
    if (periodStart) {
      conditions.push('s.started_at >= ?');
      params.push(periodStart);
    }
  }

  if (project) {
    conditions.push('s.project_id = ?');
    params.push(project);
  }
  if (source) {
    conditions.push('s.source_tool = ?');
    params.push(source);
  }

  return {
    where: `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

export interface AggregatedFrictionCategory {
  category: string;
  count: number;
  avg_severity: number;
  examples: string[];
}

export interface AggregatedEffectivePattern {
  category: string;
  label: string;            // Human-readable category name (e.g., "Structured Planning")
  frequency: number;
  avg_confidence: number;
  descriptions: string[];   // Representative descriptions, max 10
  drivers: Record<string, number>;  // driver -> count breakdown (user-driven, ai-driven, collaborative)
}

export interface RateLimitInfo {
  count: number;
  sessionsAffected: number;
  examples: string[];
}

export interface AggregatedData {
  frictionCategories: AggregatedFrictionCategory[];
  effectivePatterns: AggregatedEffectivePattern[];
  outcomeDistribution: Record<string, number>;
  workflowDistribution: Record<string, number>;
  characterDistribution: Record<string, number>;
  totalSessions: number;
  frictionTotal: number;
  totalAllSessions: number;  // all sessions in scope (not just those with facets)
  rateLimitInfo: RateLimitInfo | null;
  streak: number;            // consecutive days with at least one session (ignores period filter)
  sourceToolCount: number;   // distinct AI tools used within the scope
}

/**
 * Run all aggregation queries needed for facet analysis and synthesis.
 * Aggregation is done in code (SQL), not by LLMs — LLMs synthesize, they don't count.
 *
 * project and source are passed separately so streak can build its own
 * period-free where clause (streak measures continuity across all time).
 */
export function getAggregatedData(
  db: ReturnType<typeof getDb>,
  where: string,
  params: (string | number)[],
  project?: string,
  source?: string
): AggregatedData {
  const hasWhere = where.length > 0;
  const extraPrefix = hasWhere ? 'AND' : 'WHERE';

  const frictionCategories = db.prepare(`
    SELECT
      json_extract(je.value, '$.category') as category,
      COUNT(*) as count,
      AVG(CASE
        WHEN json_extract(je.value, '$.severity') = 'high' THEN 3
        WHEN json_extract(je.value, '$.severity') = 'medium' THEN 2
        ELSE 1
      END) as avg_severity,
      json_group_array(json_extract(je.value, '$.description')) as examples,
      json_group_array(sf.session_id) as session_ids
    FROM session_facets sf
    JOIN sessions s ON sf.session_id = s.id
    CROSS JOIN json_each(sf.friction_points) je
    ${where}
    GROUP BY category
    ORDER BY count DESC, avg_severity DESC
  `).all(...params) as Array<{ category: string; count: number; avg_severity: number; examples: string; session_ids: string }>;

  // Fetch effective patterns with confidence >= 50.
  // Category-based grouping happens in code (post-query) after normalizePatternCategory()
  // to handle any LLM variants that were stored before normalization was applied at write time.
  // extraPrefix handles the case where where is '' (tests pass empty string) vs a WHERE clause.
  const effectivePatternsRaw = db.prepare(`
    SELECT
      json_extract(je.value, '$.category') as category,
      json_extract(je.value, '$.description') as description,
      json_extract(je.value, '$.confidence') as confidence,
      json_extract(je.value, '$.driver') as driver
    FROM session_facets sf
    JOIN sessions s ON sf.session_id = s.id
    CROSS JOIN json_each(sf.effective_patterns) je
    ${where}
    ${extraPrefix} json_extract(je.value, '$.confidence') >= 50
    ORDER BY json_extract(je.value, '$.confidence') DESC
  `).all(...params) as Array<{ category: string | null; description: string | null; confidence: number | null; driver: string | null }>;

  const outcomeDistribution = db.prepare(`
    SELECT outcome_satisfaction, COUNT(*) as count
    FROM session_facets sf JOIN sessions s ON sf.session_id = s.id
    ${where}
    GROUP BY outcome_satisfaction
  `).all(...params) as Array<{ outcome_satisfaction: string; count: number }>;

  const workflowDistribution = db.prepare(`
    SELECT workflow_pattern, COUNT(*) as count
    FROM session_facets sf JOIN sessions s ON sf.session_id = s.id
    ${where}
    ${extraPrefix} sf.workflow_pattern IS NOT NULL
    GROUP BY workflow_pattern
  `).all(...params) as Array<{ workflow_pattern: string; count: number }>;

  const characterDistribution = db.prepare(`
    SELECT session_character, COUNT(*) as count
    FROM sessions s
    ${where}
    ${extraPrefix} s.session_character IS NOT NULL
    GROUP BY session_character
  `).all(...params) as Array<{ session_character: string; count: number }>;

  const totalRow = db.prepare(
    `SELECT COUNT(*) as count FROM session_facets sf JOIN sessions s ON sf.session_id = s.id ${where}`
  ).get(...params) as { count: number };

  const totalAllRow = db.prepare(
    `SELECT COUNT(*) as count FROM sessions s ${where}`
  ).get(...params) as { count: number };

  // Parse examples and session_ids from json_group_array output, then normalize via alias + Levenshtein clustering
  const parsedFriction = frictionCategories.map(fc => ({
    ...fc,
    examples: JSON.parse(fc.examples) as string[],
    session_ids: JSON.parse(fc.session_ids) as string[],
  }));

  const normalizedFriction = new Map<string, { count: number; total_severity: number; examples: string[]; session_ids: string[] }>();
  for (const fc of parsedFriction) {
    const normalized = normalizeFrictionCategory(fc.category);
    const existing = normalizedFriction.get(normalized);
    if (existing) {
      existing.count += fc.count;
      existing.total_severity += fc.avg_severity * fc.count;
      existing.examples.push(...fc.examples);
      existing.session_ids.push(...fc.session_ids);
    } else {
      normalizedFriction.set(normalized, {
        count: fc.count,
        total_severity: fc.avg_severity * fc.count,
        examples: [...fc.examples],
        session_ids: [...fc.session_ids],
      });
    }
  }

  // Partition: separate rate-limit-hit entries from general friction.
  // Rate limits are a billing/plan constraint — surfaced as a usage insight, not friction.
  // The alias map already normalizes all rate limit variants to "rate-limit-hit".
  // A regex sweep catches creative LLM variants ("throttled-by-api", etc.) that bypass
  // both the alias map and Levenshtein clustering.
  const RATE_LIMIT_CATEGORY = 'rate-limit-hit';
  const RATE_LIMIT_REGEX = /rate.?limit|throttl/i;
  let rateLimitInfo: RateLimitInfo | null = null;

  // Accumulated data for rateLimitInfo, merged from exact match + regex sweep
  let rateLimitCount = 0;
  let rateLimitSessionIds: string[] = [];
  let rateLimitExamples: string[] = [];

  const rateLimitEntry = normalizedFriction.get(RATE_LIMIT_CATEGORY);
  if (rateLimitEntry) {
    rateLimitCount += rateLimitEntry.count;
    rateLimitSessionIds.push(...rateLimitEntry.session_ids);
    rateLimitExamples.push(...rateLimitEntry.examples);
    normalizedFriction.delete(RATE_LIMIT_CATEGORY);
  }

  // Regex sweep over remaining entries to catch variants the alias map missed
  for (const [category, entry] of normalizedFriction) {
    if (RATE_LIMIT_REGEX.test(category)) {
      rateLimitCount += entry.count;
      rateLimitSessionIds.push(...entry.session_ids);
      rateLimitExamples.push(...entry.examples);
      normalizedFriction.delete(category);
    }
  }

  if (rateLimitCount > 0) {
    const uniqueSessions = new Set(rateLimitSessionIds);
    rateLimitInfo = {
      count: rateLimitCount,
      sessionsAffected: uniqueSessions.size,
      examples: rateLimitExamples.slice(0, 3),
    };
  }

  const mergedFriction = Array.from(normalizedFriction.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      avg_severity: data.total_severity / data.count,
      examples: data.examples.slice(0, 10),
    }))
    .sort((a, b) => b.count - a.count || b.avg_severity - a.avg_severity);

  // frictionTotal reflects only non-rate-limit friction (rate limits partitioned separately)
  const frictionTotal = mergedFriction.reduce((sum, fc) => sum + fc.count, 0);

  // Aggregate effective patterns by normalized category.
  // Each row from effectivePatternsRaw is a single pattern entry — we group by normalized
  // category in code so normalizePatternCategory() can handle LLM variants at query time.
  const normalizedPatterns = new Map<string, { total_confidence: number; count: number; descriptions: string[]; drivers: Record<string, number> }>();
  for (const row of effectivePatternsRaw) {
    // Skip entries with null category or description (malformed JSON in older sessions)
    if (!row.category || !row.description) continue;
    const normalized = normalizePatternCategory(row.category);
    const existing = normalizedPatterns.get(normalized);
    if (existing) {
      existing.count += 1;
      existing.total_confidence += row.confidence ?? 0;
      existing.descriptions.push(row.description);
      // Track driver breakdown — null/missing driver is silently skipped (transition period)
      if (row.driver) {
        existing.drivers[row.driver] = (existing.drivers[row.driver] ?? 0) + 1;
      }
    } else {
      const drivers: Record<string, number> = {};
      if (row.driver) {
        drivers[row.driver] = 1;
      }
      normalizedPatterns.set(normalized, {
        count: 1,
        total_confidence: row.confidence ?? 0,
        descriptions: [row.description],
        drivers,
      });
    }
  }

  const effectivePatterns: AggregatedEffectivePattern[] = Array.from(normalizedPatterns.entries())
    .map(([category, data]) => ({
      category,
      label: getPatternCategoryLabel(category),
      frequency: data.count,
      avg_confidence: data.count > 0 ? data.total_confidence / data.count : 0,
      descriptions: data.descriptions.slice(0, 10),
      drivers: data.drivers,
    }))
    .sort((a, b) => b.frequency - a.frequency || b.avg_confidence - a.avg_confidence);

  // Count distinct source tools within scope (for hero card stat pill)
  const sourceToolRow = db.prepare(
    `SELECT COUNT(DISTINCT source_tool) as count FROM sessions s ${where}`
  ).get(...params) as { count: number };

  // Streak: count consecutive days (backward from today) with at least one session.
  // Always uses all-time scope — filtering by period would cap streak at the window size.
  // Respects project and source filters since those are user-scope constraints.
  const { where: streakWhere, params: streakParams } = buildWhereClause('all', project, source);
  const sessionDates = db.prepare(
    `SELECT DISTINCT date(started_at) as session_date FROM sessions s ${streakWhere} ORDER BY session_date DESC`
  ).all(...streakParams) as Array<{ session_date: string }>;

  // Compare dates as YYYY-MM-DD strings in UTC to match SQLite's date() output.
  // Using toISOString().slice(0,10) avoids local timezone shifting the day boundary.
  const todayUTC = new Date().toISOString().slice(0, 10);
  const yesterdayUTC = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let streak = 0;
  // baseline is the date we expect for the next streak entry.
  // Start at today; if first session is yesterday, reset baseline to yesterday so
  // the loop can continue counting backward from there correctly.
  let baseline: string | null = null;

  for (const { session_date } of sessionDates) {
    if (baseline === null) {
      // First entry: must be today or yesterday to start an active streak
      if (session_date === todayUTC) {
        baseline = todayUTC;
      } else if (session_date === yesterdayUTC) {
        baseline = yesterdayUTC;
      } else {
        break; // Gap from today — no active streak
      }
      streak++;
    } else {
      // Subsequent entries: must be exactly one day before current baseline
      const prevDay: Date = new Date((baseline as string) + 'T00:00:00Z');
      prevDay.setUTCDate(prevDay.getUTCDate() - 1);
      const expectedPrev: string = prevDay.toISOString().slice(0, 10);
      if (session_date !== expectedPrev) break;
      baseline = expectedPrev;
      streak++;
    }
  }

  return {
    frictionCategories: mergedFriction,
    effectivePatterns,
    outcomeDistribution: Object.fromEntries(outcomeDistribution.map(o => [o.outcome_satisfaction, o.count])),
    workflowDistribution: Object.fromEntries(workflowDistribution.map(w => [w.workflow_pattern, w.count])),
    characterDistribution: Object.fromEntries(characterDistribution.map(ch => [ch.session_character, ch.count])),
    totalSessions: totalRow.count,
    frictionTotal,
    totalAllSessions: totalAllRow.count,
    rateLimitInfo,
    streak,
    sourceToolCount: sourceToolRow.count,
  };
}
