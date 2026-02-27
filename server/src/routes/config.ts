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
  const config: ClaudeInsightConfig = loadConfig() ?? {
    sync: { claudeDir: '', excludeProjects: [] },
  };
  if (body.dashboardPort !== undefined) {
    config.dashboard = { ...config.dashboard, port: body.dashboardPort };
  }
  saveConfig(config);
  return c.json({ ok: true });
});

export default app;
