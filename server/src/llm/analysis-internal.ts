// Internal helpers and shared types for analysis modules.
// Not part of the public API — consumers import from analysis.ts or a specific analysis module.

import type { SessionMetadata } from './prompt-types.js';
import type { SessionData, InsightRow } from './analysis-db.js';
import { safeParseJson } from '../utils.js';

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
    /** Anthropic: tokens written to the prompt cache (incurs 25% surcharge). */
    cacheCreationTokens?: number;
    /** Anthropic: tokens read from the prompt cache (90% discount vs normal input). */
    cacheReadTokens?: number;
  };
}

// ─── Shared constants ─────────────────────────────────────────────────────────

/**
 * Maximum input tokens to send to the LLM (leaves room for the response).
 *
 * Provider-aware: llamacpp targets small quantized models (12B-27B GGUF) with limited
 * context windows. The CONVERSATION budget must leave room for:
 *   - ~3K tokens of system prompt + analysis instructions (prompt overhead)
 *   - 4K max_tokens reserved for model output
 * With a 32K context llama-server (-c 32768): 32K - 3K prompt - 4K output ≈ 25K available.
 * At 12K conversation budget with 80% chunking (9.6K effective), total request stays under 17K,
 * fitting safely in even a 16K context window.
 *
 * Previously 24K, which caused exceed_context_size_error because it didn't account for overhead.
 *
 * All other providers (hosted APIs with large context windows) use the 80K default.
 */
export const MAX_INPUT_TOKENS = 80000;

export function getMaxInputTokens(provider: string): number {
  if (provider === 'llamacpp') return 12288;
  return MAX_INPUT_TOKENS;
}

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
    slashCommands: safeParseJson<string[]>(session.slash_commands, []),
  };
}
