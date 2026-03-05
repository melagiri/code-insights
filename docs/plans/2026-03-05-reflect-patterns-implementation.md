# Reflect/Patterns Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cross-session analysis with facet extraction, synthesis prompts, dashboard Patterns page, and CLI reflect/stats-patterns commands.

**Architecture:** Per-session facets extracted during analysis (integrated prompt), stored in dedicated `session_facets` table, aggregated in code, fed to 3 synthesis prompts (Friction & Wins, Rules & Skills, Working Style). Results displayed via dashboard Patterns page and CLI commands.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), Hono API, React + React Query, Commander.js CLI

**Design Doc:** `docs/insights-generation-analysis.md`

---

## File Summary

| Action | File | Phase |
|--------|------|-------|
| Modify | `cli/src/types.ts` | 1 |
| Modify | `cli/src/db/schema.ts` | 1 |
| Modify | `cli/src/db/migrate.ts` | 1 |
| Modify | `server/src/llm/prompts.ts` | 2 |
| Modify | `server/src/llm/analysis.ts` | 2 |
| Create | `server/src/routes/facets.ts` | 3 |
| Create | `server/src/llm/reflect-prompts.ts` | 3 |
| Create | `server/src/routes/reflect.ts` | 3 |
| Modify | `server/src/index.ts` | 3 |
| Create | `dashboard/src/pages/PatternsPage.tsx` | 4 |
| Create | `dashboard/src/hooks/useReflect.ts` | 4 |
| Modify | `dashboard/src/App.tsx` | 4 |
| Modify | `dashboard/src/components/layout/Header.tsx` | 4 |
| Create | `cli/src/commands/reflect.ts` | 5 |
| Create | `cli/src/commands/stats/actions/patterns.ts` | 5 |
| Modify | `cli/src/commands/stats/index.ts` | 5 |
| Modify | `cli/src/index.ts` | 5 |
| Create | `server/src/llm/friction-normalize.ts` | 6 |

---

## Phase 1: Foundation (Types + Schema + Migration V3)

### Task 1.1: Add facet types to types.ts

**Files:**
- Modify: `cli/src/types.ts` (after line ~203, after InsightMetadata)

**Step 1: Add types**

Add after `InsightMetadata` interface:

```typescript
// === Session Facets (cross-session analysis foundation) ===

export interface FrictionPoint {
  category: string;          // kebab-case, e.g. "wrong-approach", "missing-dependency"
  description: string;       // one sentence: what went wrong
  severity: 'high' | 'medium' | 'low';
  resolution: 'resolved' | 'workaround' | 'unresolved';
}

export interface EffectivePattern {
  description: string;       // specific technique worth repeating
  confidence: number;        // 0-100
}

export type OutcomeSatisfaction = 'high' | 'medium' | 'low' | 'abandoned';

export interface SessionFacet {
  sessionId: string;
  outcomeSatisfaction: OutcomeSatisfaction;
  workflowPattern: string | null;
  hadCourseCorrection: boolean;
  courseCorrectionReason: string | null;
  iterationCount: number;
  frictionPoints: FrictionPoint[];
  effectivePatterns: EffectivePattern[];
  extractedAt: string;
  analysisVersion: string;
}

export interface ComputedFacets {
  toolsUsed: string[];
  dominantToolPattern: 'read-heavy' | 'edit-heavy' | 'bash-heavy' | 'balanced';
  messageCount: number;
  sessionDurationMinutes: number;
}

// === Reflect / Patterns types ===

export type ReflectSection = 'friction-wins' | 'rules-skills' | 'working-style';

export interface FrictionWinsResult {
  section: 'friction-wins';
  frictionCategories: Array<{
    category: string;
    count: number;
    avgSeverity: number;
    examples: string[];
    trend: 'increasing' | 'stable' | 'decreasing' | 'new';
  }>;
  effectivePatterns: Array<{
    description: string;
    frequency: number;
    avgConfidence: number;
  }>;
  narrative: string;
  generatedAt: string;
}

export interface RulesSkillsResult {
  section: 'rules-skills';
  claudeMdRules: Array<{
    rule: string;
    rationale: string;
    frictionSource: string;
  }>;
  skillTemplates: Array<{
    name: string;
    description: string;
    content: string;
  }>;
  hookConfigs: Array<{
    event: string;
    command: string;
    rationale: string;
  }>;
  targetTool: string;
  generatedAt: string;
}

export interface WorkingStyleResult {
  section: 'working-style';
  narrative: string;
  workflowDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  characterDistribution: Record<string, number>;
  generatedAt: string;
}

export type ReflectResult = FrictionWinsResult | RulesSkillsResult | WorkingStyleResult;
```

