import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { parseIntParam } from '../utils.js';

const app = new Hono();

app.get('/:sessionId', (c) => {
  const db = getDb();
  const { limit, offset } = c.req.query();
  const messages = db.prepare(`
    SELECT id, session_id, type, content, thinking,
           tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages
    WHERE session_id = ?
    ORDER BY timestamp ASC
    LIMIT ? OFFSET ?
  `).all(c.req.param('sessionId'), parseIntParam(limit, 100), parseIntParam(offset, 0));
  return c.json({ messages });
});

export default app;
