import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';

const app = new Hono();

app.get('/', (c) => {
  const db = getDb();
  const { projectId, sourceTool, limit = '50', offset = '0' } = c.req.query();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (projectId) {
    conditions.push('project_id = ?');
    params.push(projectId);
  }
  if (sourceTool) {
    conditions.push('source_tool = ?');
    params.push(sourceTool);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sessions = db.prepare(`
    SELECT id, project_id, project_name, project_path, git_remote_url,
           summary, custom_title, generated_title, title_source, session_character,
           started_at, ended_at, message_count, user_message_count,
           assistant_message_count, tool_call_count, git_branch,
           claude_version, source_tool, device_id, device_hostname,
           device_platform, synced_at, total_input_tokens, total_output_tokens,
           cache_creation_tokens, cache_read_tokens, estimated_cost_usd,
           models_used, primary_model, usage_source
    FROM sessions
    ${where}
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit, 10), parseInt(offset, 10));

  return c.json({ sessions });
});

app.get('/:id', (c) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT id, project_id, project_name, project_path, git_remote_url,
           summary, custom_title, generated_title, title_source, session_character,
           started_at, ended_at, message_count, user_message_count,
           assistant_message_count, tool_call_count, git_branch,
           claude_version, source_tool, device_id, device_hostname,
           device_platform, synced_at, total_input_tokens, total_output_tokens,
           cache_creation_tokens, cache_read_tokens, estimated_cost_usd,
           models_used, primary_model, usage_source
    FROM sessions WHERE id = ?
  `).get(c.req.param('id'));
  if (!session) return c.json({ error: 'Not found' }, 404);
  return c.json({ session });
});

app.patch('/:id', async (c) => {
  const db = getDb();
  const body = await c.req.json<{ customTitle?: string }>();
  const { customTitle } = body;
  if (customTitle === undefined) {
    return c.json({ error: 'customTitle is required' }, 400);
  }
  db.prepare('UPDATE sessions SET custom_title = ? WHERE id = ?').run(
    customTitle || null,
    c.req.param('id'),
  );
  return c.json({ ok: true });
});

export default app;