**Step 2: Commit**

```bash
git add cli/src/types.ts
git commit -m "feat(types): add SessionFacet, ReflectResult types for cross-session analysis"
```

---

### Task 1.2: Add session_facets table to schema

**Files:**
- Modify: `cli/src/db/schema.ts` (bump CURRENT_SCHEMA_VERSION to 3)

**Step 1: Bump version**

Change `CURRENT_SCHEMA_VERSION = 2` to `CURRENT_SCHEMA_VERSION = 3`.

**Step 2: Commit**

```bash
git add cli/src/db/schema.ts
git commit -m "feat(schema): bump CURRENT_SCHEMA_VERSION to 3 for session_facets"
```

---

### Task 1.3: Add V3 migration

**Files:**
- Modify: `cli/src/db/migrate.ts`

**Step 1: Add applyV3 function**

```typescript
function applyV3(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_facets (
      session_id              TEXT PRIMARY KEY REFERENCES sessions(id),
      outcome_satisfaction    TEXT NOT NULL,
      workflow_pattern        TEXT,
      had_course_correction   INTEGER NOT NULL DEFAULT 0,
      course_correction_reason TEXT,
      iteration_count         INTEGER NOT NULL DEFAULT 0,
      friction_points         TEXT,
      effective_patterns      TEXT,
      extracted_at            TEXT NOT NULL DEFAULT (datetime('now')),
      analysis_version        TEXT NOT NULL DEFAULT '1.0.0'
    );

    CREATE INDEX IF NOT EXISTS idx_facets_outcome ON session_facets(outcome_satisfaction);
    CREATE INDEX IF NOT EXISTS idx_facets_workflow ON session_facets(workflow_pattern);
  `);

  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(3);
}
```

**Step 2: Wire into runMigrations**

Add V3 call after V2 in the migration chain.

**Step 3: Commit**

```bash
git add cli/src/db/migrate.ts
git commit -m "feat(migrate): add V3 migration for session_facets table"
```

---

### Task 1.4: Build verification

**Step 1: Run build**

```bash
cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build
```

Expected: Clean build, no errors.

**Step 2: Commit** (if any fixes needed)

---

## Phase 2: Facet Extraction (Prompt Integration)

### Task 2.1: Add facet extraction to analysis prompt

**Files:**
- Modify: `server/src/llm/prompts.ts`

**Step 1: Add PART 1 — SESSION FACETS to SESSION_ANALYSIS_SYSTEM_PROMPT**

Insert before the existing insight instructions (which become PART 2). The facet section includes:

- Facet schema with field-level instructions
- Canonical friction category list (15 categories)
- 2 worked examples
- Instruction: "Extract facets FIRST (holistic assessment), then insights"

Add canonical friction categories as a constant:

```typescript
export const CANONICAL_FRICTION_CATEGORIES = [
  'wrong-approach', 'missing-dependency', 'config-drift', 'test-failure',
  'type-error', 'api-misunderstanding', 'stale-cache', 'version-mismatch',
  'permission-issue', 'incomplete-requirements', 'circular-dependency',
  'race-condition', 'environment-mismatch', 'documentation-gap', 'tooling-limitation'
] as const;
```

**Step 2: Update AnalysisResponse interface**

Add `facets` field to the response interface:

```typescript
export interface AnalysisResponse {
  facets?: {
    outcome_satisfaction: string;
    workflow_pattern: string | null;
    had_course_correction: boolean;
    course_correction_reason: string | null;
    iteration_count: number;
    friction_points: Array<{
      category: string;
      description: string;
      severity: string;
      resolution: string;
    }>;
    effective_patterns: Array<{
      description: string;
      confidence: number;
    }>;
  };
  session_character: string;
  insights: Array<{...}>;  // existing
}
```

**Step 3: Update parseAnalysisResponse to extract facets**

Parse the `facets` field from LLM JSON response and return it alongside insights.

**Step 4: Commit**

```bash
git add server/src/llm/prompts.ts
git commit -m "feat(prompts): integrate facet extraction into session analysis prompt"
```

---

### Task 2.2: Save facets during analysis

**Files:**
- Modify: `server/src/llm/analysis.ts`

**Step 1: Add saveFacetsToDb function**

```typescript
function saveFacetsToDb(
  db: Database,
  sessionId: string,
  facets: AnalysisResponse['facets'],
  analysisVersion: string
): void {
  if (!facets) return;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO session_facets
    (session_id, outcome_satisfaction, workflow_pattern, had_course_correction,
     course_correction_reason, iteration_count, friction_points, effective_patterns,
     analysis_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    sessionId,
    facets.outcome_satisfaction,
    facets.workflow_pattern,
    facets.had_course_correction ? 1 : 0,
    facets.course_correction_reason,
    facets.iteration_count,
    JSON.stringify(facets.friction_points),
    JSON.stringify(facets.effective_patterns),
    analysisVersion
  );
}
```

**Step 2: Wire into analyzeSession**

After `convertToInsightRows` saves insights, call `saveFacetsToDb` with the parsed facets.

**Step 3: Add chunked session facet extraction**

For sessions that hit the chunking path (>80k tokens), add a separate lightweight facet-only prompt that uses session summary + first/last 20 messages. This runs AFTER `mergeAnalysisResponses` since chunk-level facets don't make sense.

**Step 4: Commit**

```bash
git add server/src/llm/analysis.ts
git commit -m "feat(analysis): save extracted facets to session_facets table"
```

---

### Task 2.3: Add facet-only backfill endpoint

**Files:**
- Modify: `server/src/llm/prompts.ts` (add FACET_ONLY_SYSTEM_PROMPT)
- Modify: `server/src/llm/analysis.ts` (add extractFacetsOnly function)

**Step 1: Create lightweight facet-only prompt**

For backfilling already-analyzed sessions. Input: session summary + first/last 20 messages (~2.5k tokens). Output: facet JSON only (~350 tokens).

```typescript
export const FACET_ONLY_SYSTEM_PROMPT = `You are analyzing an AI coding session to extract structured metadata (facets) for cross-session pattern analysis.

Given a session summary and message samples, extract the following:
[facet schema with instructions]

PREFERRED friction categories: ${CANONICAL_FRICTION_CATEGORIES.join(', ')}
Use these when applicable. Create new kebab-case categories only when none fit.

Respond with JSON only.`;
```

**Step 2: Add extractFacetsOnly function**

```typescript
export async function extractFacetsOnly(
  db: Database,
  sessionId: string,
  llmConfig: LLMProviderConfig
): Promise<void> {
  // 1. Load session summary + first/last 20 messages from db
  // 2. Call LLM with FACET_ONLY_SYSTEM_PROMPT
  // 3. Parse response
  // 4. saveFacetsToDb()
}
```

**Step 3: Commit**

```bash
git add server/src/llm/prompts.ts server/src/llm/analysis.ts
git commit -m "feat(analysis): add facet-only extraction for backfilling existing sessions"
```

---

### Task 2.4: Build verification

```bash
pnpm build
```

---

## Phase 3: Server (Facet Aggregation API + Synthesis)

### Task 3.1: Create facets API route

**Files:**
- Create: `server/src/routes/facets.ts`
- Modify: `server/src/index.ts` (mount router)

**Step 1: Create facets router**

```typescript
// GET /api/facets?project=X&period=7d
//   Returns: { facets: SessionFacet[], missingCount: number, totalSessions: number }

