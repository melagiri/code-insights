import chalk from 'chalk';
import { loadSyncState } from '../utils/config.js';
import { getDb, getDbPath } from '../db/client.js';
import { getProjects } from '../db/read.js';
import { getAllProviders } from '../providers/registry.js';
import { trackEvent } from '../utils/telemetry.js';

/**
 * Show Code Insights status
 */
export async function statusCommand(): Promise<void> {
  console.log(chalk.cyan('\n  Code Insights Status\n'));

  // Check database
  console.log(chalk.white('Database:'));
  try {
    getDb(); // ensures migrations run
    const dbPath = getDbPath();
    console.log(chalk.green(`  Connected: ${dbPath}`));

    const projects = getProjects();
    if (projects.length > 0) {
      const totalSessions = projects.reduce((sum, p) => sum + p.session_count, 0);
      console.log(chalk.gray(`  ${projects.length} projects, ${totalSessions} sessions synced`));
    } else {
      console.log(chalk.gray('  No sessions synced yet. Run `code-insights sync`'));
    }
  } catch (error) {
    console.log(chalk.red(`  Database error: ${error instanceof Error ? error.message : 'Unknown'}`));
  }

  // Discover local sessions across all providers
  console.log(chalk.white('\nLocal Sessions:'));
  const providers = getAllProviders();
  let totalLocal = 0;
  for (const provider of providers) {
    try {
      const files = await provider.discover();
      if (files.length > 0) {
        console.log(chalk.green(`  ${provider.getProviderName()}: ${files.length} sessions`));
        totalLocal += files.length;
      }
    } catch {
      // Provider not available on this machine (e.g., no Cursor installed)
    }
  }
  if (totalLocal === 0) {
    console.log(chalk.yellow('  No sessions found from any tool'));
  }

  // Check sync state
  console.log(chalk.white('\nSync State:'));
  const syncState = loadSyncState();
  if (syncState.lastSync) {
    const lastSync = new Date(syncState.lastSync);
    const syncedFiles = Object.keys(syncState.files).length;
    console.log(chalk.green(`  Last sync: ${lastSync.toLocaleString()}`));
    console.log(chalk.gray(`  ${syncedFiles} files tracked`));
  } else {
    console.log(chalk.yellow('  Never synced'));
    console.log(chalk.gray('  Run `code-insights sync` to sync'));
  }

  // Synced projects list
  try {
    const projects = getProjects();
    if (projects.length > 0) {
      console.log(chalk.white('\nSynced Projects:'));
      for (const project of projects.slice(0, 5)) {
        console.log(chalk.gray(`  ${project.name} (${project.session_count} sessions)`));
      }
      if (projects.length > 5) {
        console.log(chalk.gray(`  ... and ${projects.length - 5} more`));
      }
    }
  } catch {
    // DB not ready yet
  }

  console.log('');
  trackEvent('status', true);
}
