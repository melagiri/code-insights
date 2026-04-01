/**
 * analysis_queue CRUD operations.
 *
 * Queue semantics: one row per session (session_id is PRIMARY KEY).
 * Retries increment attempt_count in-place — no duplicate rows.
 *
 * Status lifecycle:
 *   pending -> processing -> completed
 *                        -> pending  (retry if attempt_count < max_attempts)
 *                        -> failed   (permanent failure after max_attempts)
 *
 * All write operations are synchronous (better-sqlite3 is sync-only).
 */

import { getDb } from './client.js';

export interface QueueItem {
  session_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  runner_type: string;
  enqueued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
}

export interface QueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  items: QueueItem[];
}

/**
 * Add a session to the analysis queue.
 * Uses INSERT OR REPLACE so re-enqueuing a session resets it to pending
 * (handles the case where a session grows after initial enqueue).
 */
export function enqueue(sessionId: string, runnerType = 'native'): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO analysis_queue
       (session_id, status, runner_type, enqueued_at, started_at, completed_at, error_message, attempt_count, max_attempts)
     VALUES
       (?, 'pending', ?, datetime('now'), NULL, NULL, NULL, 0, 3)`
  ).run(sessionId, runnerType);
}

/**
 * Atomically claim the next pending item by moving it to 'processing'.
 * Uses UPDATE ... WHERE session_id = (subquery) to avoid a SELECT-then-UPDATE
 * race. Returns the claimed item, or null if the queue is empty.
 *
 * SQLite's single-writer model prevents concurrent claims, but the atomic
 * pattern is still correct and future-safe.
 */
export function claimNext(): QueueItem | null {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE analysis_queue
     SET status = 'processing', started_at = datetime('now')
     WHERE session_id = (
       SELECT session_id FROM analysis_queue
       WHERE status = 'pending'
       ORDER BY enqueued_at ASC
       LIMIT 1
     )`
  );
  const result = stmt.run();
  if (result.changes === 0) return null;

  // Fetch the row we just claimed
  return db.prepare(
    `SELECT * FROM analysis_queue WHERE status = 'processing' ORDER BY started_at DESC LIMIT 1`
  ).get() as QueueItem | null;
}

/**
 * Mark an item as completed.
 */
export function markCompleted(sessionId: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE analysis_queue
     SET status = 'completed', completed_at = datetime('now'), error_message = NULL
     WHERE session_id = ?`
  ).run(sessionId);
}

/**
 * Mark an item as failed (or re-queue for retry).
 * If attempt_count < max_attempts, resets to 'pending' for retry.
 * Otherwise sets status to 'failed' permanently.
 */
export function markFailed(sessionId: string, errorMessage: string): void {
  const db = getDb();
  // Increment attempt_count and check if we've hit the limit atomically
  db.prepare(
    `UPDATE analysis_queue
     SET attempt_count = attempt_count + 1,
         error_message = ?,
         status = CASE
           WHEN attempt_count + 1 >= max_attempts THEN 'failed'
           ELSE 'pending'
         END,
         started_at = NULL
     WHERE session_id = ?`
  ).run(errorMessage, sessionId);
}

/**
 * Reset stale 'processing' items back to 'pending'.
 * Items stuck in 'processing' for more than 10 minutes are considered stale
 * (worker was killed or crashed mid-analysis).
 */
export function resetStale(): number {
  const db = getDb();
  const result = db.prepare(
    `UPDATE analysis_queue
     SET status = 'pending', started_at = NULL
     WHERE status = 'processing'
       AND started_at < datetime('now', '-10 minutes')`
  ).run();
  return result.changes;
}

/**
 * Reset failed items back to pending (manual retry).
 * Pass a sessionId to retry one item, or omit to retry all failed items.
 */
export function resetFailed(sessionId?: string): number {
  const db = getDb();
  if (sessionId) {
    const result = db.prepare(
      `UPDATE analysis_queue
       SET status = 'pending', attempt_count = 0, error_message = NULL, started_at = NULL
       WHERE session_id = ? AND status = 'failed'`
    ).run(sessionId);
    return result.changes;
  }
  const result = db.prepare(
    `UPDATE analysis_queue
     SET status = 'pending', attempt_count = 0, error_message = NULL, started_at = NULL
     WHERE status = 'failed'`
  ).run();
  return result.changes;
}

/**
 * Return queue status counts and active/pending item details.
 * Completed items are excluded from the items list (only pending/processing/failed).
 */
export function getQueueStatus(): QueueStatus {
  const db = getDb();

  const counts = db.prepare(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM analysis_queue`
  ).get() as { pending: number | null; processing: number | null; completed: number | null; failed: number | null };

  const items = db.prepare(
    `SELECT * FROM analysis_queue
     WHERE status IN ('pending', 'processing', 'failed')
     ORDER BY enqueued_at ASC`
  ).all() as QueueItem[];

  return {
    pending: counts.pending ?? 0,
    processing: counts.processing ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    items,
  };
}

/**
 * Remove completed and failed items older than the specified number of days.
 * Returns the number of rows deleted.
 */
export function pruneCompleted(olderThanDays = 7): number {
  const db = getDb();
  const result = db.prepare(
    `DELETE FROM analysis_queue
     WHERE status IN ('completed', 'failed')
       AND enqueued_at < datetime('now', ? || ' days')`
  ).run(`-${olderThanDays}`);
  return result.changes;
}