// GET /api/facets/aggregated?project=X&period=7d
//   Returns: pre-aggregated friction categories, effective patterns, distributions

// POST /api/facets/backfill
//   Body: { sessionIds: string[] }
//   SSE: streams progress as facets are extracted one-by-one
```

**Step 2: Implement aggregation queries**

Friction aggregation using `json_each()`:

```sql
SELECT
  je.value ->> '$.category' as category,
  COUNT(*) as count,
  AVG(CASE
    WHEN je.value ->> '$.severity' = 'high' THEN 3
    WHEN je.value ->> '$.severity' = 'medium' THEN 2
    ELSE 1
  END) as avg_severity
FROM session_facets sf
JOIN sessions s ON sf.session_id = s.id
CROSS JOIN json_each(sf.friction_points) je
WHERE s.project_id = ? AND s.started_at >= ?
GROUP BY category
ORDER BY count DESC, avg_severity DESC
```

**Step 3: Mount in server/src/index.ts**

```typescript
import { facetsRouter } from './routes/facets.js';
app.route('/api/facets', facetsRouter);
```

**Step 4: Commit**

```bash
git add server/src/routes/facets.ts server/src/index.ts
git commit -m "feat(server): add facets API with aggregation queries"
```

---

### Task 3.2: Create synthesis prompts

**Files:**
- Create: `server/src/llm/reflect-prompts.ts`

**Step 1: Create file with 3 synthesis prompt templates**

Each prompt receives pre-aggregated data (aggregation done in code):

1. **FRICTION_WINS_SYSTEM_PROMPT** — receives ranked friction categories + effective patterns, outputs narrative analysis
2. **RULES_SKILLS_SYSTEM_PROMPT** — receives recurring friction + patterns, outputs CLAUDE.md rules + skill templates + hook configs
3. **WORKING_STYLE_SYSTEM_PROMPT** — receives aggregated stats, outputs narrative profile

Include hallucination guard in each: "Every claim must trace to the statistics provided. Patterns require 2+ occurrences."

**Step 2: Add response interfaces and parsers**

**Step 3: Commit**

```bash
git add server/src/llm/reflect-prompts.ts
git commit -m "feat(prompts): add synthesis prompts for Friction & Wins, Rules & Skills, Working Style"
```

---

### Task 3.3: Create reflect API route

**Files:**
- Create: `server/src/routes/reflect.ts`
- Modify: `server/src/index.ts` (mount router)

**Step 1: Create reflect router**

```typescript
// POST /api/reflect/generate
//   Body: { sections: ReflectSection[], period: string, project?: string }
//   SSE: streams progress through stages (aggregating -> synthesizing -> complete)
//   Final: { results: ReflectResult[] }

