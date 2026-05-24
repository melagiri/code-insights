# Reflect Feature Enhancement — Design Plan

> **Status:** Feature 1 Complete (PRs #125, #127, #129, #132, #136, #138) · Feature 2 (Progress Tracking) Deferred
> **Date:** 2026-03-09
> **Scope:** Server (prompts, aggregation, normalization), Dashboard (PatternsPage, Insights), CLI (types)
> **Features:** Pattern Normalization + Confidence Filtering + Outdated Format Detection + Progress Tracking (TBD)

---

## Problem

Effective patterns use free-text `description` with exact-match `GROUP BY` in SQL. Semantically identical patterns (e.g., "structured planning before implementation" and "decomposing the task into steps") never cluster. The Patterns page shows all patterns at 1x frequency — no signal, just noise.

Friction already solved this with `category`-based classification + a normalizer (`friction-normalize.ts`). We mirror that approach for effective patterns.

## Key Design Decisions

### 1. No Backward Compatibility

The Reflect feature has NOT been released. Only local dev data exists. We make a **clean break**:

- No `COALESCE` fallbacks for missing `category` fields
- No optional `category?: string` — it's **required**: `category: string`
- No `__uncategorized__` handling in aggregation
- Old session facets without the new format are treated as **outdated**

### 2. Outdated Format Detection + Re-analysis Flag

When session insights exist but lack the latest format (missing `category` on effective patterns OR friction points), show a **warning banner** on:

- **Session Insights page** (per-session) — "This session's insights were generated with an older format. Re-analyze to get the latest insights."
- **Patterns/Reflect page** — "N sessions have outdated insight formats. Re-analyze them to improve pattern accuracy."

The banner includes an action button to trigger re-analysis.

**Detection logic:** Check if `effective_patterns` JSON entries lack `category` field, OR if `friction_points` entries lack expected fields.

### 3. Confidence Threshold: 50%+ Filter

Apply a **minimum 50% confidence filter** to BOTH:

- **Friction points** — only aggregate friction with `confidence >= 50` (Note: friction currently uses `severity` not confidence — see implementation notes)
- **Effective patterns** — only aggregate patterns with `confidence >= 50`

This filter applies at **aggregation time** in `shared-aggregation.ts`, not at extraction time. The LLM still extracts everything; we filter during display/synthesis.

### 4. Eight Canonical Categories (Not 12)

Fewer, denser categories create more credible frequency signals across all 5 source tools.

```typescript
export const CANONICAL_PATTERN_CATEGORIES = [
  'structured-planning',        // Task breakdown, phased plans, decomposition before implementation
  'incremental-implementation', // Small steps, iterative building, progressive refinement
  'verification-workflow',      // Build/test/commit loops, validation, TDD (absorbed)
  'systematic-debugging',       // Binary search debugging, log diagnosis, reproduction isolation
  'self-correction',            // Recognizing wrong path and pivoting, course correction
  'context-gathering',          // Reading existing code/docs/schemas before making changes
  'domain-expertise',           // Applying framework/library/architecture knowledge (absorbs type-driven)
  'effective-tooling',          // Leveraging tool capabilities: agents, multi-file edits, completions
] as const;
```

**Merges:**
- `agent-delegation` → `effective-tooling` (tool-neutral: agents in Claude Code, multi-file in Cursor, completions in Copilot)
- `type-driven-development` → `domain-expertise` (types-first is a subset of domain knowledge)
- `test-driven-development` → `verification-workflow` (tests-first is a verification strategy)

**Dropped:**
- `documentation-practice` — too thin, rarely surfaces as top-3 pattern
- `version-control-discipline` — hygiene, not a technique

---

## Architecture

### Data Flow

```
LLM extraction (prompts.ts)
    -> { category: "structured-planning", description: "...", confidence: 85 }
    -> normalizePatternCategory() at write time (analysis.ts)
    -> saveFacetsToDb writes JSON to session_facets.effective_patterns
    -> shared-aggregation.ts reads JSON, filters confidence >= 50, GROUPs BY category
    -> reflect-prompts.ts receives category-grouped data for synthesis
    -> dashboard renders category headings with description sub-items
```

### New File: `server/src/llm/pattern-normalize.ts`

Mirrors `friction-normalize.ts`:
- `CANONICAL_PATTERN_CATEGORIES` import from prompts
- `PATTERN_ALIASES` map for LLM variant clustering
- `normalizePatternCategory(category: string): string` — exact -> alias -> Levenshtein <= 2 -> substring -> novel
- `PATTERN_CATEGORY_LABELS` map for dashboard display
- `getPatternCategoryLabel(category: string): string` — fallback to Title Case

**Alias map (initial):**
```typescript
const PATTERN_ALIASES: Record<string, string> = {
  // structured-planning variants
  'task-decomposition': 'structured-planning',
  'plan-first': 'structured-planning',
  'upfront-planning': 'structured-planning',
  'phased-approach': 'structured-planning',
  'task-breakdown': 'structured-planning',
  'planning-before-implementation': 'structured-planning',

  // effective-tooling variants
  'agent-delegation': 'effective-tooling',
  'agent-orchestration': 'effective-tooling',
  'specialized-agents': 'effective-tooling',
  'multi-agent': 'effective-tooling',
  'tool-leverage': 'effective-tooling',

  // verification-workflow variants
  'build-test-verify': 'verification-workflow',
  'test-driven-development': 'verification-workflow',
  'tdd': 'verification-workflow',
  'test-first': 'verification-workflow',
  'pre-commit-checks': 'verification-workflow',

  // systematic-debugging variants
  'binary-search-debugging': 'systematic-debugging',
  'methodical-debugging': 'systematic-debugging',
  'log-based-debugging': 'systematic-debugging',
  'debugging-methodology': 'systematic-debugging',

  // self-correction variants
  'course-correction': 'self-correction',
  'pivot-on-failure': 'self-correction',
  'backtracking': 'self-correction',

  // context-gathering variants
  'code-reading-first': 'context-gathering',
  'codebase-exploration': 'context-gathering',
  'understanding-before-changing': 'context-gathering',

  // domain-expertise variants
  'framework-knowledge': 'domain-expertise',
  'types-first': 'domain-expertise',
  'type-driven-development': 'domain-expertise',
  'schema-first': 'domain-expertise',

  // incremental-implementation variants
  'small-steps': 'incremental-implementation',
  'iterative-building': 'incremental-implementation',
  'iterative-development': 'incremental-implementation',
};
```

### Prompt Changes

#### `SESSION_ANALYSIS_SYSTEM_PROMPT` — effective_patterns section

**Before:**
```
4. effective_patterns: Up to 3 techniques or approaches that worked particularly well (array, max 3).
   Each has:
   - description: Specific technique worth repeating
   - confidence: 0-100 how confident you are this is genuinely effective
```

**After:**
```
4. effective_patterns: Up to 3 techniques or approaches that worked particularly well (array, max 3).
   Each has:
   - category: Use one of these PREFERRED categories when applicable: structured-planning, incremental-implementation, verification-workflow, systematic-debugging, self-correction, context-gathering, domain-expertise, effective-tooling. Create a new kebab-case category only when none of these fit.
   - description: Specific technique worth repeating (1-2 sentences with concrete detail)
   - confidence: 0-100 how confident you are this is genuinely effective

EFFECTIVE PATTERN CLASSIFICATION GUIDANCE:
- "structured-planning": Task decomposition, phased plans, breaking work into steps BEFORE coding
- "incremental-implementation": Small steps, iterative building, progressive refinement
- "verification-workflow": Build/test/lint loops, TDD, CI checks, verifying before committing
- "systematic-debugging": Binary search, log analysis, reproduction isolation, comparing expected vs actual
- "self-correction": Recognizing a wrong path and pivoting without user intervention
- "context-gathering": Reading existing code/docs/schemas before making changes
- "domain-expertise": Applying specific framework/library/API/type-system knowledge that skips trial-and-error
- "effective-tooling": Leveraging tool-specific capabilities — agent delegation, multi-file edits, smart completions
When no canonical category fits, create a specific kebab-case category.
```

#### `FACET_ONLY_SYSTEM_PROMPT` — same update

#### JSON schema examples — add `"category": "kebab-case-category"` field

#### `AnalysisResponse` type — `category: string` (REQUIRED, not optional)

### Aggregation Changes (`shared-aggregation.ts`)

#### Updated SQL (effective patterns)
```sql
SELECT
  json_extract(je.value, '$.category') as category,
  json_extract(je.value, '$.description') as description,
  json_extract(je.value, '$.confidence') as confidence
FROM session_facets sf
JOIN sessions s ON sf.session_id = s.id
CROSS JOIN json_each(sf.effective_patterns) je
WHERE json_extract(je.value, '$.confidence') >= 50
  ${additionalWhere}
```

Post-query: normalize categories, merge by normalized key, collect descriptions.

#### Updated SQL (friction points) — add confidence filter
```sql
WHERE json_extract(je.value, '$.confidence') >= 50
```

Note: Friction currently uses `severity` (high/medium/low), not a numeric confidence. If friction lacks numeric confidence, this filter applies only to effective patterns. Check implementation.

#### Updated Interface
```typescript
export interface AggregatedEffectivePattern {
  category: string;
  label: string;              // "Structured Planning"
  frequency: number;
  avg_confidence: number;
  descriptions: string[];     // max 10, for display
}
```

### Dashboard Changes

#### PatternsPage.tsx — Effective Patterns Section
```tsx
<li key={i}>
  <div className="flex items-start gap-3">
    <span className="badge">{ep.frequency}x</span>
    <span className="font-medium">{ep.label}</span>
  </div>
  {ep.descriptions.length > 0 && (
    <ul className="ml-10 mt-1.5 space-y-1">
      {ep.descriptions.slice(0, 3).map((desc, j) => (
        <li key={j} className="text-xs text-muted-foreground">{desc}</li>
      ))}
      {ep.descriptions.length > 3 && (
        <li className="text-xs text-muted-foreground italic">
          +{ep.descriptions.length - 3} more
        </li>
      )}
    </ul>
  )}
</li>
```

#### Outdated Format Banner

Show on Session Insights page and Patterns page when outdated sessions detected:

```tsx
{outdatedCount > 0 && (
  <Alert variant="warning">
    <AlertDescription>
      {outdatedCount} session(s) have outdated insight formats.
      Re-analyze to get improved pattern accuracy.
    </AlertDescription>
    <Button size="sm" onClick={handleReanalyze}>Re-analyze</Button>
  </Alert>
)}
```

**Detection:** API endpoint or query that checks `session_facets` rows where `effective_patterns` JSON entries lack `category` field.

### Reflect Prompts Changes (`reflect-prompts.ts`)

- `generateFrictionWinsPrompt` — receives category-grouped effective patterns
- `generateRulesSkillsPrompt` — same type update
- `topWins` output schema gets `category` field
- Label change: "EFFECTIVE PATTERNS (ranked by frequency, grouped by category)"

### Type Changes

#### `cli/src/types.ts`
```typescript
export interface EffectivePattern {
  category: string;     // REQUIRED — no backward compat
  description: string;
  confidence: number;
}
```

#### `dashboard/src/lib/api.ts`
```typescript
effectivePatterns: Array<{
  category: string;
  label: string;
  frequency: number;
  avg_confidence: number;
  descriptions: string[];
}>;
```

---

## Implementation Order

```
1. server/src/llm/prompts.ts          — Canonical list, prompt updates, type updates
2. server/src/llm/pattern-normalize.ts — NEW: normalizer + aliases + labels
3. server/src/llm/analysis.ts         — Import normalizer, apply at write time
4. server/src/routes/shared-aggregation.ts — New SQL, confidence filter, normalization, interface
5. server/src/llm/reflect-prompts.ts   — Parameter type updates
6. cli/src/types.ts                    — Required category on EffectivePattern
7. dashboard/src/lib/api.ts           — Updated FacetAggregation type
8. dashboard/src/pages/PatternsPage.tsx — Category display + outdated banner
9. server/src/routes/insights.ts (or similar) — Outdated format detection endpoint
```

Steps 1-2 in parallel. Steps 3-5 sequential (depend on 1-2). Steps 6-8 in parallel (after 4).

## Files Modified

| File | Action | Est. Lines |
|------|--------|-----------|
| `server/src/llm/prompts.ts` | Modify | ~30 |
| `server/src/llm/pattern-normalize.ts` | **Create** | ~100 |
| `server/src/llm/analysis.ts` | Modify | ~10 |
| `server/src/routes/shared-aggregation.ts` | Modify | ~50 |
| `server/src/llm/reflect-prompts.ts` | Modify | ~10 |
| `cli/src/types.ts` | Modify | ~3 |
| `dashboard/src/lib/api.ts` | Modify | ~8 |
| `dashboard/src/pages/PatternsPage.tsx` | Modify | ~40 |
| Outdated detection (route TBD) | Modify/Create | ~20 |

**Total: ~270 lines changed, 1 new file**

## What Pattern Normalization Does NOT Include

- No schema migration (JSON column is flexible)
- No backfill command (users re-analyze via UI banner)
- No new API routes for re-analysis (existing analyze endpoint handles it)
- No friction normalization changes (out of scope — friction already works)
- No export prompt changes (out of scope)

---

## Feature 2: Progress Tracking (Cross-Reflection Improvement)

> **Status:** Designed — Ships after Pattern Normalization

### Vision

The third layer of the product arc:
- **Layer 1: Sessions** — "What happened?" (per-session insights)
- **Layer 2: Patterns/Reflect** — "What keeps happening?" (cross-session synthesis)
- **Layer 3: Progress** — "Am I getting better?" (cross-reflection improvement tracking)

This transforms Code Insights from a *reporting tool* into a *learning tool*.

### Finalized Design Decisions

| Decision | Answer | Rationale |
|---|---|---|
| Reflection cadence | **Weekly** | Power users do 2-3 sessions/day ≈ 20/week, meets the analysis threshold |
| Comparison approach | **Snapshot vs snapshot** | Snapshots are what the user saw; re-aggregation could produce numbers that don't match their memory |
| Trigger | **Manual** with missing-week flags | User clicks "Generate" for each week; UI flags weeks without reflections |
| Shipping order | **Follow-up feature** after pattern normalization | Pattern normalization completes Reflect for release; progress is next |
| Minimum weeks for progress | **3-4 weeks** of reflections before offering progress analysis |

### Weekly Reflection Model

- Reflections are **weekly snapshots**, not arbitrary time windows
- Each week (Mon-Sun) is a discrete reflection period
- If the user didn't generate a reflection for a week, the UI shows a flag: "Week of Mar 3 — reflection not generated"
- The `reflect_snapshots` table stores one snapshot per week per project
- Period format changes from `7d|30d|90d|all` to ISO week identifiers (e.g., `2026-W10`)

### Future-Proofing for Progress (Pattern Normalization Must Account For)

Pattern normalization ships first but must be designed so progress tracking slots in cleanly:

1. **`reflect_snapshots` schema** — Consider whether the current `PRIMARY KEY (period, project_id)` with upsert needs to change to support weekly history. With weekly periods as distinct keys (e.g., `2026-W10`, `2026-W11`), each week is a separate row — no overwrites, natural history.
2. **Aggregation by category** — Progress will diff friction/pattern categories between weeks. The category-based aggregation in pattern normalization is a prerequisite.
3. **`snapshot_stale` flag** — Optional column on `reflect_snapshots` for future use. Set to `true` when sessions in that week's range are re-analyzed. Zero cost now, useful for progress later.

### Core Concept

After 3-4 weekly reflections exist, offer progress analysis:
1. **Friction that decreased** — user is overcoming blockers
2. **Friction that resolved entirely** — blocker eliminated
3. **New effective patterns** — user developing new strengths
4. **Friction-to-pattern transformations** — the "aha" moment: a friction category decreasing while a related pattern category increases

### Architecture: Hybrid (Deterministic + LLM)

**Phase 1: Deterministic delta computation (zero LLM cost)**
- Compare stored weekly snapshots (Week N-1 vs Week N, or across 3-4 weeks)
- Compute friction deltas (count change, severity change, new/resolved)
- Compute pattern deltas (frequency change, new/lost)
- Flag candidate friction-to-pattern transformations via affinity map

**Phase 2: Lightweight LLM narrative (~2000-3000 tokens, ~$0.005-0.01)**
- Receives only pre-computed deltas, NOT full snapshots
- Confirms/rejects candidate transformations
- Writes progress narrative (200-400 words)
- Identifies biggest win + any regressions

### Friction-to-Pattern Affinity Map

Static mapping from the 9 canonical friction categories (PR #127) to 8 pattern categories.
Ships in the Progress PR alongside its consumer code and validation tests — not in the pattern taxonomy PR (deferred per LLM expert + TA consensus: dead code with no runtime consumer).

```typescript
/**
 * Maps each friction category to its natural pattern antidotes.
 * Used by Progress tracking to detect friction-to-pattern transformations:
 * declining friction in a category + emerging pattern in its antidote = growth signal.
 *
 * self-correction intentionally absent — it is a reactive recovery behavior,
 * not a preventive practice, and is typically ai-driven.
 */
const FRICTION_PATTERN_AFFINITIES: Record<string, string[]> = {
  'wrong-approach':           ['structured-planning', 'context-gathering'],
  'knowledge-gap':            ['domain-expertise', 'context-gathering'],
  'stale-assumptions':        ['context-gathering', 'verification-workflow'],
  'incomplete-requirements':  ['structured-planning', 'context-gathering'],
  'context-loss':             ['structured-planning', 'incremental-implementation'],
  'scope-creep':              ['structured-planning', 'incremental-implementation'],
  'repeated-mistakes':        ['verification-workflow', 'systematic-debugging'],
  'documentation-gap':        ['context-gathering', 'domain-expertise'],
  'tooling-limitation':       ['effective-tooling'],
};
```

**Key design notes for Progress implementation:**
- `context-gathering` appears in 6 of 9 mappings — the universal prevention pattern
- `effective-tooling` maps only to `tooling-limitation` — it's a productivity multiplier, not a friction preventer
- `self-correction` maps to zero friction categories — it's reactive recovery (ai-driven), not preventive
- Progress should filter on `driver = 'user-driven'` patterns as primary growth signals, `collaborative` as secondary, and exclude `ai-driven` from user improvement metrics
- The `driver` field on effective patterns (added in the pattern taxonomy revision PR) enables this filtering without hardcoded category exceptions

### Delta Types

```typescript
interface FrictionDelta {
  category: string;
  previous: { count: number; avg_severity: number } | null;  // null = new friction
  current:  { count: number; avg_severity: number } | null;  // null = resolved
  change: 'resolved' | 'improving' | 'stable' | 'worsening' | 'new';
  countDelta: number;
}

interface PatternDelta {
  category: string;
  previous: { frequency: number; avg_confidence: number } | null;
  current:  { frequency: number; avg_confidence: number } | null;
  change: 'new' | 'growing' | 'stable' | 'declining' | 'gone';
  frequencyDelta: number;
}

interface CandidateTransformation {
  friction: string;          // friction category that decreased
  pattern: string;           // pattern category that increased
  frictionDelta: number;     // negative = improved
  patternDelta: number;      // positive = grew
}
```

### LLM Progress Prompt (New, Separate from Reflect Prompts)

**System prompt (~350 tokens):**
- Role: analyze improvement trajectory from pre-computed deltas
- Rules: every claim traces to deltas, distinguish improvement from activity change,
  be specific with numbers, encouraging but honest

**User prompt (~800-1500 tokens):**
- Previous period metadata (session count, window)
- Current period metadata
- Friction deltas (max 10)
- Pattern deltas (max 8)
- Candidate transformations from affinity map
- Working style tagline change

**Output schema:**
```json
{
  "progressNarrative": "200-400 word story",
  "confirmedTransformations": [
    { "friction": "category", "pattern": "category", "confidence": "high|medium|low", "explanation": "..." }
  ],
  "biggestWin": { "description": "...", "evidence": "..." },
  "regressions": [
    { "category": "...", "severity": "concerning|minor", "description": "..." }
  ],
  "overallTrajectory": "improving | mixed | declining | insufficient-data"
}
```

### Dashboard: Patterns Page Integration

**Not a new page. Embedded in Patterns page when previous snapshot exists.**

Progress indicators appear as annotations on existing data:
- Friction categories get trend arrows (↓ ↑ ✦ ✓)
- Effective patterns get trend arrows (★ ↑ ↓)
- "Since your last reflection on [date]" context line
- Optional: LLM progress narrative section (with "Generate" button)

### Regression Framing (UX Principle)

| What Happened | How It's Framed |
|---|---|
| Friction decreased | "Improvement" — celebrate |
| Friction resolved | "Resolved" — checkmark |
| Friction increased | "New challenges this period" (harder problems, new territory) |
| Friction returned | "Recurring challenge" (neutral) |
| No change | Don't call it out |

**Principle: Celebrate improvements. Contextualize regressions. Never blame the user.**

### Resolved Design Decisions

1. **Snapshot comparison approach:** ✅ **Stored snapshots.** Snapshots are what the user saw — comparing anything else creates a disconnected narrative.
2. **Trigger:** ✅ **Manual** with missing-week flags in UI. No auto-compute.
3. **Scope:** ✅ **Follow-up feature.** Pattern normalization ships first to complete Reflect for release.
4. **Window alignment:** ✅ **ISO weeks (Mon-Sun).** Each week is a discrete period key (e.g., `2026-W10`).
5. **Minimum data threshold:** ✅ **3-4 weekly snapshots** before offering progress analysis. Individual week threshold matches reflect minimum (~20 sessions).

### Remaining Open Questions (For Progress Implementation Phase)

1. **Multi-week trend visualization** — After 6+ weeks, show a line chart of friction/pattern trends? Or keep it pairwise (this week vs last)?
2. **CLI integration** — `code-insights progress` command? Or progress only in dashboard?
3. **Notification/nudge** — Should the CLI sync hook remind users to generate their weekly reflection?
