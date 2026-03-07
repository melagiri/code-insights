#!/usr/bin/env node

import { readFileSync } from 'fs';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand, getTrivialSessions, pruneTrivialSessions } from './commands/sync.js';
import { statusCommand } from './commands/status.js';
import { installHookCommand, uninstallHookCommand } from './commands/install-hook.js';
import { openCommand } from './commands/open.js';
import { dashboardCommand } from './commands/dashboard.js';
import { resetCommand } from './commands/reset.js';
import { statsCommand } from './commands/stats/index.js';
import { configCommand } from './commands/config.js';
import { telemetryCommand } from './commands/telemetry.js';
import { reflectCommand } from './commands/reflect.js';
import { showTelemetryNoticeIfNeeded } from './utils/telemetry.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

const program = new Command();

program
  .name('code-insights')
  .description('AI coding session analytics — sync, stats, and insights')
  .version(pkg.version);

program
  .command('init')
  .description('Set up Code Insights (initializes local database)')
  .action(initCommand);

const syncCmd = program
  .command('sync')
  .description('Sync AI coding sessions to local SQLite database')
  .option('-f, --force', 'Force re-sync all sessions (also restores hidden sessions)')
  .option('-p, --project <name>', 'Only sync sessions from a specific project')
  .option('-s, --source <name>', 'Only sync sessions from a specific tool (e.g., claude-code, cursor)')
  .option('--dry-run', 'Show what would be synced without making changes')
  .option('-q, --quiet', 'Suppress output (useful for hooks)')
  .option('-v, --verbose', 'Show diagnostic warnings from providers')
  .option('--regenerate-titles', 'Regenerate titles for all sessions')
  .action(syncCommand);

syncCmd
  .command('prune')
  .description('Soft-delete sessions with ≤2 messages (trivial abandoned sessions)')
  .action(async () => {
    const chalk = (await import('chalk')).default;
    const { default: inquirer } = await import('inquirer');
    console.log(chalk.cyan('\n  Code Insights — Prune\n'));

    const sessions = getTrivialSessions();
    if (sessions.length === 0) {
      console.log(chalk.green('  No trivial sessions found. Nothing to prune.'));
      return;
    }

    console.log(chalk.white(`  Found ${sessions.length} session${sessions.length !== 1 ? 's' : ''} with ≤2 messages:\n`));
    for (const s of sessions) {
      const label = s.title ?? chalk.dim('(no title)');
      console.log(`  ${chalk.dim('·')} ${label} ${chalk.dim(`[${s.project_name}, ${s.message_count} msg]`)}`);
    }
    console.log('');

    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `Soft-delete these ${sessions.length} session${sessions.length !== 1 ? 's' : ''}? (Restorable with sync --force)`,
        default: false,
      },
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('\n  Cancelled. No sessions were hidden.'));
      return;
    }

    const { deleted } = pruneTrivialSessions(sessions.map((s) => s.id));
    console.log(chalk.green(`\n  Hidden ${deleted} session${deleted !== 1 ? 's' : ''}.`));
    console.log(chalk.dim('  Use code-insights sync --force to restore hidden sessions.'));
  });

program
  .command('status')
  .description('Show Code Insights status and statistics')
  .action(statusCommand);

program
  .command('install-hook')
  .description('Install Claude Code hook for automatic sync')
  .action(installHookCommand);

program
  .command('uninstall-hook')
  .description('Remove Claude Code hook')
  .action(uninstallHookCommand);

program
  .command('open')
  .description('Open the local dashboard in your browser')
  .option('--project', 'Open filtered to the current project')
  .action(openCommand);

program
  .command('dashboard')
  .description('Start the Code Insights dashboard server and open in browser')
  .option('-p, --port <number>', 'Port number', String(7890))
  .option('--no-open', 'Do not open browser automatically')
  .action(dashboardCommand);

program.addCommand(resetCommand);
program.addCommand(statsCommand);
program.addCommand(configCommand);
program.addCommand(telemetryCommand);
program.addCommand(reflectCommand);

// Show one-time telemetry disclosure before any command runs
showTelemetryNoticeIfNeeded();

program.parse();
