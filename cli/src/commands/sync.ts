import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadSyncState, saveSyncState, resolveDataSourcePreference } from '../utils/config.js';
import { trackEvent } from '../utils/telemetry.js';
import { initializeFirebase, uploadSession, uploadMessages, sessionExists, recalculateUsageStats } from '../firebase/client.js';
import { getAllProviders, getProvider } from '../providers/registry.js';
import { setProviderVerbose } from '../providers/context.js';
import type { SessionProvider } from '../providers/types.js';
import type { SyncState } from '../types.js';
import { splitVirtualPath } from '../utils/paths.js';

interface SyncOptions {
  force?: boolean;
  forceRemote?: boolean;
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
}

/**
 * Core sync logic — reusable from stats commands and other callers.
 *
 * Throws on fatal errors (missing config, Firebase connection failure,
 * unknown provider) instead of calling process.exit().
 * Returns a SyncResult summary instead of printing one.
 */
export async function runSync(options: SyncOptions = {}): Promise<SyncResult> {
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

  log(chalk.cyan('\n\uD83D\uDCE4 Code Insights Sync\n'));

  // Load config
  const config = loadConfig();
  if (!config) {
    throw new Error(
      'Sync requires Firebase. Run `code-insights init` to set up.\n' +
      '  For local-only analytics: code-insights stats'
    );
  }

  // Initialize Firebase
  const spinner = createSpinner('Connecting to Firebase...').start();
  try {
    initializeFirebase(config);
    spinner.succeed('Connected to Firebase');
  } catch (error) {
    spinner.fail('Failed to connect to Firebase');
    throw new Error(`Failed to connect to Firebase: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Dry-run banner
  if (options.dryRun) {
    log(chalk.yellow('\n\uD83D\uDD0D Dry run \u2014 no changes will be made'));
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

  for (const provider of providers) {
    const providerName = provider.getProviderName();
    try {
      if (providers.length > 1) {
        log(chalk.cyan(`\n\uD83D\uDCE6 Syncing ${providerName}...`));
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
    } catch (error) {
      totalErrorCount++;
      spinner.fail(`Failed to sync ${providerName}`);
      if (!options.quiet) {
        console.error(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
  }

  // Reconcile usage stats after force sync (skip if nothing changed)
  if (options.force && (totalSyncedCount > 0 || totalErrorCount > 0)) {
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

  return {
    syncedCount: totalSyncedCount,
    messageCount: totalMessageCount,
    errorCount: totalErrorCount,
  };
}

/**
 * Sync AI coding sessions to Firestore
 */
export async function syncCommand(options: SyncOptions = {}): Promise<void> {
  const log = options.quiet ? () => {} : console.log.bind(console);
  const preference = resolveDataSourcePreference();
  if (preference === 'local' && !options.forceRemote) {
    log(chalk.yellow('\n  ⚠ Data source is set to local. Sync is only used with Firebase.\n'));
    log(chalk.gray('  To switch to Firebase: code-insights config set-source firebase'));
    log(chalk.gray('  To sync anyway (one-time): code-insights sync --force-remote\n'));
    return;
  }

  try {
    const result = await runSync(options);

    // Summary (only if not quiet)
    if (result.syncedCount === 0 && result.errorCount === 0) {
      log(chalk.green('\n\u2705 Already up to date!'));
      trackEvent('sync', true);
      return;
    }
    log(chalk.cyan('\n\uD83D\uDCCA Sync Summary'));
    log(chalk.white(`  Sessions synced: ${result.syncedCount}`));
    log(chalk.white(`  Messages uploaded: ${result.messageCount}`));
    if (result.errorCount > 0) {
      log(chalk.red(`  Errors: ${result.errorCount}`));
    }
    log(chalk.green('\n\u2705 Sync complete!'));
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

    // For virtual paths (multi-session files), check if this specific session was synced
    if (sessionFragment && fileState.syncedSessionIds) {
      return !fileState.syncedSessionIds.includes(sessionFragment);
    }

    // For regular files, check if modified since last sync
    if (sessionFragment) {
      // Virtual path but no syncedSessionIds tracked yet — needs sync
      return true;
    }

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
