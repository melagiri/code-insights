# Test Suite Design — Code Insights

> Full test suite for CLI and server packages using Vitest.

**Date:** 2026-02-28
**Status:** Approved
**Scope:** CLI + Server (dashboard deferred)

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Vitest | Native ESM, Vite-native for dashboard (future), fast, monorepo workspace support |
| Structure | Monorepo-unified | Root `vitest.workspace.ts` + per-package configs. Single `pnpm test` |
| File convention | Co-located `*.test.ts` | Tests next to source for discoverability |
| DB testing | In-memory SQLite | Real SQL engine, no mocks, fast |
| Server testing | Hono `app.request()` | No HTTP server needed, tests route handlers directly |
| FS mocking | `vi.mock('fs')` + fixtures | Controlled, deterministic, fast |
| Dashboard | Deferred | CLI and server are where data integrity bugs live |

---

## Infrastructure

### Dependencies

| Package | New Dev Dependencies |
|---------|---------------------|
| Root | `vitest` |
| CLI | (uses root vitest) |
| Server | (uses root vitest) |

### Config Files

```
code-insights/
├── vitest.workspace.ts          # Lists ['cli', 'server']
├── cli/vitest.config.ts         # environment: 'node'
├── server/vitest.config.ts      # environment: 'node'
```

### Scripts

```json
// root package.json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"

// cli/package.json + server/package.json
"test": "vitest run",
"test:watch": "vitest"
```

---

## Test Scope

### CLI (~35 test files)

#### Tier 1 — Pure Logic (no mocking)

| Module | What to Test | Priority |
|--------|-------------|----------|
| `parser/titles.ts` | Title generation (5-tier fallback), character classification | High |
| `utils/pricing.ts` | Cost calculation per model, edge cases (unknown models) | High |
| `commands/stats/data/aggregation.ts` | Overview, cost, project, today, models computations | High |
| `commands/stats/data/fuzzy-match.ts` | Levenshtein distance, closest match selection | Medium |
| `commands/stats/render/format.ts` | Number/currency/token formatting | Medium |
| `utils/paths.ts` | Path encoding/decoding, virtual path handling | Medium |

#### Tier 2 — Filesystem I/O (mock fs)

| Module | What to Test | Priority |
|--------|-------------|----------|
| `parser/jsonl.ts` | JSONL parsing with fixture files, malformed input | High |
| `providers/claude-code.ts` | Session discovery, path patterns, parse output | High |
| `providers/codex.ts` | Codex rollout file discovery and parsing | Medium |
| `providers/copilot-cli.ts` | Copilot events discovery and parsing | Medium |
| `providers/cursor.ts` | Cursor SQLite discovery (mock better-sqlite3) | Medium |
| `utils/config.ts` | Config load/save, defaults | Medium |
| `utils/device.ts` | Device ID generation, git remote detection | Low |

#### Tier 3 — Database (in-memory SQLite)

| Module | What to Test | Priority |
|--------|-------------|----------|
| `db/schema.ts` | Migrations apply cleanly, schema is valid SQL | High |
| `db/write.ts` | Insert sessions, insights, messages; upsert behavior | High |
| `db/read.ts` | Query sessions by project/tool/date, pagination | High |
| `db/migrate.ts` | Version tracking, idempotent migration | Medium |

#### Tier 4 — Integration

| Module | What to Test | Priority |
|--------|-------------|----------|
| `commands/sync.ts` | End-to-end: fixture files → SQLite rows | Medium |
| Package imports | Verify server-dist imports resolve (prevents hono bug) | High |

### Server (~12 test files)

| Module | What to Test | Priority |
|--------|-------------|----------|
| `routes/sessions.ts` | GET sessions (filtered), PATCH rename | High |
| `routes/messages.ts` | GET messages with pagination | High |
| `routes/insights.ts` | GET/DELETE insights | High |
| `routes/projects.ts` | GET projects list, project detail | Medium |
| `routes/analysis.ts` | POST analysis (mock LLM client) | Medium |
| `routes/analytics.ts` | GET stats aggregation | Medium |
| `routes/export.ts` | GET export in CSV/JSON format | Medium |
| `llm/prompts.ts` | Prompt templates produce valid strings | Low |
| `llm/analysis.ts` | Analysis orchestration (mock LLM) | Low |

---

## Testing Patterns

### Fixtures

```
cli/src/__fixtures__/
├── sessions/
│   ├── claude-code-simple.jsonl    # Minimal valid session
│   ├── claude-code-complex.jsonl   # Multi-tool, long session
│   ├── malformed.jsonl             # Bad JSON lines
│   └── empty.jsonl                 # Empty file
├── config/
│   ├── valid-config.json           # Standard config
│   └── minimal-config.json         # Bare minimum
└── db/
    └── seed.ts                     # Helper to seed in-memory SQLite
```

### Database Testing

Real in-memory SQLite (`:memory:`) — tests actual SQL:

```typescript
import Database from 'better-sqlite3';
import { applyMigrations } from '../db/migrate.js';

export function createTestDb() {
  const db = new Database(':memory:');
  applyMigrations(db);
  return db;
}
```

### Server Route Testing

Hono `app.request()` — no HTTP server:

```typescript
const res = await app.request('/api/sessions?project=my-project');
expect(res.status).toBe(200);
const data = await res.json();
expect(data.sessions).toHaveLength(3);
```

### Import Validation ("Hono Bug" Test)

```typescript
test('server-dist entry point resolves all imports', async () => {
  await expect(import('../../server-dist/index.js')).resolves.toBeDefined();
});
```

---

## Implementation Order

1. **Infrastructure** — Install vitest, create configs, add scripts
2. **Tier 1 CLI** — Pure logic tests (titles, pricing, aggregation, fuzzy-match, format, paths)
3. **Tier 3 CLI** — Database tests (schema, read, write, migrate) with in-memory SQLite
4. **Tier 2 CLI** — Provider/parser tests with fixtures and fs mocking
5. **Server routes** — Route handler tests with Hono app.request()
6. **Tier 4 CLI** — Integration tests (sync command, package imports)
7. **Server LLM** — Analysis/prompt tests with mocked LLM client

Total: ~47 test files across CLI and server.
