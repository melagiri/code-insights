import { Hono } from 'hono';
import { loadConfig, saveConfig } from '@code-insights/cli/utils/config';
import type { ClaudeInsightConfig } from '@code-insights/cli/types';

const app = new Hono();

// GET /api/config/llm — return dashboard config (port setting)
// Note: LLM provider config is a Phase 4 concern. This endpoint exposes
// the dashboard port config so the SPA can display current settings.
app.get('/llm', (c) => {
  const config = loadConfig();
  return c.json({
    dashboardPort: config?.dashboard?.port ?? 7890,
  });
});

// PUT /api/config/llm — update dashboard port config
app.put('/llm', async (c) => {
  const body = await c.req.json<{ dashboardPort?: number }>();

  // Nothing to update — return early without touching the config file.
  // Avoids writing a broken stub config when no existing config exists.
  if (body.dashboardPort === undefined) {
    return c.json({ ok: true });
  }

  const port = body.dashboardPort;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    return c.json({ error: 'dashboardPort must be an integer between 1 and 65535' }, 400);
  }

  const config: ClaudeInsightConfig = loadConfig() ?? {
    sync: { claudeDir: '', excludeProjects: [] },
  };
  config.dashboard = { ...config.dashboard, port };
  saveConfig(config);
  return c.json({ ok: true });
});

export default app;
