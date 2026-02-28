import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { parseIntParam } from '../utils.js';
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

  const result = await analyzeSession(session, messages);
  return c.json(result, result.success ? 200 : 422);
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

  const result = await analyzePromptQuality(session, messages);
  return c.json(result, result.success ? 200 : 422);
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

  const result = await findRecurringInsights(insights);
  return c.json(result, result.success ? 200 : 422);
});

export default app;
