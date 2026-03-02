import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getDb } from '@code-insights/cli/db/client';
import { trackEvent } from '@code-insights/cli/utils/telemetry';
import { parseIntParam } from '../utils.js';
import { loadLLMConfig } from '../llm/client.js';
import { analyzeSession, analyzePromptQuality, findRecurringInsights } from '../llm/analysis.js';
import { isLLMConfigured } from '../llm/client.js';
import type { SQLiteMessageRow, SessionData } from '../llm/analysis.js';

const app = new Hono();

// POST /api/analysis/session
// Body: { sessionId: string }
// Fetches session + messages from SQLite, runs LLM analysis, saves insights, returns results.
app.post('/session', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

  const body = await c.req.json<{ sessionId?: string }>();
  if (!body.sessionId || typeof body.sessionId !== 'string') {
    return c.json({ error: 'Missing required field: sessionId' }, 400);
  }

  const db = getDb();

  const session = db.prepare(`
    SELECT id, project_id, project_name, project_path, summary, ended_at
    FROM sessions WHERE id = ?
  `).get(body.sessionId) as SessionData | undefined;

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = db.prepare(`
    SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages WHERE session_id = ? ORDER BY timestamp ASC
  `).all(body.sessionId) as SQLiteMessageRow[];

  const startTime = Date.now();
  const result = await analyzeSession(session, messages);
  if (result.success) {
    const llmConfig = loadLLMConfig();
    trackEvent('analysis_run', {
      type: 'session',
      llm_provider: llmConfig?.provider,
      llm_model: llmConfig?.model,
      duration_ms: Date.now() - startTime,
      success: true,
    });
    trackEvent('insight_generated', {
      type: 'session',
      count: result.insights.length,
    });
  }
  return c.json(result, result.success ? 200 : 422);
});

// GET /api/analysis/session/stream?sessionId=X
// SSE endpoint — streams progress events during session analysis.
// onProgress is non-async because analyzeSession calls it without await;
// stream.writeSSE is fire-and-forget for progress events (non-fatal if missed).
app.get('/session/stream', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Missing required query param: sessionId' }, 400);
  }

  const db = getDb();

  const session = db.prepare(`
    SELECT id, project_id, project_name, project_path, summary, ended_at
    FROM sessions WHERE id = ?
  `).get(sessionId) as SessionData | undefined;

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = db.prepare(`
    SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages WHERE session_id = ? ORDER BY timestamp ASC
  `).all(sessionId) as SQLiteMessageRow[];

  return streamSSE(c, async (stream) => {
    const streamStart = Date.now();
    try {
      const abortSignal = c.req.raw.signal;

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ phase: 'loading_messages', message: 'Loading messages...' }),
      });

      const result = await analyzeSession(session, messages, {
        signal: abortSignal,
        onProgress: (progress) => {
          const message = progress.phase === 'saving'
            ? 'Saving insights...'
            : progress.currentChunk && progress.totalChunks
              ? `Analyzing... (${progress.currentChunk} of ${progress.totalChunks})`
              : 'Analyzing...';
          void stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({ ...progress, message }),
          }).catch(() => {});
        },
      });

      if (result.success) {
        const llmConfig = loadLLMConfig();
        trackEvent('analysis_run', {
          type: 'session',
          llm_provider: llmConfig?.provider,
          llm_model: llmConfig?.model,
          duration_ms: Date.now() - streamStart,
          success: true,
        });
        trackEvent('insight_generated', {
          type: 'session',
          count: result.insights.length,
        });
        const summaryInsight = result.insights.find(i => i.type === 'summary');
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            success: true,
            insightCount: result.insights.length,
            tokenUsage: result.usage,
            suggestedTitle: summaryInsight?.title ?? null,
          }),
        });
      } else {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: result.error ?? 'Analysis failed' }),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: message }),
      }).catch(() => {});
    }
  });
});

