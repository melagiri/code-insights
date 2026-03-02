import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync, readFileSync } from 'fs';
import { relative, join } from 'path';
import { openUrl } from '@code-insights/cli/utils/browser';
import { shutdownTelemetry } from '@code-insights/cli/utils/telemetry';
import projectsRouter from './routes/projects.js';
import sessionsRouter from './routes/sessions.js';
import messagesRouter from './routes/messages.js';
import insightsRouter from './routes/insights.js';
import analysisRouter from './routes/analysis.js';
import analyticsRouter from './routes/analytics.js';
import configRouter from './routes/config.js';
import exportRouter from './routes/export.js';
import telemetryRouter from './routes/telemetry.js';

export interface ServerOptions {
  port: number;
  // Absolute path to the dashboard/dist directory
  staticDir: string;
  openBrowser: boolean;
}

/**
 * Create the Hono app with all API routes mounted.
 * Does NOT add static file serving or call serve() — that's startServer's job.
 * Exported so tests can use app.request() without starting a real server.
 */
export function createApp(): Hono {
  const app = new Hono();

  // Global error handler — prevents stack trace leakage to clients.
  // Detects malformed JSON bodies (SyntaxError) and returns 400 instead of 500.
  app.onError((err, c) => {
    if (err instanceof SyntaxError && err.message.includes('JSON')) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  // API routes — all under /api
  app.route('/api/projects', projectsRouter);
  app.route('/api/sessions', sessionsRouter);
  app.route('/api/messages', messagesRouter);
  app.route('/api/insights', insightsRouter);
  app.route('/api/analysis', analysisRouter);
  app.route('/api/analytics', analyticsRouter);
  app.route('/api/config', configRouter);
  app.route('/api/export', exportRouter);
  app.route('/api/telemetry', telemetryRouter);

  // Health check
  app.get('/api/health', (c) => c.json({ ok: true, version: '0.1.0' }));

  // API 404 catch-all — must come AFTER all /api sub-routers and BEFORE static serving.
  // Without this, unmatched /api/* routes fall through to the SPA fallback and return
  // index.html as 200, which breaks API clients expecting JSON errors.
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  return app;
}

/**
 * Start the Code Insights local dashboard server.
 * Calls createApp(), adds static file serving + SPA fallback if staticDir exists,
 * then calls serve().
 * Called by the CLI `dashboard` command.
 */
export async function startServer(options: ServerOptions): Promise<void> {
  const { port, staticDir, openBrowser } = options;

  const app = createApp();

  // Static file serving — only if the dashboard has been built.
  // serveStatic requires a path relative to process.cwd(), not an absolute path.
  if (existsSync(staticDir)) {
    const relativeStaticDir = relative(process.cwd(), staticDir);
    app.use('/*', serveStatic({ root: relativeStaticDir }));

    // Cache index.html at startup — avoids a readFileSync on every SPA navigation
    // request, which would be a pointless disk read for a file that never changes
    // while the server is running.
    const indexPath = join(staticDir, 'index.html');
    const indexHtml = existsSync(indexPath) ? readFileSync(indexPath, 'utf-8') : null;

    // SPA fallback: any non-API route not matched by serveStatic serves index.html
    // so react-router can handle client-side routing.
    app.get('*', (c) => {
      if (indexHtml) return c.html(indexHtml);
      return c.text('Dashboard not found. Run pnpm build first.', 404);
    });
  } else {
    // Dashboard not built — serve a helpful message
    app.get('*', (c) =>
      c.html(`
        <html><body style="font-family:monospace;padding:2rem">
          <h2>Code Insights Dashboard</h2>
          <p>The dashboard has not been built yet.</p>
          <pre>pnpm install &amp;&amp; pnpm build</pre>
          <p>Then restart the server.</p>
        </body></html>
      `),
    );
  }

  // Graceful shutdown: flush PostHog events before exit, then let the process
  // 'exit' handler in cli/src/db/client.ts run WAL checkpoint via closeDb().
  const shutdown = async () => {
    await shutdownTelemetry();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  serve({ fetch: app.fetch, port }, (info) => {
    const url = `http://localhost:${info.port}`;
    console.log(`  Code Insights dashboard running at ${url}`);
    if (openBrowser) {
      openUrl(url);
    }
  });
}
