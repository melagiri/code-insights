import { execFile } from 'child_process';
import path from 'path';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';

// Phase 3: local Hono server will listen on this port.
// `code-insights dashboard` command will start the server first.
const DEFAULT_DASHBOARD_PORT = 7890;

interface OpenOptions {
  project?: boolean;
}

/**
 * Open the local dashboard in the default browser.
 * Note: requires `code-insights dashboard` server to be running (Phase 3).
 */
export async function openCommand(options: OpenOptions): Promise<void> {
  const config = loadConfig();
  const port = config?.dashboard?.port ?? DEFAULT_DASHBOARD_PORT;
  const baseUrl = `http://localhost:${port}`;

  let url = baseUrl;

  // If --project flag, try to detect current project name from cwd
  if (options.project) {
    const projectName = getCurrentProjectName();
    if (projectName) {
      url = `${baseUrl}/sessions?project=${encodeURIComponent(projectName)}`;
    }
  }

  console.log(chalk.cyan(`\n  Opening ${url}\n`));
  console.log(chalk.gray('  (Run `code-insights dashboard` to start the local server if needed)\n'));

  try {
    openInBrowser(url);
    trackEvent('open', true);
  } catch {
    console.log(chalk.yellow('  Could not open browser automatically.'));
    console.log(chalk.white(`  Visit: ${chalk.bold.underline(url)}\n`));
    trackEvent('open', false);
  }
}

/**
 * Open a URL in the default browser using platform-specific commands.
 * Uses execFile (not exec) to prevent shell injection.
 */
function openInBrowser(url: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    execFile('open', [url]);
  } else if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else {
    execFile('xdg-open', [url]);
  }
}

/**
 * Get the current directory name as a project name guess.
 */
function getCurrentProjectName(): string | null {
  try {
    return path.basename(process.cwd()) || null;
  } catch {
    return null;
  }
}
