import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadSyncState, saveSyncState } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';
import { insertSessionWithProjectAndReturnIsNew, insertMessages, recalculateUsageStats } from '../db/write.js';
import { getDb } from '../db/client.js';
import { getAllProviders, getProvider } from '../providers/registry.js';
import { setProviderVerbose } from '../providers/context.js';
import type { SessionProvider } from '../providers/types.js';
import type { SyncState } from '../types.js';
import { splitVirtualPath } from '../utils/paths.js';

interface SyncOptions {
  force?: boolean;
  project?: string;
  dryRun?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  regenerateTitles?: boolean;
  source?: string;
}

export interface SyncResult {
  syncedCount: number;
  messageCount: number;
  errorCount: number;
  updatedExistingCount: number;
}

/**
 * Core sync logic — reusable from stats commands and other callers.
 *
 * Parses sessions from all configured providers and writes to local SQLite.
 * Throws on fatal errors (unknown provider) instead of calling process.exit().
 * Returns a SyncResult summary.
 */
export async function runSync(options: SyncOptions = {}): Promise<SyncResult> {
  const log = options.quiet ? () => {} : console.log.bind(console);
  const noopSpinner = {
    start: function() { return this; },
    succeed: function() { return this; },
    fail: function() { return this; },
    warn: function() { return this; },
    info: function() { return this; },
    stop: function() { return this; },
  };
  const createSpinner = options.quiet
    ? () => noopSpinner
    : ora;

  log(chalk.cyan('\n  Code Insights Sync\n'));

  // Initialize database (runs migrations if needed)
  const spinner = createSpinner('Initializing database...').start();
  try {
    getDb();
    spinner.succeed('Database ready');
  } catch (error) {
    spinner.fail('Failed to initialize database');
    throw new Error(`Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Dry-run banner
  if (options.dryRun) {
    log(chalk.yellow('\n  Dry run -- no changes will be made'));
  }

  // Set verbose flag for providers (e.g., gates Cursor diagnostic warnings)
  setProviderVerbose(!!options.verbose);

  // Get providers to sync
  let providers: SessionProvider[];
  if (options.source) {
    try {
      providers = [getProvider(options.source)];
    } catch {
      throw new Error(`Unknown source: ${options.source}. Available: ${getAllProviders().map(p => p.getProviderName()).join(', ')}`);
    }
  } else {
    providers = getAllProviders();
  }

  // Load sync state
  // When --force is used with --source, only clear the targeted provider's entries
  // instead of nuking the entire sync state.
  const syncState = loadSyncState();
  if (options.force) {
    if (options.source) {
      // Targeted force: remove only entries belonging to the specified provider's files
      const targetProviderPaths = new Set<string>();
      for (const provider of providers) {
        const discovered = await provider.discover({ projectFilter: options.project });
        for (const p of discovered) {
          const { realPath } = splitVirtualPath(p);
          targetProviderPaths.add(realPath);
        }
      }
      for (const key of Object.keys(syncState.files)) {
        if (targetProviderPaths.has(key)) {
          delete syncState.files[key];
        }
      }
    } else {
      // Full force: reset everything
      syncState.files = {};
    }
  }

  let totalSyncedCount = 0;
  let totalMessageCount = 0;
  let totalErrorCount = 0;
  let totalUpdatedExisting = 0;

  for (const provider of providers) {
    const providerName = provider.getProviderName();
    try {
      if (providers.length > 1) {
        log(chalk.cyan(`\n  Syncing ${providerName}...`));
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

      // Process files — accumulate per-provider counts, show one summary line after
      let providerSyncedCount = 0;
      let providerUpdatedCount = 0;
      let providerSkippedCount = 0;
      let providerMessageCount = 0;

      for (const filePath of filesToSync) {
        const fileName = path.basename(filePath);
        spinner.start(`Processing ${fileName}...`);

        try {
          // Parse session
          const session = await provider.parse(filePath);
          if (!session) {
            providerSkippedCount++;
            continue;
          }

          // Write session and messages to SQLite
          const isNew = insertSessionWithProjectAndReturnIsNew(session, !!options.force);
          insertMessages(session);

          // Update and persist sync state after each file
          // so progress survives crashes
          updateSyncState(syncState, filePath, session.id);
          saveSyncState(syncState);

          if (!isNew && !options.force) {
            providerUpdatedCount++;
            totalUpdatedExisting++;
          }

          providerSyncedCount++;
          providerMessageCount += session.messages.length;
          totalSyncedCount++;
          totalMessageCount += session.messages.length;
        } catch (error) {
          totalErrorCount++;
          spinner.fail(`Failed to sync ${fileName}`);
          if (!options.quiet) {
            console.error(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        }
      }

      // One summary line per provider instead of per-file noise
      spinner.stop();
      if (providerSyncedCount > 0 || providerSkippedCount > 0) {
        const providerNewCount = providerSyncedCount - providerUpdatedCount;
        const parts: string[] = [];
        if (providerNewCount > 0) parts.push(`${providerNewCount} new`);
        if (providerUpdatedCount > 0) parts.push(`${providerUpdatedCount} updated`);
        if (parts.length === 0) parts.push('0 synced');
        const syncedPart = `${parts.join(', ')}${providerMessageCount > 0 ? ` (${providerMessageCount.toLocaleString()} messages)` : ''}`;
        const skippedPart = providerSkippedCount > 0
          ? `, ${providerSkippedCount} empty`
          : '';
        log(chalk.gray(`  ${syncedPart}${skippedPart}`));
      }
    } catch (error) {
      totalErrorCount++;
      spinner.fail(`Failed to sync ${providerName}`);
      if (!options.quiet) {
        console.error(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
  }

  // Reconcile usage stats after force sync (skip if nothing changed)
  const shouldRecalculateUsageStats = options.force
    ? (totalSyncedCount > 0 || totalErrorCount > 0)
    : totalUpdatedExisting > 0;

  if (shouldRecalculateUsageStats) {
    spinner.start('Recalculating usage stats...');
    try {
      const result = recalculateUsageStats();
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

  return {
    syncedCount: totalSyncedCount,
    messageCount: totalMessageCount,
    errorCount: totalErrorCount,
    updatedExistingCount: totalUpdatedExisting,
  };
}

/**
 * Sync AI coding sessions to local SQLite database
 */
export async function syncCommand(options: SyncOptions = {}): Promise<void> {
  const log = options.quiet ? () => {} : console.log.bind(console);

  try {
    const result = await runSync(options);

    // Summary (only if not quiet)
    if (result.syncedCount === 0 && result.errorCount === 0) {
      log(chalk.green('\n  Already up to date!'));
      trackEvent('sync', true);
      return;
    }
    log(chalk.cyan('\n  Sync Summary'));
    const newCount = Math.max(result.syncedCount - result.updatedExistingCount, 0);
    log(chalk.white(`  Sessions new: ${newCount}`));
    if (result.updatedExistingCount > 0) {
      log(chalk.white(`  Sessions updated: ${result.updatedExistingCount}`));
    }
    log(chalk.white(`  Messages synced: ${result.messageCount}`));
    if (result.errorCount > 0) {
      log(chalk.red(`  Errors: ${result.errorCount}`));
    }
    log(chalk.green('\n  Sync complete!'));
    trackEvent('sync', true);
  } catch (error) {
    trackEvent('sync', false);
    if (!options.quiet) {
      console.error(chalk.red(error instanceof Error ? error.message : 'Sync failed'));
    }
    process.exit(1);
  }
}

/**
 * Filter files to only those that need syncing
 */
function filterFilesToSync(files: string[], syncState: SyncState, force?: boolean): string[] {
  if (force) return files;

  return files.filter((filePath) => {
    const { realPath, sessionFragment } = splitVirtualPath(filePath);
    const stat = fs.statSync(realPath);
    const lastModified = stat.mtime.toISOString();
    const fileState = syncState.files[realPath];

    // If file was never synced, sync it
    if (!fileState) return true;

    if (sessionFragment) {
      // Virtual path (multi-session DB).
      // If the DB file changed, re-sync all sessions from it.
      if (fileState.lastModified !== lastModified) return true;

      // Otherwise only sync sessions we haven't seen yet.
      if (fileState.syncedSessionIds) {
        return !fileState.syncedSessionIds.includes(sessionFragment);
      }

      // Virtual path but no syncedSessionIds tracked yet — needs sync
      return true;
    }

    // For regular files, check if modified since last sync
    return fileState.lastModified !== lastModified;
  });
}

/**
 * Update sync state for a file
 */
function updateSyncState(state: SyncState, filePath: string, sessionId: string): void {
  const { realPath, sessionFragment } = splitVirtualPath(filePath);
  const stat = fs.statSync(realPath);

  if (sessionFragment) {
    // Virtual path: track the session fragment in syncedSessionIds
    const existing = state.files[realPath];
    const syncedIds = existing?.syncedSessionIds || [];
    if (!syncedIds.includes(sessionFragment)) {
      syncedIds.push(sessionFragment);
    }
    state.files[realPath] = {
      lastModified: stat.mtime.toISOString(),
      lastSyncedLine: 0,
      sessionId,
      syncedSessionIds: syncedIds,
    };
  } else {
    // Regular file path
    state.files[realPath] = {
      lastModified: stat.mtime.toISOString(),
      lastSyncedLine: 0,
      sessionId,
    };
  }
}
