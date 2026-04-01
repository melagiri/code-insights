/**
 * GET /api/analysis/queue
 *
 * Returns current analysis_queue status for dashboard polling.
 * Dashboard polls at 5s intervals when pending > 0 or processing > 0,
 * and stops polling when both reach 0.
 */

import { Hono } from 'hono';
import { getQueueStatus } from '@code-insights/cli/db/queue';

const app = new Hono();

// GET /api/analysis/queue
// Returns counts by status and details for active/pending/failed items.
// Returns 200 with empty items[] when queue is empty.
app.get('/', (c) => {
  const status = getQueueStatus();
  return c.json(status);
});

export default app;
