// Internal helpers and shared types for analysis modules.
// Not part of the public API — consumers import from analysis.ts or a specific analysis module.

import type { SessionMetadata } from './prompt-types.js';
import type { SessionData, InsightRow } from './analysis-db.js';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface AnalysisProgress {
  phase: 'loading_messages' | 'analyzing' | 'saving';
  currentChunk?: number;
  totalChunks?: number;
}

export interface AnalysisOptions {
  onProgress?: (progress: AnalysisProgress) => void;
  signal?: AbortSignal;
}

export interface AnalysisResult {
  success: boolean;
  insights: InsightRow[];
  error?: string;
  error_type?: string;
  response_length?: number;
  response_preview?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ─── Shared constants ─────────────────────────────────────────────────────────

/** Maximum input tokens to send to the LLM (leaves room for the response). */
export const MAX_INPUT_TOKENS = 80000;

// ─── Shared helper ────────────────────────────────────────────────────────────

/**
 * Build a SessionMetadata object from V6 session columns.
 * Returns undefined when all V6 fields are absent (pre-V6 sessions with NULL columns).
 * When undefined, prompt generators omit the "Context signals" line entirely.
 */
export function buildSessionMeta(session: SessionData): SessionMetadata | undefined {
  const hasCompacts = !!(session.compact_count || session.auto_compact_count);
  const hasSlashCommands = !!(session.slash_commands);
  if (!hasCompacts && !hasSlashCommands) return undefined;

  return {
    compactCount: session.compact_count ?? 0,
    autoCompactCount: session.auto_compact_count ?? 0,
    slashCommands: session.slash_commands ? JSON.parse(session.slash_commands) as string[] : [],
  };
}
