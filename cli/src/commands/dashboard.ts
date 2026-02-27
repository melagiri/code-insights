import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import net from 'net';

interface DashboardOptions {
  port: string;
  open: boolean;
}

/**
 * Check if a port is already in use.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.once('error', () => resolvePromise(true));
    server.once('listening', () => {
      server.close();
      resolvePromise(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Start the Code Insights local dashboard server.
 *
 * Loads server/dist/index.js by resolved filesystem path rather than
 * package name to avoid a circular workspace dependency: the server package
 * depends on @code-insights/cli, so CLI cannot list @code-insights/server
 * as a build-time dependency. At runtime the server dist is always present
 * after `pnpm build`.
 */
export async function dashboardCommand(options: DashboardOptions): Promise<void> {
  const port = parseInt(options.port, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(chalk.red(`  Invalid port: ${options.port}`));
    process.exit(1);
  }

  const inUse = await isPortInUse(port);
  if (inUse) {
    console.error(chalk.red(`  Port ${port} is already in use.`));
    console.error(chalk.dim(`  Try: code-insights dashboard --port <number>`));
    process.exit(1);
  }

  const spinner = ora('Starting Code Insights dashboard...').start();

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // cli/dist/commands/dashboard.js -> workspace root is 3 levels up
    const workspaceRoot = resolve(__dirname, '..', '..', '..');

    const serverEntryPath = resolve(workspaceRoot, 'server', 'dist', 'index.js');
    const staticDir = resolve(workspaceRoot, 'dashboard', 'dist');

    // Guard: server must be built before the dashboard command can start.
    // In a published npm package this would always be present; in a local
    // dev checkout users must run `pnpm build` first.
    if (!existsSync(serverEntryPath)) {
      spinner.fail('Dashboard server not found.');
      console.error(chalk.dim(
        '  The dashboard requires a local build of the server package.\n' +
        '  Run: pnpm build\n' +
        '  See: https://github.com/melagiri/code-insights#local-development',
      ));
      process.exit(1);
    }

    // Dynamic path-based import avoids build-time circular dep
    type ServerModule = { startServer: (opts: { port: number; staticDir: string; openBrowser: boolean }) => Promise<void> };
    const { startServer } = await import(serverEntryPath) as ServerModule;

    spinner.stop();

    await startServer({ port, staticDir, openBrowser: options.open });
  } catch (err) {
    spinner.fail('Failed to start dashboard server.');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
