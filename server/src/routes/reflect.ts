import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getDb } from '@code-insights/cli/db/client';
import { jsonrepair } from 'jsonrepair';
import { createLLMClient, isLLMConfigured } from '../llm/client.js';
import { extractJsonPayload } from '../llm/prompts.js';
import {
  FRICTION_WINS_SYSTEM_PROMPT,
  generateFrictionWinsPrompt,
  RULES_SKILLS_SYSTEM_PROMPT,
  generateRulesSkillsPrompt,
  WORKING_STYLE_SYSTEM_PROMPT,
  generateWorkingStylePrompt,
} from '../llm/reflect-prompts.js';
import { buildWhereClause, buildPeriodFilter, parseIsoWeek, formatIsoWeek, getAggregatedData } from './shared-aggregation.js';
import type { ReflectSection } from '@code-insights/cli/types';

const app = new Hono();

const MIN_FACETS_FOR_REFLECT = 8;

const ALL_SECTIONS: ReflectSection[] = ['friction-wins', 'rules-skills', 'working-style'];

// Parse LLM JSON response wrapped in <json>...</json> tags with jsonrepair fallback.
function parseLLMJson<T>(response: string): T | null {
  const payload = extractJsonPayload(response);
  if (!payload) return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    try {
      return JSON.parse(jsonrepair(payload)) as T;
    } catch {
      return null;
    }
  }
}

// Detect the dominant source tool from the database to target artifact generation.
function detectTargetTool(db: ReturnType<typeof getDb>): string {
  const row = db.prepare(
    `SELECT source_tool, COUNT(*) as count FROM sessions WHERE deleted_at IS NULL GROUP BY source_tool ORDER BY count DESC LIMIT 1`
  ).get() as { source_tool: string; count: number } | undefined;
  return row?.source_tool || 'claude-code';
}

