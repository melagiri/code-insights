import { Hono } from 'hono';
import { isTelemetryEnabled, getStableMachineId } from '@code-insights/cli/utils/telemetry';

const app = new Hono();

// GET /api/telemetry/identity
// Returns the stable distinct_id and whether telemetry is enabled.
// Used by the dashboard SPA to initialize posthog-js with the same identity
// as the CLI, so events from both sources are linked to the same person.
//
// Security note: this returns a deterministic hash (not PII) and is localhost-only.
app.get('/identity', (c) => {
  const enabled = isTelemetryEnabled();
  if (!enabled) {
    return c.json({ enabled: false });
  }
  return c.json({
    enabled: true,
    distinct_id: getStableMachineId(),
  });
});

export default app;
