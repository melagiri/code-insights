import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, unlinkSync } from 'fs';
import { getDb, getDbPath } from '../db/client.js';
import { getSyncStatePath } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';

export const resetCommand = new Command('reset')
  .description('Delete all synced data from the local SQLite database and reset sync state')
  .option('--confirm', 'Skip confirmation prompt')
  .action(async (options) => {
    console.log(chalk.red.bold('\n  WARNING: This will permanently delete ALL synced data from your local database!'));
    console.log(chalk.yellow('  Tables to be cleared: projects, sessions, messages, insights, usage_stats\n'));

    if (!options.confirm) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.cyan('Type "DELETE" to confirm: '), resolve);
      });
      rl.close();

      if (answer !== 'DELETE') {
        console.log(chalk.gray('\nAborted. No data was deleted.'));
        process.exit(0);
      }
    }

    console.log('');

    // Delete SQLite data — all 5 DELETEs wrapped in a single transaction.
    // If any DELETE fails, the transaction rolls back atomically and we do NOT
    // proceed to delete the sync state file (which would leave them out of sync).
    const dbSpinner = ora('Clearing database...').start();
    try {
      const db = getDb();
      const clearAll = db.transaction(() => {
        // Delete in dependency order (FK constraints)
        db.prepare('DELETE FROM insights').run();
        db.prepare('DELETE FROM messages').run();
        db.prepare('DELETE FROM sessions').run();
        db.prepare('DELETE FROM projects').run();
        db.prepare('DELETE FROM usage_stats').run();
      });
      clearAll();
      dbSpinner.succeed(`Database cleared (${getDbPath()})`);
    } catch (error) {
      dbSpinner.fail(`Failed to clear database: ${error instanceof Error ? error.message : error}`);
      console.error(chalk.red('\nAborted. Sync state was NOT deleted to avoid inconsistency.'));
      console.error(chalk.dim('Run `code-insights doctor` if the problem persists.'));
      process.exit(1);
    }

    // Delete local sync state — only reached if DB clear succeeded
    const syncStatePath = getSyncStatePath();
    const syncSpinner = ora('Removing local sync state...').start();
    try {
      if (existsSync(syncStatePath)) {
        unlinkSync(syncStatePath);
        syncSpinner.succeed('Removed local sync state');
      } else {
        syncSpinner.info('No local sync state file found');
      }
    } catch (error) {
      syncSpinner.fail(`Failed to remove sync state: ${error}`);
    }

    // Collect stats for telemetry before resetting
    try {
      trackEvent('cli_reset', { success: true });
    } catch {
      // non-fatal
    }

    console.log(chalk.green('\n  Reset complete. Run `code-insights sync` to re-sync all sessions.\n'));
    process.exit(0);
  });