// GET /api/reflect/results?project=X&period=7d
//   Returns: stored/cached reflect results
```

**Step 2: Implement generation pipeline**

1. Query facets from `session_facets` table
2. Aggregate in code (friction categories ranked, patterns grouped)
3. For each requested section, call corresponding synthesis prompt
4. Return structured results

**Step 3: Mount in server/src/index.ts**

**Step 4: Commit**

```bash
git add server/src/routes/reflect.ts server/src/index.ts
git commit -m "feat(server): add reflect API with synthesis pipeline"
```

---

### Task 3.4: Build verification

```bash
pnpm build
```

---

## Phase 4: Dashboard (Patterns Page)

### Task 4.1: Create React Query hooks

**Files:**
- Create: `dashboard/src/hooks/useReflect.ts`

**Step 1: Create hooks**

```typescript
export function useFacetAggregation(project?: string, period?: string) { ... }
export function useReflectResults(project?: string, period?: string) { ... }
export function useGenerateReflect() { ... }  // mutation with SSE
export function useBackfillFacets() { ... }   // mutation with SSE progress
```

**Step 2: Commit**

```bash
git add dashboard/src/hooks/useReflect.ts
git commit -m "feat(dashboard): add React Query hooks for reflect/patterns API"
```

---

### Task 4.2: Create Patterns page

**Files:**
- Create: `dashboard/src/pages/PatternsPage.tsx`

**Step 1: Create page with 3 sections as tabs or accordion**

- **Friction & Wins** tab: friction category bar chart (Recharts), effective patterns list, narrative text
- **Rules & Skills** tab: generated rules with copy buttons, skill templates, hook configs
- **Working Style** tab: workflow distribution pie chart, outcome trend, narrative text

**Step 2: Add alert banner for missing facets**

When `missingCount > 0`, show: "X sessions haven't been analyzed for patterns yet. [Generate] (Est. ~$Y.YY)"

**Step 3: Add Generate button**

Triggers reflect generation with SSE progress display.

**Step 4: Commit**

```bash
git add dashboard/src/pages/PatternsPage.tsx
git commit -m "feat(dashboard): add Patterns page with Friction & Wins, Rules & Skills, Working Style sections"
```

---

### Task 4.3: Wire into App.tsx and Header.tsx

**Files:**
- Modify: `dashboard/src/App.tsx` (add `/patterns` route)
- Modify: `dashboard/src/components/layout/Header.tsx` (add nav item)

**Step 1: Add route**

```typescript
{ path: '/patterns', element: <PatternsPage /> }
```

**Step 2: Add nav item**

Add `{ label: 'Patterns', path: '/patterns', icon: Lightbulb }` to NAV_ITEMS (after Analytics).

**Step 3: Commit**

```bash
git add dashboard/src/App.tsx dashboard/src/components/layout/Header.tsx
git commit -m "feat(dashboard): wire Patterns page into routing and navigation"
```

---

### Task 4.4: Build verification

```bash
pnpm build
```

---

## Phase 5: CLI (reflect command + stats patterns)

### Task 5.1: Create reflect command

**Files:**
- Create: `cli/src/commands/reflect.ts`
- Modify: `cli/src/index.ts` (register command)

**Step 1: Create command**

```typescript
// code-insights reflect [--section <name>] [--period <range>] [--project <name>]
// 1. Starts the server if not running
// 2. Calls POST /api/reflect/generate via fetch
// 3. Streams SSE progress to terminal with ora spinner
// 4. Displays summary when complete
```

**Step 2: Register in index.ts**

**Step 3: Commit**

```bash
git add cli/src/commands/reflect.ts cli/src/index.ts
git commit -m "feat(cli): add reflect command for cross-session analysis generation"
```

---

### Task 5.2: Create stats patterns subcommand

**Files:**
- Create: `cli/src/commands/stats/actions/patterns.ts`
- Modify: `cli/src/commands/stats/index.ts` (register subcommand)

**Step 1: Create action handler**

```typescript
// code-insights stats patterns [--section <name>] [shared flags]
// Reads stored reflect results from GET /api/reflect/results
// Renders in terminal with chalk formatting:
// - Friction categories with colored severity bars
// - Top effective patterns
// - Working style narrative
```

**Step 2: Register in stats/index.ts**

Follow the exact pattern used by other subcommands (overview, cost, projects, today, models).

**Step 3: Commit**

```bash
git add cli/src/commands/stats/actions/patterns.ts cli/src/commands/stats/index.ts
git commit -m "feat(cli): add stats patterns subcommand for viewing reflect results"
```

---

### Task 5.3: Build verification

```bash
pnpm build
```

---

## Phase 6: Friction Category Normalization

### Task 6.1: Create friction normalization module

**Files:**
- Create: `server/src/llm/friction-normalize.ts`

**Step 1: Implement normalization**

Uses Levenshtein distance (port from existing `cli/src/commands/stats/data/fuzzy-match.ts`) to cluster similar friction categories during aggregation:

```typescript
import { CANONICAL_FRICTION_CATEGORIES } from './prompts.js';

