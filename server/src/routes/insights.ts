import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { randomUUID } from 'crypto';

const app = new Hono();

app.get('/', (c) => {
  const db = getDb();
  const { projectId, sessionId, type } = c.req.query();

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
  `).all(...params);

  return c.json({ insights });
});

app.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json<{
    sessionId: string;
    projectId: string;
    projectName: string;
    type: string;
    title: string;
    content: string;
    summary: string;
    bullets?: string[];
    confidence: number;
    metadata?: Record<string, unknown>;
  }>();

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO insights (
      id, session_id, project_id, project_name, type, title, content,
      summary, bullets, confidence, source, metadata, timestamp, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'llm', ?, ?, ?)
  `).run(
    id,
    body.sessionId,
    body.projectId,
    body.projectName,
    body.type,
    body.title,
    body.content,
    body.summary,
    body.bullets ? JSON.stringify(body.bullets) : null,
    body.confidence,
    body.metadata ? JSON.stringify(body.metadata) : null,
    now,
    now,
  );

  return c.json({ id }, 201);
});

app.delete('/:id', (c) => {
  const db = getDb();
  db.prepare('DELETE FROM insights WHERE id = ?').run(c.req.param('id'));
  return c.json({ ok: true });
});

export default app;
