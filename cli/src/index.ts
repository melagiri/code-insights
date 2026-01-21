#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand } from './commands/sync.js';
import { statusCommand } from './commands/status.js';
import { installHookCommand, uninstallHookCommand } from './commands/install-hook.js';
import { insightsCommand } from './commands/insights.js';

const program = new Command();

program
  .name('claudeinsight')
  .description('Sync Claude Code sessions to Firestore for insights')
  .version('0.1.0');

program
  .command('init')
  .description('Configure ClaudeInsight with your Firebase credentials')
  .action(initCommand);

program
  .command('sync')
  .description('Sync Claude Code sessions to Firestore')
  .option('-f, --force', 'Force re-sync all sessions')
  .option('-p, --project <name>', 'Only sync sessions from a specific project')
  .option('--include-messages', 'Include full message content (increases storage)')
  .option('--dry-run', 'Show what would be synced without making changes')
  .option('-q, --quiet', 'Suppress output (useful for hooks)')
  .option('--regenerate-titles', 'Regenerate titles for all sessions')
  .action(syncCommand);

program
  .command('status')
  .description('Show ClaudeInsight status and statistics')
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
  .command('insights')
  .description('View recent insights from Firestore')
  .option('-t, --type <type>', 'Filter by insight type (decision, learning, workitem)')
  .option('-p, --project <name>', 'Filter by project name')
  .option('--today', 'Show only today\'s insights')
  .option('-l, --limit <number>', 'Number of insights to show', '20')
  .action((options) => {
    insightsCommand({
      type: options.type,
      project: options.project,
      today: options.today,
      limit: parseInt(options.limit, 10),
    });
  });

program.parse();
