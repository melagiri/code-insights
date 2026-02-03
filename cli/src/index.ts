#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand } from './commands/sync.js';
import { statusCommand } from './commands/status.js';
import { linkCommand } from './commands/link.js';
import { installHookCommand, uninstallHookCommand } from './commands/install-hook.js';
import { resetCommand } from './commands/reset.js';

const program = new Command();

program
  .name('code-insights')
  .description('Sync your AI coding sessions to Firebase for analysis')
  .version('1.0.0');

program
  .command('init')
  .description('Configure Code Insights with your Firebase credentials')
  .option('-j, --from-json <path>', 'Path to Firebase service account JSON file')
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
  .description('Show Code Insights status and statistics')
  .action(statusCommand);

program
  .command('link')
  .description('Generate a link to connect the web dashboard')
  .option('--no-qr', 'Skip QR code generation')
  .action(linkCommand);

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
