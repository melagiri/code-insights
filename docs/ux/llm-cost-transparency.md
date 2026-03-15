# UX Design: LLM Cost Transparency

**Status:** draft
**Date:** 2026-03-15
**Author:** UX Engineer

---

## Problem Statement

Users configure an LLM provider (Anthropic, OpenAI, Gemini, Ollama) and Code Insights makes API calls on their behalf for session analysis, prompt quality evaluation, and facet extraction. Currently there is **zero visibility** into what these calls cost. Users see "This uses LLM tokens" in re-analysis confirmation dialogs, but never learn *how many* tokens or *how much money*.

This creates a trust gap. A local-first, privacy-focused tool should be radically transparent about the one thing it does that costs users money.

## Design Goals

1. **Trust through transparency** -- show costs without making them feel scary
2. **Informed consent** -- users know what they are about to spend before clicking Analyze
3. **Post-hoc accountability** -- users can see what analysis actually cost, per-session and cumulative
4. **Ollama grace** -- Ollama users ($0.00) should feel good about their choice, not see broken/empty states

## What Already Exists (Infrastructure Audit)

**Server-side:**
- `AnalysisResult.usage` already returns `{ inputTokens, outputTokens, cacheCreationTokens?, cacheReadTokens? }` from every analysis call
- `LLMResponse.usage` is populated by all 4 providers (Anthropic, OpenAI, Gemini, Ollama)
- `streamSessionAnalysis` sends `tokenUsage` in the SSE `complete` event
- `AnalysisState.result.tokenUsage` captures `{ inputTokens, outputTokens }` in the dashboard context
- `pricing.ts` has per-model pricing tables and `calculateCost()` utility
- `llm-providers.ts` has `inputCostPer1M` / `outputCostPer1M` on each model option
- `estimateTokens()` exists on `LLMClient` interface (used for chunking decisions)

**Dashboard-side:**
- VitalsStrip shows session cost (the AI coding session cost, not analysis cost)
- StatsHero shows cumulative tokens and cost (session-level, not analysis-level)
- The `complete` SSE event already carries `tokenUsage` -- it is just never displayed

**What is NOT stored today:**
- No persistent record of analysis cost per session (token usage is in SSE event, then discarded)
- No cumulative analysis cost tracking
- No pre-analysis estimation endpoint

---

## Design: Session Detail Page

### Current Layout (for reference)

```
+------------------------------------------------------------------+
| [Session Title]  (outcome dot)  <badge: character>  [Pencil]     |
|                                    [Analyze v] [Export] [Delete]  |
| (clock) Mar 15 · project-name · (branch) main · 47 tools · CC   |
+------------------------------------------------------------------+
| [Insights (4)]  [Prompt Quality 78]  [Conversation (127)]        |
+------------------------------------------------------------------+
|                                                                   |
| +----------+ +-----------+ +----------+ +----------+             |
| | Duration | | Messages  | | Tokens   | | Cost     |             |
| | 1h 23m   | | 127       | | 25.9M    | | $4.82    |  <-- VitalsStrip
| | 7:17-8:40 | | 64u·63a  | | 359 in.. | | sonnet.. |             |
| +----------+ +-----------+ +----------+ +----------+             |
|                                                                   |
| [Summary section...]                                              |
| [Learnings...]                                                    |
| [Decisions...]                                                    |
+------------------------------------------------------------------+
```

### Proposed: Analysis Cost Indicator

Analysis cost lives **below the VitalsStrip**, as a subtle inline element. It does NOT get its own VitalsStrip cell -- the VitalsStrip cells are about the coding session itself ("what happened"), while analysis cost is about Code Insights' own operations ("what we did").

This separation is critical: users should never confuse "this session cost me $4.82 in Claude" with "Code Insights' analysis of this session cost $0.03."

```
+------------------------------------------------------------------+
| INSIGHTS TAB                                                      |
|                                                                   |
| +----------+ +-----------+ +----------+ +----------+             |
| | Duration | | Messages  | | Tokens   | | Cost     |             |
| | 1h 23m   | | 127       | | 25.9M    | | $4.82    |  VitalsStrip
| | 7:17-8:40 | | 64u·63a  | | 359 in.. | | sonnet.. |  (session)
| +----------+ +-----------+ +----------+ +----------+             |
|                                                                   |
|  (sparkles) Analysis cost: $0.03                                  |  @A
|  Sonnet 4 · 82.4K input · 1.8K output                            |
|                                                                   |
| --- (Summary section) ---                                         |
```

