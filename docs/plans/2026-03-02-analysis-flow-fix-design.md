# Design: Fix Dashboard Analysis Flow

> **Date:** 2026-03-02
> **Status:** Approved (TA + UX reviewed)
> **Scope:** Server SSE endpoints + Dashboard AnalysisContext rewrite + bug fixes

---

## Problem

The CLI dashboard's analysis flow has two critical bugs and several missing features compared to the original web repo implementation (deleted in PR #104 of code-insights-web):

1. **AnalysisProvider not in React tree** — `useAnalysis()` returns the default no-op context, so clicking "Analyze" calls `async () => {}`. Silent no-op.
2. **Global polling every 5 seconds** — `refetchInterval: 5000` in `main.tsx` causes every React Query hook to re-fetch constantly. On session detail pages: 3 endpoints x every 5s = massive waste for immutable data.
3. **No per-chunk progress** — Current state only has `{ message: string }`, no phase/chunk tracking.
4. **Cancel is cosmetic** — Resets React state but server continues processing the LLM call.
5. **No insight count or token usage** — Success message is generic "Analysis complete!".
6. **AI title suggestion broken** — Banner UI exists but never triggers because `result.insights` is never populated.

## Design

### Fix 1: Add AnalysisProvider to React Tree

**File:** `dashboard/src/main.tsx`

Wrap `<App />` with `<AnalysisProvider>` inside `QueryClientProvider` (uses `useQueryClient`):

```tsx
<QueryClientProvider client={queryClient}>
  <ThemeProvider defaultTheme="system">
    <AnalysisProvider>
      <App />
    </AnalysisProvider>
  </ThemeProvider>
</QueryClientProvider>
```

Placed in `main.tsx` (not `Layout.tsx`) so analysis state survives route transitions.

### Fix 2: Remove Global Polling

**File:** `dashboard/src/main.tsx`

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
```

- Remove `refetchInterval: 5000` entirely
- Set `staleTime: 30_000` (local SQLite data, only changes on sync or analysis)
- `refetchOnWindowFocus: true` is React Query's default — handles the "user tabs back" case
- Data freshness after mutations handled by `queryClient.invalidateQueries()` (already in place)
- No polling anywhere, not even dashboard stats

### Fix 3: SSE Streaming Analysis Endpoints

**File:** `server/src/routes/analysis.ts`

Add two new GET streaming routes alongside existing POST routes:

- `GET /api/analysis/session/stream?sessionId=X`
- `GET /api/analysis/prompt-quality/stream?sessionId=X`

Existing POST endpoints remain unchanged (backward compatible).

**Implementation:** Uses Hono's `streamSSE` helper from `hono/streaming`.

**SSE Event Format:**

```
event: progress
data: {"phase":"loading_messages","message":"Loading messages..."}

event: progress
data: {"phase":"analyzing","currentChunk":1,"totalChunks":3,"message":"Analyzing... (1 of 3)"}

event: progress
data: {"phase":"saving","message":"Saving insights..."}

event: complete
data: {"success":true,"insightCount":5,"tokenUsage":{"inputTokens":12345,"outputTokens":1234},"suggestedTitle":"Refactored auth middleware"}

