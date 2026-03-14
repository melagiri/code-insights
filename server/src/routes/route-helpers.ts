// Shared helpers for route files — eliminates duplicated SQL queries and LLM guard blocks.
// Centralising these here ensures the session/messages query columns stay in sync across
// analysis.ts, facets.ts, export.ts, and reflect.ts. If a new column is added to the
// sessions or messages tables it only needs updating in one place.

import type { Context, MiddlewareHandler } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getDb } from '@code-insights/cli/db/client';
import { trackEvent, captureError } from '@code-insights/cli/utils/telemetry';
import { isLLMConfigured, loadLLMConfig } from '../llm/client.js';
import type { SessionData, AnalysisResult, AnalysisOptions } from '../llm/analysis.js';
import type { SQLiteMessageRow } from '../llm/analysis.js';

/**
 * Load a session row for LLM analysis. Returns undefined if the session doesn't exist
 * or has been soft-deleted. The selected columns match exactly what the analysis engine
 * expects via the SessionData interface.
 */
export function loadSessionForAnalysis(db: ReturnType<typeof getDb>, sessionId: string): SessionData | undefined {
  return db.prepare(`
    SELECT id, project_id, project_name, project_path, summary, ended_at,
           compact_count, auto_compact_count, slash_commands
    FROM sessions WHERE id = ? AND deleted_at IS NULL
  `).get(sessionId) as SessionData | undefined;
}

/**
 * Load all messages for a session, ordered by timestamp ascending.
 * The selected columns match the SQLiteMessageRow interface consumed by the analysis engine.
 */
export function loadSessionMessages(db: ReturnType<typeof getDb>, sessionId: string): SQLiteMessageRow[] {
  return db.prepare(`
    SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages WHERE session_id = ? ORDER BY timestamp ASC
  `).all(sessionId) as SQLiteMessageRow[];
}

/**
 * Hono middleware factory that short-circuits with a 400 if no LLM provider is configured.
 * Apply per-route: app.post('/route', requireLLM(), async (c) => { ... })
 * The error shape { success: false, error: '...' } matches the analysis endpoint convention.
 */
export function requireLLM(): MiddlewareHandler {
  return async (c, next) => {
    if (!isLLMConfigured()) {
      return c.json({
        success: false,
        error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
      }, 400);
    }
    await next();
  };
}

// ─── Telemetry helper ─────────────────────────────────────────────────────────

/**
 * Options for trackAnalysisResult. Callers may supply an onSuccess callback for
 * any handler-specific events (e.g., insight_generated) that fire only on success.
 */
interface TrackAnalysisOptions {
  /** Called after the success-path analysis_run event — emit extra events here. */
  onSuccess?: () => void;
}

/**
 * Emit the 'analysis_run' telemetry event (and captureError on failure) for a
 * completed analysis call. Encapsulates the boilerplate shared across the session,
 * prompt-quality, and recurring handlers in analysis.ts.
 *
 * Usage:
 *   trackAnalysisResult('session', result, startTime, {
 *     onSuccess: () => trackEvent('insight_generated', { type: 'session', count: result.insights.length }),
 *   });
 */
export function trackAnalysisResult(
  analysisType: string,
  result: Pick<AnalysisResult, 'success' | 'error' | 'error_type' | 'response_preview'>,
  startTime: number,
  options?: TrackAnalysisOptions,
): void {
  const llmConfig = loadLLMConfig();
  const baseProperties: Record<string, unknown> = {
    type: analysisType,
    llm_provider: llmConfig?.provider,
    llm_model: llmConfig?.model,
    duration_ms: Date.now() - startTime,
    success: result.success,
  };

  if (!result.success) {
    const errorProperties: Record<string, unknown> = {
      ...baseProperties,
      error_type: result.error_type,
      error_message: result.error,
      response_preview: result.response_preview,
    };
    trackEvent('analysis_run', errorProperties);
    captureError(new Error(result.error ?? `${analysisType} analysis failed`), errorProperties);
  } else {
    trackEvent('analysis_run', baseProperties);
    options?.onSuccess?.();
  }
}

// ─── SSE stream helpers ───────────────────────────────────────────────────────

/**
 * Build the human-readable progress message for a session analysis stream event.
 * The session analysis handler uses chunk-count information; the prompt-quality
 * handler uses a fixed string. Accept a resolver callback so each caller decides.
 */
type ProgressMessageFn = (progress: { phase: string; currentChunk?: number; totalChunks?: number }) => string;

/**
 * Options for streamSessionAnalysis.
 */
interface StreamSessionAnalysisOptions {
  /**
   * Human-readable telemetry type string (e.g. 'session', 'prompt-quality').
   * Used as the `type` field in the analysis_run event.
   */
  analysisType: string;
  /**
   * The analysis function to call. Must match the signature of analyzeSession /
   * analyzePromptQuality — accepts (session, messages, options?) and returns AnalysisResult.
   */
  analysisFn: (
    session: SessionData,
    messages: SQLiteMessageRow[],
    options?: AnalysisOptions,
  ) => Promise<AnalysisResult>;
  /**
   * Resolve the progress event message from the current progress state.
   * Called inside the onProgress callback to build the human-readable 'message' field.
   */
  progressMessage: ProgressMessageFn;
  /**
   * Called on the success path after tracking telemetry (e.g. to apply a generated title
   * or emit an insight_generated event). Receives the successful AnalysisResult.
   */
  onSuccess?: (result: AnalysisResult) => void;
}

