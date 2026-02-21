import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadSyncState, saveSyncState } from '../utils/config.js';
import { initializeFirebase, uploadSession, uploadMessages, sessionExists, recalculateUsageStats } from '../firebase/client.js';
import { getAllProviders, getProvider } from '../providers/registry.js';
import type { SessionProvider } from '../providers/types.js';
import type { SyncState } from '../types.js';

interface SyncOptions {
  force?: boolean;
  project?: string;
  dryRun?: boolean;
  quiet?: boolean;
  regenerateTitles?: boolean;
  source?: string;
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

  // Get providers to sync
  let providers: SessionProvider[];
  if (options.source) {
    try {
      providers = [getProvider(options.source)];
    } catch {
      log(chalk.red(`Unknown source: ${options.source}. Available: ${getAllProviders().map(p => p.getProviderName()).join(', ')}`));
      process.exit(1);
    }
  } else {
    providers = getAllProviders();
  }

  // Load sync state
  const syncState = options.force ? { lastSync: '', files: {} } : loadSyncState();

  let totalSyncedCount = 0;
  let totalMessageCount = 0;
  let totalErrorCount = 0;

  for (const provider of providers) {
    const providerName = provider.getProviderName();
    if (providers.length > 1) {
      log(chalk.cyan(`\n📦 Syncing ${providerName}...`));
    }

    // Discovery
    spinner.start(`Discovering ${providerName} sessions...`);
    const sessionFiles = await provider.discover({ projectFilter: options.project });
    spinner.succeed(`Found ${sessionFiles.length} ${providerName} session files`);

    if (sessionFiles.length === 0) continue;

    // Filter to only new/modified files
    const filesToSync = filterFilesToSync(sessionFiles, syncState, options.force);
    log(chalk.gray(`  ${filesToSync.length} files need syncing (${sessionFiles.length - filesToSync.length} already synced)`));

    if (filesToSync.length === 0) continue;

    if (options.dryRun) {
      for (const file of filesToSync) {
        log(chalk.gray(`  Would sync: ${path.basename(file)}`));
      }
      continue;
    }

    // Process files
    for (const filePath of filesToSync) {
      const fileName = path.basename(filePath);
      spinner.start(`Processing ${fileName}...`);

      try {
        // Parse session
        const session = await provider.parse(filePath);
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
            saveSyncState(syncState);
            continue;
          }
        }

        // Upload session and messages to Firestore
        await uploadSession(session, !!options.force);
        await uploadMessages(session);

        // Update and persist sync state after each file
        // so progress survives crashes (e.g., Firebase quota exceeded)
        updateSyncState(syncState, filePath, session.id);
        saveSyncState(syncState);

        totalSyncedCount++;
        totalMessageCount += session.messages.length;
        spinner.succeed(`Synced ${fileName} (${session.messages.length} messages)`);
      } catch (error) {
        totalErrorCount++;
        spinner.fail(`Failed to sync ${fileName}`);
        if (!options.quiet) {
          console.error(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    }
  }

  // Reconcile usage stats after force sync
  if (options.force) {
    spinner.start('Recalculating usage stats...');
    try {
      const result = await recalculateUsageStats();
      spinner.succeed(`Usage stats reconciled (${result.sessionsWithUsage} sessions with usage data)`);
    } catch (error) {
      spinner.warn('Could not reconcile usage stats');
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
  log(chalk.white(`  Sessions synced: ${totalSyncedCount}`));
  log(chalk.white(`  Messages uploaded: ${totalMessageCount}`));
  if (totalErrorCount > 0) {
    log(chalk.red(`  Errors: ${totalErrorCount}`));
  }
  log(chalk.green('\n✅ Sync complete!'));
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
