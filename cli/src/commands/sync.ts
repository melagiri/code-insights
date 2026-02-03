import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadSyncState, saveSyncState, getClaudeDir } from '../utils/config.js';
import { parseJsonlFile } from '../parser/jsonl.js';
import { initializeFirebase, uploadSession, uploadMessages, sessionExists } from '../firebase/client.js';
import type { SyncState } from '../types.js';

interface SyncOptions {
  force?: boolean;
  project?: string;
  dryRun?: boolean;
  quiet?: boolean;
  regenerateTitles?: boolean;
}

/**
 * Sync Claude Code sessions to Firestore
 */
export async function syncCommand(options: SyncOptions = {}): Promise<void> {
  const log = options.quiet ? () => {} : console.log.bind(console);
  const noopSpinner = {
    start: function() { return this; },
    succeed: function() { return this; },
    fail: function() { return this; },
    warn: function() { return this; },
    info: function() { return this; },
  };
  const createSpinner = options.quiet
    ? () => noopSpinner
    : ora;

  log(chalk.cyan('\n📤 Code Insights Sync\n'));

  // Load config
  const config = loadConfig();
  if (!config) {
    log(chalk.red('Not configured. Run `code-insights init` first.'));
    process.exit(1);
  }

  // Initialize Firebase
  const spinner = createSpinner('Connecting to Firebase...').start();
  try {
    initializeFirebase(config);
    spinner.succeed('Connected to Firebase');
  } catch (error) {
    spinner.fail('Failed to connect to Firebase');
    if (!options.quiet) {
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
    process.exit(1);
  }

  // Find JSONL files
  const claudeDir = getClaudeDir();
  if (!fs.existsSync(claudeDir)) {
    log(chalk.yellow(`Claude directory not found: ${claudeDir}`));
    log(chalk.gray('Make sure you have Claude Code installed and have run at least one session.'));
    process.exit(1);
  }

  spinner.start('Discovering sessions...');
  const jsonlFiles = discoverJsonlFiles(claudeDir, options.project);
  spinner.succeed(`Found ${jsonlFiles.length} session files`);

  if (jsonlFiles.length === 0) {
    log(chalk.yellow('No sessions to sync.'));
    return;
  }

  // Load sync state
  const syncState = options.force ? { lastSync: '', files: {} } : loadSyncState();

  // Filter to only new/modified files
  const filesToSync = filterFilesToSync(jsonlFiles, syncState, options.force);
  log(chalk.gray(`  ${filesToSync.length} files need syncing (${jsonlFiles.length - filesToSync.length} already synced)`));

  if (filesToSync.length === 0) {
    log(chalk.green('\n✅ Already up to date!'));
    return;
  }

  if (options.dryRun) {
    log(chalk.yellow('\n🔍 Dry run - no changes will be made'));
    for (const file of filesToSync) {
      log(chalk.gray(`  Would sync: ${path.basename(file)}`));
    }
    return;
  }

  // Process files
  let syncedCount = 0;
  let messageCount = 0;
  let errorCount = 0;

  for (const filePath of filesToSync) {
    const fileName = path.basename(filePath);
    spinner.start(`Processing ${fileName}...`);

    try {
      // Parse session
      const session = await parseJsonlFile(filePath);
      if (!session) {
        spinner.warn(`Skipped ${fileName} (no valid data)`);
        continue;
      }

      // Check if already exists (unless force)
      if (!options.force) {
        const exists = await sessionExists(session.id);
        if (exists) {
          spinner.info(`Skipped ${fileName} (already synced)`);
          updateSyncState(syncState, filePath, session.id);
          continue;
        }
      }

      // Upload session and messages to Firestore
      await uploadSession(session);
      await uploadMessages(session);

      // Update sync state
      updateSyncState(syncState, filePath, session.id);

      syncedCount++;
      messageCount += session.messages.length;
      spinner.succeed(`Synced ${fileName} (${session.messages.length} messages)`);
    } catch (error) {
      errorCount++;
      spinner.fail(`Failed to sync ${fileName}`);
      if (!options.quiet) {
        console.error(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
  }

  // Save sync state
  syncState.lastSync = new Date().toISOString();
  saveSyncState(syncState);

  // Summary
  log(chalk.cyan('\n📊 Sync Summary'));
  log(chalk.white(`  Sessions synced: ${syncedCount}`));
  log(chalk.white(`  Messages uploaded: ${messageCount}`));
  if (errorCount > 0) {
    log(chalk.red(`  Errors: ${errorCount}`));
  }
  log(chalk.green('\n✅ Sync complete!'));
}

/**
 * Discover all JSONL files in Claude directory
 */
function discoverJsonlFiles(baseDir: string, projectFilter?: string): string[] {
  const files: string[] = [];

  const projectDirs = fs.readdirSync(baseDir);
  for (const projectDir of projectDirs) {
    // Skip hidden files and non-directories
    if (projectDir.startsWith('.')) continue;

    const projectPath = path.join(baseDir, projectDir);
    const stat = fs.statSync(projectPath);
    if (!stat.isDirectory()) continue;

    // Apply project filter if specified
    if (projectFilter && !projectDir.toLowerCase().includes(projectFilter.toLowerCase())) {
      continue;
    }

    // Find JSONL files in project directory
    const projectFiles = fs.readdirSync(projectPath);
    for (const file of projectFiles) {
      if (file.endsWith('.jsonl')) {
        files.push(path.join(projectPath, file));
      }
    }

    // Also check subagents directory
    const subagentsDir = path.join(projectPath, 'subagents');
    if (fs.existsSync(subagentsDir)) {
      const subagentFiles = fs.readdirSync(subagentsDir);
      for (const file of subagentFiles) {
        if (file.endsWith('.jsonl')) {
          files.push(path.join(subagentsDir, file));
        }
      }
    }
  }

  return files;
}

/**
 * Filter files to only those that need syncing
 */
function filterFilesToSync(files: string[], syncState: SyncState, force?: boolean): string[] {
  if (force) return files;

  return files.filter((filePath) => {
    const stat = fs.statSync(filePath);
    const lastModified = stat.mtime.toISOString();
    const fileState = syncState.files[filePath];

    // Sync if never synced or modified since last sync
    return !fileState || fileState.lastModified !== lastModified;
  });
}

/**
 * Update sync state for a file
 */
function updateSyncState(state: SyncState, filePath: string, sessionId: string): void {
  const stat = fs.statSync(filePath);
  state.files[filePath] = {
    lastModified: stat.mtime.toISOString(),
    lastSyncedLine: 0, // Not tracking lines for now
    sessionId,
  };
}
