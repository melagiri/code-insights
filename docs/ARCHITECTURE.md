# Architecture — Code Insights

> Technical architecture reference. Linked from [CLAUDE.md](../CLAUDE.md).

---

## Data Flow

```
Source tool session files -> Provider (discover + parse) -> SQLite -> Dashboard (localhost:7890)
                                                         -> CLI stats commands
```

---

## Repository Structure

```
code-insights/
├── cli/                    # Node.js CLI (Commander.js, SQLite, providers)
│   └── src/
│       ├── commands/       # CLI commands (init, sync, status, stats, dashboard, config)
│       ├── commands/stats/ # Stats command suite (4-layer architecture)
│       ├── providers/      # Source tool providers (claude-code, cursor, codex, copilot, copilot-cli)
│       ├── parser/         # JSONL parsing, title generation
│       ├── db/             # SQLite schema, migrations, queries
│       ├── utils/          # Config, device, paths, telemetry
│       ├── types.ts        # Type definitions (SINGLE SOURCE OF TRUTH)
│       └── index.ts        # CLI entry point
├── dashboard/              # Vite + React SPA
│   └── src/
│       ├── components/     # React components (shadcn/ui)
│       ├── hooks/          # React Query hooks
│       ├── lib/            # LLM providers, utilities, telemetry
│       └── App.tsx         # SPA entry point
├── server/                 # Hono API server
│   └── src/
│       ├── routes/         # REST API endpoints
│       ├── llm/            # LLM client: session analysis, reflect synthesis, export, normalization, cost tracking; analysis prompts use provider-native caching for the shared conversation prefix
│       └── index.ts        # Server entry point
├── docs/                   # Product docs, plans, roadmap
│   └── plans/              # Design plans (pending implementation only)
└── .claude/                # Agent definitions, commands, hookify rules
    ├── agents/             # Agent definitions (engineer, TA, PM, etc.)
    └── commands/           # Team commands (start-feature, start-review)
```

### CLI Directory Detail (`/cli/src/`)

- `commands/` — CLI commands (init, sync, status, dashboard, reset, install-hook, config, reflect, telemetry)
- `commands/stats/` — Stats command suite (4-layer architecture):
  - `data/types.ts` — `StatsDataSource` interface, `SessionRow`, error classes
  - `data/source.ts` — Data source factory
  - `data/local.ts` — SQLite data source implementation
  - `data/aggregation.ts` — Pure compute functions (overview, cost, projects, today, models)
  - `data/fuzzy-match.ts` — Levenshtein distance for `--project` name matching
  - `render/` — Terminal rendering (colors, format, charts, layout)
  - `actions/` — Action handlers for each subcommand + shared error handler
  - `index.ts` — Command tree with lazy imports
  - `shared.ts` — Shared CLI flags
- `providers/` — Source tool providers (claude-code, cursor, codex, copilot, copilot-cli)
- `providers/types.ts` — `SessionProvider` interface
- `providers/registry.ts` — Provider registration and lookup
- `parser/jsonl.ts` — JSONL file parsing (used by ClaudeCodeProvider)
- `parser/titles.ts` — Smart session title generation (5-tier fallback strategy)
- `db/` — SQLite schema, migrations, query functions
- `utils/config.ts` — Configuration management (~/.code-insights/config.json)
- `utils/device.ts` — Device ID generation, git remote detection, stable project IDs
- `utils/paths.ts` — Virtual path handling (shared by sync and stats)
- `utils/telemetry.ts` — PostHog telemetry (opt-out model, 14 event types)
- `types.ts` — TypeScript type definitions (SINGLE SOURCE OF TRUTH)
- `index.ts` — CLI entry point (Commander.js)

---

## Provider Architecture

All source tools are integrated via the `SessionProvider` interface (`providers/types.ts`):

```typescript
interface SessionProvider {
  getProviderName(): string;                                    // e.g. 'claude-code', 'cursor'
  discover(options?: { projectFilter?: string }): Promise<string[]>;  // Find session files
  parse(filePath: string): Promise<ParsedSession | null>;       // Parse into common format
}
```

Providers are registered in `providers/registry.ts`. To add a new source tool:
1. Create `providers/<name>.ts` implementing `SessionProvider`
2. Register it in `providers/registry.ts`
3. Add color entry to dashboard `SOURCE_TOOL_COLORS`
4. Add avatar case to dashboard `getAssistantConfig()`
5. Add tool name aliases if tool names differ
6. Add option to source filter dropdown

---

## SQLite Database

- **Location:** `~/.code-insights/data.db`
- **Mode:** WAL (concurrent reads during CLI sync)
- **Driver:** better-sqlite3 (synchronous, fast, no async overhead)
- **Schema:** Versioned migrations (V1–V7) applied on startup
- **Timestamps:** ISO 8601 strings

### Tables

| Table | Purpose | Schema Version |
|-------|---------|---------------|
| `projects` | Project metadata (id = hash of git remote URL or path) | V1 |
| `sessions` | Session metadata, titles, character classification, `deleted_at` soft-delete; V6 adds `compact_count INTEGER`, `auto_compact_count INTEGER`, `slash_commands TEXT` | V1, V5, V6 |
| `messages` | Full message content (stored during sync) | V1 |
| `insights` | LLM-generated insights (5 types) | V1, V2 (index) |
| `usage_stats` | Global usage aggregation | V1 |
| `session_facets` | Cross-session facet data (friction, patterns, workflow) | V3 |
| `reflect_snapshots` | Cached synthesis results, composite PK `(period, project_id)` | V4 |
| `analysis_usage` | Per-session LLM analysis cost data, composite PK `(session_id, analysis_type)` | V7 |
| `schema_version` | Migration tracking | V1 |