**ANNOTATIONS:**

- @A: Analysis cost line. Only appears when analysis has been run (insights exist).
  - Primary: `Analysis cost: $X.XX` -- total across all analysis types run for this session
  - Sublabel: model name, token breakdown (input/output), cache savings if applicable
  - If session has both session analysis AND prompt quality analysis, show combined total
  - Tooltip on hover: per-analysis-type breakdown

**States:**

| State | Display |
|-------|---------|
| No analysis run | Not shown (empty state button in its place, as today) |
| Analysis complete (cloud) | `(sparkles) Analysis cost: $0.03` with sublabel |
| Analysis complete (Ollama) | `(sparkles) Analysis: local (free)` with sublabel showing tokens only |
| Analysis in progress | `(sparkles) Analyzing... cost will appear when complete` |
| Legacy (no stored cost) | `(sparkles) Analysis cost: not tracked` -- one-line, no sublabel |

**Ollama handling:**
```
  (sparkles) Analysis: local (free)
  llama3.2 · 82.4K input · 1.8K output
```
This celebrates the choice rather than showing "$0.00" which feels like missing data.

### Wireframe: Analysis Cost Detail (Tooltip)

When the user hovers/clicks the analysis cost line:

```
+-------------------------------------------+
| Analysis Cost Breakdown                   |
+-------------------------------------------+
| Session Analysis         $0.022           |
|   82.4K input · 1.6K output              |
|   Cache: 78.1K read (saved $0.19)        |
+-------------------------------------------+
| Prompt Quality           $0.008           |
|   82.4K input · 2.1K output              |
|   Cache: 82.0K read (saved $0.21)        |
+-------------------------------------------+
| Facet Extraction         $0.002           |
|   32.1K input · 0.4K output              |
+-------------------------------------------+
| Total                    $0.032           |
+-------------------------------------------+
```

This tooltip uses shadcn `Popover` (not `Tooltip`, since it has structured content). Click-to-open on mobile, hover on desktop.

---

## Design: Pre-Analysis Estimation

### Where It Appears

The estimation appears **inline** in the analyze dropdown, not as a separate confirmation dialog. The goal is "informed consent without friction" -- show the cost, don't force an extra click.

### Current Analyze Dropdown

```
+----------------------------+
| (sparkles) Analyze    (v)  |
+----------------------------+
| (sparkles) Analyze Session |
| (target) Analyze PQ       |
+----------------------------+
```

### Proposed: With Cost Estimates

```
+----------------------------------------------+
| (sparkles) Analyze    (v)                     |
+----------------------------------------------+
| (sparkles) Analyze Session                    |
|   ~$0.02 · 82K input tokens                  |   @B
|                                               |
| (target) Analyze Prompt Quality               |
|   ~$0.01 · same conversation                 |   @C
|   (info) ~90% cheaper if run right after      |   @D
+----------------------------------------------+
```

**ANNOTATIONS:**

- @B: Estimated cost shown as secondary text below each menu item. Calculated client-side using:
  - `session.total_input_tokens` as proxy for conversation size (rough but directional)
  - Current configured model's pricing from the provider info
  - Formula: `(estimatedInputTokens / 1M * inputPrice) + (estimatedOutputTokens / 1M * outputPrice)`
  - Estimated output tokens: ~2000 for session analysis, ~2500 for PQ, ~500 for facets
  - Prefix with `~` to signal estimate, not exact

- @C: For PQ analysis, note "same conversation" to explain why input is similar

- @D: Cache savings hint. Only shown when:
  - Provider is Anthropic (only provider with prompt caching)
  - Session analysis has already been run (so the conversation is cached)
  - PQ analysis has NOT been run yet
  - Text: "~90% cheaper if run right after" (Anthropic cache read is 90% discount)

### Re-analysis Confirmation (Updated)

The existing re-analysis AlertDialog gets a cost line added:

```
+-------------------------------------------+
| Re-analyze this session?                  |
|                                           |
| This will replace 4 existing insights     |
| with new ones.                            |
|                                           |
| Estimated cost: ~$0.02                    |   @E
|                                           |
|                    [Cancel] [Re-analyze]  |
+-------------------------------------------+
```

- @E: Same estimation logic. Adds concrete cost to the "uses LLM tokens" warning.

### Estimation Accuracy

The estimate is intentionally rough. Exact token counts require running `estimateTokens()` on the formatted conversation, which means loading all messages and formatting them. That is too slow for a dropdown.