// POST /api/reflect/generate
// Body: { sections?: ReflectSection[], period?: string, project?: string, source?: string }
// SSE endpoint: aggregates facets in code, then calls synthesis prompts for each section.
// Streams progress events so the UI can show phase-by-phase progress.
app.post('/generate', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({ error: 'LLM not configured.' }, 400);
  }

  const body = await c.req.json<{
    sections?: ReflectSection[];
    period?: string;
    project?: string;
    source?: string;
  }>();

  const sections = body.sections && body.sections.length > 0 ? body.sections : ALL_SECTIONS;
  const period = body.period || '30d';

  const db = getDb();
  const { where, params } = buildWhereClause(period, body.project, body.source);

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;

    try {
      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ phase: 'aggregating', message: 'Aggregating facets...' }),
      });

      const aggregated = getAggregatedData(db, where, params, body.project, body.source);

      if (aggregated.totalSessions === 0) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'No sessions with facets found. Run analysis first.' }),
        });
        return;
      }

      if (aggregated.totalSessions < MIN_FACETS_FOR_REFLECT) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            error: `Need at least ${MIN_FACETS_FOR_REFLECT} analyzed sessions for meaningful pattern synthesis. Currently have ${aggregated.totalSessions}. Run session analysis on more sessions first.`,
            code: 'INSUFFICIENT_FACETS',
            current: aggregated.totalSessions,
            required: MIN_FACETS_FOR_REFLECT,
          }),
        });
        return;
      }

      const client = createLLMClient();
      const results: Record<string, unknown> = {};
      const targetTool = detectTargetTool(db);

      for (const section of sections) {
        if (abortSignal.aborted) break;

        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ phase: 'synthesizing', section, message: `Generating ${section}...` }),
        });

        if (section === 'friction-wins') {
          const prompt = generateFrictionWinsPrompt({
            frictionCategories: aggregated.frictionCategories,
            effectivePatterns: aggregated.effectivePatterns,
            totalSessions: aggregated.totalSessions,
            period,
            pqSignals: (aggregated.pqDeficits.length || aggregated.pqStrengths.length)
              ? { deficits: aggregated.pqDeficits, strengths: aggregated.pqStrengths }
              : undefined,
          });
          const response = await client.chat([
            { role: 'system', content: FRICTION_WINS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ], { signal: abortSignal });
          const parsed = parseLLMJson(response.content);
          results['friction-wins'] = {
            section: 'friction-wins',
            ...(parsed ?? {}),
            frictionCategories: aggregated.frictionCategories,
            effectivePatterns: aggregated.effectivePatterns,
            pqDeficits: aggregated.pqDeficits,
            pqStrengths: aggregated.pqStrengths,
            generatedAt: new Date().toISOString(),
          };
        } else if (section === 'rules-skills') {
          // Only include patterns with sufficient occurrence counts for actionable artifacts
          const recurringFriction = aggregated.frictionCategories.filter(fc => fc.count >= 3);
          const recurringPatterns = aggregated.effectivePatterns.filter(ep => ep.frequency >= 2);
          const prompt = generateRulesSkillsPrompt({
            recurringFriction,
            effectivePatterns: recurringPatterns,
            targetTool,
          });
          const response = await client.chat([
            { role: 'system', content: RULES_SKILLS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ], { signal: abortSignal });
          const parsed = parseLLMJson(response.content);
          results['rules-skills'] = {
            section: 'rules-skills',
            ...(parsed ?? {}),
            targetTool,
            generatedAt: new Date().toISOString(),
          };
        } else if (section === 'working-style') {
          const prompt = generateWorkingStylePrompt({
            workflowDistribution: aggregated.workflowDistribution,
            outcomeDistribution: aggregated.outcomeDistribution,
            characterDistribution: aggregated.characterDistribution,
            totalSessions: aggregated.totalSessions,
            period,
            frictionFrequency: aggregated.frictionTotal,
          });
          const response = await client.chat([
            { role: 'system', content: WORKING_STYLE_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ], { signal: abortSignal });
          const parsed = parseLLMJson(response.content);
          // Sanitize tagline: must be a string ≤40 chars. Non-string LLM outputs
          // (object, array, number) are normalized to undefined so they don't
          // corrupt the snapshot blob stored in SQLite.
          const rawTagline = parsed && (parsed as Record<string, unknown>)['tagline'];
          const tagline = typeof rawTagline === 'string'
            ? rawTagline.slice(0, 40)
            : undefined;
          results['working-style'] = {
            section: 'working-style',
            ...(parsed ?? {}),
            tagline,
            workflowDistribution: aggregated.workflowDistribution,
            outcomeDistribution: aggregated.outcomeDistribution,
            characterDistribution: aggregated.characterDistribution,
            generatedAt: new Date().toISOString(),
          };
        }
      }

      // Only save snapshot if the request was not aborted mid-generation.
      // Saving partial results would cause stale/incomplete data to auto-load on next visit.
      if (!c.req.raw.signal.aborted) {
        // For ISO week periods, use the exact week boundaries as window metadata.
        // This ensures the snapshot metadata accurately reflects the week it covers.
        const isoWeekBounds = parseIsoWeek(period);
        const windowStart = isoWeekBounds
          ? isoWeekBounds.start.toISOString()
          : buildPeriodFilter(period);
        const windowEnd = isoWeekBounds
          ? isoWeekBounds.end.toISOString()
          : new Date().toISOString();
        const projectKey = body.project || '__all__';

        db.prepare(`
          INSERT INTO reflect_snapshots (period, project_id, results_json, generated_at, window_start, window_end, session_count, facet_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(period, project_id) DO UPDATE SET
            results_json = excluded.results_json,
            generated_at = excluded.generated_at,
            window_start = excluded.window_start,
            window_end = excluded.window_end,
            session_count = excluded.session_count,
            facet_count = excluded.facet_count
        `).run(
          period,
          projectKey,
          JSON.stringify(results),
          windowEnd,
          windowStart,
          windowEnd,
          aggregated.totalSessions,
          aggregated.frictionTotal
        );
      }

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ results }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: message }),
      }).catch(() => {});
    }
  });
});

// GET /api/reflect/results
// Returns raw aggregated facet data without LLM synthesis (fast, no cost).
// The full synthesized view requires POST /api/reflect/generate.
app.get('/results', (c) => {
  const db = getDb();
  const period = c.req.query('period') || '30d';
  const project = c.req.query('project');
  const source = c.req.query('source');

  const { where, params } = buildWhereClause(period, project, source);
  const aggregated = getAggregatedData(db, where, params, project, source);

  return c.json(aggregated);
});

