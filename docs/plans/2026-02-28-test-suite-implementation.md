# Test Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive Vitest test suite for CLI and server packages, covering pure logic, database operations, providers, and API routes.

**Architecture:** Vitest workspace at monorepo root with per-package configs. CLI tests use `node` environment; server route tests use Hono's `app.request()` against a `createApp()` factory. Database tests use in-memory SQLite via `better-sqlite3(':memory:')`.

**Tech Stack:** Vitest, better-sqlite3 (in-memory), Hono `app.request()`, `vi.mock()` for filesystem

**Design doc:** `docs/plans/2026-02-28-test-suite-design.md`

---

## Task 1: Vitest Infrastructure Setup

**Files:**
- Create: `vitest.workspace.ts`
- Create: `cli/vitest.config.ts`
- Create: `server/vitest.config.ts`
- Modify: `package.json` (root)
- Modify: `cli/package.json`
- Modify: `server/package.json`

**Step 1: Install vitest at workspace root**

```bash
pnpm add -Dw vitest
```

**Step 2: Create `vitest.workspace.ts`**

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['cli', 'server']);
```

**Step 3: Create `cli/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
```

**Step 4: Create `server/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
```

**Step 5: Add test scripts to root `package.json`**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Step 6: Add test scripts to `cli/package.json` and `server/package.json`**

Add to `"scripts"` in each:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 7: Verify infrastructure with a smoke test**

Create `cli/src/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('vitest is working', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `pnpm test`
Expected: 1 test passes across the CLI workspace.

**Step 8: Delete smoke test and commit**

```bash
rm cli/src/smoke.test.ts
git add -A
git commit -m "chore: add vitest infrastructure for CLI and server"
```

---

## Task 2: Pure Logic — `utils/paths.ts`

**Files:**
- Create: `cli/src/utils/paths.test.ts`
- Test: `cli/src/utils/paths.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { splitVirtualPath } from './paths.js';

describe('splitVirtualPath', () => {
  it('splits path with hash into realPath and sessionFragment', () => {
    const result = splitVirtualPath('/path/to/state.vscdb#composerId123');
    expect(result).toEqual({
      realPath: '/path/to/state.vscdb',
      sessionFragment: 'composerId123',
    });
  });

  it('returns null sessionFragment when no hash present', () => {
    const result = splitVirtualPath('/path/to/session.jsonl');
    expect(result).toEqual({
      realPath: '/path/to/session.jsonl',
      sessionFragment: null,
    });
  });

  it('handles multiple hashes — splits on last one', () => {
    const result = splitVirtualPath('/path/with#hash/file.vscdb#fragment');
    expect(result).toEqual({
      realPath: '/path/with#hash/file.vscdb',
      sessionFragment: 'fragment',
    });
  });

  it('handles hash at position 0 as no split', () => {
    const result = splitVirtualPath('#onlyfragment');
    expect(result).toEqual({
      realPath: '#onlyfragment',
      sessionFragment: null,
    });
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 3: Commit**

```bash
git add cli/src/utils/paths.test.ts
git commit -m "test: add unit tests for splitVirtualPath"
```

---

## Task 3: Pure Logic — `utils/pricing.ts`

**Files:**
- Create: `cli/src/utils/pricing.test.ts`
- Test: `cli/src/utils/pricing.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { getModelPricing, calculateCost } from './pricing.js';
import type { UsageEntry } from './pricing.js';

describe('getModelPricing', () => {
  it('returns exact match for known model', () => {
    const pricing = getModelPricing('claude-sonnet-4-5');
    expect(pricing.input).toBe(3);
    expect(pricing.output).toBe(15);
  });

  it('returns prefix match for date-suffixed model', () => {
    const pricing = getModelPricing('claude-sonnet-4-5-20250929');
    expect(pricing.input).toBe(3);
    expect(pricing.output).toBe(15);
  });

  it('returns default pricing for unknown model', () => {
    const pricing = getModelPricing('unknown-model-xyz');
    expect(pricing).toEqual({ input: 3, output: 15 });
  });
});

describe('calculateCost', () => {
  it('returns 0 for empty entries', () => {
    expect(calculateCost([])).toBe(0);
  });

  it('calculates cost for input and output tokens', () => {
    const entries: UsageEntry[] = [{
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    }];
    // input: 1M * $3/M = $3, output: 1M * $15/M = $15 => $18
    expect(calculateCost(entries)).toBe(18);
  });

  it('handles cache creation tokens at 1.25x input rate', () => {
    const entries: UsageEntry[] = [{
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 },
    }];
    expect(calculateCost(entries)).toBe(3.75);
  });

  it('handles cache read tokens at 0.1x input rate', () => {
    const entries: UsageEntry[] = [{
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 },
    }];
    expect(calculateCost(entries)).toBe(0.3);
  });

  it('sums costs across multiple entries', () => {
    const entries: UsageEntry[] = [
      { model: 'claude-sonnet-4-5', usage: { input_tokens: 500_000, output_tokens: 0 } },
      { model: 'claude-sonnet-4-5', usage: { input_tokens: 500_000, output_tokens: 0 } },
    ];
    expect(calculateCost(entries)).toBe(3);
  });

  it('handles missing usage fields gracefully', () => {
    const entries: UsageEntry[] = [{ model: 'claude-sonnet-4-5', usage: {} }];
    expect(calculateCost(entries)).toBe(0);
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 3: Commit**

```bash
git add cli/src/utils/pricing.test.ts
git commit -m "test: add unit tests for pricing utilities"
```

---

## Task 4: Pure Logic — `commands/stats/data/fuzzy-match.ts`

**Files:**
- Create: `cli/src/commands/stats/data/fuzzy-match.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { levenshtein, findSimilarNames } from './fuzzy-match.js';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns length of other string when one is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('counts single character substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('counts insertion and deletion', () => {
    expect(levenshtein('abc', 'abcd')).toBe(1);
    expect(levenshtein('abcd', 'abc')).toBe(1);
  });

  it('handles completely different strings', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });
});

describe('findSimilarNames', () => {
  const candidates = ['code-insights', 'my-project', 'dashboard-app'];

  it('returns exact match', () => {
    const result = findSimilarNames('code-insights', candidates);
    expect(result).toContain('code-insights');
  });

  it('returns close matches within default distance', () => {
    const result = findSimilarNames('code-insihgts', candidates);
    expect(result).toContain('code-insights');
  });

  it('returns empty array when no matches within distance', () => {
    const result = findSimilarNames('zzzzzzzzzzz', candidates);
    expect(result).toEqual([]);
  });

  it('is case-insensitive', () => {
    const result = findSimilarNames('CODE-INSIGHTS', candidates);
    expect(result).toContain('code-insights');
  });

  it('respects custom maxDistance', () => {
    const result = findSimilarNames('code', candidates, 1);
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 3: Commit**

```bash
git add cli/src/commands/stats/data/fuzzy-match.test.ts
git commit -m "test: add unit tests for fuzzy matching"
```

---

## Task 5: Pure Logic — `commands/stats/render/format.ts`

**Files:**
- Create: `cli/src/commands/stats/render/format.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatTokens,
  formatDuration,
  formatPercent,
  formatCount,
  formatPeriodLabel,
} from './format.js';

describe('formatMoney', () => {
  it('formats small amounts with 2 decimal places', () => {
    expect(formatMoney(1.5)).toBe('$1.50');
  });

  it('formats zero', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('formats large amounts with commas', () => {
    const result = formatMoney(1234.56);
    expect(result).toContain('1');
    expect(result).toContain('234');
  });
});

describe('formatTokens', () => {
  it('formats millions', () => {
    expect(formatTokens(1_500_000)).toBe('1.5M');
  });

  it('formats thousands', () => {
    expect(formatTokens(1_500)).toBe('2K');
  });

  it('formats small numbers as-is', () => {
    expect(formatTokens(500)).toBe('500');
  });
});

describe('formatDuration', () => {
  it('shows < 1m for very short durations', () => {
    expect(formatDuration(0.5)).toBe('< 1m');
  });

  it('shows minutes for under an hour', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('shows hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m');
  });

  it('shows only hours when no remainder', () => {
    expect(formatDuration(120)).toBe('2h');
  });
});

describe('formatPercent', () => {
  it('shows one decimal for small values', () => {
    expect(formatPercent(5.55)).toBe('5.6%');
  });

  it('rounds for values >= 10', () => {
    expect(formatPercent(15.7)).toBe('16%');
  });
});

describe('formatCount', () => {
  it('formats with locale separators', () => {
    const result = formatCount(1234);
    expect(result).toContain('1');
    expect(result).toContain('234');
  });
});

describe('formatPeriodLabel', () => {
  it('maps period codes to labels', () => {
    expect(formatPeriodLabel('7d')).toBe('Last 7 days');
    expect(formatPeriodLabel('30d')).toBe('Last 30 days');
    expect(formatPeriodLabel('90d')).toBe('Last 90 days');
    expect(formatPeriodLabel('all')).toBe('All time');
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 3: Commit**

```bash
git add cli/src/commands/stats/render/format.test.ts
git commit -m "test: add unit tests for stats formatting"
```

---

## Task 6: Pure Logic — `parser/titles.ts`

**Files:**
- Create: `cli/src/parser/titles.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { generateTitle, detectSessionCharacter, cleanTitle } from './titles.js';
import type { ParsedSession, ParsedMessage } from '../types.js';

function makeMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id: 'msg-1',
    sessionId: 'sess-1',
    type: 'user',
    content: 'test message',
    thinking: null,
    toolCalls: [],
    toolResults: [],
    usage: null,
    timestamp: new Date(),
    parentId: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    id: 'sess-1',
    projectPath: '/test/project',
    projectName: 'test-project',
    summary: null,
    generatedTitle: null,
    titleSource: null,
    sessionCharacter: null,
    startedAt: new Date('2026-01-01T10:00:00Z'),
    endedAt: new Date('2026-01-01T11:00:00Z'),
    messageCount: 5,
    userMessageCount: 2,
    assistantMessageCount: 3,
    toolCallCount: 0,
    gitBranch: null,
    claudeVersion: null,
    messages: [],
    ...overrides,
  };
}

describe('cleanTitle', () => {
  it('strips "help me" prefix', () => {
    expect(cleanTitle('help me fix the bug')).toBe('Fix the bug');
  });

  it('strips markdown characters', () => {
    expect(cleanTitle('**bold title**')).toBe('Bold title');
  });

  it('truncates at 60 chars', () => {
    const longTitle = 'a'.repeat(80);
    const result = cleanTitle(longTitle);
    expect(result.length).toBeLessThanOrEqual(63); // 60 + '...'
  });

  it('capitalizes first letter', () => {
    expect(cleanTitle('lowercase start')).toBe('Lowercase start');
  });

  it('collapses whitespace', () => {
    expect(cleanTitle('too   many   spaces')).toBe('Too many spaces');
  });
});

describe('detectSessionCharacter', () => {
  it('returns null for empty session', () => {
    const session = makeSession({ messages: [], messageCount: 0, toolCallCount: 0 });
    expect(detectSessionCharacter(session)).toBeNull();
  });

  it('detects quick_task for short sessions with edits', () => {
    const editToolCall = { id: 'tc-1', name: 'Edit', input: {} };
    const messages = [
      makeMessage({ type: 'user', content: 'fix the typo' }),
      makeMessage({ type: 'assistant', toolCalls: [editToolCall] }),
    ];
    const session = makeSession({
      messages,
      messageCount: 5,
      toolCallCount: 1,
    });
    const char = detectSessionCharacter(session);
    expect(char).toBe('quick_task');
  });

  it('detects learning for sessions with 3+ user questions', () => {
    const messages = [
      makeMessage({ type: 'user', content: 'What is a closure?' }),
      makeMessage({ type: 'assistant', content: 'A closure is...' }),
      makeMessage({ type: 'user', content: 'How does it work?' }),
      makeMessage({ type: 'assistant', content: 'It works by...' }),
      makeMessage({ type: 'user', content: 'Can you explain more?' }),
      makeMessage({ type: 'assistant', content: 'Sure...' }),
    ];
    const session = makeSession({
      messages,
      messageCount: 50,
      userMessageCount: 3,
      toolCallCount: 0,
    });
    const char = detectSessionCharacter(session);
    expect(char).toBe('learning');
  });
});

describe('generateTitle', () => {
  it('uses claude summary when available', () => {
    const session = makeSession({ summary: 'Implemented user auth' });
    const result = generateTitle(session);
    expect(result.title).toBe('Implemented user auth');
    expect(result.source).toBe('claude');
  });

  it('falls back to user message when no summary', () => {
    const messages = [
      makeMessage({ type: 'user', content: 'Add dark mode to the dashboard' }),
      makeMessage({ type: 'assistant', content: 'Sure, I will...' }),
    ];
    const session = makeSession({ messages, messageCount: 2, userMessageCount: 1 });
    const result = generateTitle(session);
    expect(result.title).toBeTruthy();
    expect(result.title.length).toBeGreaterThan(0);
  });

  it('returns a title even with empty messages and no summary', () => {
    const session = makeSession({ messages: [], messageCount: 0 });
    const result = generateTitle(session);
    expect(result.title).toBeTruthy();
    expect(result.source).toBeDefined();
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS (adjust character detection thresholds if needed based on exact scoring logic)

**Step 3: Commit**

```bash
git add cli/src/parser/titles.test.ts
git commit -m "test: add unit tests for title generation and character detection"
```

---

## Task 7: Pure Logic — `commands/stats/data/aggregation.ts`

**Files:**
- Create: `cli/src/commands/stats/data/aggregation.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  periodStartDate,
  resolveTitle,
  shortenModelName,
  bucketKey,
  createBuckets,
  computeDayStats,
  computeTopProjects,
} from './aggregation.js';
import type { SessionRow } from './types.js';

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    projectName: 'test-project',
    startedAt: new Date('2026-01-15T10:00:00Z'),
    endedAt: new Date('2026-01-15T11:00:00Z'),
    messageCount: 10,
    userMessageCount: 4,
    assistantMessageCount: 6,
    toolCallCount: 3,
    sourceTool: 'claude-code',
    ...overrides,
  };
}

describe('periodStartDate', () => {
  it('returns a Date for 7d period', () => {
    const result = periodStartDate('7d');
    expect(result).toBeInstanceOf(Date);
  });

  it('returns undefined for all period', () => {
    expect(periodStartDate('all')).toBeUndefined();
  });
});

describe('resolveTitle', () => {
  it('prefers customTitle', () => {
    const row = makeSessionRow({ customTitle: 'My Title', generatedTitle: 'Gen Title' });
    expect(resolveTitle(row)).toBe('My Title');
  });

  it('falls back to generatedTitle', () => {
    const row = makeSessionRow({ generatedTitle: 'Gen Title' });
    expect(resolveTitle(row)).toBe('Gen Title');
  });

  it('falls back to summary', () => {
    const row = makeSessionRow({ summary: 'A summary' });
    expect(resolveTitle(row)).toBe('A summary');
  });

  it('falls back to Untitled Session', () => {
    const row = makeSessionRow();
    expect(resolveTitle(row)).toBe('Untitled Session');
  });
});

describe('shortenModelName', () => {
  it('shortens claude-opus-4 family', () => {
    expect(shortenModelName('claude-opus-4-20260301')).toBe('Opus 4.x');
  });

  it('shortens claude-sonnet-4 family', () => {
    expect(shortenModelName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.x');
  });

  it('truncates unknown long names', () => {
    const longName = 'a'.repeat(30);
    const result = shortenModelName(longName);
    expect(result.length).toBeLessThanOrEqual(23);
  });
});

describe('bucketKey', () => {
  const date = new Date('2026-03-15T12:00:00Z');

  it('returns YYYY-MM-DD for 7d period', () => {
    expect(bucketKey(date, '7d')).toBe('2026-03-15');
  });

  it('returns YYYY-MM for all period', () => {
    expect(bucketKey(date, 'all')).toBe('2026-03');
  });
});

describe('createBuckets', () => {
  const refDate = new Date('2026-03-15T12:00:00Z');

  it('creates 7 buckets for 7d period', () => {
    const buckets = createBuckets('7d', refDate);
    expect(buckets.size).toBe(7);
  });

  it('creates 30 buckets for 30d period', () => {
    const buckets = createBuckets('30d', refDate);
    expect(buckets.size).toBe(30);
  });

  it('creates 13 buckets for 90d period', () => {
    const buckets = createBuckets('90d', refDate);
    expect(buckets.size).toBe(13);
  });

  it('creates 12 buckets for all period', () => {
    const buckets = createBuckets('all', refDate);
    expect(buckets.size).toBe(12);
  });

  it('all bucket values start at 0', () => {
    const buckets = createBuckets('7d', refDate);
    for (const point of buckets.values()) {
      expect(point.value).toBe(0);
    }
  });
});

describe('computeDayStats', () => {
  it('returns zeros when no sessions match the day', () => {
    const sessions = [makeSessionRow({ startedAt: new Date('2026-01-14T10:00:00Z') })];
    const result = computeDayStats(sessions, new Date('2026-01-15T00:00:00Z'));
    expect(result.sessionCount).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it('counts sessions matching the calendar day', () => {
    const sessions = [
      makeSessionRow({ startedAt: new Date('2026-01-15T08:00:00Z'), estimatedCostUsd: 1.5 }),
      makeSessionRow({ id: 's2', startedAt: new Date('2026-01-15T14:00:00Z'), estimatedCostUsd: 2.5 }),
    ];
    const result = computeDayStats(sessions, new Date('2026-01-15T00:00:00Z'));
    expect(result.sessionCount).toBe(2);
    expect(result.totalCost).toBe(4);
  });
});

describe('computeTopProjects', () => {
  it('groups sessions by project and sorts by count', () => {
    const sessions = [
      makeSessionRow({ projectName: 'alpha', projectId: 'p1' }),
      makeSessionRow({ id: 's2', projectName: 'alpha', projectId: 'p1' }),
      makeSessionRow({ id: 's3', projectName: 'beta', projectId: 'p2' }),
    ];
    const result = computeTopProjects(sessions, 5);
    expect(result[0].name).toBe('alpha');
    expect(result[0].count).toBe(2);
    expect(result[1].name).toBe('beta');
    expect(result[1].count).toBe(1);
  });

  it('respects limit', () => {
    const sessions = [
      makeSessionRow({ projectName: 'a', projectId: 'p1' }),
      makeSessionRow({ id: 's2', projectName: 'b', projectId: 'p2' }),
      makeSessionRow({ id: 's3', projectName: 'c', projectId: 'p3' }),
    ];
    const result = computeTopProjects(sessions, 2);
    expect(result.length).toBe(2);
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 3: Commit**

```bash
git add cli/src/commands/stats/data/aggregation.test.ts
git commit -m "test: add unit tests for stats aggregation functions"
```

---

## Task 8: Database — Schema and Migrations

**Files:**
- Create: `cli/src/db/schema.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, CURRENT_SCHEMA_VERSION } from './schema.js';
import { runMigrations } from './migrate.js';

describe('schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('SCHEMA_SQL applies without errors on a fresh database', () => {
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
  });

  it('creates all expected tables', () => {
    db.exec(SCHEMA_SQL);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain('projects');
    expect(tables).toContain('sessions');
    expect(tables).toContain('messages');
    expect(tables).toContain('insights');
    expect(tables).toContain('usage_stats');
  });

  it('SCHEMA_SQL is idempotent (IF NOT EXISTS)', () => {
    db.exec(SCHEMA_SQL);
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
  });

  it('CURRENT_SCHEMA_VERSION is a positive integer', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(CURRENT_SCHEMA_VERSION)).toBe(true);
  });
});

describe('runMigrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('applies migrations on a fresh database', () => {
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('creates schema_version table', () => {
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain('schema_version');
  });

  it('is idempotent — running twice does not error', () => {
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('sets version to CURRENT_SCHEMA_VERSION', () => {
    runMigrations(db);
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as any;
    expect(row.v).toBe(CURRENT_SCHEMA_VERSION);
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 3: Commit**

```bash
git add cli/src/db/schema.test.ts
git commit -m "test: add database schema and migration tests"
```

---

## Task 9: Database — Read and Write Operations

**Files:**
- Create: `cli/src/__fixtures__/db/seed.ts`
- Create: `cli/src/db/read-write.test.ts`

**Step 1: Create the test database seed helper**

```typescript
// cli/src/__fixtures__/db/seed.ts
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import type { ParsedSession, ParsedMessage } from '../../types.js';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

export function makeParsedSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    id: 'test-session-1',
    projectPath: '/Users/test/my-project',
    projectName: 'my-project',
    summary: 'Test session summary',
    generatedTitle: 'Test Title',
    titleSource: 'claude',
    sessionCharacter: 'quick_task',
    startedAt: new Date('2026-01-15T10:00:00Z'),
    endedAt: new Date('2026-01-15T11:00:00Z'),
    messageCount: 5,
    userMessageCount: 2,
    assistantMessageCount: 3,
    toolCallCount: 1,
    gitBranch: 'main',
    claudeVersion: '1.0.0',
    sourceTool: 'claude-code',
    messages: [],
    usage: {
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      estimatedCostUsd: 0.01,
      modelsUsed: ['claude-sonnet-4-5'],
      primaryModel: 'claude-sonnet-4-5',
      usageSource: 'jsonl',
    },
    ...overrides,
  };
}

export function makeParsedMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id: 'msg-1',
    sessionId: 'test-session-1',
    type: 'user',
    content: 'Hello, help me fix this bug',
    thinking: null,
    toolCalls: [],
    toolResults: [],
    usage: null,
    timestamp: new Date('2026-01-15T10:00:00Z'),
    parentId: null,
    ...overrides,
  };
}
```

**Step 2: Write the read/write tests**

```typescript
// cli/src/db/read-write.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, makeParsedSession, makeParsedMessage } from '../__fixtures__/db/seed.js';

let testDb: Database.Database;

// Mock getDb to return our in-memory database
vi.mock('./client.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

// Mock device.ts to avoid filesystem/git calls
vi.mock('../utils/device.js', () => ({
  getDeviceInfo: () => ({
    deviceId: 'test-device',
    hostname: 'test-host',
    platform: 'darwin',
    username: 'testuser',
  }),
  generateStableProjectId: (path: string) => ({
    projectId: 'proj-' + path.split('/').pop(),
    source: 'path-hash' as const,
    gitRemoteUrl: null,
  }),
}));

describe('db read/write integration', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('inserts a session and reads it back', async () => {
    const { insertSessionWithProject } = await import('./write.js');
    const { getSessions, sessionExists } = await import('./read.js');

    const session = makeParsedSession();
    insertSessionWithProject(session);

    expect(sessionExists(session.id)).toBe(true);

    const rows = getSessions();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const found = rows.find(r => r.id === session.id);
    expect(found).toBeDefined();
    expect(found!.projectName).toBe('my-project');
  });

  it('inserts messages for a session', async () => {
    const { insertSessionWithProject, insertMessages } = await import('./write.js');

    const messages = [
      makeParsedMessage({ id: 'msg-1', type: 'user', content: 'Help me' }),
      makeParsedMessage({ id: 'msg-2', type: 'assistant', content: 'Sure!' }),
    ];
    const session = makeParsedSession({ messages });
    insertSessionWithProject(session);
    insertMessages(session);

    const msgRows = testDb.prepare('SELECT * FROM messages WHERE session_id = ?').all(session.id);
    expect(msgRows.length).toBe(2);
  });

  it('upserts session on re-insert (no duplicate error)', async () => {
    const { insertSessionWithProject } = await import('./write.js');
    const session = makeParsedSession();
    insertSessionWithProject(session);
    expect(() => insertSessionWithProject(session)).not.toThrow();
  });

  it('filters sessions by sourceTool', async () => {
    const { insertSessionWithProject } = await import('./write.js');
    const { getSessions } = await import('./read.js');

    insertSessionWithProject(makeParsedSession({ id: 's1', sourceTool: 'claude-code' }));
    insertSessionWithProject(makeParsedSession({ id: 's2', sourceTool: 'cursor', projectPath: '/other' }));

    const claudeSessions = getSessions({ sourceTool: 'claude-code' });
    expect(claudeSessions.every(s => s.sourceTool === 'claude-code')).toBe(true);
  });

  it('getProjects returns inserted projects', async () => {
    const { insertSessionWithProject } = await import('./write.js');
    const { getProjects } = await import('./read.js');

    insertSessionWithProject(makeParsedSession());
    const projects = getProjects();
    expect(projects.length).toBeGreaterThanOrEqual(1);
  });
});
```

Note: If `vi.mock()` with dynamic `import()` causes ESM issues, the engineer should use `vi.hoisted()` or switch to top-level imports with `beforeEach` reset.

**Step 3: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 4: Commit**

```bash
git add cli/src/__fixtures__/db/seed.ts cli/src/db/read-write.test.ts
git commit -m "test: add database read/write integration tests with in-memory SQLite"
```

---

## Task 10: Server Refactor — Export `createApp()`

**Files:**
- Modify: `server/src/index.ts`

The Hono `app` is currently created inside `startServer()` and never exported. Tests need to call `app.request()`.

**Step 1: Read `server/src/index.ts` completely**

Understand the current structure before modifying.

**Step 2: Extract `createApp()` factory**

Split `server/src/index.ts` into two concerns:

- `createApp()` — creates Hono app, mounts all `/api/*` routes, error handler, health check, 404 catch-all. Returns the app. No static serving, no `serve()` call.
- `startServer(options)` — calls `createApp()`, adds `serveStatic` and SPA fallback if `staticDir` exists, calls `serve()`.

Export both functions. The `ServerOptions` interface stays the same.

**Step 3: Verify existing behavior**

```bash
pnpm build
```

Must pass. Then test manually: `code-insights dashboard` should still work.

**Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "refactor: export createApp() factory from server for testability"
```

---

## Task 11: Server — `utils.ts` Test

**Files:**
- Create: `server/src/utils.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseIntParam } from './utils.js';

describe('parseIntParam', () => {
  it('returns parsed integer for valid string', () => {
    expect(parseIntParam('42', 10)).toBe(42);
  });

  it('returns default for undefined', () => {
    expect(parseIntParam(undefined, 10)).toBe(10);
  });

  it('returns default for NaN', () => {
    expect(parseIntParam('abc', 10)).toBe(10);
  });

  it('returns default for negative numbers', () => {
    expect(parseIntParam('-5', 10)).toBe(10);
  });

  it('returns 0 for "0"', () => {
    expect(parseIntParam('0', 10)).toBe(0);
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/server test`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/utils.test.ts
git commit -m "test: add unit tests for server parseIntParam"
```

---

## Task 12: Server — Route Tests (Projects, Sessions, Messages)

**Files:**
- Create: `server/src/routes/projects.test.ts`
- Create: `server/src/routes/sessions.test.ts`
- Create: `server/src/routes/messages.test.ts`

Each route test follows this pattern:
1. Mock `@code-insights/cli/db/client` so `getDb()` returns in-memory SQLite
2. Apply migrations to the in-memory DB
3. Import `createApp()` from Task 10
4. Use `app.request()` to test endpoints

**Step 1: Write route tests**

Example pattern (projects):

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../cli-imports.js'; // See note below

let testDb: Database.Database;

vi.mock('@code-insights/cli/db/client', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('@code-insights/cli/utils/telemetry', () => ({
  trackEvent: vi.fn(),
}));

import { createApp } from '../index.js';

describe('GET /api/projects', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    // Apply schema — engineer should verify exact import path for runMigrations
    // May need: import { SCHEMA_SQL } from '@code-insights/cli/db/schema'
    // then: testDb.exec(SCHEMA_SQL);
  });

  afterEach(() => {
    testDb.close();
  });

  it('returns empty array when no projects exist', async () => {
    const app = createApp();
    const res = await app.request('/api/projects');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.projects).toEqual([]);
  });

  it('returns projects after insertion', async () => {
    testDb.prepare(`
      INSERT INTO projects (id, name, path, session_count, last_activity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('p1', 'test-project', '/test', 1, '2026-01-15T10:00:00Z', '2026-01-15T10:00:00Z', '2026-01-15T10:00:00Z');

    const app = createApp();
    const res = await app.request('/api/projects');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.projects.length).toBe(1);
    expect(data.projects[0].name).toBe('test-project');
  });

  it('returns 404 for non-existent project', async () => {
    const app = createApp();
    const res = await app.request('/api/projects/nonexistent');
    expect(res.status).toBe(404);
  });
});
```

Sessions test should cover:
- GET `/api/sessions` — empty list, with data, filtering by `projectId` and `sourceTool`
- GET `/api/sessions/:id` — found and not found
- PATCH `/api/sessions/:id` — rename, missing body returns 400

Messages test should cover:
- GET `/api/messages/:sessionId` — returns messages for session, empty for unknown session

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/server test`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/routes/projects.test.ts server/src/routes/sessions.test.ts server/src/routes/messages.test.ts
git commit -m "test: add server route tests for projects, sessions, messages"
```

---

## Task 13: Server — Route Tests (Insights, Analytics, Config, Export)

**Files:**
- Create: `server/src/routes/insights.test.ts`
- Create: `server/src/routes/analytics.test.ts`
- Create: `server/src/routes/config.test.ts`
- Create: `server/src/routes/export.test.ts`

Same mocking pattern as Task 12.

**Key test cases:**

**Insights:**
- GET `/api/insights` — empty, filtered by `sessionId`, `type`
- POST `/api/insights` — valid creation (201), missing required fields (400), invalid type (400)
- DELETE `/api/insights/:id` — existing (200), missing (404)

**Analytics:**
- GET `/api/analytics/dashboard` — returns stats shape
- GET `/api/analytics/dashboard?range=invalid` — 400
- GET `/api/analytics/usage` — returns usage or null

**Config:**
- GET `/api/config/llm` — returns config (mock `loadConfig` from CLI)
- PUT `/api/config/llm` — validates port range, provider values

**Export:**
- POST `/api/export/markdown` — no body returns 400
- POST `/api/export/markdown` with valid `sessionIds` — returns `text/markdown`

**Step 1: Write all four test files**

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/server test`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/routes/insights.test.ts server/src/routes/analytics.test.ts server/src/routes/config.test.ts server/src/routes/export.test.ts
git commit -m "test: add server route tests for insights, analytics, config, export"
```

---

## Task 14: Server — LLM Prompt Tests

**Files:**
- Create: `server/src/llm/prompts.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatMessagesForAnalysis,
  SESSION_ANALYSIS_SYSTEM_PROMPT,
  generateSessionAnalysisPrompt,
  parseAnalysisResponse,
  PROMPT_QUALITY_SYSTEM_PROMPT,
} from './prompts.js';

describe('formatMessagesForAnalysis', () => {
  it('formats messages into readable text', () => {
    const messages = [
      { type: 'user', content: 'Hello', thinking: null, tool_calls: null, tool_results: null, timestamp: '2026-01-15T10:00:00Z' },
      { type: 'assistant', content: 'Hi there', thinking: null, tool_calls: null, tool_results: null, timestamp: '2026-01-15T10:00:01Z' },
    ];
    const result = formatMessagesForAnalysis(messages as any);
    expect(result).toContain('Hello');
    expect(result).toContain('Hi there');
  });
});

describe('generateSessionAnalysisPrompt', () => {
  it('includes project name and summary', () => {
    const prompt = generateSessionAnalysisPrompt('my-project', 'Fixed a bug', 'User: help\nAssistant: ok');
    expect(prompt).toContain('my-project');
    expect(prompt).toContain('Fixed a bug');
  });
});

describe('parseAnalysisResponse', () => {
  it('parses valid JSON wrapped in json tags', () => {
    const response = '<json>{"insights": [{"type": "summary", "title": "Test", "content": "Content", "bullets": [], "confidence": 0.9}]}</json>';
    const result = parseAnalysisResponse(response);
    expect(result).not.toBeNull();
    expect(result!.insights).toHaveLength(1);
  });

  it('returns null for malformed response', () => {
    expect(parseAnalysisResponse('not json')).toBeNull();
    expect(parseAnalysisResponse('<json>invalid</json>')).toBeNull();
  });
});

describe('system prompts', () => {
  it('SESSION_ANALYSIS_SYSTEM_PROMPT is non-empty', () => {
    expect(SESSION_ANALYSIS_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('PROMPT_QUALITY_SYSTEM_PROMPT is non-empty', () => {
    expect(PROMPT_QUALITY_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/server test`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/llm/prompts.test.ts
git commit -m "test: add LLM prompt template and parsing tests"
```

---

## Task 15: CLI — JSONL Parser Tests with Fixtures

**Files:**
- Create: `cli/src/__fixtures__/sessions/claude-code-simple.jsonl`
- Create: `cli/src/__fixtures__/sessions/empty.jsonl`
- Create: `cli/src/__fixtures__/sessions/malformed.jsonl`
- Create: `cli/src/parser/jsonl.test.ts`

**Step 1: Create fixture files**

`claude-code-simple.jsonl` — minimal valid 2-message session:
```jsonl
{"type":"user","uuid":"u1","sessionId":"test-session","timestamp":"2026-01-15T10:00:00Z","message":{"role":"user","content":"Hello, help me fix the login bug"}}
{"type":"assistant","uuid":"a1","sessionId":"test-session","timestamp":"2026-01-15T10:00:05Z","parentUuid":"u1","message":{"role":"assistant","content":"I will help you fix the login bug.","model":"claude-sonnet-4-5","usage":{"input_tokens":100,"output_tokens":50}}}
```

`empty.jsonl` — 0-byte empty file

`malformed.jsonl`:
```
not valid json at all
{"incomplete": true
```

**Step 2: Write the parser tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseJsonlFile } from './jsonl.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '..', '__fixtures__', 'sessions');

describe('parseJsonlFile', () => {
  it('parses a valid simple session', async () => {
    const result = await parseJsonlFile(resolve(fixturesDir, 'claude-code-simple.jsonl'));
    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();
    expect(result!.messages.length).toBeGreaterThanOrEqual(2);
    expect(result!.startedAt).toBeInstanceOf(Date);
    expect(result!.endedAt).toBeInstanceOf(Date);
  });

  it('returns null for empty file', async () => {
    const result = await parseJsonlFile(resolve(fixturesDir, 'empty.jsonl'));
    expect(result).toBeNull();
  });

  it('handles malformed JSONL gracefully', async () => {
    const result = await parseJsonlFile(resolve(fixturesDir, 'malformed.jsonl'));
    expect(result).toBeNull();
  });

  it('generates a title for the parsed session', async () => {
    const result = await parseJsonlFile(resolve(fixturesDir, 'claude-code-simple.jsonl'));
    expect(result).not.toBeNull();
    expect(result!.generatedTitle).toBeTruthy();
    expect(result!.titleSource).toBeTruthy();
  });
});
```

**Step 3: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 4: Commit**

```bash
git add cli/src/__fixtures__/ cli/src/parser/jsonl.test.ts
git commit -m "test: add JSONL parser tests with fixture files"
```

---

## Task 16: Integration — Package Import Validation

**Files:**
- Create: `cli/src/__tests__/package-imports.test.ts`

This is the test that would have caught the v3.0.2 hono bug.

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';

describe('package imports', () => {
  it('hono and @hono/node-server are resolvable', async () => {
    await expect(import('hono')).resolves.toBeDefined();
    await expect(import('@hono/node-server')).resolves.toBeDefined();
  });

  it('better-sqlite3 is resolvable', async () => {
    await expect(import('better-sqlite3')).resolves.toBeDefined();
  });

  it('all CLI dependencies are importable', async () => {
    await expect(import('chalk')).resolves.toBeDefined();
    await expect(import('commander')).resolves.toBeDefined();
    await expect(import('ora')).resolves.toBeDefined();
  });
});
```

**Step 2: Run and verify**

Run: `pnpm --filter @code-insights/cli test`
Expected: PASS

**Step 3: Commit**

```bash
git add cli/src/__tests__/package-imports.test.ts
git commit -m "test: add package import validation (prevents missing dep bugs)"
```

---

## Task 17: Final Verification and Cleanup

**Step 1: Run full test suite from root**

```bash
pnpm test
```

Expected: All tests pass across CLI and server.

**Step 2: Run build to ensure tests haven't broken anything**

```bash
pnpm build
```

Expected: Clean build.

**Step 3: Verify test files excluded from npm package**

The `cli/package.json` `"files"` array only includes `"dist"`, `"dashboard-dist"`, `"server-dist"` — source `*.test.ts` files won't be published.

**Step 4: Final commit if any remaining changes**

```bash
git add -A
git commit -m "test: complete test suite for CLI and server packages"
```

---

## Summary

| Task | Scope | Test Files | Est. Tests |
|------|-------|-----------|------------|
| 1 | Infrastructure | Config files | 0 (setup) |
| 2 | `utils/paths` | 1 | 4 |
| 3 | `utils/pricing` | 1 | 7 |
| 4 | `fuzzy-match` | 1 | 6 |
| 5 | `render/format` | 1 | 10 |
| 6 | `parser/titles` | 1 | 8 |
| 7 | `aggregation` | 1 | 11 |
| 8 | `db/schema + migrate` | 1 | 8 |
| 9 | `db/read + write` | 1 + seed | 5 |
| 10 | Server refactor | 0 (modify) | 0 |
| 11 | `server/utils` | 1 | 5 |
| 12 | Routes (core) | 3 | ~12 |
| 13 | Routes (rest) | 4 | ~16 |
| 14 | LLM prompts | 1 | 6 |
| 15 | JSONL parser | 1 + fixtures | 4 |
| 16 | Package imports | 1 | 3 |
| 17 | Final verification | 0 | 0 |
| **Total** | | **~19 files** | **~105 tests** |
