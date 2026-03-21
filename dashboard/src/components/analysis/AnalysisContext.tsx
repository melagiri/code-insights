/**
 * Analysis context for the embedded dashboard.
 * Consumes SSE streaming endpoints for real-time progress and cancellation.
 * Uses fetch() + ReadableStream (not EventSource) for AbortController support.
 *
 * State model: Map<analysisKey, AnalysisState> where analysisKey = `${sessionId}:${type}`.
 * Each analysis entry owns its own AbortController — multiple analyses can run concurrently.
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
import { parseSSEStream } from '@/lib/sse';

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
    costUsd?: number;
    provider?: string;
    model?: string;
    error?: string;
  } | null;
}

type AnalysisType = 'session' | 'prompt_quality';

function makeKey(sessionId: string, type: AnalysisType): string {
  return `${sessionId}:${type}`;
}

function makeToastId(sessionId: string, type: AnalysisType): string {
  return `analysis-${sessionId}-${type}`;
}

interface AnalysisContextValue {
  analyses: Map<string, AnalysisState>;
  getAnalysisState: (sessionId: string, type: AnalysisType) => AnalysisState | undefined;
  startAnalysis: (session: Session, type: AnalysisType) => Promise<void>;
  cancelAnalysis: (sessionId: string, type: AnalysisType) => void;
  clearResult: (sessionId: string, type: AnalysisType) => void;
}

const AnalysisContext = createContext<AnalysisContextValue>({
  analyses: new Map(),
  getAnalysisState: () => undefined,
  startAnalysis: async () => {},
  cancelAnalysis: () => {},
  clearResult: () => {},
});

export function useAnalysis() {
  return useContext(AnalysisContext);
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
  const [analyses, setAnalyses] = useState<Map<string, AnalysisState>>(new Map());
  const queryClient = useQueryClient();
  // Map of analysisKey → AbortController for concurrent cancellation
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const getAnalysisState = useCallback(
    (sessionId: string, type: AnalysisType): AnalysisState | undefined => {
      return analyses.get(makeKey(sessionId, type));
    },
    [analyses]
  );

  const cancelAnalysis = useCallback((sessionId: string, type: AnalysisType) => {
    const key = makeKey(sessionId, type);
    abortControllersRef.current.get(key)?.abort();
    abortControllersRef.current.delete(key);
    setAnalyses((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    toast.info('Analysis cancelled', { id: makeToastId(sessionId, type), duration: 2000 });
  }, []);

  const clearResult = useCallback((sessionId: string, type: AnalysisType) => {
    const key = makeKey(sessionId, type);
    setAnalyses((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const startAnalysis = useCallback(
    async (session: Session, type: AnalysisType) => {
      const key = makeKey(session.id, type);
      const toastId = makeToastId(session.id, type);
      const sessionTitle = getSessionTitle(session);
      const controller = new AbortController();

      abortControllersRef.current.set(key, controller);

      setAnalyses((prev) => {
        const next = new Map(prev);
        next.set(key, {
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
        return next;
      });

      toast.loading(`Loading messages for "${sessionTitle}"...`, { id: toastId });

      const endpoint =
        type === 'session'
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
              setAnalyses((prev) => {
                const next = new Map(prev);
                const entry = next.get(key);
                if (entry) next.set(key, { ...entry, progress });
                return next;
              });
              toast.loading(toastMsg, { id: toastId });
            } else if (sseEvent.event === 'complete') {
              const result = JSON.parse(sseEvent.data) as {
                success: boolean;
                insightCount: number;
                tokenUsage?: { inputTokens: number; outputTokens: number };
                costUsd?: number;
                provider?: string;
                model?: string;
              };

              queryClient.invalidateQueries({ queryKey: ['insights'] });
              queryClient.invalidateQueries({ queryKey: ['session', session.id] });
              queryClient.invalidateQueries({ queryKey: ['sessions'] });
              queryClient.invalidateQueries({ queryKey: ['analysis-cost', session.id] });

              const successMsg = `${result.insightCount} insight${result.insightCount !== 1 ? 's' : ''} saved for "${sessionTitle}"`;

              setAnalyses((prev) => {
                const next = new Map(prev);
                next.set(key, {
                  status: 'complete',
                  sessionId: session.id,
                  sessionTitle,
                  type,
                  progress: null,
                  result: {
                    success: true,
                    insightCount: result.insightCount,
                    tokenUsage: result.tokenUsage,
                    costUsd: result.costUsd,
                    provider: result.provider,
                    model: result.model,
                  },
                });
                return next;
              });
              toast.success(successMsg, { id: toastId });
            } else if (sseEvent.event === 'error') {
              const errorData = JSON.parse(sseEvent.data) as { error: string };
              setAnalyses((prev) => {
                const next = new Map(prev);
                next.set(key, {
                  status: 'error',
                  sessionId: session.id,
                  sessionTitle,
                  type,
                  progress: null,
                  result: { success: false, error: errorData.error },
                });
                return next;
              });
              toast.error(`Analysis failed: ${errorData.error}`, { id: toastId });
            }
          } catch {
            // Malformed SSE event data — skip and continue
            continue;
          }
        }

        // Stream ended — if no terminal event was received, treat as unexpected close
        if (!controller.signal.aborted) {
          setAnalyses((prev) => {
            const entry = prev.get(key);
            if (entry?.status === 'analyzing') {
              toast.error('Analysis connection closed unexpectedly', { id: toastId });
              const next = new Map(prev);
              next.set(key, {
                ...entry,
                status: 'error',
                progress: null,
                result: { success: false, error: 'Connection closed unexpectedly' },
              });
              return next;
            }
            return prev;
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const errorMsg = error instanceof Error ? error.message : 'Analysis failed';
        setAnalyses((prev) => {
          const next = new Map(prev);
          next.set(key, {
            status: 'error',
            sessionId: session.id,
            sessionTitle,
            type,
            progress: null,
            result: { success: false, error: errorMsg },
          });
          return next;
        });
        toast.error(`Analysis failed: ${errorMsg}`, { id: toastId });
      } finally {
        abortControllersRef.current.delete(key);
      }
    },
    [queryClient]
  );

  return (
    <AnalysisContext.Provider value={{ analyses, getAnalysisState, startAnalysis, cancelAnalysis, clearResult }}>
      {children}
    </AnalysisContext.Provider>
  );
}