Instead, use `session.total_input_tokens` (the coding session's own token count) as a heuristic:
- Session analysis input is roughly the conversation transcript, which correlates with session token count
- But the formatted transcript is much shorter than raw API tokens (we strip tool results, truncate thinking)
- Apply a compression factor: `estimatedAnalysisInput = session.total_input_tokens * 0.03` (3% of session tokens, capped at MAX_INPUT_TOKENS)
- This is "order of magnitude" correct, which is all the user needs

If estimation feels too inaccurate in practice, we can add a server endpoint later that does the real `estimateTokens()` call. But start with the cheap heuristic.

---

## Design: Dashboard-Level Cost Overview

### Option A: Extend StatsHero (Recommended)

The StatsHero already shows "Tokens" and "Cost" for the coding sessions. Add a second row or a visual separator for analysis costs.

```
+------------------------------------------------------------------+
| STATS HERO (existing)                                             |
| Sessions | Messages | Tool Calls | Coding Time | Projects        |
| 142      | 8.2k     | 12.4k      | 47h 23m     | 8               |
|                                                                   |
| Tokens   | Cost     |                                             |
| 156.3M   | $287.41  |  <-- This is session cost (coding with AI)  |
+------------------------------------------------------------------+
```

Add a subtle "Analysis" sub-line beneath the existing Cost cell:

```
+------------------------------------------------------------------+
| ...existing StatsHero cells...                                    |
|                                                                   |
| Tokens   | Cost              |                                    |
| 156.3M   | $287.41           |                                    |
|          | (sparkles) +$1.24  |   @F                               |
|          | analysis          |                                    |
+------------------------------------------------------------------+
```

- @F: "+$1.24 analysis" shown below the main cost, in smaller muted text with sparkles icon. This communicates "analysis is additive, not the main cost." Clicking it navigates to a detailed breakdown (see Option B below).

For Ollama users, this line reads: "(sparkles) analysis: free (local)"

### Option B: Settings Page Cost Summary (Future, V2)

A dedicated "Usage & Cost" section on the Settings page, below the LLM configuration:

```
+------------------------------------------------------------------+
| SETTINGS > LLM Configuration                                     |
| [Provider: Anthropic] [Model: Sonnet 4] [API Key: ****]         |
+------------------------------------------------------------------+
|                                                                   |
| USAGE & COST                                    [Last 30 days v] |
+------------------------------------------------------------------+
|                                                                   |
| +-------------------+  +-------------------+                      |
| | Total Analysis    |  | Sessions          |                      |
| | Cost              |  | Analyzed          |                      |
| | $1.24             |  | 89 / 142          |                      |
| | 30-day total      |  | 63%               |                      |
| +-------------------+  +-------------------+                      |
|                                                                   |
| Cost Trend                                                        |
| $0.05 |     *                                                     |
| $0.04 |   * * *     *                                             |
| $0.03 | *     * * * * *                                           |
| $0.02 |               * *                                         |
| $0.01 |                   * *                                     |
|       +---+---+---+---+---+---+                                   |
|       Mar 1       Mar 8     Mar 15                                |
|                                                                   |
| Per-Analysis-Type Breakdown                                       |
| Session Analysis    $0.89  (72%)  ==================              |
| Prompt Quality      $0.31  (25%)  ======                          |
| Facet Extraction    $0.04  (3%)   =                               |
|                                                                   |
+------------------------------------------------------------------+
```

This is a V2 feature. It requires persistent storage of analysis costs (see Data Model section). The core feature (session-level transparency) ships first.

---

## Design: Delight Features (Beyond the Ask)

### 1. Cache Savings Celebration

When Anthropic prompt caching saves money, show it:

```
  (sparkles) Analysis cost: $0.03 (saved $0.19 from cache)
```

This turns a technical optimization into a user-visible win. "Your tool is smart about saving you money."

### 2. Provider Cost Comparison (V2)

In the Settings page Usage section, a one-liner:

```
  (info) Switching to Haiku would save ~60% on analysis costs ($0.50/mo vs $1.24/mo)
```

Only shown when:
- User is on a more expensive model (Opus, Sonnet)
- The savings are material (>$0.50/mo)
- Analysis quality would not meaningfully degrade (Haiku is fine for analysis)

### 3. Bulk Analyze Cost Preview

The existing "N sessions without analysis" banner on the Dashboard gets a cost estimate:

```
+------------------------------------------------------------------+
| (sparkles) 12 sessions without analysis                          |
|   Generate AI insights to extract learnings and decisions         |
|   Estimated cost: ~$0.24                     [Analyze All]       |
+------------------------------------------------------------------+
```

### 4. Analysis Cost in Session List (Subtle)

In `CompactSessionRow`, add analysis cost to the metadata line only if analysis has been run. This is very low priority -- the session detail is the right place for this information.

---

## User Flows

### Flow 1: First-Time Analysis with Cost Awareness

**Trigger:** User opens an unanalyzed session and clicks the Analyze dropdown
**Actor:** Developer Dev
**Goal:** Run analysis with confidence about what it will cost

```
1. User opens session detail (Insights tab, empty state)
2. User clicks [Analyze v] dropdown in header
3. System shows dropdown with cost estimates:
   "Analyze Session ~$0.02 · 82K input tokens"
   "Analyze Prompt Quality ~$0.01 · same conversation"
4. User clicks "Analyze Session"
5. System shows analyzing state (existing SSE progress)
6. Analysis completes. SSE 'complete' event includes tokenUsage.
7. System shows success toast: "4 insights saved for session"
8. Analysis cost line appears below VitalsStrip:
   "(sparkles) Analysis cost: $0.022"
   "Sonnet 4 · 82.4K input · 1.6K output"
   -> Flow complete: user has clear record of what analysis cost
```

### Flow 2: Re-analysis with Cost Warning

**Trigger:** User wants to re-analyze a session (already has insights)
**Actor:** Developer Dev
**Goal:** Understand cost of re-running analysis before committing

```
1. User clicks [Analyze v] dropdown
2. System shows "Re-analyze Session ~$0.02 · 82K input"
3. User clicks "Re-analyze Session"
4. System shows confirmation dialog:
   "Re-analyze this session?"
   "This will replace 4 existing insights with new ones."
   "Estimated cost: ~$0.02"
5. User clicks [Re-analyze]
6. Analysis runs, cost line updates with new actual cost
   -> Flow complete: user made informed choice
```

### Flow 3: Ollama User (Free Analysis)

**Trigger:** Ollama user runs analysis
**Actor:** Developer Dev (using local LLM)
**Goal:** See that analysis is free

```
1. User opens Analyze dropdown
2. System shows "Analyze Session · free (local)"
   No cost estimate needed -- just "free (local)" label
3. User clicks, analysis runs
4. Analysis cost line shows:
   "(sparkles) Analysis: local (free)"
   "llama3.2 · 82.4K input · 1.8K output"
   -> Flow complete: user feels good about local-first choice
```

---

## Component Spec: AnalysisCostLine

**Location:** Below VitalsStrip in the Insights tab of SessionDetailPanel
**File:** `dashboard/src/components/sessions/AnalysisCostLine.tsx`

```
+------------------------------------------------------------------+
| COMPONENT: AnalysisCostLine                         [STATUS: draft]
| Context: SessionDetailPanel > Insights tab, below VitalsStrip
| Breakpoint: all (single-line, responsive)
+------------------------------------------------------------------+

+------------------------------------------------------+
| (sparkles) Analysis cost: $0.032                     |   @A
| Sonnet 4 · 82.4K in · 1.8K out · saved $0.19        |   @B
+------------------------------------------------------+

ANNOTATIONS:
- @A: Primary line. Sparkles icon (h-3.5 w-3.5, text-purple-500).
      Cost in text-sm font-medium.
      Click/hover opens Popover with per-type breakdown.
- @B: Sublabel line. text-[10px] text-muted-foreground/60.
      Model name · input token count · output token count.
      Cache savings shown only when > $0.01.

TAILWIND MAPPING:
- Container: flex flex-col gap-0.5 px-1 py-1
- Primary: flex items-center gap-1.5 text-sm text-muted-foreground
- Sublabel: text-[10px] text-muted-foreground/60
- Matches VitalsStrip spacing (sits directly below it)

SHADCN COMPONENTS:
- Popover -> breakdown detail on click
- Uses Sparkles icon from lucide-react (already imported in SessionDetailPanel)
```

**Props:**

```typescript
interface AnalysisCostLineProps {
  // Per-analysis-type usage records (from stored analysis results)
  usage: Array<{
    type: 'session' | 'prompt_quality' | 'facets';
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  }>;
  model: string;        // Analysis model used
  provider: string;     // 'anthropic' | 'openai' | 'gemini' | 'ollama'
}
```

**Cost calculation:** Uses `getModelPricing()` from `cli/src/utils/pricing.ts` (or a dashboard copy). Calculates cost per analysis type and total. Cache savings = `(cacheReadTokens / 1M) * inputPrice * 0.9` (what user would have paid without cache).

---

## Component Spec: Analyze Dropdown Cost Estimates

**Location:** `AnalyzeDropdown.tsx` (existing component, enhancement)

```
+------------------------------------------------------------------+
| COMPONENT: AnalyzeDropdown (enhanced)               [STATUS: draft]
| Context: SessionDetailPanel header, right side
| Breakpoint: all
+------------------------------------------------------------------+

+----------------------------------------------+
| (sparkles) Analyze    (v)                     |
+----------------------------------------------+
| (sparkles) Analyze Session                    |
|   ~$0.02 · ~82K tokens                       |   @A
|                                               |
| (target) Analyze Prompt Quality               |
|   ~$0.01 · same conversation                 |
|   (info) Cheaper if run right after session   |   @B
|     analysis (Anthropic cache)                |
+----------------------------------------------+

ANNOTATIONS:
- @A: Estimate sublabel. text-xs text-muted-foreground, pl-7 (indent under icon).
      Calculated from session metadata + configured model pricing.
- @B: Cache hint. Only visible for Anthropic provider when session analysis
      already ran and PQ has not. text-xs text-muted-foreground/60.
      Uses (info) icon, italic.

TAILWIND MAPPING:
- Estimate line: text-xs text-muted-foreground pl-7 pb-1
- Cache hint: text-[10px] text-muted-foreground/60 pl-7 italic flex items-center gap-1
```

**Estimation logic (client-side):**

```
// Rough heuristic: formatted analysis input is ~3% of session's raw token count
// Capped at MAX_INPUT_TOKENS (80K)
const estimatedInputTokens = Math.min(
  (session.total_input_tokens ?? 0) * 0.03,
  80_000
);

// Fallback if session has no token data: estimate from message count
// ~500 tokens per message average
if (estimatedInputTokens === 0 && session.message_count > 0) {
  estimatedInputTokens = Math.min(session.message_count * 500, 80_000);
}

// Fixed output token estimates per analysis type
const ESTIMATED_OUTPUT_TOKENS = {
  session: 2000,
  prompt_quality: 2500,
  facets: 500,
};

// Cost = (input/1M * inputPrice) + (output/1M * outputPrice)
```

For Ollama: show "free (local)" instead of a dollar estimate.

---

## Data Model Changes Required

### Analysis Cost Storage (Server-Side)

**Option A: Store in insights table metadata (minimal change)**

When saving insights, include the analysis cost in the summary insight's metadata:

```json
{
  "outcome": "success",
  "analysis_usage": {
    "inputTokens": 82400,
    "outputTokens": 1600,
    "cacheCreationTokens": 0,
    "cacheReadTokens": 78100,
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic",
    "estimated_cost_usd": 0.022
  }
}
```

Pros: No schema change. Cost travels with the insight.
Cons: Cost is per-analysis-type, not aggregated. Need to query multiple insight types to get total.

**Option B: New `analysis_runs` table (clean, future-proof)**

```sql
CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'session' | 'prompt_quality' | 'facets'
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  estimated_cost_usd REAL NOT NULL,
  created_at TEXT NOT NULL,     -- ISO 8601
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_session ON analysis_runs(session_id);
```

Pros: Clean separation. Supports cumulative queries. Supports cost trend charts.
Cons: Schema migration (V7). More plumbing.

**Recommendation: Option B.** The `analysis_runs` table is the right long-term foundation. It enables the Settings page cost summary, cost trends, and per-session cost queries without parsing insight metadata. The schema migration is mechanical (V7, one table + one index).

### API Endpoints Needed

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/analysis/cost?sessionId=X` | GET | Per-session analysis cost | `{ runs: AnalysisRun[], total_cost: number }` |
| `/api/analysis/cost/summary` | GET | Cumulative analysis cost | `{ total_cost, total_runs, by_type: {...}, by_period: [...] }` |
| `/api/analysis/estimate?sessionId=X` | GET | Pre-analysis cost estimate | `{ estimated_input_tokens, estimated_cost, model, provider }` (V2, if heuristic is insufficient) |

### SSE Enhancement

The existing `complete` SSE event already sends `tokenUsage`. Extend it to include cost:

```json
{
  "success": true,
  "insightCount": 4,
  "tokenUsage": { "inputTokens": 82400, "outputTokens": 1600 },
  "estimatedCost": 0.022,
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514"
}
```

The dashboard `AnalysisContext` already stores `tokenUsage` in `result` -- extend to include `estimatedCost`.

---

## Interaction Spec Summary

| Element | Action | Result |
|---------|--------|--------|
| Analysis cost line (below VitalsStrip) | Click | Opens Popover with per-type cost breakdown |
| Analysis cost line | Hover | Cursor changes to pointer (indicates clickable) |
| Analyze dropdown menu item | View | Shows estimated cost as sublabel |
| Re-analyze confirmation dialog | View | Shows estimated cost below warning text |
| Bulk analyze banner (Dashboard) | View | Shows total estimated cost for all unanalyzed sessions |
| Cache savings hint (dropdown) | View | Appears only for Anthropic + cached scenario |
| StatsHero cost cell | View | Shows "+$X.XX analysis" sublabel below session cost |
| StatsHero analysis cost sublabel | Click | Navigates to Settings > Usage & Cost (V2) |

---

## Implementation Priority

### Phase 1: Core Transparency (Ship First)

1. **`analysis_runs` table** -- V7 schema migration
2. **Record analysis costs** -- write to `analysis_runs` after each analysis call in `analysis.ts`, `prompt-quality-analysis.ts`, `facet-extraction.ts`
3. **`/api/analysis/cost?sessionId=X`** endpoint
4. **`AnalysisCostLine` component** -- render actual costs below VitalsStrip
5. **Enhance `AnalyzeDropdown`** -- client-side cost estimates in dropdown items
6. **Enhance re-analysis dialogs** -- add estimated cost line

### Phase 2: Dashboard Integration

7. **Enhance SSE `complete` event** -- include cost and model
8. **Show cost in analysis success toast** -- "4 insights saved ($0.02)"
9. **StatsHero analysis cost sublabel**
10. **Bulk analyze banner cost estimate**

### Phase 3: Settings Page (V2)

11. **`/api/analysis/cost/summary`** endpoint
12. **Settings > Usage & Cost** section with trend chart
13. **Provider cost comparison** hint
14. **Cache savings celebration** in AnalysisCostLine

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/db/migrate.ts` (or equivalent) | V7 schema: `analysis_runs` table |
| `server/src/llm/analysis.ts` | Write to `analysis_runs` after analysis |
| `server/src/llm/prompt-quality-analysis.ts` | Write to `analysis_runs` after PQ analysis |
| `server/src/llm/facet-extraction.ts` | Write to `analysis_runs` after facet extraction |
| `server/src/llm/analysis-db.ts` | New `saveAnalysisRun()` function |
| `server/src/routes/analysis.ts` | New `/cost` endpoint |
| `dashboard/src/components/sessions/AnalysisCostLine.tsx` | **New file** |
| `dashboard/src/components/sessions/SessionDetailPanel.tsx` | Add AnalysisCostLine below VitalsStrip |
| `dashboard/src/components/analysis/AnalyzeDropdown.tsx` | Add cost estimates to dropdown items |
| `dashboard/src/components/analysis/AnalyzeButton.tsx` | Add cost estimate to empty state |
| `dashboard/src/components/analysis/AnalysisContext.tsx` | Extend `result` type with cost/model |
| `dashboard/src/hooks/useAnalysisCost.ts` | **New hook** for per-session cost query |
| `dashboard/src/lib/cost-utils.ts` | **New file** -- client-side estimation logic, pricing lookup |
| `dashboard/src/lib/types.ts` | Add `AnalysisRun` type |

---

## Open Questions

1. **Estimation accuracy threshold** -- Is the 3% heuristic good enough, or do we need a server-side estimation endpoint from the start? Recommendation: ship heuristic, add endpoint if users report confusion.

2. **Cost display precision** -- `$0.03` vs `$0.032` vs `$0.0320`? Recommendation: 2 decimal places for costs > $0.10, 3 decimal places for costs < $0.10, to avoid rounding $0.003 to $0.00.

3. **Historical backfill** -- Sessions analyzed before the `analysis_runs` table exists will have no cost data. Show "not tracked" for those. No backfill needed (we cannot reconstruct past costs).

4. **Multi-chunk sessions** -- A session that gets chunked into 3 LLM calls has a higher cost. The estimation should account for this. Use `session.message_count > 200` as a proxy for "likely chunked" and multiply the estimate by the estimated chunk count.

5. **Re-analysis cost accumulation** -- If a user re-analyzes 3 times, do we show total accumulated cost or just the latest run? Recommendation: show latest run cost in `AnalysisCostLine`, but `analysis_runs` stores all runs for the cumulative summary.
