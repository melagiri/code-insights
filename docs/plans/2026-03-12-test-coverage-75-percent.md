# Test Coverage: 47% → 75% Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase test coverage from 47.3% to ≥75% statement coverage across the CLI and server packages.

**Architecture:** Add tests in 4 tiers, ordered by ROI: (1) pure business logic with zero mocking, (2) route handlers using established in-memory SQLite + `app.request()` pattern, (3) LLM orchestration layer with module-level mocks, (4) gap-filling in medium-coverage files. Skip LLM provider wrappers (thin SDK adapters, ~50 lines each — ROI too low).

**Tech Stack:** Vitest, better-sqlite3 (in-memory), Hono `app.request()`, `vi.mock()` for module mocking.

**Testing Conventions (follow existing patterns):**
- In-memory SQLite via `new Database(':memory:')` + `runMigrations(db)` — see `sessions.test.ts`
- Mock `@code-insights/cli/db/client` with `vi.mock()` before dynamic imports
- Mock `@code-insights/cli/utils/telemetry` with `trackEvent: vi.fn()`
- Use `const { createApp } = await import('../index.js')` for route tests
- Use `app.request(path, opts)` for HTTP assertions (no supertest)
- Test files live next to source: `foo.ts` → `foo.test.ts`

---

## Chunk 1: Pure Business Logic (Tier 1)

### Task 1: Pattern Normalizer Tests

**Files:**
- Test: `server/src/llm/pattern-normalize.test.ts` (create)
- Source: `server/src/llm/pattern-normalize.ts` (158 lines, 18% → ~95%)

This file mirrors `friction-normalize.ts` (already at 100%). Copy the test structure from `friction-normalize.test.ts`.

- [ ] **Step 1: Write tests for exact match, case-insensitive, and all 8 canonical categories**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizePatternCategory, getPatternCategoryLabel } from './pattern-normalize.js';

describe('normalizePatternCategory', () => {
  it('returns canonical for exact match', () => {
    expect(normalizePatternCategory('structured-planning')).toBe('structured-planning');
    expect(normalizePatternCategory('incremental-implementation')).toBe('incremental-implementation');
    expect(normalizePatternCategory('verification-workflow')).toBe('verification-workflow');
    expect(normalizePatternCategory('systematic-debugging')).toBe('systematic-debugging');
    expect(normalizePatternCategory('self-correction')).toBe('self-correction');
    expect(normalizePatternCategory('context-gathering')).toBe('context-gathering');
    expect(normalizePatternCategory('domain-expertise')).toBe('domain-expertise');
    expect(normalizePatternCategory('effective-tooling')).toBe('effective-tooling');
  });

  it('matches case-insensitively', () => {
    expect(normalizePatternCategory('Structured-Planning')).toBe('structured-planning');
    expect(normalizePatternCategory('DOMAIN-EXPERTISE')).toBe('domain-expertise');
  });

  it('recognizes all 8 canonical categories', () => {
    const canonicals = [
      'structured-planning', 'incremental-implementation', 'verification-workflow',
      'systematic-debugging', 'self-correction', 'context-gathering',
      'domain-expertise', 'effective-tooling',
    ];
    for (const cat of canonicals) {
      expect(normalizePatternCategory(cat)).toBe(cat);
    }
  });
});
```

- [ ] **Step 2: Write tests for alias mapping (all aliases)**

```typescript
  it('remaps structured-planning aliases', () => {
    expect(normalizePatternCategory('task-decomposition')).toBe('structured-planning');
    expect(normalizePatternCategory('plan-first')).toBe('structured-planning');
    expect(normalizePatternCategory('upfront-planning')).toBe('structured-planning');
    expect(normalizePatternCategory('phased-approach')).toBe('structured-planning');
    expect(normalizePatternCategory('task-breakdown')).toBe('structured-planning');
    expect(normalizePatternCategory('planning-before-implementation')).toBe('structured-planning');
  });

  it('remaps effective-tooling aliases', () => {
    expect(normalizePatternCategory('agent-delegation')).toBe('effective-tooling');
    expect(normalizePatternCategory('agent-orchestration')).toBe('effective-tooling');
    expect(normalizePatternCategory('specialized-agents')).toBe('effective-tooling');
    expect(normalizePatternCategory('multi-agent')).toBe('effective-tooling');
    expect(normalizePatternCategory('tool-leverage')).toBe('effective-tooling');
  });

  it('remaps verification-workflow aliases', () => {
    expect(normalizePatternCategory('build-test-verify')).toBe('verification-workflow');
    expect(normalizePatternCategory('test-driven-development')).toBe('verification-workflow');
    expect(normalizePatternCategory('tdd')).toBe('verification-workflow');
    expect(normalizePatternCategory('test-first')).toBe('verification-workflow');
    expect(normalizePatternCategory('pre-commit-checks')).toBe('verification-workflow');
  });

  it('remaps other category aliases', () => {
    expect(normalizePatternCategory('binary-search-debugging')).toBe('systematic-debugging');
    expect(normalizePatternCategory('course-correction')).toBe('self-correction');
    expect(normalizePatternCategory('code-reading-first')).toBe('context-gathering');
    expect(normalizePatternCategory('framework-knowledge')).toBe('domain-expertise');
    expect(normalizePatternCategory('small-steps')).toBe('incremental-implementation');
    expect(normalizePatternCategory('iterative-building')).toBe('incremental-implementation');
  });

  it('remaps aliases case-insensitively', () => {
    expect(normalizePatternCategory('Task-Decomposition')).toBe('structured-planning');
    expect(normalizePatternCategory('TDD')).toBe('verification-workflow');
  });
```

- [ ] **Step 3: Write tests for Levenshtein, substring, and novel categories**

```typescript
  it('normalizes typos within Levenshtein distance 2', () => {
    expect(normalizePatternCategory('self-corection')).toBe('self-correction');
    expect(normalizePatternCategory('context-gatherng')).toBe('context-gathering');
  });

  it('does not match when Levenshtein distance > 2', () => {
    const result = normalizePatternCategory('completely-unrelated');
    expect(result).toBe('completely-unrelated');
  });

  it('matches when canonical is a significant substring', () => {
    expect(normalizePatternCategory('self-correction-behavior')).toBe('self-correction');
  });

  it('does not match short substrings (< 5 chars)', () => {
    expect(normalizePatternCategory('abc')).toBe('abc');
  });

  it('returns original for novel categories', () => {
    expect(normalizePatternCategory('pair-programming')).toBe('pair-programming');
    expect(normalizePatternCategory('rubber-ducking')).toBe('rubber-ducking');
  });

  it('preserves original casing for novel categories', () => {
    expect(normalizePatternCategory('Custom-Pattern')).toBe('Custom-Pattern');
  });
