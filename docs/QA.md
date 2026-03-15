# QA & Test Strategy — Code Insights

> Reference document for test strategy, domain classification, coverage targets, and test patterns.
> See [DEVELOPMENT.md](DEVELOPMENT.md) for the TDD workflow and running tests.

---

## Philosophy

Code Insights uses **strategic TDD**: test-first development applied where it delivers the most value. The codebase is a live product with real users. Silent regressions in normalizers, parsers, or migrations cause data corruption that's hard to detect and harder to undo.

The strategy is **surgical, not universal**. Dashboard components and CLI command wiring are intentionally excluded — the value-to-effort ratio is too low.

---

## Domain Classification

| Level | Domain | Path | Coverage Target |
|-------|--------|------|----------------|
| **MUST TDD** | Source providers (parsers) | `cli/src/providers/` | 90%+ |
| **MUST TDD** | Normalizers | `server/src/llm/*-normalize.ts` | 85%+ |
| **MUST TDD** | Migrations | `cli/src/db/migrate.ts`, `schema.ts` | 90%+ |
| **MUST TDD** | Shared utilities | `server/src/utils.ts`, `cli/src/utils/` | 85%+ |
| **SHOULD TDD** | API routes | `server/src/routes/` | 70%+ |
| **SKIP TDD** | Dashboard components | `dashboard/src/` | — |
| **SKIP TDD** | CLI command wiring | `cli/src/commands/`, `cli/src/index.ts` | — |

### Why Each Domain is Classified This Way

**MUST TDD: Parsers (`cli/src/providers/`)**

Providers parse external file formats (JSONL, SQLite, JSON) that can change at any time without warning. A broken parser silently produces `null` or wrong data, corrupting every session sync until the user notices something is off. Tests catch format changes immediately.

**MUST TDD: Normalizers (`server/src/llm/*-normalize.ts`)**

Each normalizer contains 10–44 alias mappings. A typo in an alias silently corrupts user insights — `friction-normalize.ts` maps 11 legacy categories to 9 canonical ones. Without table-driven tests covering every alias, any edit risks introducing regressions that affect stored data permanently.

**MUST TDD: Migrations (`cli/src/db/`)**

Migrations apply irreversible schema changes to users' SQLite databases. A non-idempotent migration could duplicate rows or fail on re-run. Tests with in-memory SQLite verify the complete V1→V7 sequence applies cleanly and can be safely re-run.

**MUST TDD: Shared Utilities**

Pure functions with deterministic input/output. The cost of testing is minimal; the benefit (regression safety and documentation of expected behavior) is high.

**SHOULD TDD: API Routes**

High-value but harder to test due to SQLite coupling and Hono server setup. Worth testing for critical business logic (pagination, filtering, date ranges), but not required for every route.

**SKIP TDD: Dashboard Components**

React components are visual and state-driven. Unit tests for UI components tend to be brittle, testing implementation details rather than behavior. Manual testing and visual review are more effective here.

**SKIP TDD: CLI Command Wiring**

Commander.js command registration and argument parsing is integration-level behavior. Test via `code-insights sync --dry-run` and manual verification rather than unit tests.

---

## Coverage Targets

| Domain | Minimum | What to Cover |
|--------|---------|---------------|
| Normalizers | 100% of canonical categories + all aliases | Every alias in the alias map |
| Parsers | Happy path + empty + malformed + edge cases | All `null`-return conditions |
| Migrations | V1→V7 sequential, double-apply idempotency | All added tables and columns |
| Utilities | All exported functions | Happy path + boundary conditions |

---

## Test Patterns by Domain

### Normalizers — Table-Driven Tests

Normalizers have many alias mappings. Use table-driven tests to cover all of them efficiently:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeFrictionCategory } from './friction-normalize.js';