export function normalizeFrictionCategory(category: string): string {
  // 1. Check exact match against canonical list
  // 2. Check Levenshtein distance <= 2 against canonical list
  // 3. Check if category is a substring of a canonical category (or vice versa)
  // 4. Return as-is if no match (novel category)
}

export function aggregateWithNormalization(
  frictionPoints: Array<{ category: string; [key: string]: unknown }>
): Map<string, Array<{ category: string; [key: string]: unknown }>> {
  // Groups friction points by normalized category
}
```

**Step 2: Wire into facets aggregation in facets.ts route**

**Step 3: Commit**

```bash
git add server/src/llm/friction-normalize.ts server/src/routes/facets.ts
git commit -m "feat(server): add Levenshtein friction category normalization"
```

---

## Phase 7: Integration Testing & Build Verification

### Task 7.1: Full workspace build

```bash
cd /Users/melagiri/Workspace/codeInsights/code-insights && pnpm build
```

### Task 7.2: Verify migration

```bash
# Delete test DB and verify schema applies cleanly
node -e "
const Database = require('better-sqlite3');
const db = new Database(':memory:');
// Run migration code
// Verify session_facets table exists
// Verify indexes exist
"
```

### Task 7.3: Manual smoke test

1. `code-insights sync` — verify sync still works
2. `code-insights dashboard` — verify Patterns page loads
3. Analyze a session — verify facets are extracted and stored
4. Visit Patterns page — verify missing facet alert shows
5. Generate reflect — verify synthesis works

---

## Implementation Order

Phases MUST be implemented sequentially (each depends on the prior):

```
Phase 1 (Foundation) → Phase 2 (Extraction) → Phase 3 (Server API) → Phase 4 (Dashboard) → Phase 5 (CLI) → Phase 6 (Normalization) → Phase 7 (Verification)
```

Within each phase, tasks can be done sequentially (they're small enough that parallelization doesn't help).