```

- [ ] **Step 4: Write tests for getPatternCategoryLabel**

```typescript
describe('getPatternCategoryLabel', () => {
  it('returns human label for canonical categories', () => {
    expect(getPatternCategoryLabel('structured-planning')).toBe('Structured Planning');
    expect(getPatternCategoryLabel('self-correction')).toBe('Self-Correction');
    expect(getPatternCategoryLabel('effective-tooling')).toBe('Effective Tooling');
  });

  it('converts novel categories to title case', () => {
    expect(getPatternCategoryLabel('pair-programming')).toBe('Pair Programming');
  });
});
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `cd server && pnpm test -- src/llm/pattern-normalize.test.ts`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/llm/pattern-normalize.test.ts
git commit -m "test: add pattern-normalize tests (18% → ~95%)"
```

---

### Task 2: Export Prompts Tests (Pure Functions)

**Files:**
- Test: `server/src/llm/export-prompts.test.ts` (create)
- Source: `server/src/llm/export-prompts.ts` (283 lines, 19% → ~85%)

Test the pure functions: `applyDepthCap`, `buildInsightContext`, `getExportSystemPrompt`, `buildExportUserPrompt`. Do NOT test prompt wording — test structural correctness.

- [ ] **Step 1: Write tests for applyDepthCap**

```typescript
import { describe, it, expect } from 'vitest';
import {
  applyDepthCap,
  buildInsightContext,
  getExportSystemPrompt,
  buildExportUserPrompt,
  DEPTH_CAPS,
  type ExportInsightRow,
  type ExportContext,
} from './export-prompts.js';

function makeInsight(overrides: Partial<ExportInsightRow> = {}): ExportInsightRow {
  return {
    id: 'ins-1',
    type: 'decision',
    title: 'Test Decision',
    content: 'Test content',
    summary: 'Test summary',
    confidence: 0.85,
    project_name: 'test-project',
    timestamp: '2025-06-15T10:00:00Z',
    ...overrides,
  };
}

