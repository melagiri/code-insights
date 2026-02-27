import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { closeDb } from '@code-insights/cli/db/client';
import projectsRouter from './routes/projects.js';
import sessionsRouter from './routes/sessions.js';
import messagesRouter from './routes/messages.js';
import insightsRouter from './routes/insights.js';
import analysisRouter from './routes/analysis.js';
import analyticsRouter from './routes/analytics.js';
import configRouter from './routes/config.js';
import exportRouter from './routes/export.js';

export interface ServerOptions {
  port: number;
  // Absolute path to the dashboard/dist directory
  staticDir: string;
  openBrowser: boolean;
}

/**
 * Start the Code Insights local dashboard server.
 * Serves the Hono API and the pre-built Vite SPA from staticDir.
 * Called by the CLI `dashboard` command.
 */
export async function startServer(options: ServerOptions): Promise<void> {
  const { port, staticDir, openBrowser } = options;

  const app = new Hono();

  // API routes — all under /api
  app.route('/api/projects', projectsRouter);
  app.route('/api/sessions', sessionsRouter);
  app.route('/api/messages', messagesRouter);
  app.route('/api/insights', insightsRouter);
  app.route('/api/analysis', analysisRouter);
  app.route('/api/analytics', analyticsRouter);
  app.route('/api/config', configRouter);
  app.route('/api/export', exportRouter);

  // Health check
  app.get('/api/health', (c) => c.json({ ok: true, version: '0.1.0' }));

  // Static file serving — only if the dashboard has been built
  if (existsSync(staticDir)) {
    app.use(
      '/*',
      serveStatic({
        root: staticDir,
        // Fallback to index.html for SPA client-side routing
        rewriteRequestPath: (path) => {
          // Let /api routes pass through (already handled above)
          // For everything else, serve index.html so react-router handles it
          if (path.startsWith('/api/')) return path;
          return path;
        },
      }),
    );

    // SPA fallback: any route not matched above serves index.html
    app.get('*', async (c) => {
      const indexPath = `${staticDir}/index.html`;
      if (existsSync(indexPath)) {
        const { readFileSync } = await import('fs');
        const html = readFileSync(indexPath, 'utf-8');
        return c.html(html);
      }
      return c.text('Dashboard not found. Run pnpm build first.', 404);
    });
  } else {
    // Dashboard not built — serve a helpful message
    app.get('*', (c) =>
      c.html(`
        <html><body style="font-family:monospace;padding:2rem">
          <h2>Code Insights Dashboard</h2>
          <p>The dashboard has not been built yet.</p>
          <pre>pnpm build</pre>
          <p>Then restart the server.</p>
        </body></html>
      `),
    );
  }

  // Graceful shutdown: close SQLite on SIGINT/SIGTERM
  const shutdown = () => {
    closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  serve({ fetch: app.fetch, port }, (info) => {
    const url = `http://localhost:${info.port}`;
    console.log(`  Code Insights dashboard running at ${url}`);
    if (openBrowser) {
      openUrl(url);
    }
  });
}

function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    execFile('open', [url]);
  } else if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else {
    execFile('xdg-open', [url]);
  }
}
