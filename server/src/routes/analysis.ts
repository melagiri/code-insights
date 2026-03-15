import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { trackEvent } from '@code-insights/cli/utils/telemetry';
import { parseIntParam } from '../utils.js';
import { loadLLMConfig } from '../llm/client.js';
import { analyzeSession, analyzePromptQuality, findRecurringInsights } from '../llm/analysis.js';
import { getSessionAnalysisUsage } from '../llm/analysis-usage-db.js';
import { calculateAnalysisCost } from '../llm/analysis-pricing.js';
import {
  loadSessionForAnalysis,
  loadSessionMessages,
  requireLLM,
  trackAnalysisResult,
  streamSessionAnalysis,
} from './route-helpers.js';

const app = new Hono();

// GET /api/analysis/usage?sessionId=X
// Returns recorded analysis token usage and cost for a session.
// Returns an empty usage array (not 404) for sessions with no recorded usage —
// this is expected for sessions analyzed before V7 or not yet analyzed.
app.get('/usage', async (c) => {
  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Missing required query param: sessionId' }, 400);
  }

  const usage = getSessionAnalysisUsage(sessionId);

  // Compute total cost and cache savings across all analysis types.
  let totalCostUsd = 0;
  let cacheSavingsUsd = 0;

  for (const row of usage) {
    totalCostUsd += row.estimated_cost_usd;

    // Cache savings = what the user would have paid without cache minus what they paid.
    // Applies only to Anthropic (cache read = 10% of input price; savings = 90%).
    if (row.provider === 'anthropic' && row.cache_read_tokens > 0) {
      // We need the input price to compute savings — use calculateAnalysisCost on the
      // cached read tokens at full price vs discounted price.
      const fullCacheCost = calculateAnalysisCost(row.provider, row.model, {
        inputTokens: row.cache_read_tokens,
        outputTokens: 0,
      });
      const actualCacheCost = calculateAnalysisCost(row.provider, row.model, {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: row.cache_read_tokens,
      });
      cacheSavingsUsd += fullCacheCost - actualCacheCost;
    }
  }

  return c.json({
    usage,
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    cacheSavingsUsd: Math.round(cacheSavingsUsd * 1_000_000) / 1_000_000,
  });
});

/** Auto-apply an LLM-generated summary title as the session's generated_title. */
function applyGeneratedTitle(sessionId: string, insights: Array<{ type: string; title?: string }>) {
  const summaryInsight = insights.find(i => i.type === 'summary');
  if (!summaryInsight?.title) return;
  const db = getDb();
  db.prepare('UPDATE sessions SET generated_title = ? WHERE id = ? AND deleted_at IS NULL')
    .run(summaryInsight.title.slice(0, 120), sessionId);
}

// POST /api/analysis/session
// Body: { sessionId: string }
// Fetches session + messages from SQLite, runs LLM analysis, saves insights, returns results.
app.post('/session', requireLLM(), async (c) => {
  const body = await c.req.json<{ sessionId?: string }>();
  if (!body.sessionId || typeof body.sessionId !== 'string') {
    return c.json({ error: 'Missing required field: sessionId' }, 400);
  }

  const db = getDb();
  const session = loadSessionForAnalysis(db, body.sessionId);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = loadSessionMessages(db, body.sessionId);

  const startTime = Date.now();
  const result = await analyzeSession(session, messages);
  trackAnalysisResult('session', result, startTime, {
    onSuccess: () => {
      trackEvent('insight_generated', { type: 'session', count: result.insights.length });
      applyGeneratedTitle(body.sessionId!, result.insights);
    },
  });
  return c.json(result, result.success ? 200 : 422);
});

