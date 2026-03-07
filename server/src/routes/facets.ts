import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getDb } from '@code-insights/cli/db/client';
import { isLLMConfigured } from '../llm/client.js';
import { extractFacetsOnly } from '../llm/analysis.js';
import type { SQLiteMessageRow, SessionData } from '../llm/analysis.js';
import { buildWhereClause, getAggregatedData } from './shared-aggregation.js';

const app = new Hono();

const MAX_BACKFILL_SESSIONS = 200;

interface FacetRow {
  session_id: string;
  outcome_satisfaction: string;
  workflow_pattern: string | null;
  had_course_correction: number;
  course_correction_reason: string | null;
  iteration_count: number;
  friction_points: string;     // JSON
  effective_patterns: string;  // JSON
  extracted_at: string;
  analysis_version: string;
}

// GET /api/facets
// Query params: project (project_id), period (7d|30d|90d|all), source (source_tool filter)
// Returns: { facets, missingCount, totalSessions }
app.get('/', (c) => {
  const db = getDb();
  const project = c.req.query('project');
  const period = c.req.query('period') || '30d';
  const source = c.req.query('source');

  const { where, params } = buildWhereClause(period, project, source);

  // Total sessions in scope
  const totalRow = db.prepare(
    `SELECT COUNT(*) as count FROM sessions s ${where}`
  ).get(...params) as { count: number };

  // Sessions with facets — join to sessions so period/project/source filters apply
  const facets = db.prepare(
    `SELECT sf.* FROM session_facets sf
     JOIN sessions s ON sf.session_id = s.id
     ${where}
     ORDER BY s.started_at DESC`
  ).all(...params) as FacetRow[];

  return c.json({
    facets,
    missingCount: totalRow.count - facets.length,
    totalSessions: totalRow.count,
  });
});

// GET /api/facets/aggregated
// Returns pre-aggregated friction categories and effective patterns for synthesis.
// Uses the shared getAggregatedData function to avoid duplication with reflect routes.
app.get('/aggregated', (c) => {
  const db = getDb();
  const project = c.req.query('project');
  const period = c.req.query('period') || '30d';
  const source = c.req.query('source');

  const { where, params } = buildWhereClause(period, project, source);
  const aggregated = getAggregatedData(db, where, params);

  return c.json(aggregated);
});

// GET /api/facets/missing
// Returns session IDs that have insights but no session_facets row.
// Used by CLI `reflect backfill` and dashboard facet status indicators.
app.get('/missing', (c) => {
  const db = getDb();
  const period = c.req.query('period') || 'all';
  const project = c.req.query('project');
  const source = c.req.query('source');

  // buildWhereClause can't be used here — it generates "WHERE ..." prefix,
  // but this query already needs "WHERE sf.session_id IS NULL".
  // Build conditions inline instead.
  const conditions: string[] = ['sf.session_id IS NULL', 's.deleted_at IS NULL'];
  const params: (string | number)[] = [];

  if (period !== 'all') {
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 0;
    if (days > 0) {
      conditions.push('s.started_at >= ?');
      params.push(new Date(now.getTime() - days * 86400000).toISOString());
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

  const where = `WHERE ${conditions.join(' AND ')}`;

  const rows = db.prepare(`
    SELECT DISTINCT i.session_id
    FROM insights i
    JOIN sessions s ON i.session_id = s.id
    LEFT JOIN session_facets sf ON i.session_id = sf.session_id
    ${where}
  `).all(...params) as Array<{ session_id: string }>;

  const sessionIds = rows.map(r => r.session_id);
  return c.json({ sessionIds, count: sessionIds.length });
});

// POST /api/facets/backfill
// Body: { sessionIds: string[] }
// Streams progress as facets are extracted one-by-one for sessions that lack them.
// Uses extractFacetsOnly (lightweight prompt: summary + first/last 20 messages).
app.post('/backfill', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({ error: 'LLM not configured.' }, 400);
  }

  const body = await c.req.json<{ sessionIds?: string[] }>();
  if (!body.sessionIds || !Array.isArray(body.sessionIds) || body.sessionIds.length === 0) {
    return c.json({ error: 'sessionIds array required' }, 400);
  }
  if (body.sessionIds.length > MAX_BACKFILL_SESSIONS) {
    return c.json({ error: `Maximum ${MAX_BACKFILL_SESSIONS} sessions per backfill request` }, 400);
  }

  const db = getDb();

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let completed = 0;
    let failed = 0;
    const total = body.sessionIds!.length;

    for (const sessionId of body.sessionIds!) {
      if (abortSignal.aborted) break;

      const session = db.prepare(
        `SELECT id, project_id, project_name, project_path, summary, ended_at
         FROM sessions WHERE id = ? AND deleted_at IS NULL`
      ).get(sessionId) as SessionData | undefined;

      if (!session) {
        failed++;
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            completed,
            failed,
            total,
            currentSessionId: sessionId,
          }),
        });
        continue;
      }

      // Skip sessions that already have facets (race condition guard)
      const existingFacet = db.prepare(
        'SELECT 1 FROM session_facets WHERE session_id = ?'
      ).get(sessionId);
      if (existingFacet) {
        completed++;
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            completed,
            failed,
            total,
            currentSessionId: sessionId,
          }),
        });
        continue;
      }

      // Only load first 20 and last 20 messages for facet extraction
      const firstMessages = db.prepare(
        `SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
         FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT 20`
      ).all(sessionId) as SQLiteMessageRow[];

      const lastMessages = db.prepare(
        `SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
         FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 20`
      ).all(sessionId) as SQLiteMessageRow[];

      // Merge and deduplicate (for sessions with <= 40 messages, some overlap)
      const seenIds = new Set<string>();
      const messages: SQLiteMessageRow[] = [];
      for (const msg of [...firstMessages, ...lastMessages.reverse()]) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          messages.push(msg);
        }
      }

      const result = await extractFacetsOnly(session, messages, { signal: abortSignal });
      if (result.success) {
        completed++;
      } else {
        failed++;
      }

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({
          completed,
          failed,
          total,
          currentSessionId: sessionId,
          ...(result.success ? {} : { error: result.error }),
        }),
      });
    }

    await stream.writeSSE({
      event: 'complete',
      data: JSON.stringify({ completed, failed, total }),
    });
  });
});

export default app;