describe('normalizeFrictionCategory', () => {
  it('recognizes all 9 canonical categories', () => {
    const canonicals = ['wrong-approach', 'knowledge-gap', /* ... */];
    for (const cat of canonicals) {
      expect(normalizeFrictionCategory(cat)).toBe(cat);
    }
  });

  it('remaps all 11 legacy aliases', () => {
    const aliases: [string, string][] = [
      ['missing-dependency', 'stale-assumptions'],
      ['type-error', 'knowledge-gap'],
      // ... all 11 aliases
    ];
    for (const [input, expected] of aliases) {
      expect(normalizeFrictionCategory(input)).toBe(expected);
    }
  });

  it('returns original for novel (unknown) categories', () => {
    expect(normalizeFrictionCategory('custom-category')).toBe('custom-category');
  });
});
```

### Parsers — Fixture-Based Tests

Use real fixture files (or temp files written during tests) to exercise the parser with realistic input:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeProvider } from '../claude-code.js';

describe('ClaudeCodeProvider', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses a valid session', async () => {
    const filePath = path.join(tempDir, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl');
    fs.writeFileSync(filePath, VALID_SESSION_JSONL);
    const provider = new ClaudeCodeProvider();
    const session = await provider.parse(filePath);
    expect(session).not.toBeNull();
  });

  it('returns null for empty file', async () => {
    const filePath = path.join(tempDir, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl');
    fs.writeFileSync(filePath, '');
    const provider = new ClaudeCodeProvider();
    const session = await provider.parse(filePath);
    expect(session).toBeNull();
  });
});
```

**Fixture file naming:** Parser tests require UUID-format filenames (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.jsonl`) because `extractSessionId()` parses the session ID from the filename.

### Migrations — In-Memory SQLite

Use `new Database(':memory:')` so tests are fully isolated with no on-disk state:

```typescript
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrate.js';

function freshDb(): Database.Database {
  return new Database(':memory:');
}

describe('runMigrations', () => {
  it('applies all migrations on a fresh database', () => {
    const db = freshDb();
    runMigrations(db);
    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number };
    expect(row.v).toBe(7); // update when schema version bumps
  });

  it('is idempotent — double apply leaves no duplicate rows', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db); // second run must be a no-op
    const count = (db.prepare('SELECT COUNT(*) as n FROM schema_version').get() as { n: number }).n;
    expect(count).toBe(7);
  });
});
```

**When adding a new migration (VN):** Update the idempotency test expected version number and add a test verifying the new table/column exists after migration.

### Utility Functions — Unit Tests

Pure functions: straightforward input/output testing with boundary conditions:

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

  it('returns default for negative values', () => {
    expect(parseIntParam('-5', 10)).toBe(10);
  });
});
```

---

## Running Tests

```bash
# Run all tests (from repo root)
pnpm test

# Watch mode (re-runs on file changes)
pnpm test:watch

# Coverage report
pnpm test:coverage

# Run a single test file
pnpm test cli/src/db/__tests__/migrate.test.ts
```

Tests run via **vitest** with native ESM support. Configuration lives in the root `package.json`.

---

## Debugging Test Failures

### "Cannot find package" errors in server tests

Some server route tests import from `@code-insights/cli` which requires the CLI to be built first. If you see this error, run `pnpm build` from the root, then re-run tests.

### "table has no column" in migration tests

The sessions table has many required columns. Use only the truly NOT NULL required columns in test INSERTs: `id, project_id, project_name, project_path, started_at, ended_at`. Or use `createTestDb()` + `insertSessionWithProject()` from `cli/src/__fixtures__/db/seed.ts`.

### "expected null" in parser tests

`parseJsonlFile` returns `null` when:
- File is empty (0 bytes)
- All lines are malformed JSON (no valid entries)
- File has entries but no `user`/`assistant`/`system` type messages
- Filename doesn't match UUID format (session ID extraction fails)

Note: `'system'` type entries DO count as messages in the JSONL parser. Use `'summary'` type entries to create a file with entries but no messages.

---

## Test File Locations

```
code-insights/
├── cli/src/
│   ├── __fixtures__/
│   │   ├── db/seed.ts              # createTestDb(), makeParsedSession()
│   │   └── sessions/               # Golden JSONL fixtures for parser tests
│   ├── db/__tests__/
│   │   └── migrate.test.ts         # Migration idempotency tests
│   ├── parser/
│   │   ├── jsonl.test.ts           # JSONL parsing tests
│   │   └── titles.test.ts          # Title generation tests
│   ├── providers/
│   │   ├── __tests__/
│   │   │   └── claude-code.test.ts # ClaudeCodeProvider tests
│   │   └── codex.test.ts           # CodexProvider tests (co-located)
│   └── utils/
│       ├── config.test.ts
│       ├── paths.test.ts
│       └── pricing.test.ts
└── server/src/
    ├── llm/
    │   ├── friction-normalize.test.ts
    │   ├── pattern-normalize.test.ts
    │   ├── prompt-quality-normalize.test.ts
    │   ├── normalize-utils.test.ts
    │   ├── prompts.test.ts
    │   ├── reflect-prompts.test.ts
    │   └── export-prompts.test.ts
    ├── routes/                     # SHOULD TDD — partial coverage
    └── utils.test.ts
```
