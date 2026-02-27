import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';

const app = new Hono();

const VALID_RANGES = ['7d', '30d', '90d', 'all'] as const;
type Range = typeof VALID_RANGES[number];

// Dashboard overview stats for a given time range (e.g. ?range=7d|30d|90d|all)
app.get('/dashboard', (c) => {
  const db = getDb();
  const { range = '7d' } = c.req.query();

  if (!VALID_RANGES.includes(range as Range)) {
    return c.json({ error: `Invalid range. Must be one of: ${VALID_RANGES.join(', ')}` }, 400);
  }

  let periodStart: string | null = null;
  const now = new Date();
  if (range === '7d') {
    periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (range === '30d') {
    periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (range === '90d') {
    periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }

  const where = periodStart ? 'WHERE started_at >= ?' : '';
  const params = periodStart ? [periodStart] : [];

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS session_count,
      SUM(message_count) AS total_messages,
      SUM(total_input_tokens) AS total_input_tokens,
      SUM(total_output_tokens) AS total_output_tokens,
      SUM(estimated_cost_usd) AS estimated_cost_usd
    FROM sessions ${where}
  `).get(...params);

  return c.json({ range, stats });
});

// Global cumulative usage stats
app.get('/usage', (c) => {
  const db = getDb();
  const stats = db.prepare(`
    SELECT total_input_tokens, total_output_tokens, cache_creation_tokens,
           cache_read_tokens, estimated_cost_usd, sessions_with_usage, last_updated_at
    FROM usage_stats WHERE id = 1
  `).get();
  return c.json({ stats: stats ?? null });
});

export default app;
