import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
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
 * - Checks only EADDRINUSE, not other errors (e.g. EACCES for privileged ports).
 * - Waits for the test socket to fully close before resolving, avoiding a TOCTOU
 *   race where the real server tries to bind before the OS releases the port.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      server.close();
      resolvePromise(err.code === 'EADDRINUSE');
    });
    server.once('listening', () => {
      // Wait for close callback before resolving so the OS fully releases the port
      server.close(() => resolvePromise(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Start the Code Insights local dashboard server.
 *
 * Loads server/dist/index.js by file URL rather than package name to avoid a
 * circular workspace dependency (server depends on @code-insights/cli, so CLI
 * cannot list @code-insights/server as a build-time dep). pathToFileURL ensures
 * the import works on Windows where absolute paths like C:\... are not valid
 * ESM import specifiers.
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
    // Running `npm install -g @code-insights/cli` does not include server/dist
    // because the package is structured for local workspace use only.
    if (!existsSync(serverEntryPath)) {
      spinner.fail('Dashboard server not found.');
      console.error(chalk.dim(
        '  The dashboard requires a full workspace checkout.\n' +
        '  Clone the repo and run: pnpm install && pnpm build\n' +
        '  See: https://github.com/melagiri/code-insights#development',
      ));
      process.exit(1);
    }

    // Use pathToFileURL so the import specifier is valid on all platforms,
    // including Windows where resolve() returns C:\...\index.js.
    type ServerModule = { startServer: (opts: { port: number; staticDir: string; openBrowser: boolean }) => Promise<void> };
    const { startServer } = await import(pathToFileURL(serverEntryPath).href) as ServerModule;

    spinner.stop();

    await startServer({ port, staticDir, openBrowser: options.open });
  } catch (err) {
    spinner.fail('Failed to start dashboard server.');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
