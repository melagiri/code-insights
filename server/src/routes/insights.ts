import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { randomUUID } from 'crypto';
import { parseIntParam } from '../utils.js';

const app = new Hono();

const VALID_TYPES = ['summary', 'decision', 'learning', 'technique', 'prompt_quality'] as const;

app.get('/', (c) => {
  const db = getDb();
  const { projectId, sessionId, type, limit, offset } = c.req.query();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (projectId) {
    conditions.push('project_id = ?');
    params.push(projectId);
  }
  if (sessionId) {
    conditions.push('session_id = ?');
    params.push(sessionId);
  }
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const insights = db.prepare(`
    SELECT id, session_id, project_id, project_name, type, title, content,
           summary, bullets, confidence, source, metadata, timestamp,
           created_at, scope, analysis_version, linked_insight_ids
    FROM insights
    ${where}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseIntParam(limit, 100), parseIntParam(offset, 0));

  return c.json({ insights });
});

app.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json<{
    sessionId: string;
    projectId: string;
    projectName?: string;   // optional — defaults to ''
    type: string;
    title: string;
    content: string;
    summary?: string;       // optional — defaults to ''
    bullets?: string[];
    confidence?: number;    // optional — defaults to 0
    metadata?: Record<string, unknown>;
  }>();

  // Validate required string fields
  const required = ['sessionId', 'projectId', 'type', 'title', 'content'] as const;
  for (const field of required) {
    if (!body[field] || typeof body[field] !== 'string') {
      return c.json({ error: `Missing or invalid field: ${field}` }, 400);
    }
  }

  // Validate type is one of the known insight types
  if (!VALID_TYPES.includes(body.type as typeof VALID_TYPES[number])) {
    return c.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, 400);
  }

  // Validate confidence is a finite number if provided
  if (body.confidence !== undefined && (typeof body.confidence !== 'number' || !Number.isFinite(body.confidence))) {
    return c.json({ error: 'confidence must be a finite number' }, 400);
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO insights (
        id, session_id, project_id, project_name, type, title, content,
        summary, bullets, confidence, source, metadata, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'llm', ?, ?, ?)
    `).run(
      id,
      body.sessionId,
      body.projectId,
      body.projectName ?? '',
      body.type,
      body.title,
      body.content,
      body.summary ?? '',
      body.bullets ? JSON.stringify(body.bullets) : null,
      body.confidence ?? 0,
      body.metadata ? JSON.stringify(body.metadata) : null,
      now,
      now,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('FOREIGN KEY constraint failed')) {
      return c.json({ error: 'Invalid sessionId or projectId' }, 400);
    }
    throw err;
  }

  return c.json({ id }, 201);
});

app.delete('/:id', (c) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM insights WHERE id = ?').run(c.req.param('id'));
  if (result.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

export default app;
