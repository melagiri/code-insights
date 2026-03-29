// DB persistence for LLM analysis token usage and cost data.
// Moved from server/src/llm/analysis-usage-db.ts (server is now a re-export wrapper).
// Writes to the analysis_usage table (V7 schema).
// One row per (session_id, analysis_type) — upserts on re-analysis.

import { getDb } from '../db/client.js';

/** Shape of a row returned from analysis_usage table. */
export interface AnalysisUsageRow {
  session_id: string;
  analysis_type: string;          // 'session' | 'prompt_quality' | 'facet'
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number | null;
  chunk_count: number;
  analyzed_at: string;            // ISO 8601 (from SQLite datetime('now'))
}

/** Data required to record a completed analysis call. */
export interface SaveAnalysisUsageData {
  session_id: string;
  analysis_type: 'session' | 'prompt_quality' | 'facet';
  provider: string;
  model: string;
  /** Total input tokens across all chunks (already summed by caller). */
  input_tokens: number;
  /** Total output tokens across all chunks (already summed by caller). */
  output_tokens: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  estimated_cost_usd: number;
  /** Wall-clock duration of the full analysis call (or sum of chunks), in ms. */
  duration_ms?: number;
  /** Number of chunks used (1 for non-chunked sessions). */
  chunk_count?: number;
  /**
   * Current message count for the session being analyzed.
   * Written by CLI insights command for resume-detection:
   * if this matches sessions.message_count on next hook run, analysis is skipped.
   * Optional because server-side re-analysis calls don't have this context.
   */
  session_message_count?: number;
}

/**
 * Persist analysis token usage to SQLite.
 * Uses INSERT ... ON CONFLICT DO UPDATE — preserves columns not in this write.
 * INSERT OR REPLACE would DELETE+INSERT, clobbering unrelated columns.
 */
export function saveAnalysisUsage(data: SaveAnalysisUsageData): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO analysis_usage
      (session_id, analysis_type, provider, model,
       input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
       estimated_cost_usd, duration_ms, chunk_count, session_message_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, analysis_type) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      cache_creation_tokens = excluded.cache_creation_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      estimated_cost_usd = excluded.estimated_cost_usd,
      duration_ms = excluded.duration_ms,
      chunk_count = excluded.chunk_count,
      session_message_count = excluded.session_message_count
  `).run(
    data.session_id,
    data.analysis_type,
    data.provider,
    data.model,
    data.input_tokens,
    data.output_tokens,
    data.cache_creation_tokens ?? 0,
    data.cache_read_tokens ?? 0,
    data.estimated_cost_usd,
    data.duration_ms ?? null,
    data.chunk_count ?? 1,
    data.session_message_count ?? null,
  );
}

/**
 * Retrieve all analysis usage rows for a session.
 * Returns an empty array for sessions with no recorded usage (pre-V7 or unanalyzed).
 */
export function getSessionAnalysisUsage(sessionId: string): AnalysisUsageRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT session_id, analysis_type, provider, model,
           input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
           estimated_cost_usd, duration_ms, chunk_count, analyzed_at
    FROM analysis_usage
    WHERE session_id = ?
    ORDER BY analyzed_at ASC
  `).all(sessionId) as AnalysisUsageRow[];
}
