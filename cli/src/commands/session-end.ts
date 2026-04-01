/**
 * session-end command — single SessionEnd hook entry point.
 *
 * Replaces the two-hook system (Stop sync + SessionEnd analysis):
 *   1. Reads Claude Code SessionEnd JSON from stdin
 *   2. syncSingleFile() — foreground, fast (~50-200ms)
 *   3. enqueue(sessionId) — writes to analysis_queue (<1ms)
 *   4. Spawns a detached worker process to run analysis asynchronously
 *   5. Exits 0 immediately — hook completes quickly
 *
 * The detached worker picks up the queue item and runs analysis in the
 * background, surviving the hook process tree cleanup by Claude Code.
 *
 * Guard: If CODE_INSIGHTS_HOOK_ACTIVE is set, exits immediately to prevent
 * the analysis worker's own session from re-triggering this hook.
 */

import chalk from 'chalk';
import { spawn } from 'child_process';
import { openSync, closeSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getConfigDir } from '../utils/config.js';
import { syncSingleFile } from './sync.js';
import { enqueue } from '../db/queue.js';

/** Resolve the CLI entry point for spawning child processes. */
const CLI_ENTRY = resolve(fileURLToPath(import.meta.url), '../../index.js');

/** Log file for detached background worker output. */
const WORKER_LOG_PATH = join(getConfigDir(), 'hook-analysis.log');

export interface SessionEndOptions {
  native?: boolean;
  quiet?: boolean;
  source?: string;
}

/**
 * Main entry point for the session-end command.
 * Returns normally (no process.exit) so tests can call it directly.
 */
export async function sessionEndCommand(options: SessionEndOptions = {}): Promise<void> {
  const { quiet = false, native = true } = options;

  // Guard: break infinite recursion when our own analysis worker's session ends
  if (process.env.CODE_INSIGHTS_HOOK_ACTIVE) {
    return;
  }

  const stdinData = await readStdin();
  let parsed: { session_id?: string; transcript_path?: string; cwd?: string; hook_event_name?: string; reason?: string };
  try {
    parsed = JSON.parse(stdinData);
  } catch {
    if (!quiet) {
      console.error(chalk.red('[Code Insights] session-end: invalid JSON on stdin'));
    }
    return;
  }

  if (!parsed.session_id) {
    if (!quiet) {
      console.error(chalk.red('[Code Insights] session-end: missing session_id in stdin JSON'));
    }
    return;
  }

  const sessionId = parsed.session_id;

  // Phase 1: Sync the session file to SQLite (foreground, must complete before exit)
  if (parsed.transcript_path) {
    try {
      await syncSingleFile({ filePath: parsed.transcript_path, sourceTool: options.source, quiet });
    } catch {
      // Sync failure is non-fatal: session may already be in DB from a previous sync.
      // Fall through to enqueue anyway so analysis still runs if the session is present.
      if (!quiet) {
        console.error(chalk.yellow('[Code Insights] session-end: sync failed, enqueuing anyway'));
      }
    }
  }

  // Phase 2: Enqueue for async analysis
  enqueue(sessionId, native ? 'native' : 'provider');

  // Phase 3: Spawn detached worker to process the queue
  spawnWorker(quiet);
}

function spawnWorker(quiet: boolean): void {
  try {
    const configDir = getConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
    const logFd = openSync(WORKER_LOG_PATH, 'a');

    const args = [CLI_ENTRY, 'queue', 'process'];
    if (quiet) args.push('-q');

    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, CODE_INSIGHTS_HOOK_ACTIVE: '1' },
    });
    child.unref();
    // Close the fd in the parent — the child inherited it and keeps it open.
    // Not closing here would leak the fd until the parent process exits.
    closeSync(logFd);
  } catch {
    // Worker spawn failure is non-fatal — the item stays in the queue
    // and will be picked up by the next worker invocation.
    if (!quiet) {
      console.error(chalk.yellow('[Code Insights] session-end: could not spawn analysis worker'));
    }
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('{}');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}