// POST /api/analysis/prompt-quality
// Body: { sessionId: string }
// Runs prompt quality analysis on user messages in the session.
app.post('/prompt-quality', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

  const body = await c.req.json<{ sessionId?: string }>();
  if (!body.sessionId || typeof body.sessionId !== 'string') {
    return c.json({ error: 'Missing required field: sessionId' }, 400);
  }

  const db = getDb();

  const session = db.prepare(`
    SELECT id, project_id, project_name, project_path, summary, ended_at
    FROM sessions WHERE id = ?
  `).get(body.sessionId) as SessionData | undefined;

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = db.prepare(`
    SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages WHERE session_id = ? ORDER BY timestamp ASC
  `).all(body.sessionId) as SQLiteMessageRow[];

  const pqStart = Date.now();
  const result = await analyzePromptQuality(session, messages);
  if (result.success) {
    const llmConfig = loadLLMConfig();
    trackEvent('analysis_run', {
      type: 'prompt-quality',
      llm_provider: llmConfig?.provider,
      llm_model: llmConfig?.model,
      duration_ms: Date.now() - pqStart,
      success: true,
    });
    trackEvent('insight_generated', {
      type: 'prompt_quality',
      count: result.insights.length,
    });
  }
  return c.json(result, result.success ? 200 : 422);
});

// GET /api/analysis/prompt-quality/stream?sessionId=X
// SSE endpoint — streams progress events during prompt quality analysis.
// onProgress is non-async because analyzePromptQuality calls it without await;
// stream.writeSSE is fire-and-forget for progress events (non-fatal if missed).
app.get('/prompt-quality/stream', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Missing required query param: sessionId' }, 400);
  }

  const db = getDb();

  const session = db.prepare(`
    SELECT id, project_id, project_name, project_path, summary, ended_at
    FROM sessions WHERE id = ?
  `).get(sessionId) as SessionData | undefined;

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = db.prepare(`
    SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages WHERE session_id = ? ORDER BY timestamp ASC
  `).all(sessionId) as SQLiteMessageRow[];

  return streamSSE(c, async (stream) => {
    const pqStreamStart = Date.now();
    try {
      const abortSignal = c.req.raw.signal;

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ phase: 'loading_messages', message: 'Loading messages...' }),
      });

      const result = await analyzePromptQuality(session, messages, {
        signal: abortSignal,
        onProgress: (progress) => {
          const message = progress.phase === 'saving'
            ? 'Saving insights...'
            : 'Analyzing prompt quality...';
          void stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({ ...progress, message }),
          }).catch(() => {});
        },
      });

      if (result.success) {
        const llmConfig = loadLLMConfig();
        trackEvent('analysis_run', {
          type: 'prompt-quality',
          llm_provider: llmConfig?.provider,
          llm_model: llmConfig?.model,
          duration_ms: Date.now() - pqStreamStart,
          success: true,
        });
        trackEvent('insight_generated', {
          type: 'prompt_quality',
          count: result.insights.length,
        });
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            success: true,
            insightCount: result.insights.length,
            tokenUsage: result.usage,
            suggestedTitle: null,
          }),
        });
      } else {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: result.error ?? 'Prompt quality analysis failed' }),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: message }),
      }).catch(() => {});
    }
  });
});

// POST /api/analysis/recurring
// Body: { projectId?: string; limit?: number }
// Finds recurring insight patterns across sessions.
app.post('/recurring', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

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

  const recurringStart = Date.now();
  const result = await findRecurringInsights(insights);
  if (result.success) {
    const llmConfig = loadLLMConfig();
    trackEvent('analysis_run', {
      type: 'recurring',
      llm_provider: llmConfig?.provider,
      llm_model: llmConfig?.model,
      duration_ms: Date.now() - recurringStart,
      success: true,
    });
    trackEvent('insight_generated', {
      type: 'recurring',
      count: result.groups.length,
    });
  }
  return c.json(result, result.success ? 200 : 422);
});

export default app;
