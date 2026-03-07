import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getDb } from '@code-insights/cli/db/client';
import { trackEvent, captureError } from '@code-insights/cli/utils/telemetry';
import type { ExportTemplate } from '@code-insights/cli/types';
import { formatKnowledgeBase } from '../export/knowledge-base.js';
import { formatAgentRules } from '../export/agent-rules.js';
import type { SessionRow, InsightRow } from '../export/knowledge-base.js';
import { createLLMClient, isLLMConfigured, loadLLMConfig } from '../llm/client.js';
import {
  applyDepthCap,
  buildInsightContext,
  getExportSystemPrompt,
  buildExportUserPrompt,
  type ExportFormat,
  type ExportScope,
  type ExportDepth,
  type ExportInsightRow,
} from '../llm/export-prompts.js';

const app = new Hono();

// SQLite SQLITE_LIMIT_VARIABLE_NUMBER is 999 by default.
// Batch insights queries to avoid hitting this limit for large session sets.
const INSIGHTS_BATCH_SIZE = 500;

function fetchInsightsForSessions(db: ReturnType<typeof getDb>, sessionIds: string[]): InsightRow[] {
  if (sessionIds.length === 0) return [];

  const results: InsightRow[] = [];
  for (let i = 0; i < sessionIds.length; i += INSIGHTS_BATCH_SIZE) {
    const chunk = sessionIds.slice(i, i + INSIGHTS_BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = db.prepare(
      `SELECT id, session_id, project_id, project_name, type, title, content,
              summary, bullets, confidence, source, metadata, timestamp,
              created_at, scope, analysis_version, linked_insight_ids
       FROM insights WHERE session_id IN (${placeholders})
       ORDER BY type, timestamp`,
    ).all(...chunk) as InsightRow[];
    results.push(...rows);
  }
  return results;
}

// POST /api/export/markdown — export sessions/insights as markdown
app.post('/markdown', async (c) => {
  const db = getDb();
  const body = await c.req.json<{
    sessionIds?: string[];
    projectId?: string;
    template?: ExportTemplate;
  }>();

  const { sessionIds, projectId, template = 'knowledge-base' } = body;

  if (template !== 'knowledge-base' && template !== 'agent-rules') {
    return c.json({ error: 'template must be "knowledge-base" or "agent-rules"' }, 400);
  }
  if (sessionIds !== undefined && !Array.isArray(sessionIds)) {
    return c.json({ error: 'sessionIds must be an array' }, 400);
  }
  if (sessionIds && (sessionIds as unknown[]).some((id) => typeof id !== 'string')) {
    return c.json({ error: 'sessionIds must contain only strings' }, 400);
  }
  if (sessionIds && sessionIds.length > 100) {
    return c.json({ error: 'Maximum 100 session IDs per export request' }, 400);
  }

  let sessions: SessionRow[];
  if (sessionIds && sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => '?').join(', ');
    sessions = db.prepare(
      `SELECT id, project_name, generated_title, custom_title, started_at, ended_at,
              message_count, estimated_cost_usd, session_character, source_tool
       FROM sessions WHERE id IN (${placeholders}) AND deleted_at IS NULL ORDER BY started_at DESC`,
    ).all(...sessionIds) as SessionRow[];
  } else if (projectId) {
    // Cap at 100 to avoid unbounded queries and SQLite variable limit on insight fetch
    sessions = db.prepare(
      `SELECT id, project_name, generated_title, custom_title, started_at, ended_at,
              message_count, estimated_cost_usd, session_character, source_tool
       FROM sessions WHERE project_id = ? AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 100`,
    ).all(projectId) as SessionRow[];
  } else {
    // "Everything" export — most recent 100 sessions
    sessions = db.prepare(
      `SELECT id, project_name, generated_title, custom_title, started_at, ended_at,
              message_count, estimated_cost_usd, session_character, source_tool
       FROM sessions WHERE deleted_at IS NULL ORDER BY started_at DESC LIMIT 100`,
    ).all() as SessionRow[];
  }

  const insights = fetchInsightsForSessions(db, sessions.map((s) => s.id));

  const markdown =
    template === 'agent-rules'
      ? formatAgentRules(sessions, insights)
      : formatKnowledgeBase(sessions, insights);

  trackEvent('export_run', {
    format: 'markdown',
    template,
    session_count: sessions.length,
    insight_count: insights.length,
    success: true,
  });

  c.header('Content-Type', 'text/markdown');
  return c.body(markdown);
});

// ─── LLM-powered export types (co-located, not in cli/src/types.ts) ──────────

interface ExportGenerateBody {
  scope: ExportScope;
  projectId?: string;
  format: ExportFormat;
  depth?: ExportDepth;
}

interface ExportGenerateMetadata {
  insightCount: number;    // insights actually sent to LLM
  totalInsights: number;   // total insights available for scope
  sessionCount: number;
  projectCount: number;
  scope: ExportScope;
  depth: ExportDepth;
}

