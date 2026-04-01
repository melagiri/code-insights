/**
 * queue command suite — manage the analysis_queue.
 *
 * Subcommands:
 *   status          Show queue state (pending/processing/completed/failed counts)
 *   process         Process next pending item (foreground)
 *   retry [id]      Reset failed items to pending
 *     --all         Reset all failed items
 *   prune           Remove old completed/failed items
 *     --days <n>    Default: 7
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { getQueueStatus, resetFailed, pruneCompleted } from '../db/queue.js';
import { processQueue } from '../analysis/queue-worker.js';

// ── queue status ──────────────────────────────────────────────────────────────

export async function queueStatusCommand(opts: { quiet?: boolean } = {}): Promise<void> {
  const { quiet = false } = opts;
  const status = getQueueStatus();

  if (quiet) {
    process.stdout.write(JSON.stringify({
      pending: status.pending,
      processing: status.processing,
      completed: status.completed,
      failed: status.failed,
    }) + '\n');
    return;
  }

  console.log(chalk.cyan('\n  Analysis Queue Status\n'));
  console.log(chalk.white(`  Pending:    ${status.pending}`));
  console.log(chalk.white(`  Processing: ${status.processing}`));
  console.log(chalk.white(`  Completed:  ${status.completed}`));
  if (status.failed > 0) {
    console.log(chalk.red(`  Failed:     ${status.failed}`));
  } else {
    console.log(chalk.white(`  Failed:     ${status.failed}`));
  }

  if (status.items.length > 0) {
    console.log(chalk.cyan('\n  Active Items:\n'));
    for (const item of status.items) {
      const statusColor = item.status === 'failed' ? chalk.red : chalk.yellow;
      console.log(
        `  ${statusColor(item.status.padEnd(12))} ${chalk.dim(item.session_id)} ` +
        `${chalk.dim(`(attempt ${item.attempt_count}/${item.max_attempts})`)}`
      );
      if (item.error_message && item.status === 'failed') {
        console.log(chalk.dim(`               ${item.error_message}`));
      }
    }
    console.log('');
  }
}

// ── queue process ─────────────────────────────────────────────────────────────

export async function queueProcessCommand(opts: { quiet?: boolean; model?: string } = {}): Promise<void> {
  const { quiet = false } = opts;
  const log = quiet ? () => {} : console.log.bind(console);

  try {
    const count = await processQueue({ quiet, model: opts.model });
    if (count === 0) {
      log(chalk.dim('[Code Insights] No pending items in queue'));
    } else {
      log(chalk.green(`[Code Insights] Processed ${count} item(s)`));
    }
  } catch (error) {
    if (!quiet) {
      console.error(chalk.red(`[Code Insights] Queue processing failed: ${error instanceof Error ? error.message : String(error)}`));
    }
    process.exit(1);
  }
}

// ── queue retry ───────────────────────────────────────────────────────────────

export async function queueRetryCommand(
  sessionId: string | undefined,
  opts: { all?: boolean; quiet?: boolean } = {}
): Promise<void> {
  const { quiet = false } = opts;

  if (!sessionId && !opts.all) {
    console.error(chalk.red('Provide a session ID to retry, or use --all to retry all failed items'));
    process.exit(1);
  }

  const count = resetFailed(sessionId);
  if (!quiet) {
    if (count === 0) {
      console.log(chalk.yellow('[Code Insights] No failed items found to retry'));
    } else {
      console.log(chalk.green(`[Code Insights] Reset ${count} failed item(s) to pending`));
    }
  }
}

// ── queue prune ───────────────────────────────────────────────────────────────

export async function queuePruneCommand(opts: { days?: number; quiet?: boolean } = {}): Promise<void> {
  const { days = 7, quiet = false } = opts;
  const count = pruneCompleted(days);
  if (!quiet) {
    if (count === 0) {
      console.log(chalk.dim(`[Code Insights] No items older than ${days} days to remove`));
    } else {
      console.log(chalk.green(`[Code Insights] Removed ${count} item(s) older than ${days} days`));
    }
  }
}

// ── Commander command tree ────────────────────────────────────────────────────

export function buildQueueCommand(): Command {
  const queueCmd = new Command('queue')
    .description('Manage the analysis queue');

  queueCmd
    .command('status')
    .description('Show queue state (pending/processing/completed/failed counts)')
    .option('-q, --quiet', 'Machine-readable JSON output')
    .action((opts) => queueStatusCommand({ quiet: opts.quiet }));

  queueCmd
    .command('process')
    .description('Process pending queue items (foreground)')
    .option('-q, --quiet', 'Suppress output')
    .option('--model <model>', 'Model for native analysis (default: sonnet)')
    .action((opts) => queueProcessCommand({ quiet: opts.quiet, model: opts.model }));

  queueCmd
    .command('retry [session_id]')
    .description('Reset failed items to pending for retry')
    .option('--all', 'Reset all failed items')
    .option('-q, --quiet', 'Suppress output')
    .action((sessionId: string | undefined, opts) =>
      queueRetryCommand(sessionId, { all: opts.all, quiet: opts.quiet })
    );

  queueCmd
    .command('prune')
    .description('Remove completed/failed items older than N days')
    .option('--days <n>', 'Age threshold in days (default: 7)', '7')
    .option('-q, --quiet', 'Suppress output')
    .action((opts) =>
      queuePruneCommand({ days: parseInt(opts.days, 10), quiet: opts.quiet })
    );

  return queueCmd;
}
