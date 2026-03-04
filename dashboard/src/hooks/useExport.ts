import { useMutation } from '@tanstack/react-query';
import { useState, useRef, useCallback } from 'react';
import { exportMarkdown, exportGenerateStream } from '@/lib/api';
import type { ExportTemplate } from '@/lib/types';
import type { ExportGenerateRequest, ExportGenerateMetadata } from '@/lib/api';
import { parseSSEStream } from '@/lib/sse';

interface ExportParams {
  sessionIds?: string[];
  projectId?: string;
  template?: ExportTemplate;
}

export function useExportMarkdown() {
  return useMutation({
    mutationFn: (params: ExportParams) => exportMarkdown(params),
  });
}

// ─── SSE-based LLM export generate hook ──────────────────────────────────────

export type ExportGenerateStatus = 'idle' | 'loading_insights' | 'synthesizing' | 'complete' | 'error';

export interface ExportGenerateState {
  status: ExportGenerateStatus;
  insightCount: number | null;    // insights being sent to LLM
  totalInsights: number | null;   // total available for scope (before depth cap)
  content: string | null;
  metadata: ExportGenerateMetadata | null;
  error: string | null;
}

const IDLE_STATE: ExportGenerateState = {
  status: 'idle',
  insightCount: null,
  totalInsights: null,
  content: null,
  metadata: null,
  error: null,
};

/**
 * Hook for LLM-powered cross-session export generation via SSE streaming.
 * Uses fetch() + ReadableStream + AbortController (not EventSource).
 * Lives within ExportPage — no context provider needed (single-page state).
 */
export function useExportGenerate() {
  const [state, setState] = useState<ExportGenerateState>(IDLE_STATE);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef(false);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isGeneratingRef.current = false;
    setState(IDLE_STATE);
  }, []);

  const reset = useCallback(() => {
    setState(IDLE_STATE);
  }, []);

  const generate = useCallback(async (params: ExportGenerateRequest) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({
      status: 'loading_insights',
      insightCount: null,
      totalInsights: null,
      content: null,
      metadata: null,
      error: null,
    });

    try {
      const response = await exportGenerateStream(params, controller.signal);

      if (!response.body) {
        throw new Error('No response body for export SSE stream');
      }

      for await (const sseEvent of parseSSEStream(response.body)) {
        if (controller.signal.aborted) return;

        try {
          if (sseEvent.event === 'progress') {
            const progress = JSON.parse(sseEvent.data) as {
              phase: 'loading_insights' | 'synthesizing';
              insightCount?: number;
              totalInsights?: number;
              progress?: string;
            };

            if (progress.phase === 'loading_insights') {
              setState((prev) => ({
                ...prev,
                status: 'loading_insights',
                insightCount: progress.insightCount ?? null,
                totalInsights: progress.totalInsights ?? null,
              }));
            } else if (progress.phase === 'synthesizing') {
              setState((prev) => ({ ...prev, status: 'synthesizing' }));
            }
          } else if (sseEvent.event === 'complete') {
            const result = JSON.parse(sseEvent.data) as {
              content: string;
              metadata: ExportGenerateMetadata;
            };
            setState({
              status: 'complete',
              insightCount: result.metadata.insightCount,
              totalInsights: result.metadata.totalInsights,
              content: result.content,
              metadata: result.metadata,
              error: null,
            });
          } else if (sseEvent.event === 'error') {
            const errorData = JSON.parse(sseEvent.data) as { error: string };
            setState({
              status: 'error',
              insightCount: null,
              totalInsights: null,
              content: null,
              metadata: null,
              error: errorData.error,
            });
          }
        } catch {
          // Malformed SSE event data — skip and continue
          continue;
        }
      }

      // Stream ended without a terminal event
      if (!controller.signal.aborted) {
        setState((prev) => {
          if (prev.status === 'loading_insights' || prev.status === 'synthesizing') {
            return { ...prev, status: 'error', error: 'Export stream closed unexpectedly' };
          }
          return prev;
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Export failed';
      setState({
        status: 'error',
        insightCount: null,
        totalInsights: null,
        content: null,
        metadata: null,
        error: message,
      });
    } finally {
      abortControllerRef.current = null;
      isGeneratingRef.current = false;
    }
  }, []);

  return { state, generate, cancel, reset };
}
