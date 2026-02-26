import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ensureConfigDir, getConfigDir } from './config.js';
import { getAllProviders } from '../providers/registry.js';

const WELCOME_MARKER = '.welcome-shown';

/**
 * Show a one-time welcome banner for first-time users.
 *
 * Only fires when no ~/.code-insights/.welcome-shown marker exists.
 * Intentionally non-critical — all file I/O is wrapped so errors
 * are swallowed silently rather than interrupting the user's command.
 *
 * Returns true if the banner was printed, false if already shown.
 */
export async function showWelcomeIfFirstRun(): Promise<boolean> {
  try {
    const markerPath = path.join(getConfigDir(), WELCOME_MARKER);

    // Already greeted this user — bail out fast
    if (fs.existsSync(markerPath)) {
      return false;
    }

    const sessionCount = await countAllSessions();

    console.log('');
    console.log(chalk.bold.cyan('  Welcome to Code Insights!'));
    console.log('');

    if (sessionCount > 0) {
      console.log(
        chalk.dim('  Found ') +
        chalk.white.bold(sessionCount) +
        chalk.dim(` session${sessionCount === 1 ? '' : 's'} across your dev tools`)
      );
    } else {
      console.log(chalk.dim('  No sessions found yet across your dev tools'));
    }

    console.log('');

    // Touch the marker so we never show this again
    touchWelcomeMarker(markerPath);

    return true;
  } catch {
    // Welcome is non-critical — swallow all errors silently
    return false;
  }
}

/**
 * Count total sessions across all registered providers.
 * Uses discover() which is fast (file/DB scan, no parsing).
 */
async function countAllSessions(): Promise<number> {
  const providers = getAllProviders();
  let total = 0;

  await Promise.allSettled(
    providers.map(async (provider) => {
      try {
        const paths = await provider.discover();
        total += paths.length;
      } catch {
        // Provider unavailable or errored — skip it, keep counting
      }
    })
  );

  return total;
}

/**
 * Create the welcome-shown marker file.
 * Ensures the config directory exists first (handles brand-new installs
 * where no config has been written yet).
 */
function touchWelcomeMarker(markerPath: string): void {
  ensureConfigDir();
  fs.writeFileSync(markerPath, '', { mode: 0o600 });
}
