/**
 * Analysis context for the embedded dashboard.
 * Consumes SSE streaming endpoints for real-time progress and cancellation.
 * Uses fetch() + ReadableStream (not EventSource) for AbortController support.
 */
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSessionTitle } from '@/lib/utils';
import type { Session } from '@/lib/types';
import { toast } from 'sonner';

const ANALYSIS_TOAST_ID = 'analysis-toast';

export interface AnalysisState {
  status: 'idle' | 'analyzing' | 'complete' | 'error';
  sessionId: string | null;
  sessionTitle: string | null;
  type: 'session' | 'prompt_quality';
  progress: {
    phase: 'loading_messages' | 'analyzing' | 'saving';
    currentChunk?: number;
    totalChunks?: number;
    message: string;
  } | null;
  result: {
    success: boolean;
    insightCount?: number;
    tokenUsage?: { inputTokens: number; outputTokens: number };
    suggestedTitle?: string | null;
    error?: string;
  } | null;
}

interface AnalysisContextValue {
  state: AnalysisState;
  startAnalysis: (session: Session, type: 'session' | 'prompt_quality') => Promise<void>;
  cancelAnalysis: () => void;
  clearResult: () => void;
}

const IDLE_STATE: AnalysisState = {
  status: 'idle',
  sessionId: null,
  sessionTitle: null,
  type: 'session',
  progress: null,
  result: null,
};

const AnalysisContext = createContext<AnalysisContextValue>({
  state: IDLE_STATE,
  startAnalysis: async () => {},
  cancelAnalysis: () => {},
  clearResult: () => {},
});

export function useAnalysis() {
  return useContext(AnalysisContext);
}

/**
 * Parse SSE events from a ReadableStream response body.
 * Handles partial chunks by buffering lines until a complete event is received.
 */
async function* parseSSEStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          yield { event: currentEvent, data: currentData };
          currentEvent = '';
          currentData = '';
        }
      }
    }
    // Flush any remaining buffered event
    if (currentEvent && currentData) {
      yield { event: currentEvent, data: currentData };
    }
  } finally {
    reader.releaseLock();
  }
}

function buildToastMessage(
  sessionTitle: string,
  phase: string,
  currentChunk?: number,
  totalChunks?: number
): string {
  if (phase === 'loading_messages') {
    return `Loading messages for "${sessionTitle}"...`;
  }
  if (phase === 'saving') {
    return `Saving insights for "${sessionTitle}"...`;
  }
  if (currentChunk !== undefined && totalChunks !== undefined) {
    return `Analyzing "${sessionTitle}"... (${currentChunk} of ${totalChunks})`;
  }
  return `Analyzing "${sessionTitle}"...`;
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AnalysisState>(IDLE_STATE);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAnalyzingRef = useRef(false);

  const cancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isAnalyzingRef.current = false;
    setState(IDLE_STATE);
    toast.info('Analysis cancelled', { id: ANALYSIS_TOAST_ID, duration: 2000 });
  }, []);

  const clearResult = useCallback(() => {
    setState(IDLE_STATE);
  }, []);

  const startAnalysis = useCallback(
    async (session: Session, type: 'session' | 'prompt_quality') => {
      if (isAnalyzingRef.current) {
        toast.warning('Analysis already in progress. Please wait or cancel it first.');
        return;
      }
      isAnalyzingRef.current = true;

      const sessionTitle = getSessionTitle(session);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setState({
        status: 'analyzing',
        sessionId: session.id,
        sessionTitle,
        type,
        progress: {
          phase: 'loading_messages',
          message: 'Loading messages...',
        },
        result: null,
      });

      toast.loading(`Loading messages for "${sessionTitle}"...`, {
        id: ANALYSIS_TOAST_ID,
      });

      const endpoint = type === 'session'
        ? `/api/analysis/session/stream?sessionId=${encodeURIComponent(session.id)}`
        : `/api/analysis/prompt-quality/stream?sessionId=${encodeURIComponent(session.id)}`;

      try {
        const response = await fetch(endpoint, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => response.statusText);
          throw new Error(`API ${response.status}: ${text}`);
        }

        if (!response.body) {
          throw new Error('No response body for SSE stream');
        }

        for await (const sseEvent of parseSSEStream(response.body)) {
          if (controller.signal.aborted) return;

          try {
            if (sseEvent.event === 'progress') {
              const progress = JSON.parse(sseEvent.data) as {
                phase: 'loading_messages' | 'analyzing' | 'saving';
                currentChunk?: number;
                totalChunks?: number;
                message: string;
              };
              const toastMsg = buildToastMessage(
                sessionTitle,
                progress.phase,
                progress.currentChunk,
                progress.totalChunks
              );
              setState((prev) => ({ ...prev, progress }));
              toast.loading(toastMsg, { id: ANALYSIS_TOAST_ID });
            } else if (sseEvent.event === 'complete') {
              const result = JSON.parse(sseEvent.data) as {
                success: boolean;
                insightCount: number;
                tokenUsage?: { inputTokens: number; outputTokens: number };
                suggestedTitle?: string | null;
              };

              queryClient.invalidateQueries({ queryKey: ['insights'] });
              queryClient.invalidateQueries({ queryKey: ['session', session.id] });

              const successMsg = `${result.insightCount} insight${result.insightCount !== 1 ? 's' : ''} saved for "${sessionTitle}"`;

              setState({
                status: 'complete',
                sessionId: session.id,
                sessionTitle,
                type,
                progress: null,
                result: {
                  success: true,
                  insightCount: result.insightCount,
                  tokenUsage: result.tokenUsage,
                  suggestedTitle: result.suggestedTitle,
                },
              });
              toast.success(successMsg, { id: ANALYSIS_TOAST_ID });
            } else if (sseEvent.event === 'error') {
              const errorData = JSON.parse(sseEvent.data) as { error: string };
              setState({
                status: 'error',
                sessionId: session.id,
                sessionTitle,
                type,
                progress: null,
                result: { success: false, error: errorData.error },
              });
              toast.error(`Analysis failed: ${errorData.error}`, { id: ANALYSIS_TOAST_ID });
            }
          } catch {
            // Malformed SSE event data — skip and continue
            continue;
          }
        }

        // Stream ended — if no terminal event was received, treat as unexpected close
        if (!controller.signal.aborted) {
          setState((prev) => {
            if (prev.status === 'analyzing') {
              toast.error('Analysis connection closed unexpectedly', { id: ANALYSIS_TOAST_ID });
              return {
                ...prev,
                status: 'error',
                progress: null,
                result: { success: false, error: 'Connection closed unexpectedly' },
              };
            }
            return prev;
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const errorMsg = error instanceof Error ? error.message : 'Analysis failed';
        setState({
          status: 'error',
          sessionId: session.id,
          sessionTitle,
          type,
          progress: null,
          result: { success: false, error: errorMsg },
        });
        toast.error(`Analysis failed: ${errorMsg}`, { id: ANALYSIS_TOAST_ID });
      } finally {
        abortControllerRef.current = null;
        isAnalyzingRef.current = false;
      }
    },
    [queryClient]
  );

  return (
    <AnalysisContext.Provider value={{ state, startAnalysis, cancelAnalysis, clearResult }}>
      {children}
    </AnalysisContext.Provider>
  );
}