// Fetch scoped insights ordered by confidence DESC, timestamp DESC.
// Excludes 'summary' type — per-session summaries aren't cross-session knowledge.
function fetchScopedInsights(
  db: ReturnType<typeof getDb>,
  scope: ExportScope,
  projectId: string | undefined
): ExportInsightRow[] {
  if (scope === 'project') {
    if (!projectId) return [];
    return db.prepare(`
      SELECT i.id, i.type, i.title, i.content, i.summary, i.confidence, i.project_name, i.timestamp
      FROM insights i
      JOIN sessions s ON i.session_id = s.id AND s.deleted_at IS NULL
      WHERE i.project_id = ? AND i.type != 'summary'
      ORDER BY i.confidence DESC, i.timestamp DESC
    `).all(projectId) as ExportInsightRow[];
  }

  return db.prepare(`
    SELECT i.id, i.type, i.title, i.content, i.summary, i.confidence, i.project_name, i.timestamp
    FROM insights i
    JOIN sessions s ON i.session_id = s.id AND s.deleted_at IS NULL
    WHERE i.type != 'summary'
    ORDER BY i.confidence DESC, i.timestamp DESC
  `).all() as ExportInsightRow[];
}

function fetchSessionContext(
  db: ReturnType<typeof getDb>,
  scope: ExportScope,
  projectId: string | undefined
): { sessionCount: number; projectCount: number; projectName: string | undefined; dateFrom: string; dateTo: string } {
  const today = new Date().toISOString().slice(0, 10);

  if (scope === 'project' && projectId) {
    const row = db.prepare(`
      SELECT COUNT(*) as cnt, MIN(started_at) as min_date, MAX(ended_at) as max_date, project_name
      FROM sessions WHERE project_id = ? AND deleted_at IS NULL
    `).get(projectId) as { cnt: number; min_date: string; max_date: string; project_name: string } | undefined;
    return {
      sessionCount: row?.cnt ?? 0,
      projectCount: 1,
      projectName: row?.project_name,
      dateFrom: row?.min_date?.slice(0, 10) ?? today,
      dateTo: row?.max_date?.slice(0, 10) ?? today,
    };
  }

  const row = db.prepare(`
    SELECT COUNT(*) as session_cnt,
           COUNT(DISTINCT project_id) as project_cnt,
           MIN(started_at) as min_date,
           MAX(ended_at) as max_date
    FROM sessions
    WHERE deleted_at IS NULL
  `).get() as { session_cnt: number; project_cnt: number; min_date: string; max_date: string } | undefined;

  return {
    sessionCount: row?.session_cnt ?? 0,
    projectCount: row?.project_cnt ?? 0,
    projectName: undefined,
    dateFrom: row?.min_date?.slice(0, 10) ?? today,
    dateTo: row?.max_date?.slice(0, 10) ?? today,
  };
}

// POST /api/export/generate
// Synchronous LLM export — returns full result when complete.
app.post('/generate', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

  const body = await c.req.json<ExportGenerateBody>();
  const { scope, projectId, format, depth = 'standard' } = body;

  if (scope !== 'project' && scope !== 'all') {
    return c.json({ error: 'scope must be "project" or "all"' }, 400);
  }
  if (scope === 'project' && !projectId) {
    return c.json({ error: 'projectId is required when scope is "project"' }, 400);
  }
  if (!['agent-rules', 'knowledge-brief', 'obsidian', 'notion'].includes(format)) {
    return c.json({ error: 'format must be one of: agent-rules, knowledge-brief, obsidian, notion' }, 400);
  }
  if (!['essential', 'standard', 'comprehensive'].includes(depth)) {
    return c.json({ error: 'depth must be one of: essential, standard, comprehensive' }, 400);
  }

  const db = getDb();
  const llmConfig = loadLLMConfig();
  const startTime = Date.now();

  try {
    const rawInsights = fetchScopedInsights(db, scope, projectId);
    const { capped, totalInsights } = applyDepthCap(rawInsights, depth);
    const sessionCtx = fetchSessionContext(db, scope, projectId);

    const ctx = {
      scope,
      format,
      depth,
      projectName: sessionCtx.projectName,
      sessionCount: sessionCtx.sessionCount,
      projectCount: sessionCtx.projectCount,
      dateRange: { from: sessionCtx.dateFrom, to: sessionCtx.dateTo },
      exportDate: new Date().toISOString().slice(0, 10),
    };

    const systemPrompt = getExportSystemPrompt(ctx);
    const insightContext = buildInsightContext(capped);
    const userPrompt = buildExportUserPrompt(ctx, insightContext);

    const client = createLLMClient();
    const response = await client.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { signal: c.req.raw.signal });

    const metadata: ExportGenerateMetadata = {
      insightCount: capped.length,
      totalInsights,
      sessionCount: sessionCtx.sessionCount,
      projectCount: sessionCtx.projectCount,
      scope,
      depth,
    };

    trackEvent('export_run', {
      format: `llm-${format}`,
      scope,
      depth,
      insight_count: capped.length,
      session_count: sessionCtx.sessionCount,
      llm_provider: llmConfig?.provider,
      llm_model: llmConfig?.model,
      duration_ms: Date.now() - startTime,
      success: true,
    });

    return c.json({ content: response.content, metadata }, 200);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Client disconnected — 422 is the closest Hono allows; client ignores this on abort
      return c.json({ error: 'Export cancelled' }, 422);
    }
    const message = error instanceof Error ? error.message : 'Export generation failed';
    captureError(error, { format, scope, depth, llm_provider: llmConfig?.provider, llm_model: llmConfig?.model });
    trackEvent('export_run', {
      format: `llm-${format}`,
      scope,
      depth,
      llm_provider: llmConfig?.provider,
      llm_model: llmConfig?.model,
      duration_ms: Date.now() - startTime,
      success: false,
      error_message: message,
    });
    return c.json({ error: message }, 422);
  }
});