---

## Type Architecture (CRITICAL)

Types are defined **once** in `cli/src/types.ts`. This is the single source of truth for the entire monorepo.

```
CLI (cli/src/types.ts)       -> Writes to SQLite
Server (server/src/)         -> Reads from SQLite, exposes via API
Dashboard (dashboard/src/)   -> Reads from Server API
```

**Rules:**
- New SQLite columns MUST have defaults or be nullable (backward compatible)
- Type changes in `types.ts` must be reflected in SQLite migrations
- TA owns this contract — flag all type changes to `technical-architect`

### Key Types (`cli/src/types.ts`)

| Type | Purpose |
|------|---------|
| `ClaudeMessage` | Individual message entry |
| `ParsedSession` | Aggregated session with metadata, title, character |
| `Insight` | Types: summary, decision, learning, technique, prompt_quality; source: 'llm' |
| `FrictionPoint` | Friction with category, severity, resolution, description; optional `attribution` field (`'user-actionable' \| 'ai-capability' \| 'environmental'`) |
| `EffectivePattern` | Pattern with required `category`, `description`, `confidence`; optional `driver` field (`'user-driven' \| 'ai-driven' \| 'collaborative'`); CoT `_reasoning` scratchpad stored in JSON blob |
| `SessionCharacter` | 7 classifications: deep_focus, bug_hunt, feature_build, exploration, refactor, learning, quick_task |
| `ClaudeInsightConfig` | Config format |
| `SyncState` | File modification tracking for incremental sync |

### Friction & Pattern Normalization

Both friction points and effective patterns use canonical category taxonomies with Levenshtein-based normalization (`server/src/llm/friction-normalize.ts`, `server/src/llm/pattern-normalize.ts`).

**Friction categories (9 canonical):** `wrong-approach`, `knowledge-gap`, `stale-assumptions`, `incomplete-requirements`, `context-loss`, `scope-creep`, `repeated-mistakes`, `documentation-gap`, `tooling-limitation`

**Effective pattern categories (8 canonical):** `structured-planning`, `incremental-implementation`, `verification-workflow`, `systematic-debugging`, `self-correction`, `context-gathering`, `domain-expertise`, `effective-tooling`

**Normalization pipeline:** exact match → alias lookup → Levenshtein (distance ≤ 2) → substring match → pass-through (novel category). Normalization runs at write time in `saveFacetsToDb()` and at read time as a belt-and-suspenders guard.

**Legacy alias remapping:** 11 old friction categories (from the original 15-category taxonomy) are aliased to the current 9. See `FRICTION_ALIASES` in `friction-normalize.ts`.

**Attribution model:** Each friction point carries an optional `attribution` field classifying who contributed: `user-actionable` (better input would have prevented it), `ai-capability` (AI failed despite adequate input), or `environmental` (external constraint). Old data without attribution is detected by the `/api/facets/outdated` endpoint.

---

## Server API Routes

| Route | Purpose |
|-------|---------|
| `/api/projects` | Project queries |
| `/api/sessions` | Session list, detail |
| `/api/messages` | Message content |
| `/api/insights` | Generated insights |
| `/api/analysis` | Session analysis (SSE streaming) |
| `/api/analytics` | Analytics aggregation |
| `/api/config` | Configuration endpoints (including LLM) |
| `/api/export` | Export generation (SSE streaming) |
| `/api/telemetry` | Telemetry identity & opt-out |
| `/api/analysis/usage` | Analysis cost/usage data per session |
| `/api/facets` | Session facets data; `/api/facets/outdated` detects sessions missing effective_patterns.category or friction_points.attribution |
| `/api/facets/missing-pq` | Sessions missing prompt quality analysis |
| `/api/facets/outdated-pq` | Sessions with outdated prompt quality insights |
| `/api/facets/backfill-pq` | Backfill prompt quality for sessions |
| `/api/reflect` | Cross-session synthesis endpoints |
| `/api/reflect/weeks` | List last 8 ISO weeks with session counts and snapshot status |
| `/api/reflect/snapshot` | Cached synthesis snapshot for a specific week/project |
| `/api/sessions/deleted/count` | Count of soft-deleted sessions |
| `PATCH /api/sessions/:id` | Update session (custom title, soft delete) |
| `DELETE /api/sessions/:id` | Soft-delete a session |

---

## Dashboard Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Overview with charts |
| Sessions | `/sessions` | Session list with filters |
| Session Detail | `/sessions/:id` | Full session with analyze button |
| Insights | `/insights` | Browse generated insights |
| Analytics | `/analytics` | Charts: cost, models, projects |
| Patterns | `/patterns` | Cross-session synthesis (Friction & Wins, Rules & Skills, Working Style) |
| Export | `/export` | LLM-powered export wizard (4 formats, 3 depths) |
| Journal | `/journal` | Session journal/notes |
| Settings | `/settings` | Configuration UI |
