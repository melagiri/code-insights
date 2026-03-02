import inquirer from 'inquirer';
import chalk from 'chalk';
import { saveConfig, getConfigDir, isConfigured } from '../utils/config.js';
import { getDb } from '../db/client.js';
import { trackEvent } from '../utils/telemetry.js';
import type { ClaudeInsightConfig } from '../types.js';

export interface InitOptions {
  // No options needed for local-first setup
}

/**
 * Initialize Code Insights configuration.
 * Sets up sync preferences and initializes the local SQLite database.
 */
export async function initCommand(_options: InitOptions = {}): Promise<void> {
  console.log(chalk.cyan('\n  Code Insights Setup\n'));

  if (isConfigured()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Configuration already exists. Overwrite?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('Setup cancelled.'));
      return;
    }
  }

  // Save minimal config
  const config: ClaudeInsightConfig = {
    sync: { claudeDir: '~/.claude/projects', excludeProjects: [] },
  };
  saveConfig(config);

  // Initialize database (creates schema if first run)
  try {
    getDb();
    console.log(chalk.green('\n  Database initialized at ~/.code-insights/data.db'));
  } catch (error) {
    console.log(chalk.red(`\n  Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }

  console.log(chalk.green('\n  Configuration saved!'));
  console.log(chalk.gray(`  Config location: ${getConfigDir()}/config.json`));

  console.log(chalk.cyan('\n  Setup complete! Next steps:\n'));
  console.log(chalk.white('  1. Sync your sessions:'));
  console.log(chalk.gray('     code-insights sync\n'));
  console.log(chalk.white('  2. View your stats:'));
  console.log(chalk.gray('     code-insights stats\n'));
  console.log(chalk.white('  3. Check today\'s activity:'));
  console.log(chalk.gray('     code-insights stats today\n'));

  trackEvent('cli_init', { success: true });
}