// GET /api/analysis/session/stream?sessionId=X
// SSE endpoint — streams progress events during session analysis.
// onProgress is non-async because analyzeSession calls it without await;
// stream.writeSSE is fire-and-forget for progress events (non-fatal if missed).
app.get('/session/stream', requireLLM(), async (c) => {
  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Missing required query param: sessionId' }, 400);
  }

  const db = getDb();
  const session = loadSessionForAnalysis(db, sessionId);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = loadSessionMessages(db, sessionId);

  return streamSessionAnalysis(c, session, messages, {
    analysisType: 'session',
    analysisFn: analyzeSession,
    progressMessage: (progress) =>
      progress.phase === 'saving'
        ? 'Saving insights...'
        : progress.currentChunk && progress.totalChunks
          ? `Analyzing... (${progress.currentChunk} of ${progress.totalChunks})`
          : 'Analyzing...',
    onSuccess: (result) => {
      trackEvent('insight_generated', { type: 'session', count: result.insights.length });
      applyGeneratedTitle(sessionId, result.insights);
    },
  });
});

// POST /api/analysis/prompt-quality
// Body: { sessionId: string }
// Runs prompt quality analysis on user messages in the session.
app.post('/prompt-quality', requireLLM(), async (c) => {
  const body = await c.req.json<{ sessionId?: string }>();
  if (!body.sessionId || typeof body.sessionId !== 'string') {
    return c.json({ error: 'Missing required field: sessionId' }, 400);
  }

  const db = getDb();
  const session = loadSessionForAnalysis(db, body.sessionId);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = loadSessionMessages(db, body.sessionId);

  const startTime = Date.now();
  const result = await analyzePromptQuality(session, messages);
  trackAnalysisResult('prompt-quality', result, startTime, {
    onSuccess: () => {
      trackEvent('insight_generated', { type: 'prompt_quality', count: result.insights.length });
    },
  });
  return c.json(result, result.success ? 200 : 422);
});

// GET /api/analysis/prompt-quality/stream?sessionId=X
// SSE endpoint — streams progress events during prompt quality analysis.
// onProgress is non-async because analyzePromptQuality calls it without await;
// stream.writeSSE is fire-and-forget for progress events (non-fatal if missed).
app.get('/prompt-quality/stream', requireLLM(), async (c) => {
  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Missing required query param: sessionId' }, 400);
  }

  const db = getDb();
  const session = loadSessionForAnalysis(db, sessionId);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = loadSessionMessages(db, sessionId);

  return streamSessionAnalysis(c, session, messages, {
    analysisType: 'prompt-quality',
    analysisFn: analyzePromptQuality,
    progressMessage: (progress) =>
      progress.phase === 'saving' ? 'Saving insights...' : 'Analyzing prompt quality...',
    onSuccess: (result) => {
      trackEvent('insight_generated', { type: 'prompt_quality', count: result.insights.length });
    },
  });
});

// POST /api/analysis/recurring
// Body: { projectId?: string; limit?: number }
// Finds recurring insight patterns across sessions.
app.post('/recurring', requireLLM(), async (c) => {

  const body = await c.req.json<{ projectId?: string; limit?: number }>();
  const db = getDb();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (body.projectId) {
    conditions.push('project_id = ?');
    params.push(body.projectId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(parseIntParam(String(body.limit ?? ''), 200), 200);

  const insights = db.prepare(`
    SELECT id, type, title, summary, project_name, session_id
    FROM insights
    ${where}
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(...params, limit) as Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    project_name: string;
    session_id: string;
  }>;

  const startTime = Date.now();
  const result = await findRecurringInsights(insights);
  // recurring errors don't carry error_type/response_preview — pass them as undefined;
  // trackAnalysisResult handles undefined gracefully (omits from event properties).
  trackAnalysisResult('recurring', {
    success: result.success,
    error: result.error,
    error_type: result.success ? undefined : 'api_error',
    response_preview: undefined,
  }, startTime, {
    onSuccess: () => {
      trackEvent('insight_generated', { type: 'recurring', count: result.groups.length });
    },
  });
  return c.json(result, result.success ? 200 : 422);
});

export default app;
