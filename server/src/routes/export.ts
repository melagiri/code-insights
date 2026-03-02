import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { trackEvent } from '@code-insights/cli/utils/telemetry';

const app = new Hono();

// POST /api/export/markdown — export sessions/insights as markdown
app.post('/markdown', async (c) => {
  const db = getDb();
  const body = await c.req.json<{ sessionIds?: string[]; projectId?: string }>();

  const { sessionIds, projectId } = body;

  if (sessionIds !== undefined && !Array.isArray(sessionIds)) {
    return c.json({ error: 'sessionIds must be an array' }, 400);
  }
  if (sessionIds && (sessionIds as unknown[]).some((id) => typeof id !== 'string')) {
    return c.json({ error: 'sessionIds must contain only strings' }, 400);
  }
  if (sessionIds && sessionIds.length > 100) {
    return c.json({ error: 'Maximum 100 session IDs per export request' }, 400);
  }

  let sessions: Record<string, unknown>[];
  if (sessionIds && sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => '?').join(', ');
    sessions = db.prepare(
      `SELECT id, project_name, generated_title, custom_title, started_at, ended_at,
              message_count, estimated_cost_usd, session_character, source_tool
       FROM sessions WHERE id IN (${placeholders}) ORDER BY started_at DESC`,
    ).all(...sessionIds) as Record<string, unknown>[];
  } else if (projectId) {
    sessions = db.prepare(
      `SELECT id, project_name, generated_title, custom_title, started_at, ended_at,
              message_count, estimated_cost_usd, session_character, source_tool
       FROM sessions WHERE project_id = ? ORDER BY started_at DESC`,
    ).all(projectId) as Record<string, unknown>[];
  } else {
    return c.json({ error: 'sessionIds or projectId required' }, 400);
  }

  const lines: string[] = ['# Code Insights Export', ''];

  for (const s of sessions) {
    const title = (s.custom_title ?? s.generated_title ?? s.id) as string;
    lines.push(`## ${title}`);
    lines.push(`- **Started:** ${s.started_at}`);
    lines.push(`- **Ended:** ${s.ended_at}`);
    lines.push(`- **Messages:** ${s.message_count}`);
    if (s.estimated_cost_usd != null) {
      lines.push(`- **Cost:** $${Number(s.estimated_cost_usd).toFixed(4)}`);
    }
    lines.push('');
  }

  const markdown = lines.join('\n');
  trackEvent('export_run', { format: 'markdown', session_count: sessions.length, success: true });
  c.header('Content-Type', 'text/markdown');
  return c.body(markdown);
});

export default app;
