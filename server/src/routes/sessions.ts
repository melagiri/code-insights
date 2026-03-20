import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { parseIntParam } from '../utils.js';

/** Escape SQLite LIKE wildcard characters so user input is treated as literal text. */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

/** ISO 8601 date/datetime — accepts YYYY-MM-DD and YYYY-MM-DDTHH:MM:SSZ-style strings. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+\-]+)?$/;

/** Allowlist of supported source tool identifiers. */
const VALID_SOURCE_TOOLS = new Set(['claude-code', 'cursor', 'codex-cli', 'copilot-cli', 'copilot']);

const app = new Hono();

app.get('/', (c) => {
  const db = getDb();
  const { projectId, sourceTool, limit, offset, q, from, to } = c.req.query();

  // Validate from/to are ISO 8601 date strings before passing to SQLite comparisons
  if (from && !ISO_DATE_RE.test(from)) {
    return c.json({ error: 'Invalid from: must be an ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)' }, 400);
  }
  if (to && !ISO_DATE_RE.test(to)) {
    return c.json({ error: 'Invalid to: must be an ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)' }, 400);
  }
  // Validate sourceTool against known providers
  if (sourceTool && !VALID_SOURCE_TOOLS.has(sourceTool)) {
    return c.json({ error: `Invalid sourceTool: must be one of ${[...VALID_SOURCE_TOOLS].join(', ')}` }, 400);
  }

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
  if (q) {
    const likeParam = `%${escapeLike(q)}%`;
    conditions.push("(custom_title LIKE ? ESCAPE '\\' OR generated_title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR project_name LIKE ? ESCAPE '\\')");
    params.push(likeParam, likeParam, likeParam, likeParam);
  }
  if (from) {
    conditions.push('started_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('started_at <= ?');
    params.push(to);
  }
  conditions.push('deleted_at IS NULL');
  const where = `WHERE ${conditions.join(' AND ')}`;
  const sessions = db.prepare(`
    SELECT id, project_id, project_name, project_path, git_remote_url,
           summary, custom_title, generated_title, title_source, session_character,
           started_at, ended_at, message_count, user_message_count,
           assistant_message_count, tool_call_count, git_branch,
           claude_version, source_tool, device_id, device_hostname,
           device_platform, synced_at, total_input_tokens, total_output_tokens,
           cache_creation_tokens, cache_read_tokens, estimated_cost_usd,
           models_used, primary_model, usage_source,
           compact_count, auto_compact_count, slash_commands
    FROM sessions
    ${where}
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseIntParam(limit, 50), parseIntParam(offset, 0));

  return c.json({ sessions });
});

// GET /api/sessions/deleted/count — count of soft-deleted sessions for a project
// IMPORTANT: registered before /:id so "deleted" isn't matched as a session ID
app.get('/deleted/count', (c) => {
  const db = getDb();
  const { projectId } = c.req.query();
  let row: { count: number };
  if (projectId) {
    row = db.prepare(
      `SELECT COUNT(*) AS count FROM sessions WHERE deleted_at IS NOT NULL AND project_id = ?`
    ).get(projectId) as { count: number };
  } else {
    row = db.prepare(
      `SELECT COUNT(*) AS count FROM sessions WHERE deleted_at IS NOT NULL`
    ).get() as { count: number };
  }
  return c.json({ count: row.count });
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
           models_used, primary_model, usage_source,
           compact_count, auto_compact_count, slash_commands
    FROM sessions WHERE id = ? AND deleted_at IS NULL
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
  const result = db.prepare(
    'UPDATE sessions SET custom_title = ? WHERE id = ? AND deleted_at IS NULL'
  ).run(customTitle || null, c.req.param('id'));
  if (result.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

app.delete('/:id', (c) => {
  const db = getDb();
  const result = db.prepare(
    `UPDATE sessions SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`
  ).run(c.req.param('id'));
  if (result.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

export default app;
