# Analysis Flow Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the dashboard analysis flow — make the Analyze button work, stop infinite polling, add SSE streaming with real progress/cancellation, and restore parity with the web repo's analysis UX.

**Architecture:** Add SSE streaming GET endpoints to the Hono server (using `hono/streaming`'s `streamSSE`), rewrite the dashboard `AnalysisContext` to consume SSE via `fetch()` + `ReadableStream` with `AbortController`, and fix two critical bugs (missing provider, global polling).

**Tech Stack:** Hono SSE streaming, React Context + refs, fetch ReadableStream, Sonner toasts, React Query invalidation

**Design doc:** `docs/plans/2026-03-02-analysis-flow-fix-design.md`

---

## Task 1: Fix Critical Bugs (AnalysisProvider + Polling)

**Files:**
- Modify: `dashboard/src/main.tsx`
- Modify: `dashboard/src/hooks/useConfig.ts` (remove now-redundant `refetchInterval: false` override)

**Step 1: Fix `main.tsx` — add AnalysisProvider and remove global polling**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { AnalysisProvider } from '@/components/analysis/AnalysisContext';
import App from './App';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        <AnalysisProvider>
          <App />
        </AnalysisProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

Changes from current:
- Added `AnalysisProvider` import and wrapping `<App />`
- Removed `refetchInterval: 5000` and comment
- Changed `staleTime: 4000` → `staleTime: 30_000`

**Step 2: Clean up `useConfig.ts` — remove now-redundant override**

Remove `refetchInterval: false` from `useLlmConfig()` since the global default no longer has polling:

```typescript
export function useLlmConfig() {
  return useQuery({
    queryKey: ['config', 'llm'],
    queryFn: () => fetchLlmConfig(),
  });
}
```

**Step 3: Build and verify**

Run: `cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build`
Expected: Build succeeds across all three packages.

**Step 4: Manual verification**

1. Open `http://localhost:7890/sessions/<any-session-id>`
2. Check Network tab — no repeated polling requests every 5s
3. Click "Analyze" button — should now trigger the POST `/api/analysis/session` (existing flow works since AnalysisProvider is now in the tree)
4. Check console — no errors

**Step 5: Commit**

```bash
git add dashboard/src/main.tsx dashboard/src/hooks/useConfig.ts
git commit -m "fix: add AnalysisProvider to React tree and remove global polling

AnalysisProvider was never wrapped in the component tree, causing all
useAnalysis() calls to return the default no-op context. The Analyze
button silently called an empty function.

Global refetchInterval: 5000 caused every React Query hook to re-fetch
every 5 seconds for immutable session data. Replaced with staleTime:
30s and refetchOnWindowFocus (React Query default)."
```

---

## Task 2: Add SSE Streaming Endpoints to Server

**Files:**
- Modify: `server/src/routes/analysis.ts`

**Step 1: Add the SSE streaming session analysis endpoint**

Add this route AFTER the existing `app.post('/session', ...)` (around line 46):

```typescript
import { streamSSE } from 'hono/streaming';
```

Add at top of file with other imports.

Then add the route:

```typescript
// GET /api/analysis/session/stream?sessionId=X
// SSE endpoint — streams progress events during session analysis.
app.get('/session/stream', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Missing required query param: sessionId' }, 400);
  }

  const db = getDb();

  const session = db.prepare(`
    SELECT id, project_id, project_name, project_path, summary, ended_at
    FROM sessions WHERE id = ?
  `).get(sessionId) as SessionData | undefined;

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = db.prepare(`
    SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages WHERE session_id = ? ORDER BY timestamp ASC
  `).all(sessionId) as SQLiteMessageRow[];

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;

    await stream.writeSSE({
      event: 'progress',
      data: JSON.stringify({ phase: 'loading_messages', message: 'Loading messages...' }),
    });

    const result = await analyzeSession(session, messages, {
      signal: abortSignal,
      onProgress: async (progress) => {
        const message = progress.phase === 'saving'
          ? 'Saving insights...'
          : progress.currentChunk && progress.totalChunks
            ? `Analyzing... (${progress.currentChunk} of ${progress.totalChunks})`
            : 'Analyzing...';
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ ...progress, message }),
        });
      },
    });

    if (result.success) {
      const summaryInsight = result.insights.find(i => i.type === 'summary');
      if (result.success) trackEvent('analysis', true, 'session');
      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({
          success: true,
          insightCount: result.insights.length,
          tokenUsage: result.usage,
          suggestedTitle: summaryInsight?.title ?? null,
        }),
      });
    } else {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: result.error ?? 'Analysis failed' }),
      });
    }
  });
});
```

**Step 2: Add the SSE streaming prompt quality endpoint**

Add AFTER the existing `app.post('/prompt-quality', ...)` (around line 83):

```typescript
// GET /api/analysis/prompt-quality/stream?sessionId=X
// SSE endpoint — streams progress events during prompt quality analysis.
app.get('/prompt-quality/stream', async (c) => {
  if (!isLLMConfigured()) {
    return c.json({
      success: false,
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    }, 400);
  }

  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Missing required query param: sessionId' }, 400);
  }

  const db = getDb();

  const session = db.prepare(`
    SELECT id, project_id, project_name, project_path, summary, ended_at
    FROM sessions WHERE id = ?
  `).get(sessionId) as SessionData | undefined;

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const messages = db.prepare(`
    SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages WHERE session_id = ? ORDER BY timestamp ASC
  `).all(sessionId) as SQLiteMessageRow[];

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;

    await stream.writeSSE({
      event: 'progress',
      data: JSON.stringify({ phase: 'loading_messages', message: 'Loading messages...' }),
    });

    const result = await analyzePromptQuality(session, messages, {
      signal: abortSignal,
      onProgress: async (progress) => {
        const message = progress.phase === 'saving'
          ? 'Saving insights...'
          : 'Analyzing prompt quality...';
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ ...progress, message }),
        });
      },
    });

    if (result.success) {
      if (result.success) trackEvent('analysis', true, 'prompt-quality');
      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({
          success: true,
          insightCount: result.insights.length,
          tokenUsage: result.usage,
          suggestedTitle: null,
        }),
      });
    } else {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: result.error ?? 'Prompt quality analysis failed' }),
      });
    }
  });
});
```

**Step 3: Add missing import for SessionData type**

The `SessionData` type is already imported via the existing routes. Verify the import at the top of the file includes it:

```typescript
import { analyzeSession, analyzePromptQuality, findRecurringInsights } from '../llm/analysis.js';
```

And `SessionData` is used via the `as SessionData` cast already in the file. Just need to add the `streamSSE` import:

```typescript
import { streamSSE } from 'hono/streaming';
```

**Step 4: Build and verify**

Run: `cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build`
Expected: Build succeeds. The SSE endpoints exist but are not consumed yet.

**Step 5: Quick curl test**

```bash
curl -N "http://localhost:7890/api/analysis/session/stream?sessionId=INVALID" 2>/dev/null
```
Expected: `{"error":"Session not found"}` with 404 status (validates the endpoint is mounted).

**Step 6: Commit**

```bash
git add server/src/routes/analysis.ts
git commit -m "feat: add SSE streaming endpoints for analysis progress

GET /api/analysis/session/stream and /prompt-quality/stream provide
real-time progress events (loading, analyzing with chunk N of M, saving)
via Server-Sent Events. Supports cancellation through client disconnect
signal propagation to LLM fetch calls. Existing POST endpoints remain
unchanged for backward compatibility."
```

---

## Task 3: Rewrite AnalysisContext with SSE Consumer

**Files:**
- Modify: `dashboard/src/components/analysis/AnalysisContext.tsx` (full rewrite)

**Step 1: Rewrite AnalysisContext.tsx**

Replace the entire file:

```tsx
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
          // Empty line = end of SSE event
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
          // Guard: abort was requested while reading the stream
          if (controller.signal.aborted) return;

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
            setState((prev) => ({
              ...prev,
              progress: { ...progress, message: progress.message },
            }));
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
        }
      } catch (error) {
        // If aborted (user cancelled), ignore the error — cancelAnalysis() already handled state
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
```

Key differences from the old version:
- Uses `isAnalyzingRef` instead of `state.status` to avoid stale closures
- Real `AbortController` passed to `fetch()` — abort closes the SSE connection, server detects it
- `parseSSEStream` async generator handles partial chunks
- Toast messages include session title (for float context) but inline progress uses short messages
- Success toast shows insight count: `"5 insights saved for 'Session Title'"`
- `cancelAnalysis` shows `toast.info('Analysis cancelled')` instead of just dismissing
- `result` includes `suggestedTitle`, `insightCount`, and `tokenUsage`
- Removed the dependency on `state.status` in useCallback deps — uses ref instead

**Step 2: Build and verify**

Run: `cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add dashboard/src/components/analysis/AnalysisContext.tsx
git commit -m "feat: rewrite AnalysisContext with SSE streaming consumer

Replaces the single POST call with SSE stream consumption via
fetch() + ReadableStream. Adds per-chunk progress tracking, real
AbortController cancellation, token usage in result state, and
suggestedTitle for AI title suggestion. Uses refs to avoid stale
closures in async callbacks."
```

---

## Task 4: UX Polish — Components and SessionDetailPage

**Files:**
- Modify: `dashboard/src/components/analysis/AnalyzeDropdown.tsx`
- Modify: `dashboard/src/components/analysis/AnalyzeButton.tsx`
- Modify: `dashboard/src/pages/SessionDetailPage.tsx`

**Step 1: Update AnalyzeDropdown.tsx — remove onTitleSuggestion, improve blocking state**

Changes:
1. Remove `onTitleSuggestion` from props interface
2. Update inline progress to show short messages (no session title — redundant on page)
3. Show which session is blocking in the "analyzing other" state

In the interface, remove `onTitleSuggestion`:

```typescript
interface AnalyzeDropdownProps {
  session: Session;
  hasExistingInsights?: boolean;
  insightCount?: number;
  hasExistingPromptQuality?: boolean;
}
```

Update the destructured props:

```typescript
export function AnalyzeDropdown({
  session,
  hasExistingInsights,
  insightCount,
  hasExistingPromptQuality,
}: AnalyzeDropdownProps) {
```

Remove unused imports: `useEffect` from line 1 (already unused).

Update the `isAnalyzingThisSession` inline progress display (lines 95-115) — the `analysisState.progress?.message` already contains the short inline message from the context. Keep as-is since the context now provides proper phase messages.

Update the `isAnalyzingOther` block (lines 118-125) to show which session is blocking:

```tsx
  if (isAnalyzingOther) {
    return (
      <div className="flex items-center gap-1.5">
        <Button disabled variant="outline" size="sm" className="h-8 gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analysis in progress...
        </Button>
        <span className="text-xs text-muted-foreground">
          Waiting for &quot;{analysisState.sessionTitle}&quot;
        </span>
      </div>
    );
  }
```

**Step 2: Update AnalyzeButton.tsx — remove onTitleSuggestion**

Remove `onTitleSuggestion` from props:

```typescript
interface AnalyzeButtonProps {
  session: Session;
  hasExistingInsights?: boolean;
  insightCount?: number;
}
```

Update destructured props:

```typescript
export function AnalyzeButton({ session, hasExistingInsights, insightCount }: AnalyzeButtonProps) {
```

Update the `isAnalyzingOther` block (lines 93-107) to show which session is blocking:

```tsx
  if (isAnalyzingOther) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button disabled variant="outline" className="gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analysis in progress...
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Waiting for &quot;{analysisState.sessionTitle}&quot; to finish
        </p>
      </div>
    );
  }
```

Update the success message (lines 143-146) to show insight count from context:

```tsx
      {isCompleteForThisSession && analysisState.result?.success && (
        <div className="text-sm text-green-600">
          Analysis complete! {analysisState.result.insightCount ?? ''} insight{(analysisState.result.insightCount ?? 0) !== 1 ? 's' : ''} saved.
        </div>
      )}
```

**Step 3: Update SessionDetailPage.tsx — title suggestion from context, use AnalyzeButton in empty state**

Changes:
1. Read `suggestedTitle` from AnalysisContext directly
2. Remove `onTitleSuggestion` prop from both AnalyzeDropdown usages
3. Use `AnalyzeButton` in the empty state CTA
4. Add slide-in animation for the title banner

Add import for `useAnalysis` and `AnalyzeButton`:

```typescript
import { useAnalysis } from '@/components/analysis/AnalysisContext';
import { AnalyzeButton } from '@/components/analysis/AnalyzeButton';
```

Inside the component, after `const [suggestedTitle, setSuggestedTitle]`:

Replace the `suggestedTitle` state with context-derived value:

```typescript
const { state: analysisState } = useAnalysis();

// AI title suggestion: read from analysis context when complete for this session
const contextSuggestedTitle =
  analysisState.status === 'complete' &&
  analysisState.sessionId === id &&
  analysisState.type === 'session' &&
  analysisState.result?.suggestedTitle
    ? analysisState.result.suggestedTitle
    : null;

// Merge: context suggestion takes precedence, local state persists for Apply/Dismiss
const effectiveSuggestedTitle = contextSuggestedTitle ?? suggestedTitle;
```

Update the banner to use `effectiveSuggestedTitle`:

```tsx
      {effectiveSuggestedTitle && effectiveSuggestedTitle !== getSessionTitle(session) && (
        <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-2.5 border-b bg-muted/50 transition-all duration-300">
```

Update the Apply button to use `effectiveSuggestedTitle`:

```tsx
              await sessionMutation.mutateAsync({
                id: session.id,
                customTitle: effectiveSuggestedTitle!,
              });
```

Update the Dismiss button to clear both:

```tsx
              onClick={() => {
                setSuggestedTitle(null);
                if (analysisState.result?.suggestedTitle) {
                  // Clear the context result so banner doesn't reappear
                  // (clearResult is available from useAnalysis)
                }
              }}
```

Actually, simpler approach — just use the local `suggestedTitle` state, populated from context via useEffect:

```typescript
const { state: analysisState, clearResult } = useAnalysis();

// Populate suggestedTitle from analysis context when complete
useEffect(() => {
  if (
    analysisState.status === 'complete' &&
    analysisState.sessionId === id &&
    analysisState.type === 'session' &&
    analysisState.result?.suggestedTitle
  ) {
    setSuggestedTitle(analysisState.result.suggestedTitle);
  }
}, [analysisState, id]);
```

This approach lets the banner persist via local state even if analysis context is cleared. The Apply/Dismiss buttons just clear local `setSuggestedTitle(null)`.

Remove `onTitleSuggestion={setSuggestedTitle}` from both AnalyzeDropdown usages (line 232 and line 493).

Replace the empty state CTA (lines 489-498) with `AnalyzeButton`:

```tsx
                <div className="pt-2">
                  <AnalyzeButton
                    session={session}
                    hasExistingInsights={false}
                    insightCount={0}
                  />
                </div>
```

Keep the header AnalyzeDropdown as-is (compact):

```tsx
            <AnalyzeDropdown
              session={session}
              hasExistingInsights={nonPromptInsights.length > 0}
              insightCount={nonPromptInsights.length}
              hasExistingPromptQuality={hasPromptQuality}
            />
```

**Step 4: Build and verify**

Run: `cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build`
Expected: Build succeeds.

**Step 5: Manual verification**

1. Open a session with no insights → "Analyze Session" button (AnalyzeButton) appears in empty state
2. Click Analyze → loading toast with "Loading messages for 'Title'..."
3. Progress updates in real-time in toast (chunk N of M for large sessions)
4. On complete → "N insights saved for 'Title'" toast
5. If analysis produced a summary insight → title suggestion banner slides in
6. Navigate to different session during analysis → "Analysis in progress... Waiting for 'Title'" shown
7. Click Cancel during analysis → "Analysis cancelled" info toast, server aborts LLM call

**Step 6: Commit**

```bash
git add dashboard/src/components/analysis/AnalyzeDropdown.tsx \
       dashboard/src/components/analysis/AnalyzeButton.tsx \
       dashboard/src/pages/SessionDetailPage.tsx
git commit -m "feat: UX polish for analysis flow

- Remove onTitleSuggestion prop threading — read from AnalysisContext
  directly via useEffect in SessionDetailPage
- Show which session is blocking in 'analyzing other' state
- Use AnalyzeButton in empty state CTA for richer inline feedback
- Show insight count in success message
- Add transition animation for title suggestion banner"
```

---

## Task 5: Type the API Return Types

**Files:**
- Modify: `dashboard/src/lib/api.ts`

**Step 1: Add proper return types for analysis functions**

Update the analysis API functions to have typed returns (currently `unknown`):

```typescript
// ── Analysis (Phase 4) ────────────────────────────────────────────────────────

export interface AnalysisApiResult {
  success: boolean;
  insights?: Array<{ id: string; type: string; title: string }>;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export function analyzeSession(sessionId: string) {
  return request<AnalysisApiResult>('/analysis/session', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export function analyzePromptQuality(sessionId: string) {
  return request<AnalysisApiResult>('/analysis/prompt-quality', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export function findRecurringInsights(body?: { projectId?: string; limit?: number }) {
  return request<{
    success: boolean;
    groups?: Array<{ insightIds: string[]; theme: string }>;
    updatedCount?: number;
    error?: string;
  }>('/analysis/recurring', {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}
```

Note: The AnalysisContext no longer calls these POST functions directly (it uses the SSE endpoints), but BulkAnalyzeButton still uses `analyzeSession()` from the API. Typing it properly helps that component.

**Step 2: Build and verify**

Run: `cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add dashboard/src/lib/api.ts
git commit -m "chore: type analysis API return types

Replace unknown return types with AnalysisApiResult for analyzeSession,
analyzePromptQuality, and findRecurringInsights. BulkAnalyzeButton
benefits from typed responses."
```

---

## Task 6: Final Build Verification and PR

**Step 1: Full workspace build**

Run: `cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build`
Expected: All three packages (cli, server, dashboard) build successfully.

**Step 2: Manual E2E verification checklist**

Start the dashboard: `code-insights dashboard`

Verify each scenario:
- [ ] Session detail page: no repeated polling in Network tab
- [ ] Analyze button on unanalyzed session: triggers SSE analysis flow
- [ ] Progress toast updates through phases (loading → analyzing → saving → complete)
- [ ] Cancel during analysis: info toast, server stops processing
- [ ] After analysis: insight count in success toast
- [ ] After analysis: title suggestion banner appears if summary title differs
- [ ] Title suggestion Apply: renames session
- [ ] Title suggestion Dismiss: banner disappears
- [ ] Navigate away during analysis: other session shows "Waiting for..." state
- [ ] Tab away and return: data refreshes via refetchOnWindowFocus
- [ ] BulkAnalyzeButton still works (uses POST endpoints)
- [ ] Settings page: LLM config still works
- [ ] Dashboard page: stats display correctly (no polling, but data present)

**Step 3: Create PR**

```bash
gh pr create --title "fix: dashboard analysis flow with SSE streaming" --body "$(cat <<'EOF'
## Summary
- Fix AnalysisProvider missing from React tree (Analyze button was a silent no-op)
- Remove global 5s polling (refetchInterval: 5000 → staleTime: 30s + invalidation)
- Add SSE streaming endpoints for real-time analysis progress
- Rewrite AnalysisContext with fetch+ReadableStream SSE consumer
- Real AbortController cancellation (server aborts LLM call on client disconnect)
- AI title suggestion from analysis context
- UX polish: insight count in toast, blocking state shows session name, AnalyzeButton in empty state

## Test plan
- [ ] Verify no polling in Network tab on session detail page
- [ ] Click Analyze → SSE progress events flow through toast
- [ ] Cancel mid-analysis → server aborts, info toast shown
- [ ] Title suggestion banner appears after session analysis
- [ ] BulkAnalyzeButton still works via POST endpoints
- [ ] Dashboard/Sessions/Insights pages load correctly without polling

Closes analysis flow parity gap with web repo (PR #104 deleted the original).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
