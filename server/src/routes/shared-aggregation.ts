// Shared aggregation logic for facets and reflect routes.
// Extracted to avoid ~150 lines of duplication between the two routes.

import { getDb } from '@code-insights/cli/db/client';
import { normalizeFrictionCategory } from '../llm/friction-normalize.js';

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

  const periodStart = buildPeriodFilter(period);
  if (periodStart) {
    conditions.push('s.started_at >= ?');
    params.push(periodStart);
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
  description: string;
  frequency: number;
  avg_confidence: number;
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
}

/**
 * Run all aggregation queries needed for facet analysis and synthesis.
 * Aggregation is done in code (SQL), not by LLM — LLMs synthesize, they don't count.
 */
export function getAggregatedData(
  db: ReturnType<typeof getDb>,
  where: string,
  params: (string | number)[]
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
      json_group_array(json_extract(je.value, '$.description')) as examples
    FROM session_facets sf
    JOIN sessions s ON sf.session_id = s.id
    CROSS JOIN json_each(sf.friction_points) je
    ${where}
    GROUP BY category
    ORDER BY count DESC, avg_severity DESC
  `).all(...params) as Array<{ category: string; count: number; avg_severity: number; examples: string }>;

  const effectivePatterns = db.prepare(`
    SELECT
      json_extract(je.value, '$.description') as description,
      COUNT(*) as frequency,
      AVG(json_extract(je.value, '$.confidence')) as avg_confidence
    FROM session_facets sf
    JOIN sessions s ON sf.session_id = s.id
    CROSS JOIN json_each(sf.effective_patterns) je
    ${where}
    GROUP BY description
    ORDER BY frequency DESC, avg_confidence DESC
  `).all(...params) as Array<{ description: string; frequency: number; avg_confidence: number }>;

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

  const frictionTotal = frictionCategories.reduce((sum, fc) => sum + fc.count, 0);

  // Parse examples from json_group_array output, then normalize via Levenshtein clustering
  const parsedFriction = frictionCategories.map(fc => ({
    ...fc,
    examples: JSON.parse(fc.examples) as string[],
  }));

  const normalizedFriction = new Map<string, { count: number; total_severity: number; examples: string[] }>();
  for (const fc of parsedFriction) {
    const normalized = normalizeFrictionCategory(fc.category);
    const existing = normalizedFriction.get(normalized);
    if (existing) {
      existing.count += fc.count;
      existing.total_severity += fc.avg_severity * fc.count;
      existing.examples.push(...fc.examples);
    } else {
      normalizedFriction.set(normalized, {
        count: fc.count,
        total_severity: fc.avg_severity * fc.count,
        examples: [...fc.examples],
      });
    }
  }

  const mergedFriction = Array.from(normalizedFriction.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      avg_severity: data.total_severity / data.count,
      examples: data.examples.slice(0, 10),
    }))
    .sort((a, b) => b.count - a.count || b.avg_severity - a.avg_severity);

  return {
    frictionCategories: mergedFriction,
    effectivePatterns,
    outcomeDistribution: Object.fromEntries(outcomeDistribution.map(o => [o.outcome_satisfaction, o.count])),
    workflowDistribution: Object.fromEntries(workflowDistribution.map(w => [w.workflow_pattern, w.count])),
    characterDistribution: Object.fromEntries(characterDistribution.map(ch => [ch.session_character, ch.count])),
    totalSessions: totalRow.count,
    frictionTotal,
    totalAllSessions: totalAllRow.count,
  };
}
