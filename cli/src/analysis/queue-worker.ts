/**
 * Queue worker — processes analysis_queue items one at a time.
 *
 * Called as a detached subprocess spawned by `session-end` after enqueue.
 * Resets stale processing items first, then claims and runs pending items
 * until the queue is empty.
 *
 * Worker spawned with CODE_INSIGHTS_HOOK_ACTIVE=1 in env so that
 * ClaudeNativeRunner does not re-trigger this hook recursively.
 */

import chalk from 'chalk';
import { claimNext, markCompleted, markFailed, resetStale } from '../db/queue.js';
import { runInsightsCommand } from '../commands/insights.js';
import { ClaudeNativeRunner } from './native-runner.js';

export interface ProcessQueueOptions {
  quiet?: boolean;
  /** Runner type to use — 'native' uses claude -p, anything else uses configured provider */
  runnerType?: string;
  model?: string;
}

/**
 * Process all pending queue items until the queue is empty.
 * Returns the number of items processed successfully.
 */
export async function processQueue(options: ProcessQueueOptions = {}): Promise<number> {
  const { quiet = false } = options;
  const log = quiet ? () => {} : console.log.bind(console);

  // Reset any items stuck in 'processing' from a previous crashed worker
  const staleCount = resetStale();
  if (staleCount > 0) {
    log(chalk.yellow(`[Code Insights] Reset ${staleCount} stale processing item(s) to pending`));
  }

  let successCount = 0;

  // Build a native runner once and reuse across items (avoids repeated validate() calls)
  let runner: ClaudeNativeRunner | undefined;
  try {
    ClaudeNativeRunner.validate();
    runner = new ClaudeNativeRunner({ model: options.model });
  } catch {
    // claude CLI not available — fall back to provider runner (runInsightsCommand handles this)
    runner = undefined;
  }

  while (true) {
    const item = claimNext();
    if (!item) break; // Queue empty

    log(chalk.dim(`[Code Insights] Analyzing session ${item.session_id} (attempt ${item.attempt_count + 1}/${item.max_attempts})...`));

    try {
      await runInsightsCommand({
        sessionId: item.session_id,
        native: item.runner_type === 'native',
        quiet,
        _runner: item.runner_type === 'native' ? runner : undefined,
      });
      markCompleted(item.session_id);
      successCount++;
      log(chalk.green(`[Code Insights] Session ${item.session_id} analyzed successfully`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      markFailed(item.session_id, errorMessage);
      if (!quiet) {
        console.error(chalk.red(`[Code Insights] Analysis failed for ${item.session_id}: ${errorMessage}`));
      }
    }
  }

  return successCount;
}
