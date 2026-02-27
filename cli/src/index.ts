#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand } from './commands/sync.js';
import { statusCommand } from './commands/status.js';
import { installHookCommand, uninstallHookCommand } from './commands/install-hook.js';
import { openCommand } from './commands/open.js';
import { dashboardCommand } from './commands/dashboard.js';
import { resetCommand } from './commands/reset.js';
import { statsCommand } from './commands/stats/index.js';
import { configCommand } from './commands/config.js';
import { telemetryCommand } from './commands/telemetry.js';
import { showTelemetryNoticeIfNeeded } from './utils/telemetry.js';

const program = new Command();

program
  .name('code-insights')
  .description('AI coding session analytics — sync, stats, and insights')
  .version('2.1.0');

program
  .command('init')
  .description('Set up Code Insights (initializes local database)')
  .action(initCommand);

program
  .command('sync')
  .description('Sync AI coding sessions to local SQLite database')
  .option('-f, --force', 'Force re-sync all sessions')
  .option('-p, --project <name>', 'Only sync sessions from a specific project')
  .option('-s, --source <name>', 'Only sync sessions from a specific tool (e.g., claude-code, cursor)')
  .option('--dry-run', 'Show what would be synced without making changes')
  .option('-q, --quiet', 'Suppress output (useful for hooks)')
  .option('-v, --verbose', 'Show diagnostic warnings from providers')
  .option('--regenerate-titles', 'Regenerate titles for all sessions')
  .action(syncCommand);

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

// Show one-time telemetry disclosure before any command runs
showTelemetryNoticeIfNeeded();

program.parse();
