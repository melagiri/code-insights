/**
 * Queue worker — processes analysis_queue items one at a time.
 *
 * Called as a detached subprocess spawned by `session-end` after enqueue.
 * Resets stale processing items first, then claims and runs pending items
 * until the queue is empty.
 *
 * Worker spawned with CODE_INSIGHTS_HOOK_ACTIVE=1 in env so that
 * local agent runners do not re-trigger this hook recursively.
 */

import chalk from 'chalk';
import { claimNext, markCompleted, markFailed, resetStale } from '../db/queue.js';
import { runInsightsCommand } from '../commands/insights.js';
import type { AnalysisRunner } from './runner-types.js';
import { createAnalysisRunner, normalizeRunner } from './runner-factory.js';

export interface ProcessQueueOptions {
  quiet?: boolean;
  /** Optional model override used by local agent runners. */
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

  // Build each requested runner once and reuse it across queue items.
  const runners = new Map<string, AnalysisRunner>();

  while (true) {
    const item = claimNext();
    if (!item) break; // Queue empty

    log(chalk.dim(`[Code Insights] Analyzing session ${item.session_id} (attempt ${item.attempt_count + 1}/${item.max_attempts})...`));

    try {
      const runnerName = normalizeRunner(item.runner_type, item.runner_type === 'native');
      let runner = runners.get(runnerName);
      if (!runner) {
        runner = createAnalysisRunner(runnerName, options.model);
        runners.set(runnerName, runner);
      }
      await runInsightsCommand({
        sessionId: item.session_id,
        native: runnerName === 'claude',
        runner: runnerName,
        quiet,
        _runner: runner,
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