// GET /api/reflect/weeks
// Returns the last 8 ISO weeks that have sessions, with snapshot status for each.
// Used by the WeekSelector component to show which weeks have reflections.
app.get('/weeks', (c) => {
  const db = getDb();
  const project = c.req.query('project');

  // Compute the Monday of the current ISO week so we can generate the last 8 weeks
  const now = new Date();
  const nowDay = now.getUTCDay(); // 0=Sun
  const daysToMonday = nowDay === 0 ? 6 : nowDay - 1;
  const thisMondayMs = now.getTime() - daysToMonday * 86400000;

  // Build list of last 8 ISO week strings (most recent first) with their boundaries
  type WeekEntry = { week: string; start: string; end: string };
  const weekEntries: WeekEntry[] = [];
  for (let i = 0; i < 8; i++) {
    const weekMonday = new Date(thisMondayMs - i * 7 * 86400000);
    const week = formatIsoWeek(weekMonday);
    const bounds = parseIsoWeek(week)!;
    weekEntries.push({ week, start: bounds.start.toISOString(), end: bounds.end.toISOString() });
  }

  // Oldest week start and newest week end span the full 8-week range
  const rangeStart = weekEntries[weekEntries.length - 1].start;
  const rangeEnd = weekEntries[0].end;
  const projectKey = project || '__all__';

  // Bulk query 1: session counts per week boundary using CASE bucketing.
  // Each session is assigned to its week by checking which Monday-to-Monday
  // range its started_at falls into. Avoids 8 separate COUNT queries.
  const projectCondition = project ? 'AND s.project_id = ?' : '';
  const projectParams: string[] = project ? [project] : [];

  const sessionCountRows = db.prepare(`
    SELECT
      ${weekEntries.map((_, i) => `SUM(CASE WHEN s.started_at >= ? AND s.started_at < ? THEN 1 ELSE 0 END) as w${i}`).join(',\n      ')}
    FROM sessions s
    WHERE s.deleted_at IS NULL
      AND s.started_at >= ?
      AND s.started_at < ?
      ${projectCondition}
  `).get(
    ...weekEntries.flatMap(e => [e.start, e.end]),
    rangeStart,
    rangeEnd,
    ...projectParams
  ) as Record<string, number> | undefined;

  // Bulk query 2: all snapshots for these weeks in one query
  const weekPlaceholders = weekEntries.map(() => '?').join(', ');
  const snapshotRows = db.prepare(`
    SELECT period, generated_at
    FROM reflect_snapshots
    WHERE period IN (${weekPlaceholders}) AND project_id = ?
  `).all(...weekEntries.map(e => e.week), projectKey) as Array<{ period: string; generated_at: string }>;

  const snapshotMap = new Map(snapshotRows.map(r => [r.period, r.generated_at]));

  const weeks = weekEntries.map((entry, i) => ({
    week: entry.week,
    sessionCount: (sessionCountRows?.[`w${i}`] ?? 0),
    hasSnapshot: snapshotMap.has(entry.week),
    generatedAt: snapshotMap.get(entry.week) ?? null,
  }));

  return c.json({ weeks });
});

// GET /api/reflect/snapshot
// Returns cached reflect results for a given period/project combo.
app.get('/snapshot', (c) => {
  const db = getDb();
  const period = c.req.query('period') || '30d';
  const project = c.req.query('project') || '__all__';

  const row = db.prepare(
    `SELECT * FROM reflect_snapshots WHERE period = ? AND project_id = ?`
  ).get(period, project) as {
    period: string;
    project_id: string;
    results_json: string;
    generated_at: string;
    window_start: string | null;
    window_end: string;
    session_count: number;
    facet_count: number;
  } | undefined;

  if (!row) {
    return c.json({ snapshot: null });
  }

  let results: unknown;
  try {
    results = JSON.parse(row.results_json);
  } catch {
    // Corrupted snapshot data — treat as if no snapshot exists
    return c.json({ snapshot: null });
  }

  return c.json({
    snapshot: {
      period: row.period,
      projectId: row.project_id,
      results,
      generatedAt: row.generated_at,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      sessionCount: row.session_count,
      facetCount: row.facet_count,
    },
  });
});

export default app;