// GET /api/export/generate/stream?scope=project&projectId=xxx&format=agent-rules&depth=standard
// SSE endpoint — streams progress events during LLM export generation.
// onProgress is implicit (no chunked analysis here); stream.writeSSE is fire-and-forget
// for progress events (non-fatal if missed).
app.get('/generate/stream', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

  const scope = c.req.query('scope') as ExportScope | undefined;
  const projectId = c.req.query('projectId');
  const format = c.req.query('format') as ExportFormat | undefined;
  const depth = (c.req.query('depth') ?? 'standard') as ExportDepth;

  if (scope !== 'project' && scope !== 'all') {
    return c.json({ error: 'scope must be "project" or "all"' }, 400);
  }
  if (scope === 'project' && !projectId) {
    return c.json({ error: 'projectId is required when scope is "project"' }, 400);
  }
  if (!format || !['agent-rules', 'knowledge-brief', 'obsidian', 'notion'].includes(format)) {
    return c.json({ error: 'format must be one of: agent-rules, knowledge-brief, obsidian, notion' }, 400);
  }
  if (!['essential', 'standard', 'comprehensive'].includes(depth)) {
    return c.json({ error: 'depth must be one of: essential, standard, comprehensive' }, 400);
  }

  const db = getDb();
  const llmConfig = loadLLMConfig();

  return streamSSE(c, async (stream) => {
    const streamStart = Date.now();
    try {
      const abortSignal = c.req.raw.signal;

      // Phase 1: load and count insights, emit counts before LLM call
      const rawInsights = fetchScopedInsights(db, scope, projectId);
      const { capped, totalInsights } = applyDepthCap(rawInsights, depth);

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({
          phase: 'loading_insights',
          insightCount: capped.length,
          totalInsights,
        }),
      });

      if (capped.length === 0) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'No insights found for the selected scope. Run analysis on some sessions first.' }),
        });
        return;
      }

      // Phase 2: synthesizing
      void stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ phase: 'synthesizing', progress: 'Sending to LLM...' }),
      }).catch(() => {});

      const sessionCtx = fetchSessionContext(db, scope, projectId);
      const ctx = {
        scope,
        format,
        depth,
        projectName: sessionCtx.projectName,
        sessionCount: sessionCtx.sessionCount,
        projectCount: sessionCtx.projectCount,
        dateRange: { from: sessionCtx.dateFrom, to: sessionCtx.dateTo },
        exportDate: new Date().toISOString().slice(0, 10),
      };

      const systemPrompt = getExportSystemPrompt(ctx);
      const insightContext = buildInsightContext(capped);
      const userPrompt = buildExportUserPrompt(ctx, insightContext);

      const client = createLLMClient();
      const response = await client.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { signal: abortSignal });

      const metadata: ExportGenerateMetadata = {
        insightCount: capped.length,
        totalInsights,
        sessionCount: sessionCtx.sessionCount,
        projectCount: sessionCtx.projectCount,
        scope,
        depth,
      };

      trackEvent('export_run', {
        format: `llm-${format}`,
        scope,
        depth,
        insight_count: capped.length,
        session_count: sessionCtx.sessionCount,
        llm_provider: llmConfig?.provider,
        llm_model: llmConfig?.model,
        duration_ms: Date.now() - streamStart,
        success: true,
      });

      // Phase 3: complete — send full content + metadata
      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ content: response.content, metadata }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      captureError(err, { format, scope, depth, llm_provider: llmConfig?.provider, llm_model: llmConfig?.model });
      trackEvent('export_run', {
        format: `llm-${format}`,
        scope,
        depth,
        llm_provider: llmConfig?.provider,
        llm_model: llmConfig?.model,
        duration_ms: Date.now() - streamStart,
        success: false,
        error_message: message,
      });
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: message }),
      }).catch(() => {});
    }
  });
});

export default app;