event: error
data: {"error":"Failed to parse LLM response"}
```

**Type definitions** (server-side):

```typescript
type SSEProgressEvent = AnalysisProgress & { message: string };
type SSECompleteEvent = {
  success: boolean;
  insightCount: number;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  suggestedTitle?: string | null;
};
type SSEErrorEvent = { error: string };
```

Uses existing `AnalysisProgress` type from `server/src/llm/analysis.ts` — no new types needed in the analysis engine.

**Cancellation:** `c.req.raw.signal` detects client disconnect. Signal passed through `AnalysisOptions.signal` to the LLM `fetch()` calls. When client closes the connection, server aborts the in-flight LLM request.

**Key decisions (TA):**
- Use `tokenUsage: { inputTokens, outputTokens }` consistently (matches server-side `AnalysisResult` type)
- Send `suggestedTitle` in complete event instead of full `insights[]` — React Query invalidation fetches canonical data
- No new dependencies — `hono/streaming` is part of core `hono` package

### Fix 4: Enhanced AnalysisContext

**File:** `dashboard/src/components/analysis/AnalysisContext.tsx`

Rewrite with SSE consumer. Enhanced state:

```typescript
interface AnalysisState {
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
```

**SSE consumer:** Uses `fetch()` + `ReadableStream` (not `EventSource`):
- Better AbortController support — `signal` passed to `fetch()`
- No auto-reconnect (we don't want it for one-shot analysis)
- Proper SSE line-buffer parsing with `TextDecoderStream`

**Real cancellation:** `abortControllerRef.current.abort()` + `isAnalyzingRef` guard (matches web repo pattern).

**Cancel UX:** Show `toast.info('Analysis cancelled')` on cancel (2s duration).

**AbortError guard:**

```typescript
} catch (error) {
  if (controller.signal.aborted) {
    toast.dismiss(ANALYSIS_TOAST_ID);
    setState(IDLE_STATE);
    return;
  }
  // Real error — show error state
}
```

### Fix 5: AI Title Suggestion

**File:** `dashboard/src/pages/SessionDetailPage.tsx`

Read `suggestedTitle` directly from AnalysisContext (UX recommendation):

```tsx
const { state: analysisState } = useAnalysis();
const contextSuggestedTitle = analysisState.status === 'complete'
  && analysisState.sessionId === id
  && analysisState.result?.suggestedTitle;

// Use contextSuggestedTitle || local suggestedTitle state
```

Remove `onTitleSuggestion` prop from `AnalyzeDropdown` and `AnalyzeButton` — simplifies both components.

**Banner:** Persists until user clicks Apply or Dismiss (no auto-dismiss). Add slide-in transition (`transition-all duration-300`).

### Fix 6: UX Polish (from UX review)

- **Progress text:** Drop session title from inline button state (redundant on page); keep in toast
- **Chunk format:** "2 of 4" instead of "2/4"
- **Blocking state:** Show which session is blocking: `Waiting for "Session Title" to finish`
- **Empty state CTA:** Use `AnalyzeButton` in the overview empty state (richer inline feedback), `AnalyzeDropdown` in the header (compact)
- **Success toast:** `"N insights saved for 'Session Title'"` (no token usage in toast — too technical)

## Files Affected

| File | Change |
|------|--------|
| `server/src/routes/analysis.ts` | Add SSE streaming endpoints |
| `dashboard/src/main.tsx` | Add AnalysisProvider, remove global polling |
| `dashboard/src/components/analysis/AnalysisContext.tsx` | Rewrite with SSE consumer |
| `dashboard/src/components/analysis/AnalyzeDropdown.tsx` | Remove `onTitleSuggestion` prop, improve blocking state message |
| `dashboard/src/components/analysis/AnalyzeButton.tsx` | Remove `onTitleSuggestion` prop |
| `dashboard/src/pages/SessionDetailPage.tsx` | Read suggestedTitle from context, use AnalyzeButton in empty state, banner animation |
| `dashboard/src/lib/api.ts` | Type the `analyzeSession`/`analyzePromptQuality` return types (existing POST endpoints) |

**No changes needed:**
- `server/src/llm/analysis.ts` — already has `AnalysisOptions` with `onProgress` + `signal`
- `cli/src/types.ts` — no type definition changes
- SQLite schema — no changes

## Implementation Order

1. Fix 1 + Fix 2 (AnalysisProvider + polling) — immediate bug fixes, unblocks Analyze button with existing POST flow
2. Fix 3 (SSE endpoints on server) — server-side only
3. Fix 4 (Enhanced AnalysisContext with SSE consumer) — depends on Fix 3
4. Fix 5 + Fix 6 (Title suggestion + polish) — depends on Fix 4

## Post-Implementation Verification

- Manually verify SSE abort propagation: start analysis, close browser tab, check server logs confirm LLM call was cancelled
- Test chunk progress with a large session (>80k estimated tokens)
- Test with all 4 LLM providers (OpenAI, Anthropic, Gemini, Ollama)
- Verify `refetchOnWindowFocus` refreshes data on tab switch
