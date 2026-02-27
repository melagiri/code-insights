import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';

const app = new Hono();

app.get('/', (c) => {
  const db = getDb();
  const projects = db.prepare(`
    SELECT id, name, path, git_remote_url, session_count, last_activity,
           total_input_tokens, total_output_tokens, cache_creation_tokens,
           cache_read_tokens, estimated_cost_usd, created_at, updated_at
    FROM projects
    ORDER BY last_activity DESC
  `).all();
  return c.json({ projects });
});

app.get('/:id', (c) => {
  const db = getDb();
  const project = db.prepare(`
    SELECT id, name, path, git_remote_url, session_count, last_activity,
           total_input_tokens, total_output_tokens, cache_creation_tokens,
           cache_read_tokens, estimated_cost_usd, created_at, updated_at
    FROM projects
    WHERE id = ?
  `).get(c.req.param('id'));
  if (!project) return c.json({ error: 'Not found' }, 404);
  return c.json({ project });
});

export default app;
