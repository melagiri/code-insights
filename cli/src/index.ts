#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand } from './commands/sync.js';
import { statusCommand } from './commands/status.js';
import { installHookCommand, uninstallHookCommand } from './commands/install-hook.js';
import { resetCommand } from './commands/reset.js';

const program = new Command();

program
  .name('claudeinsight')
  .description('Sync Claude Code sessions to your Firebase for analysis')
  .version('1.0.0');

program
  .command('init')
  .description('Configure ClaudeInsight with your Firebase credentials')
  .option('-f, --from-json <path>', 'Path to Firebase service account JSON file')
  .option('-w, --web-config <path>', 'Path to Firebase web SDK config JSON file')
  .action(initCommand);

program
  .command('sync')
  .description('Sync Claude Code sessions to Firestore')
  .option('-f, --force', 'Force re-sync all sessions')
  .option('-p, --project <name>', 'Only sync sessions from a specific project')
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

program.addCommand(resetCommand);

program.parse();