/**
 * Shared SSE lifecycle for single-session analysis stream endpoints.
 * Handles the streamSSE wrapper, abort signal, progress events, result telemetry,
 * and complete/error SSE events. The two analysis stream handlers (session and
 * prompt-quality) differed only in their progress message and analysis function —
 * those are injected via options.
 *
 * Preserves the exact SSE event names and complete/error payload shapes the
 * dashboard expects: progress → { phase, message, ...progress }, complete →
 * { success, insightCount, tokenUsage }, error → { error }.
 */
export function streamSessionAnalysis(
  c: Context,
  session: SessionData,
  messages: SQLiteMessageRow[],
  opts: StreamSessionAnalysisOptions,
): ReturnType<typeof streamSSE> {
  const llmConfig = loadLLMConfig();

  return streamSSE(c, async (stream) => {
    const streamStart = Date.now();
    try {
      const abortSignal = c.req.raw.signal;

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ phase: 'loading_messages', message: 'Loading messages...' }),
      });

      const result = await opts.analysisFn(session, messages, {
        signal: abortSignal,
        onProgress: (progress) => {
          const message = opts.progressMessage(progress);
          void stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({ ...progress, message }),
          }).catch(() => {});
        },
      });

      const baseProperties: Record<string, unknown> = {
        type: opts.analysisType,
        llm_provider: llmConfig?.provider,
        llm_model: llmConfig?.model,
        duration_ms: Date.now() - streamStart,
        success: result.success,
      };

      if (!result.success) {
        const errorProperties: Record<string, unknown> = {
          ...baseProperties,
          error_type: result.error_type,
          error_message: result.error,
          response_preview: result.response_preview,
        };
        trackEvent('analysis_run', errorProperties);
        captureError(new Error(result.error ?? `${opts.analysisType} stream failed`), errorProperties);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: result.error ?? 'Analysis failed' }),
        });
      } else {
        trackEvent('analysis_run', baseProperties);
        opts.onSuccess?.(result);
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            success: true,
            insightCount: result.insights.length,
            tokenUsage: result.usage,
          }),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      captureError(err, {
        type: `${opts.analysisType}_stream`,
        llm_provider: llmConfig?.provider,
        llm_model: llmConfig?.model,
      });
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: message }),
      }).catch(() => {});
    }
  });
}

// ─── Batch backfill SSE helper ────────────────────────────────────────────────

/**
 * Options for streamBatchBackfill. The two backfill handlers (facets and PQ) share
 * the same loop structure but differ in how they check for existing work and which
 * analysis function they call.
 */
export interface StreamBatchBackfillOptions {
  /**
   * Returns true if the session should be skipped (work already done).
   * Only called when force=false; callers implement the appropriate SQL check.
   */
  shouldSkip: (sessionId: string) => boolean;
  /**
   * The analysis function to run for each session. Receives the loaded session,
   * its messages, and an AbortSignal. Returns a result with a success boolean.
   */
  analysisFn: (
    session: SessionData,
    messages: SQLiteMessageRow[],
    options: { signal: AbortSignal },
  ) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Shared SSE lifecycle for batch backfill endpoints (facets backfill and PQ backfill).
 * Iterates sessionIds one-by-one, streaming per-session progress events and a final
 * complete event. Preserves the exact SSE payload shapes the dashboard expects:
 *   progress → { completed, failed, total, currentSessionId, error? }
 *   complete → { completed, failed, total }
 *
 * The caller is responsible for request body validation (sessionIds array present,
 * length ≤ MAX_BACKFILL_SESSIONS) before calling this helper.
 */
export function streamBatchBackfill(
  c: Context,
  sessionIds: string[],
  force: boolean,
  opts: StreamBatchBackfillOptions,
): ReturnType<typeof streamSSE> {
  const db = getDb();

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let completed = 0;
    let failed = 0;
    const total = sessionIds.length;

    for (const sessionId of sessionIds) {
      if (abortSignal.aborted) break;

      const session = loadSessionForAnalysis(db, sessionId);

      if (!session) {
        failed++;
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ completed, failed, total, currentSessionId: sessionId }),
        });
        continue;
      }

      // Skip sessions that already have work done unless force=true.
      if (!force && opts.shouldSkip(sessionId)) {
        completed++;
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ completed, failed, total, currentSessionId: sessionId }),
        });
        continue;
      }

      const messages = loadSessionMessages(db, sessionId);
      const result = await opts.analysisFn(session, messages, { signal: abortSignal });

      if (result.success) {
        completed++;
      } else {
        failed++;
      }

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({
          completed,
          failed,
          total,
          currentSessionId: sessionId,
          ...(result.success ? {} : { error: result.error }),
        }),
      });
    }

    await stream.writeSSE({
      event: 'complete',
      data: JSON.stringify({ completed, failed, total }),
    });
  });
}