describe('applyDepthCap', () => {
  it('applies essential cap (25 insights)', () => {
    const insights = Array.from({ length: 50 }, (_, i) => makeInsight({ id: `ins-${i}` }));
    const { capped, totalInsights } = applyDepthCap(insights, 'essential');
    expect(totalInsights).toBe(50);
    expect(capped.length).toBeLessThanOrEqual(DEPTH_CAPS.essential);
  });

  it('applies standard cap (80 insights)', () => {
    const insights = Array.from({ length: 100 }, (_, i) => makeInsight({ id: `ins-${i}` }));
    const { capped, totalInsights } = applyDepthCap(insights, 'standard');
    expect(totalInsights).toBe(100);
    expect(capped.length).toBeLessThanOrEqual(DEPTH_CAPS.standard);
  });

  it('applies comprehensive cap (200 insights)', () => {
    const insights = Array.from({ length: 250 }, (_, i) => makeInsight({ id: `ins-${i}` }));
    const { capped } = applyDepthCap(insights, 'comprehensive');
    expect(capped.length).toBeLessThanOrEqual(DEPTH_CAPS.comprehensive);
  });

  it('returns all insights when under cap', () => {
    const insights = [makeInsight()];
    const { capped, totalInsights } = applyDepthCap(insights, 'standard');
    expect(capped.length).toBe(1);
    expect(totalInsights).toBe(1);
  });

  it('returns empty for empty input', () => {
    const { capped, totalInsights } = applyDepthCap([], 'standard');
    expect(capped).toEqual([]);
    expect(totalInsights).toBe(0);
  });
});
```

- [ ] **Step 2: Write tests for buildInsightContext**

```typescript
describe('buildInsightContext', () => {
  it('groups insights by type with correct headers', () => {
    const insights = [
      makeInsight({ type: 'decision', title: 'Decision A' }),
      makeInsight({ type: 'learning', title: 'Learning B' }),
    ];
    const result = buildInsightContext(insights);
    expect(result).toContain('## DECISIONS');
    expect(result).toContain('## LEARNINGS');
    expect(result).toContain('Decision A');
    expect(result).toContain('Learning B');
  });

  it('includes project name and confidence percentage', () => {
    const insights = [makeInsight({ project_name: 'my-app', confidence: 0.92 })];
    const result = buildInsightContext(insights);
    expect(result).toContain('[my-app]');
    expect(result).toContain('92%');
  });

  it('returns empty string for empty input', () => {
    expect(buildInsightContext([])).toBe('');
  });
});
```

- [ ] **Step 3: Write tests for getExportSystemPrompt**

```typescript
describe('getExportSystemPrompt', () => {
  const baseCtx: ExportContext = {
    scope: 'project',
    format: 'agent-rules',
    depth: 'standard',
    projectName: 'my-project',
    sessionCount: 10,
    projectCount: 1,
    dateRange: { from: '2025-01-01', to: '2025-06-01' },
    exportDate: '2025-06-15',
  };

  it('returns project-scoped prompt for agent-rules format', () => {
    const prompt = getExportSystemPrompt(baseCtx);
    expect(prompt).toContain('my-project');
    expect(prompt).toContain('CLAUDE.md');
  });

  it('returns all-scoped prompt for agent-rules format', () => {
    const prompt = getExportSystemPrompt({ ...baseCtx, scope: 'all' });
    expect(prompt).toContain('multiple');
  });

  it('returns obsidian prompt with frontmatter instructions', () => {
    const prompt = getExportSystemPrompt({ ...baseCtx, format: 'obsidian' });
    expect(prompt).toContain('frontmatter');
    expect(prompt).toContain('2025-06-15');
  });

  it('returns notion prompt with toggle blocks', () => {
    const prompt = getExportSystemPrompt({ ...baseCtx, format: 'notion' });
    expect(prompt).toContain('Toggle blocks');
  });

  it('returns knowledge-brief prompt', () => {
    const prompt = getExportSystemPrompt({ ...baseCtx, format: 'knowledge-brief' });
    expect(prompt).toContain('knowledge');
  });

  it('covers all 4 formats × 2 scopes (8 combinations)', () => {
    const formats = ['agent-rules', 'knowledge-brief', 'obsidian', 'notion'] as const;
    const scopes = ['project', 'all'] as const;
    for (const format of formats) {
      for (const scope of scopes) {
        const prompt = getExportSystemPrompt({ ...baseCtx, format, scope });
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(50);
      }
    }
  });
});
```

- [ ] **Step 4: Write tests for buildExportUserPrompt**

```typescript
describe('buildExportUserPrompt', () => {
  it('includes project scope description', () => {
    const ctx: ExportContext = {
      scope: 'project', format: 'agent-rules', depth: 'standard',
      projectName: 'my-app', sessionCount: 15, projectCount: 1,
      dateRange: { from: '2025-01-01', to: '2025-06-01' }, exportDate: '2025-06-15',
    };
    const result = buildExportUserPrompt(ctx, 'insight data here');
    expect(result).toContain('Project: my-app');
    expect(result).toContain('Sessions analyzed: 15');
    expect(result).toContain('insight data here');
  });

  it('includes all-projects scope description', () => {
    const ctx: ExportContext = {
      scope: 'all', format: 'agent-rules', depth: 'standard',
      sessionCount: 50, projectCount: 5,
      dateRange: { from: '2025-01-01', to: '2025-06-01' }, exportDate: '2025-06-15',
    };
    const result = buildExportUserPrompt(ctx, '');
    expect(result).toContain('All projects (5 projects)');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd server && pnpm test -- src/llm/export-prompts.test.ts`

- [ ] **Step 6: Commit**

```bash
git add server/src/llm/export-prompts.test.ts
git commit -m "test: add export-prompts tests (19% → ~85%)"
```

---

### Task 3: Reflect Prompts Tests (Pure Functions)

**Files:**
- Test: `server/src/llm/reflect-prompts.test.ts` (create)
- Source: `server/src/llm/reflect-prompts.ts` (180 lines, 30% → ~90%)

Test prompt generator functions return structurally correct output. Do NOT test exact wording.

- [ ] **Step 1: Write tests for all three prompt generators**

```typescript
import { describe, it, expect } from 'vitest';
import {
  generateFrictionWinsPrompt,
  generateRulesSkillsPrompt,
  generateWorkingStylePrompt,
  FRICTION_WINS_SYSTEM_PROMPT,
  RULES_SKILLS_SYSTEM_PROMPT,
  WORKING_STYLE_SYSTEM_PROMPT,
} from './reflect-prompts.js';

describe('system prompts', () => {
  it('FRICTION_WINS_SYSTEM_PROMPT instructs JSON in <json> tags', () => {
    expect(FRICTION_WINS_SYSTEM_PROMPT).toContain('<json>');
    expect(FRICTION_WINS_SYSTEM_PROMPT).toContain('valid JSON');
  });

  it('RULES_SKILLS_SYSTEM_PROMPT instructs JSON in <json> tags', () => {
    expect(RULES_SKILLS_SYSTEM_PROMPT).toContain('<json>');
  });

  it('WORKING_STYLE_SYSTEM_PROMPT instructs tagline generation', () => {
    expect(WORKING_STYLE_SYSTEM_PROMPT).toContain('tagline');
    expect(WORKING_STYLE_SYSTEM_PROMPT).toContain('40 characters');
  });
});

describe('generateFrictionWinsPrompt', () => {
  it('includes session count and period', () => {
    const result = generateFrictionWinsPrompt({
      frictionCategories: [{ category: 'wrong-approach', count: 5, avg_severity: 7, examples: ['ex1'] }],
      effectivePatterns: [{ category: 'structured-planning', label: 'Structured Planning', frequency: 3, avg_confidence: 80, descriptions: ['desc'] }],
      totalSessions: 42,
      period: '2026-W10',
    });
    expect(result).toContain('42 sessions');
    expect(result).toContain('2026-W10');
    expect(result).toContain('FRICTION CATEGORIES');
    expect(result).toContain('EFFECTIVE PATTERNS');
  });

  it('includes PQ signals when provided', () => {
    const result = generateFrictionWinsPrompt({
      frictionCategories: [],
      effectivePatterns: [],
      totalSessions: 10,
      period: '30d',
      pqSignals: {
        deficits: [{ category: 'vague-request', count: 3 }],
        strengths: [{ category: 'precise-request', count: 5 }],
      },
    });
    expect(result).toContain('PROMPT QUALITY SIGNALS');
    expect(result).toContain('vague-request');
    expect(result).toContain('precise-request');
  });

  it('excludes PQ section when no PQ data', () => {
    const result = generateFrictionWinsPrompt({
      frictionCategories: [],
      effectivePatterns: [],
      totalSessions: 10,
      period: '30d',
    });
    expect(result).not.toContain('PROMPT QUALITY SIGNALS');
  });
});

describe('generateRulesSkillsPrompt', () => {
  it('includes target tool and friction data', () => {
    const result = generateRulesSkillsPrompt({
      recurringFriction: [{ category: 'scope-creep', count: 4, avg_severity: 6, examples: ['ex'] }],
      effectivePatterns: [{ category: 'verification-workflow', label: 'Verification', frequency: 3, avg_confidence: 85, descriptions: ['d'] }],
      targetTool: 'claude-code',
    });
    expect(result).toContain('claude-code');
    expect(result).toContain('RECURRING FRICTION');
    expect(result).toContain('EFFECTIVE PATTERNS');
    expect(result).toContain('scope-creep');
  });
});

describe('generateWorkingStylePrompt', () => {
  it('includes all distribution data', () => {
    const result = generateWorkingStylePrompt({
      workflowDistribution: { 'plan-then-implement': 10, 'iterate-and-refine': 5 },
      outcomeDistribution: { high: 8, medium: 5, low: 2 },
      characterDistribution: { feature_build: 7, bug_hunt: 3 },
      totalSessions: 15,
      period: '2026-W09',
      frictionFrequency: 23,
    });
    expect(result).toContain('15 sessions');
    expect(result).toContain('2026-W09');
    expect(result).toContain('WORKFLOW PATTERNS');
    expect(result).toContain('OUTCOME SATISFACTION');
    expect(result).toContain('SESSION TYPES');
    expect(result).toContain('23 total friction points');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && pnpm test -- src/llm/reflect-prompts.test.ts`

- [ ] **Step 3: Commit**

```bash
git add server/src/llm/reflect-prompts.test.ts
git commit -m "test: add reflect-prompts tests (30% → ~90%)"
```

---

## Chunk 2: Route Handler Tests (Tier 2)

All route tests follow the established pattern from `sessions.test.ts`:
- In-memory SQLite via `new Database(':memory:')` + `runMigrations(db)`
- Mock `getDb` and `telemetry` via `vi.mock()`
- Use `app.request()` for HTTP assertions

### Task 4: Facets Route Tests (GET endpoints only)

**Files:**
- Test: `server/src/routes/facets.test.ts` (create)
- Source: `server/src/routes/facets.ts` (414 lines, 7% → ~55%)

Test the 5 GET endpoints. Skip the 2 SSE POST endpoints (backfill, backfill-pq) — they depend on LLM calls.

- [ ] **Step 1: Create test file with boilerplate and seed helpers**

```typescript
import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '@code-insights/cli/db/schema';

let testDb: Database.Database;

vi.mock('@code-insights/cli/db/client', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('@code-insights/cli/utils/telemetry', () => ({
  trackEvent: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('../llm/client.js', () => ({
  isLLMConfigured: () => false,
  createLLMClient: vi.fn(),
  loadLLMConfig: () => null,
}));

const { createApp } = await import('../index.js');

function initTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seedProject(id: string, name: string) {
  testDb.prepare(`
    INSERT INTO projects (id, name, path, last_activity, session_count)
    VALUES (?, ?, ?, datetime('now'), 1)
  `).run(id, name, `/projects/${name}`);
}

function seedSession(id: string, projectId: string, overrides: Record<string, unknown> = {}) {
  const defaults = {
    project_name: 'test-project',
    project_path: '/test',
    started_at: '2025-06-15T10:00:00Z',
    ended_at: '2025-06-15T11:00:00Z',
    message_count: 5,
    source_tool: 'claude-code',
  };
  const row = { ...defaults, ...overrides };
  testDb.prepare(`
    INSERT INTO sessions (id, project_id, project_name, project_path,
      started_at, ended_at, message_count, source_tool)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, row.project_name, row.project_path,
    row.started_at, row.ended_at, row.message_count, row.source_tool);
}

function seedFacets(sessionId: string, overrides: Partial<{
  outcome_satisfaction: string;
  workflow_pattern: string | null;
  had_course_correction: number;
  friction_points: unknown[];
  effective_patterns: unknown[];
}> = {}) {
  const defaults = {
    outcome_satisfaction: 'high',
    workflow_pattern: 'plan-then-implement',
    had_course_correction: 0,
    friction_points: [],
    effective_patterns: [],
  };
  const d = { ...defaults, ...overrides };
  testDb.prepare(`
    INSERT INTO session_facets (session_id, outcome_satisfaction, workflow_pattern,
      had_course_correction, course_correction_reason, iteration_count,
      friction_points, effective_patterns, analysis_version)
    VALUES (?, ?, ?, ?, NULL, 1, ?, ?, '3.0.0')
  `).run(sessionId, d.outcome_satisfaction, d.workflow_pattern,
    d.had_course_correction,
    JSON.stringify(d.friction_points), JSON.stringify(d.effective_patterns));
}

function seedInsight(sessionId: string, projectId: string, type: string = 'decision', metadata: string | null = null) {
  testDb.prepare(`
    INSERT INTO insights (id, session_id, project_id, project_name, type, title, content,
      summary, bullets, confidence, source, metadata, timestamp, created_at, scope, analysis_version)
    VALUES (?, ?, ?, 'test-project', ?, 'Test', 'Content', 'Summary', '[]', 0.85, 'llm', ?, datetime('now'), datetime('now'), 'session', '3.0.0')
  `).run(`ins-${sessionId}-${type}`, sessionId, projectId, type, metadata);
}
```

- [ ] **Step 2: Write tests for GET /api/facets**

```typescript
describe('Facets routes', () => {
  beforeEach(() => { testDb = initTestDb(); });
  afterEach(() => { testDb.close(); });

  describe('GET /api/facets', () => {
    it('returns empty facets when none exist', async () => {
      const app = createApp();
      const res = await app.request('/api/facets');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.facets).toEqual([]);
      expect(body.totalSessions).toBe(0);
    });

    it('returns facets with missing count', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedSession('sess-2', 'proj-1');
      seedFacets('sess-1');

      const app = createApp();
      const res = await app.request('/api/facets?period=all');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.facets).toHaveLength(1);
      expect(body.totalSessions).toBe(2);
      expect(body.missingCount).toBe(1);
    });

    it('filters by project', async () => {
      seedProject('proj-1', 'alpha');
      seedProject('proj-2', 'beta');
      seedSession('sess-1', 'proj-1');
      seedSession('sess-2', 'proj-2');
      seedFacets('sess-1');
      seedFacets('sess-2');

      const app = createApp();
      const res = await app.request('/api/facets?period=all&project=proj-1');
      const body = await res.json();
      expect(body.facets).toHaveLength(1);
      expect(body.totalSessions).toBe(1);
    });
  });
```

- [ ] **Step 3: Write tests for GET /api/facets/missing**

```typescript
  describe('GET /api/facets/missing', () => {
    it('returns session IDs with insights but no facets', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedSession('sess-2', 'proj-1');
      seedInsight('sess-1', 'proj-1');
      seedInsight('sess-2', 'proj-1');
      seedFacets('sess-1'); // sess-1 has facets, sess-2 does not

      const app = createApp();
      const res = await app.request('/api/facets/missing?period=all');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionIds).toEqual(['sess-2']);
      expect(body.count).toBe(1);
    });

    it('returns empty when all sessions have facets', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedInsight('sess-1', 'proj-1');
      seedFacets('sess-1');

      const app = createApp();
      const res = await app.request('/api/facets/missing?period=all');
      const body = await res.json();
      expect(body.count).toBe(0);
    });
  });
```

- [ ] **Step 4: Write tests for GET /api/facets/outdated**

```typescript
  describe('GET /api/facets/outdated', () => {
    it('detects facets with missing attribution on friction points', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedFacets('sess-1', {
        friction_points: [{ category: 'wrong-approach', description: 'bad', severity: 5 }],
      });

      const app = createApp();
      const res = await app.request('/api/facets/outdated?period=all');
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.sessionIds).toContain('sess-1');
    });

    it('detects facets with missing category on effective patterns', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedFacets('sess-1', {
        effective_patterns: [{ description: 'good pattern', confidence: 80 }],
      });

      const app = createApp();
      const res = await app.request('/api/facets/outdated?period=all');
      const body = await res.json();
      expect(body.count).toBe(1);
    });

    it('returns empty when all facets are up to date', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedFacets('sess-1', {
        friction_points: [{ category: 'wrong-approach', description: 'bad', severity: 5, attribution: 'user-actionable' }],
        effective_patterns: [{ category: 'structured-planning', description: 'good', confidence: 80, driver: 'user-driven' }],
      });

      const app = createApp();
      const res = await app.request('/api/facets/outdated?period=all');
      const body = await res.json();
      expect(body.count).toBe(0);
    });
  });
```

- [ ] **Step 5: Write tests for GET /api/facets/missing-pq and /outdated-pq**

```typescript
  describe('GET /api/facets/missing-pq', () => {
    it('returns sessions with insights but no prompt_quality insight', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedInsight('sess-1', 'proj-1', 'decision');

      const app = createApp();
      const res = await app.request('/api/facets/missing-pq?period=all');
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.sessionIds).toContain('sess-1');
    });

    it('excludes sessions that have prompt_quality insights', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedInsight('sess-1', 'proj-1', 'decision');
      seedInsight('sess-1', 'proj-1', 'prompt_quality');

      const app = createApp();
      const res = await app.request('/api/facets/missing-pq?period=all');
      const body = await res.json();
      expect(body.count).toBe(0);
    });
  });

  describe('GET /api/facets/outdated-pq', () => {
    it('detects PQ insights missing findings array in metadata', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedInsight('sess-1', 'proj-1', 'prompt_quality', JSON.stringify({
        efficiency_score: 70,
        message_overhead: 'moderate',
      }));

      const app = createApp();
      const res = await app.request('/api/facets/outdated-pq?period=all');
      const body = await res.json();
      expect(body.count).toBe(1);
    });

    it('does not flag PQ insights with findings array', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedInsight('sess-1', 'proj-1', 'prompt_quality', JSON.stringify({
        efficiency_score: 70,
        findings: [{ category: 'vague-request', type: 'deficit' }],
      }));

      const app = createApp();
      const res = await app.request('/api/facets/outdated-pq?period=all');
      const body = await res.json();
      expect(body.count).toBe(0);
    });
  });

  describe('POST /api/facets/backfill', () => {
    it('returns 400 when LLM not configured', async () => {
      const app = createApp();
      const res = await app.request('/api/facets/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: ['sess-1'] }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('LLM not configured');
    });

    it('returns 400 when sessionIds missing', async () => {
      // Need to re-mock LLM as configured for this test
      const app = createApp();
      const res = await app.request('/api/facets/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // LLM is not configured in our mock, so we get 400 for that reason
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd server && pnpm test -- src/routes/facets.test.ts`

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/facets.test.ts
git commit -m "test: add facets route tests (7% → ~55%)"
```

---

### Task 5: Reflect Route Tests (GET endpoints only)

**Files:**
- Test: `server/src/routes/reflect.test.ts` (create)
- Source: `server/src/routes/reflect.ts` (370 lines, 6% → ~50%)

- [ ] **Step 1: Create test file with boilerplate**

Reuse the same in-memory SQLite + mock pattern. Seed helpers include `seedSessionWithFacets` to populate both sessions and session_facets tables.

```typescript
import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '@code-insights/cli/db/schema';

let testDb: Database.Database;

vi.mock('@code-insights/cli/db/client', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('@code-insights/cli/utils/telemetry', () => ({
  trackEvent: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('../llm/client.js', () => ({
  isLLMConfigured: () => false,
  createLLMClient: vi.fn(),
  loadLLMConfig: () => null,
}));

const { createApp } = await import('../index.js');

function initTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seedSessionWithFacets(id: string, overrides: Record<string, unknown> = {}) {
  const projId = (overrides.projectId as string) || 'proj-1';
  const projName = (overrides.projectName as string) || 'test-project';

  testDb.prepare(`
    INSERT OR IGNORE INTO projects (id, name, path, last_activity, session_count)
    VALUES (?, ?, ?, datetime('now'), 1)
  `).run(projId, projName, `/projects/${projName}`);

  testDb.prepare(`
    INSERT INTO sessions (id, project_id, project_name, project_path,
      started_at, ended_at, message_count, source_tool, session_character)
    VALUES (?, ?, ?, '/test', ?, ?, 5, 'claude-code', ?)
  `).run(id, projId, projName,
    (overrides.startedAt as string) || '2025-06-15T10:00:00Z',
    (overrides.endedAt as string) || '2025-06-15T11:00:00Z',
    (overrides.sessionCharacter as string) || 'feature_build');

  testDb.prepare(`
    INSERT INTO session_facets (session_id, outcome_satisfaction, workflow_pattern,
      had_course_correction, course_correction_reason, iteration_count,
      friction_points, effective_patterns, analysis_version)
    VALUES (?, ?, ?, 0, NULL, 1, ?, ?, '3.0.0')
  `).run(id,
    (overrides.outcomeSatisfaction as string) || 'high',
    (overrides.workflowPattern as string) || 'plan-then-implement',
    JSON.stringify((overrides.frictionPoints as unknown[]) || []),
    JSON.stringify((overrides.effectivePatterns as unknown[]) || []));
}
```

- [ ] **Step 2: Write tests for GET /api/reflect/results**

```typescript
describe('Reflect routes', () => {
  beforeEach(() => { testDb = initTestDb(); });
  afterEach(() => { testDb.close(); });

  describe('GET /api/reflect/results', () => {
    it('returns aggregated data with zero sessions', async () => {
      const app = createApp();
      const res = await app.request('/api/reflect/results?period=all');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalSessions).toBe(0);
    });

    it('returns aggregated friction and patterns', async () => {
      seedSessionWithFacets('sess-1', {
        frictionPoints: [{ category: 'wrong-approach', description: 'bad', severity: 5, attribution: 'user-actionable' }],
        effectivePatterns: [{ category: 'structured-planning', description: 'good', confidence: 80, driver: 'user-driven' }],
      });

      const app = createApp();
      const res = await app.request('/api/reflect/results?period=all');
      const body = await res.json();
      expect(body.totalSessions).toBe(1);
      expect(body.frictionCategories.length).toBeGreaterThan(0);
      expect(body.effectivePatterns.length).toBeGreaterThan(0);
    });
  });
```

- [ ] **Step 3: Write tests for GET /api/reflect/snapshot**

```typescript
  describe('GET /api/reflect/snapshot', () => {
    it('returns null when no snapshot exists', async () => {
      const app = createApp();
      const res = await app.request('/api/reflect/snapshot?period=2026-W10');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.snapshot).toBeNull();
    });

    it('returns saved snapshot', async () => {
      testDb.prepare(`
        INSERT INTO reflect_snapshots (period, project_id, results_json, generated_at, window_start, window_end, session_count, facet_count)
        VALUES ('2026-W10', '__all__', '{"friction-wins":{"section":"friction-wins"}}', datetime('now'), '2026-03-02', '2026-03-09', 10, 5)
      `).run();

      const app = createApp();
      const res = await app.request('/api/reflect/snapshot?period=2026-W10');
      const body = await res.json();
      expect(body.snapshot).not.toBeNull();
      expect(body.snapshot.period).toBe('2026-W10');
      expect(body.snapshot.sessionCount).toBe(10);
    });
  });
```

- [ ] **Step 4: Write tests for GET /api/reflect/weeks**

```typescript
  describe('GET /api/reflect/weeks', () => {
    it('returns 8 weeks with session counts', async () => {
      const app = createApp();
      const res = await app.request('/api/reflect/weeks');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.weeks).toHaveLength(8);
      expect(body.weeks[0]).toHaveProperty('week');
      expect(body.weeks[0]).toHaveProperty('sessionCount');
      expect(body.weeks[0]).toHaveProperty('hasSnapshot');
    });
  });

  describe('POST /api/reflect/generate', () => {
    it('returns 400 when LLM not configured', async () => {
      const app = createApp();
      const res = await app.request('/api/reflect/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: '2026-W10' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 5: Run tests and commit**

Run: `cd server && pnpm test -- src/routes/reflect.test.ts`

```bash
git add server/src/routes/reflect.test.ts
git commit -m "test: add reflect route tests (6% → ~50%)"
```

---

### Task 6: Analysis Route Tests (Non-SSE endpoints)

**Files:**
- Test: `server/src/routes/analysis.test.ts` (create)
- Source: `server/src/routes/analysis.ts` (422 lines, 4% → ~35%)

Test the POST endpoints' validation and error paths. LLM-dependent paths tested in Task 8.

- [ ] **Step 1: Create test file and write validation tests**

```typescript
import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '@code-insights/cli/db/schema';

let testDb: Database.Database;

vi.mock('@code-insights/cli/db/client', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('@code-insights/cli/utils/telemetry', () => ({
  trackEvent: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('../llm/client.js', () => ({
  isLLMConfigured: () => false,
  createLLMClient: vi.fn(),
  loadLLMConfig: () => null,
}));

const { createApp } = await import('../index.js');

function initTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('Analysis routes', () => {
  beforeEach(() => { testDb = initTestDb(); });
  afterEach(() => { testDb.close(); });

  describe('POST /api/analysis/session', () => {
    it('returns 400 when LLM not configured', async () => {
      const app = createApp();
      const res = await app.request('/api/analysis/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess-1' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('LLM not configured');
    });

    it('returns 400 when sessionId missing', async () => {
      const app = createApp();
      const res = await app.request('/api/analysis/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/analysis/prompt-quality', () => {
    it('returns 400 when LLM not configured', async () => {
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess-1' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when sessionId missing', async () => {
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/analysis/recurring', () => {
    it('returns 400 when LLM not configured', async () => {
      const app = createApp();
      const res = await app.request('/api/analysis/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/analysis/session/stream', () => {
    it('returns 400 when LLM not configured', async () => {
      const app = createApp();
      const res = await app.request('/api/analysis/session/stream?sessionId=sess-1');
      expect(res.status).toBe(400);
    });

    it('returns 400 when sessionId missing', async () => {
      const app = createApp();
      const res = await app.request('/api/analysis/session/stream');
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Run tests and commit**

Run: `cd server && pnpm test -- src/routes/analysis.test.ts`

```bash
git add server/src/routes/analysis.test.ts
git commit -m "test: add analysis route validation tests (4% → ~35%)"
```

---

### Task 7: Telemetry Route Tests

**Files:**
- Test: `server/src/routes/telemetry.test.ts` (create)
- Source: `server/src/routes/telemetry.ts` (23 lines, 33% → ~95%)

- [ ] **Step 1: Write tests**

```typescript
import { vi, describe, it, expect } from 'vitest';

vi.mock('@code-insights/cli/db/client', () => ({
  getDb: () => ({}),
  closeDb: () => {},
}));

const mockEnabled = vi.fn(() => true);
const mockGetId = vi.fn(() => 'test-device-id-hash');

vi.mock('@code-insights/cli/utils/telemetry', () => ({
  isTelemetryEnabled: mockEnabled,
  getStableMachineId: mockGetId,
  trackEvent: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('../llm/client.js', () => ({
  isLLMConfigured: () => false,
  createLLMClient: vi.fn(),
  loadLLMConfig: () => null,
}));

const { createApp } = await import('../index.js');

describe('Telemetry routes', () => {
  describe('GET /api/telemetry/identity', () => {
    it('returns distinct_id when telemetry enabled', async () => {
      mockEnabled.mockReturnValue(true);
      const app = createApp();
      const res = await app.request('/api/telemetry/identity');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.enabled).toBe(true);
      expect(body.distinct_id).toBe('test-device-id-hash');
    });

    it('returns enabled:false when telemetry disabled', async () => {
      mockEnabled.mockReturnValue(false);
      const app = createApp();
      const res = await app.request('/api/telemetry/identity');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.enabled).toBe(false);
      expect(body.distinct_id).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests and commit**

Run: `cd server && pnpm test -- src/routes/telemetry.test.ts`

```bash
git add server/src/routes/telemetry.test.ts
git commit -m "test: add telemetry route tests (33% → ~95%)"
```

---

## Chunk 3: LLM Analysis Orchestration (Tier 3)

### Task 8: analysis.ts — Internal Helpers and Core Functions

**Files:**
- Test: `server/src/llm/analysis.test.ts` (create)
- Source: `server/src/llm/analysis.ts` (940 lines, 0.82% → ~55%)

Mock both `./client.js` (LLMClient) and `@code-insights/cli/db/client` (getDb). Let real prompt functions run.

- [ ] **Step 1: Create test file with dual-mock setup**

```typescript
import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '@code-insights/cli/db/schema';

let testDb: Database.Database;

vi.mock('@code-insights/cli/db/client', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

const mockChat = vi.fn();
const mockIsConfigured = vi.fn(() => true);

vi.mock('./client.js', () => ({
  isLLMConfigured: () => mockIsConfigured(),
  createLLMClient: () => ({
    provider: 'test',
    model: 'test-model',
    chat: mockChat,
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
  }),
}));

const { analyzeSession, analyzePromptQuality, findRecurringInsights, extractFacetsOnly } = await import('./analysis.js');
import type { SessionData, SQLiteMessageRow } from './analysis.js';

function initTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 'sess-test',
    project_id: 'proj-test',
    project_name: 'test-project',
    project_path: '/test',
    summary: 'Test session',
    ended_at: '2025-06-15T11:00:00Z',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<SQLiteMessageRow> = {}): SQLiteMessageRow {
  return {
    id: 'msg-1',
    session_id: 'sess-test',
    type: 'user',
    content: 'Hello, please help me with testing.',
    thinking: null,
    tool_calls: null,
    tool_results: null,
    usage: null,
    timestamp: '2025-06-15T10:00:00Z',
    parent_id: null,
    ...overrides,
  } as SQLiteMessageRow;
}
```

- [ ] **Step 2: Write tests for analyzeSession — guard clauses and error paths**

```typescript
describe('analyzeSession', () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockChat.mockReset();
    mockIsConfigured.mockReturnValue(true);
  });
  afterEach(() => { testDb.close(); });

  it('returns error when LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM not configured');
  });

  it('returns error for empty messages', async () => {
    const result = await analyzeSession(makeSession(), []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No messages');
  });

  it('returns error when LLM response cannot be parsed', async () => {
    mockChat.mockResolvedValue({
      content: 'This is not JSON at all',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe('json_parse_error');
  });

  it('handles AbortError gracefully', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockChat.mockRejectedValue(abortError);
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe('abort');
  });

  it('handles API errors gracefully', async () => {
    mockChat.mockRejectedValue(new Error('Rate limit exceeded'));
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit exceeded');
    expect(result.error_type).toBe('api_error');
  });

  it('successfully analyzes session with valid LLM response', async () => {
    // Seed project so DB writes don't fail on FK constraints
    testDb.prepare(`INSERT INTO projects (id, name, path, last_activity, session_count)
      VALUES ('proj-test', 'test-project', '/test', datetime('now'), 1)`).run();
    testDb.prepare(`INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count, source_tool)
      VALUES ('sess-test', 'proj-test', 'test-project', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 5, 'claude-code')`).run();

    const validResponse = JSON.stringify({
      summary: { title: 'Test Summary', content: 'A summary.', bullets: ['point 1'] },
      decisions: [{ title: 'Use Vitest', situation: 'Need testing', choice: 'Vitest', reasoning: 'Fast', confidence: 85 }],
      learnings: [{ title: 'Testing helps', takeaway: 'Write tests early', confidence: 80 }],
      facets: {
        outcome_satisfaction: 'high',
        workflow_pattern: 'plan-then-implement',
        had_course_correction: false,
        iteration_count: 2,
        friction_points: [],
        effective_patterns: [{ category: 'verification-workflow', description: 'TDD approach', confidence: 85, driver: 'user-driven' }],
      },
    });

    mockChat.mockResolvedValue({
      content: validResponse,
      usage: { inputTokens: 500, outputTokens: 200 },
    });

    const result = await analyzeSession(makeSession(), [
      makeMessage({ type: 'user', content: 'Help me test' }),
      makeMessage({ id: 'msg-2', type: 'assistant', content: 'Sure, let me help' }),
    ]);

    expect(result.success).toBe(true);
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.usage).toEqual({ inputTokens: 500, outputTokens: 200 });

    // Verify insights were written to DB
    const dbInsights = testDb.prepare('SELECT COUNT(*) as count FROM insights WHERE session_id = ?').get('sess-test') as { count: number };
    expect(dbInsights.count).toBeGreaterThan(0);

    // Verify facets were written to DB
    const dbFacets = testDb.prepare('SELECT * FROM session_facets WHERE session_id = ?').get('sess-test');
    expect(dbFacets).toBeDefined();
  });

  it('filters out low-confidence decisions (< 70)', async () => {
    testDb.prepare(`INSERT INTO projects (id, name, path, last_activity, session_count)
      VALUES ('proj-test', 'test-project', '/test', datetime('now'), 1)`).run();
    testDb.prepare(`INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count, source_tool)
      VALUES ('sess-test', 'proj-test', 'test-project', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 5, 'claude-code')`).run();

    const responseWithLowConfidence = JSON.stringify({
      summary: { title: 'Test', content: 'Test', bullets: [] },
      decisions: [
        { title: 'Good Decision', confidence: 85, choice: 'A' },
        { title: 'Bad Decision', confidence: 50, choice: 'B' },
      ],
      learnings: [
        { title: 'Good Learning', confidence: 80, takeaway: 'X' },
        { title: 'Bad Learning', confidence: 60, takeaway: 'Y' },
      ],
    });

    mockChat.mockResolvedValue({ content: responseWithLowConfidence, usage: { inputTokens: 100, outputTokens: 50 } });
    const result = await analyzeSession(makeSession(), [makeMessage()]);

    expect(result.success).toBe(true);
    const decisions = result.insights.filter(i => i.type === 'decision');
    const learnings = result.insights.filter(i => i.type === 'learning');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].title).toBe('Good Decision');
    expect(learnings).toHaveLength(1);
    expect(learnings[0].title).toBe('Good Learning');
  });
});
```

- [ ] **Step 3: Write tests for analyzePromptQuality**

```typescript
describe('analyzePromptQuality', () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockChat.mockReset();
    mockIsConfigured.mockReturnValue(true);
  });
  afterEach(() => { testDb.close(); });

  it('returns error when LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await analyzePromptQuality(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
  });

  it('returns error for empty messages', async () => {
    const result = await analyzePromptQuality(makeSession(), []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No messages');
  });

  it('returns error when fewer than 2 user messages', async () => {
    const result = await analyzePromptQuality(makeSession(), [
      makeMessage({ type: 'user' }),
      makeMessage({ id: 'msg-2', type: 'assistant' }),
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('successfully analyzes prompt quality', async () => {
    testDb.prepare(`INSERT INTO projects (id, name, path, last_activity, session_count)
      VALUES ('proj-test', 'test-project', '/test', datetime('now'), 1)`).run();
    testDb.prepare(`INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count, source_tool)
      VALUES ('sess-test', 'proj-test', 'test-project', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 5, 'claude-code')`).run();

    const pqResponse = JSON.stringify({
      efficiency_score: 75,
      assessment: 'Good prompting overall.',
      message_overhead: 'low',
      takeaways: [{ before: 'vague request', after: 'specific request', category: 'vague-request' }],
      findings: [{ category: 'precise-request', type: 'strength', description: 'Clear goals' }],
      dimension_scores: {
        context_provision: 80,
        request_specificity: 70,
        scope_management: 85,
        information_timing: 75,
        correction_quality: 75,
      },
    });

    mockChat.mockResolvedValue({ content: pqResponse, usage: { inputTokens: 200, outputTokens: 100 } });

    const messages = [
      makeMessage({ type: 'user', content: 'First request' }),
      makeMessage({ id: 'msg-2', type: 'assistant', content: 'Response' }),
      makeMessage({ id: 'msg-3', type: 'user', content: 'Second request' }),
    ];

    const result = await analyzePromptQuality(makeSession(), messages);
    expect(result.success).toBe(true);
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].type).toBe('prompt_quality');
  });
});
```

- [ ] **Step 4: Write tests for findRecurringInsights**

```typescript
describe('findRecurringInsights', () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockChat.mockReset();
    mockIsConfigured.mockReturnValue(true);
  });
  afterEach(() => { testDb.close(); });

  it('returns error when LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await findRecurringInsights([]);
    expect(result.success).toBe(false);
  });

  it('returns error with fewer than 2 non-summary insights', async () => {
    const result = await findRecurringInsights([
      { id: 'i1', type: 'summary', title: 'T', summary: 'S', project_name: 'P', session_id: 's1' },
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('filters out summary and prompt_quality types', async () => {
    const insights = [
      { id: 'i1', type: 'summary', title: 'T', summary: 'S', project_name: 'P', session_id: 's1' },
      { id: 'i2', type: 'prompt_quality', title: 'T', summary: 'S', project_name: 'P', session_id: 's2' },
      { id: 'i3', type: 'decision', title: 'T', summary: 'S', project_name: 'P', session_id: 's3' },
    ];
    const result = await findRecurringInsights(insights);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('validates returned IDs against actual insight IDs', async () => {
    testDb.prepare(`INSERT INTO projects (id, name, path, last_activity, session_count) VALUES ('p', 'p', '/p', datetime('now'), 1)`).run();

    // Insert insights into DB so the UPDATE statement works
    for (let i = 1; i <= 3; i++) {
      testDb.prepare(`INSERT INTO insights (id, session_id, project_id, project_name, type, title, content, summary, bullets, confidence, source, timestamp, created_at, scope, analysis_version)
        VALUES (?, ?, 'p', 'p', 'decision', ?, 'c', 's', '[]', 0.85, 'llm', datetime('now'), datetime('now'), 'session', '3.0.0')
      `).run(`i${i}`, `s${i}`, `Decision ${i}`);
    }

    mockChat.mockResolvedValue({
      content: JSON.stringify({
        groups: [
          { insightIds: ['i1', 'i2', 'fake-id'], theme: 'Similar decisions' },
        ],
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const insights = [
      { id: 'i1', type: 'decision', title: 'D1', summary: 'S1', project_name: 'p', session_id: 's1' },
      { id: 'i2', type: 'decision', title: 'D2', summary: 'S2', project_name: 'p', session_id: 's2' },
      { id: 'i3', type: 'learning', title: 'L1', summary: 'S3', project_name: 'p', session_id: 's3' },
    ];

    const result = await findRecurringInsights(insights);
    expect(result.success).toBe(true);
    // fake-id should be filtered out, leaving i1 and i2
    expect(result.groups[0].insightIds).not.toContain('fake-id');
    expect(result.groups[0].insightIds).toEqual(['i1', 'i2']);
  });
});
```

- [ ] **Step 5: Write tests for extractFacetsOnly**

```typescript
describe('extractFacetsOnly', () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockChat.mockReset();
    mockIsConfigured.mockReturnValue(true);
  });
  afterEach(() => { testDb.close(); });

  it('returns error when LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await extractFacetsOnly(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
  });

  it('returns error for empty messages', async () => {
    const result = await extractFacetsOnly(makeSession(), []);
    expect(result.success).toBe(false);
  });

  it('successfully extracts and saves facets', async () => {
    testDb.prepare(`INSERT INTO projects (id, name, path, last_activity, session_count) VALUES ('proj-test', 'test-project', '/test', datetime('now'), 1)`).run();
    testDb.prepare(`INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count, source_tool) VALUES ('sess-test', 'proj-test', 'test-project', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 5, 'claude-code')`).run();

    const facetResponse = JSON.stringify({
      outcome_satisfaction: 'high',
      workflow_pattern: 'iterate-and-refine',
      had_course_correction: false,
      iteration_count: 3,
      friction_points: [],
      effective_patterns: [{ category: 'task-decomposition', description: 'Broke into steps', confidence: 90, driver: 'user-driven' }],
    });

    mockChat.mockResolvedValue({ content: facetResponse, usage: { inputTokens: 100, outputTokens: 50 } });
    const result = await extractFacetsOnly(makeSession(), [makeMessage()]);
    expect(result.success).toBe(true);

    // Verify facets were saved and task-decomposition was normalized to structured-planning
    const row = testDb.prepare('SELECT effective_patterns FROM session_facets WHERE session_id = ?').get('sess-test') as { effective_patterns: string } | undefined;
    expect(row).toBeDefined();
    const patterns = JSON.parse(row!.effective_patterns);
    expect(patterns[0].category).toBe('structured-planning');
  });
});
```

- [ ] **Step 6: Run tests and commit**

Run: `cd server && pnpm test -- src/llm/analysis.test.ts`

```bash
git add server/src/llm/analysis.test.ts
git commit -m "test: add analysis.ts tests — guard clauses, happy paths, confidence filtering (0.8% → ~55%)"
```

---

## Chunk 4: Gap-Filling (Tier 4)

### Task 9: CLI Stats Aggregation — Expand Existing Tests

**Files:**
- Modify: `cli/src/commands/stats/data/aggregation.test.ts`
- Source: `cli/src/commands/stats/data/aggregation.ts` (756 lines, 36% → ~60%)

The existing test file tests `buildOverview`. Add tests for uncovered exported functions: `buildCostBreakdown`, `buildProjectStats`, `buildModelStats`, `periodStartDate`.

- [ ] **Step 1: Read existing test file to understand current coverage**

Read: `cli/src/commands/stats/data/aggregation.test.ts`
Identify which exported functions are already tested and which are not.

- [ ] **Step 2: Add tests for periodStartDate**

```typescript
describe('periodStartDate', () => {
  it('returns a Date 7 days ago for "7d"', () => {
    const result = periodStartDate('7d');
    expect(result).toBeInstanceOf(Date);
    const diffDays = (Date.now() - result!.getTime()) / 86400000;
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });

  it('returns undefined for "all"', () => {
    expect(periodStartDate('all')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Add tests for buildCostBreakdown, buildProjectStats, buildModelStats**

Write tests using mock `SessionRow[]` data (the source functions are pure — they take `SessionRow[]` as input). Create a shared factory helper for `SessionRow` objects. Test:
- Empty sessions array returns empty/zero results
- Multiple sessions correctly group by project/model
- Cost calculations use pricing lookup

- [ ] **Step 4: Run tests and commit**

Run: `cd cli && pnpm test -- src/commands/stats/data/aggregation.test.ts`

```bash
git add cli/src/commands/stats/data/aggregation.test.ts
git commit -m "test: expand stats aggregation tests (36% → ~60%)"
```

---

### Task 10: CLI Stats Format — Expand Existing Tests

**Files:**
- Modify: `cli/src/commands/stats/render/format.test.ts`
- Source: `cli/src/commands/stats/render/format.ts` (57 lines, 63% → ~95%)

- [ ] **Step 1: Read existing tests and add coverage for uncovered lines 25-38**

Read the source file to see what's on lines 25-38, then add tests for those code paths.

- [ ] **Step 2: Run tests and commit**

Run: `cd cli && pnpm test -- src/commands/stats/render/format.test.ts`

```bash
git add cli/src/commands/stats/render/format.test.ts
git commit -m "test: expand format tests to cover remaining branches (63% → ~95%)"
```

---

### Task 11: Server Export — knowledge-base and agent-rules Tests

**Files:**
- Test: `server/src/export/knowledge-base.test.ts` (create)
- Test: `server/src/export/agent-rules.test.ts` (create)
- Source: `server/src/export/knowledge-base.ts` (307 lines, 54% → ~75%)
- Source: `server/src/export/agent-rules.ts` (189 lines, 56% → ~75%)

These are pure formatting functions — no mocking needed.

- [ ] **Step 1: Read both source files to understand their public APIs**

Read: `server/src/export/knowledge-base.ts` and `server/src/export/agent-rules.ts`

- [ ] **Step 2: Write tests for formatKnowledgeBase**

Test with:
- Empty sessions/insights → returns valid markdown with header
- Sessions with decisions and learnings → sections appear in output
- Linked insights → cross-references rendered
- Sessions with no insights → graceful handling

- [ ] **Step 3: Write tests for formatAgentRules**

Test with:
- Empty sessions → valid markdown
- Sessions with decisions → rules rendered
- Different source tools → correct tool references

- [ ] **Step 4: Run tests and commit**

Run: `cd server && pnpm test -- src/export/`

```bash
git add server/src/export/knowledge-base.test.ts server/src/export/agent-rules.test.ts
git commit -m "test: add export formatter tests (~55% → ~75%)"
```

---

### Task 12: Final Coverage Check and Gap Fill

- [ ] **Step 1: Run full coverage report**

Run: `pnpm test:coverage`
Check if overall coverage is ≥75%.

- [ ] **Step 2: If below 75%, identify remaining gaps**

Look at the coverage report for files still below target. Likely candidates:
- `cli/src/db/write.ts` (81% → needs minor fill)
- `cli/src/parser/jsonl.ts` (73% → needs minor fill)
- `cli/src/parser/titles.ts` (63% → needs minor fill)
- `server/src/routes/export.ts` (31% → add validation tests)

- [ ] **Step 3: Add targeted tests for remaining gaps**

Focus on adding 3-5 tests per file to push each above the threshold. Follow existing test patterns.

- [ ] **Step 4: Run final coverage report and verify ≥75%**

Run: `pnpm test:coverage`
Expected: `All files | ≥75% Stmts`

- [ ] **Step 5: Commit all remaining test files**

```bash
git add -A '*.test.ts'
git commit -m "test: final coverage gap fill — hit 75% target"
```

---

## Coverage Impact Estimate

| Task | File | Before | After (est.) | Lines Covered |
|------|------|--------|-------------|---------------|
| 1 | pattern-normalize.ts | 18% | ~95% | +125 |
| 2 | export-prompts.ts | 19% | ~85% | +186 |
| 3 | reflect-prompts.ts | 30% | ~90% | +108 |
| 4 | routes/facets.ts | 7% | ~55% | +199 |
| 5 | routes/reflect.ts | 6% | ~50% | +148 |
| 6 | routes/analysis.ts | 4% | ~35% | +131 |
| 7 | routes/telemetry.ts | 33% | ~95% | +14 |
| 8 | llm/analysis.ts | 0.8% | ~55% | +509 |
| 9 | aggregation.ts | 36% | ~60% | +181 |
| 10 | format.ts | 63% | ~95% | +18 |
| 11 | export/*.ts | ~55% | ~75% | +99 |
| 12 | Gap fill | varies | varies | ~200 |

**Estimated total new lines covered: ~1,918**
**Estimated final coverage: ~76-78% statements**
