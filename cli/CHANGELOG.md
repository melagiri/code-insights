# Changelog

All notable changes to `@code-insights/cli` will be documented in this file.

## [4.2.1] - 2026-03-19

### Fixed

- **Blank share card image** — The exported PNG was a blank white image in both Chrome and Safari. Root cause: `html-to-image` serializes DOM to SVG internally, which silently drops 8-digit hex alpha colors (`#ffffff06`) and `background-clip: text` gradient fills. Fixed by converting all alpha colors to `rgba()` format, replacing gradient tagline text with solid `#a78bfa` (violet-400), and adding a `backgroundColor` fallback to the `toPng` call.

## [4.2.0] - 2026-03-19

### Added

- **Shareable working style card** — Download a 1200×630 PNG card from the Patterns page showing your coding archetype tagline, session stats, AI tool pills, milestone badges, and character distribution donut chart. Designed for sharing on LinkedIn and X/Twitter. Privacy-safe: no project names, file paths, or sensitive data.
- **Source tool names in aggregation** — The `/api/facets/aggregated` endpoint now returns `sourceTools: string[]` alongside the existing count, enabling tool-specific display on the share card.
- **Computed milestones** — Session count, streak, multi-tool, and success rate milestones computed on-the-fly from existing data (no new DB tables).

### Fixed

- **Streak unit label** — Dashboard streak badge showed `w` (weeks) but the value is consecutive days. Fixed to `d` across both dashboard and share card.

## [4.1.0] - 2026-03-18

### Added

- **Zero-config first-run** — Running `code-insights` with no arguments now automatically syncs sessions and opens the dashboard. One command to value in 30 seconds, no `init` required.
- **Dashboard auto-sync** — The `dashboard` command runs a quick sync before starting the server, so data is always fresh. Skip with `--no-sync`.
- **Guided empty states** — InsightsPage shows a guided path to LLM configuration when no analysis exists, replacing the generic "no insights" message.

### Changed

- **`init` is now optional** — The database and config are auto-created on first use. `init` remains available for customizing settings but is no longer a required first step.
- **Documentation overhaul** — README, CLI reference, CLAUDE.md, MIGRATION.md, CONTRIBUTING.md, PRODUCT.md, and VISION.md all updated to reflect the zero-config flow.

## [4.0.1] - 2026-03-16

### Fixed

- **Reflect snapshot timestamp** — The "Generated Xd ago" label on the Patterns page showed the ISO week end date instead of when the reflection was actually generated. Fixed positional parameter mismatch in snapshot INSERT that set `generated_at` to `window_end`.

## [4.0.0] - 2026-03-16

### Added

- **Reflect & Patterns** — Cross-session pattern detection and synthesis via LLM. New `reflect` CLI command generates weekly insights: friction points, effective patterns, prompt quality analysis, and working style rules. New `stats patterns` subcommand shows patterns in the terminal. New Patterns dashboard page with weekly report card layout and ISO week navigation.
- **Session facets** — Each analyzed session now produces structured facets (outcome, workflow, friction, effective patterns, course corrections) stored in a dedicated `session_facets` table. Facets power Reflect aggregation.
- **Friction taxonomy** — 9 canonical friction categories (wrong-approach, knowledge-gap, stale-assumptions, incomplete-requirements, context-loss, scope-creep, repeated-mistakes, documentation-gap, tooling-limitation) with attribution model (user-actionable, AI capability, environmental) and CoT reasoning.
- **Effective pattern taxonomy** — 8 canonical pattern categories (structured-planning, incremental-implementation, verification-workflow, systematic-debugging, self-correction, context-gathering, domain-expertise, effective-tooling) with driver classification (user-driven, AI-driven, collaborative).
- **Prompt quality taxonomy** — 7 deficit + 3 strength categories replacing efficiency scores. Two-layer output: user-facing takeaways (before/after) and categorized findings for Reflect aggregation. 5 dimension scores (context_provision, request_specificity, scope_management, information_timing, correction_quality).
- **ISO week navigation** — `reflect --week 2026-W11` replaces sliding `--period` windows. Dashboard WeekSelector with session counts and snapshot status per week.
- **Reflect backfill** — `reflect backfill` extracts facets for sessions synced before Reflect existed. Handles both missing and outdated sessions in one pass. `--prompt-quality` flag for PQ-specific backfill.
- **Reflect snapshots** — Cross-session synthesis results are cached in `reflect_snapshots` table with staleness detection and auto-load.
- **LLM prompt caching** — Shared cacheable conversation prefix for Anthropic (prompt-caching beta) and OpenAI (automatic prefix caching). Estimated ~32% input token savings on Anthropic.
- **LLM cost tracking** — New `analysis_usage` table tracks per-session analysis cost with provider, model, token counts, and duration. Dashboard cost UI on session detail page.
- **Soft-delete sessions** — `sync prune` with preview+confirm UX. Trash button in dashboard. Deleted sessions filtered from all API endpoints.
- **Chat view system events** — Context break dividers, inline command chips for slash commands, protocol noise hidden. Raw message toggle for full conversation view.
- **VS Code Copilot Chat support** — Added to supported tools table and provider documentation (provider existed since v2.1.0 but was undocumented in READMEs).
- **Message classification V6** — `compact_count`, `auto_compact_count`, `slash_commands` columns. V6 prompt context signals for better LLM analysis. Auto force-sync and stale insight advisory on V6 migration.
- **PQ signals in Reflect** — Prompt quality category aggregation wired into friction-wins synthesis for richer weekly reports.

### Changed

- **SQLite Schema V5** — `deleted_at` column for soft-delete support.
- **SQLite Schema V6** — `compact_count`, `auto_compact_count`, `slash_commands` columns on sessions.
- **SQLite Schema V7** — `analysis_usage` table with composite PK `(session_id, analysis_type)`.
- **`reflect --period` → `reflect --week`** — CLI flag replaced. Use ISO week format `YYYY-WNN` (default: current week).
- **Prompt quality metadata shape** — Dimension scores replace efficiency score. Dashboard handles both new and legacy formats via dual-read.
- **Friction display** — Bar chart replaced with category+description list matching effective patterns layout.
- **Patterns page** — Multiple redesigns: 2-tab→3-tab layout, hero card, weekly report card, data-driven week navigation.
- **Session analysis prompt** — Restructured for better facet quality with auto-applied LLM-suggested titles.
- **Actor-neutral classification** — Friction/pattern prompts use neutral category definitions with evidence-based attribution decision trees.

### Fixed

- **Inflated user_message_count** — Claude Code JSONL parser now correctly counts user messages.
- **Gemini JSON response mode** — Enabled JSON response mode to prevent malformed LLM output.
- **Insights API default limit** — Raised from 100 to 5000 to prevent truncated results.
- **Week range generation** — Monday milliseconds normalized to UTC midnight; correct Monday bucketing in GROUP BY queries.
- **PostHog telemetry routing** — CLI and dashboard telemetry routed through correct endpoints.

### Improved

- **Test coverage** — Expanded to 80%+ across CLI and server packages. Added migration idempotency tests, V6 classification tests, shared-aggregation coverage.
- **Code organization** — Major refactoring: split monolithic `analysis.ts` and `prompts.ts` into focused modules, shared normalizer infrastructure, route helpers (`trackAnalysisResult`, `streamSessionAnalysis`, `streamBatchBackfill`), dashboard component decomposition.
- **Normalizer infrastructure** — Shared `normalizeCategory()` used by friction, pattern, and prompt quality normalizers.

## [3.6.1] - 2026-03-04

### Changed

- **PostHog custom domain** — Route telemetry events through `code-insights.app` instead of `us.i.posthog.com` to avoid ad-blocker interference. Updated both CLI (posthog-node) and dashboard (posthog-js).
- **README badges** — Added npm version, monthly downloads, license, Node.js version, and Socket security score badges.

## [3.6.0] - 2026-03-04

### Added

- **LLM-Powered Export Page** — The standalone Export Page is now a 4-step wizard that uses LLM synthesis to read across multiple sessions' insights and produce curated, deduplicated output. Instead of listing learnings verbatim, the LLM deduplicates overlapping insights, resolves conflicting decisions, prioritizes by confidence, and adds contextual "WHEN" conditions.
- **4 export formats** — Agent Rules (CLAUDE.md/.cursorrules), Knowledge Brief (markdown handoff), Obsidian (YAML frontmatter + wikilinks), Notion (toggle blocks + callouts + tables).
- **2 scope modes** — Project mode (single project, rules implicitly scoped) and All Projects mode (cross-project, LLM classifies rules as UNIVERSAL or PROJECT-SPECIFIC with project labels).
- **3 depth presets** — Essential (~25 top insights, fast), Standard (~80 insights, default), Comprehensive (~200 insights, thorough). Controls how many insights the LLM synthesizes.
- **SSE streaming** — Real-time progress feedback during LLM generation with loading_insights → synthesizing → complete phases.
- **AbortSignal support** — Cancel in-progress LLM generation to save tokens when navigating away.
- **Token budget guard** — Caps input at ~60k tokens with depth-based limits as the primary control.
- **Shared SSE utility** — Extracted `parseSSEStream` from AnalysisContext to `dashboard/src/lib/sse.ts` for reuse across streaming consumers.

### Changed

- **SQLite schema V2** — Added compound index `idx_insights_confidence_timestamp` on insights table for depth-ordered export queries. Migration runs automatically on first use.

## [3.5.1] - 2026-03-03

### Changed

- **Product tagline** — Updated tagline to "Turn your AI coding sessions into knowledge" across package description, README, and product docs ahead of ProductHunt launch.

### Improved

- **Insights page UX polish** — Aligned Insights page layout, filters, and empty states with the Sessions page for a consistent dashboard experience.
- **README screenshots** — Added 5 screenshots (dashboard, sessions, insights, analytics, terminal stats) to the root README for better first impressions on GitHub.

## [3.4.1] - 2026-03-02

### Fixed

- **Missing `jsonrepair` runtime dependency** — `code-insights dashboard` failed for npm-installed users because `jsonrepair` (used by server LLM response parsing) was in `server/package.json` but not `cli/package.json`.

## [3.4.0] - 2026-03-02

### Fixed

- **Codex CLI parser rewrite** — Complete rewrite of the Codex CLI provider to handle the current JSONL format (v0.104.0+). Previously produced 0 assistant messages and 0 tool calls for all sessions. Now correctly parses `function_call`, `function_call_output`, `custom_tool_call`, `agent_message`, and `task_complete` events. Also adds support for the legacy single-JSON format (pre-2025 `.json` files).
- **Cursor provider data quality** — Three fixes: (1) project path inference from code block URIs when workspace.json is unavailable, (2) Lexical JSON rich text extraction with proper paragraph separators, (3) VSCode URI object unwrapping for file paths in tool calls.
- **Copilot VS Code metadata** — `models_used` and `primary_model` were always NULL (307 sessions affected). Provider now collects model IDs from session and per-request fields into a `SessionUsage` object.
- **Copilot CLI timestamps** — `started_at` and `ended_at` were identical (collapsed to file mtime). Event timestamps live at the event root level, not inside `event.data` — parser now extracts from the correct location.
- **Copilot CLI tool call IDs** — Were synthetic (`copilot-tool-N`) instead of using the original `toolCallId` from events. Also extracts tool calls from `assistant.message` `toolRequests` array.
- **Copilot CLI model extraction** — Model field was always empty. Now extracted from `tool.execution_complete` events.

### Added

- **Provider-agnostic session character detection** — `detectSessionCharacter` now recognizes tool names from all providers (Claude Code, Copilot VS Code, Copilot CLI, Codex CLI, Cursor) instead of only Claude Code tool names (`Edit`, `Write`, `Read`, `Grep`, `Glob`). Uses `EDIT_TOOLS` and `READ_TOOLS` sets with provider-agnostic file path extraction.
- **Dashboard agent message rendering** — Agent team coordination messages (`<task-notification>`, `<teammate-message>`) previously rendered as "You" bubbles. Now displayed as distinct notification cards with amber borders (task notifications) and colored borders (teammate messages).
- **`usageSource: 'session'` type** — New usage source value for providers that have model info but no token data.

## [3.3.2] - 2026-03-02

### Added

- **Richer analysis prompts (v3.0.0)** — Decomposed insight schemas: decisions now include situation, choice, reasoning, alternatives (with rejection reason), trade-offs, and revisit conditions. Learnings include symptom, root cause, transferable takeaway, and applicability. Summaries include outcome status.
- **Session traits in prompt quality** — Detects higher-level behavioral patterns: context drift, objective bloat, late context, no planning, and good structure. Each trait includes severity, evidence, and suggestions.
- **LLM-based session character classification** — Sessions are classified into one of 7 types (deep_focus, bug_hunt, feature_build, exploration, refactor, learning, quick_task) by the LLM during analysis, replacing the heuristic-only approach.
- **PR link extraction** — GitHub PR links referenced in session messages are automatically detected and displayed as clickable badges on the session detail page.
- **Few-shot examples in analysis prompt** — Two curated examples (a decision and a learning) set the quality bar for LLM output.
- **Chain-of-thought pre-analysis** — Prompt quality analysis now uses a 6-step mental walkthrough before scoring.

### Changed

- **Analysis version bumped to 3.0.0** — New decomposed schemas are not backward-compatible with v2 insight format. Re-analyze sessions to generate v3 insights.
- **Tool result cap raised from 200 to 500 chars** — Better context for error messages in analysis input.
- **Source tool badge shown for all sessions** — Previously hidden for claude-code sessions.

### Fixed

- **Dashboard compact layout** — Higher information density across dashboard pages.
- **7-day range filter** — Default range filter applied to dashboard and analytics.
- **LLM JSON truncation** — 3-layer fix: max_tokens 8192, jsonrepair fallback, conciseness constraints.
- **PostHog exception tracking** — Stack trace frames included in error reports.

## [3.3.1] - 2026-03-02

### Added

- **Error telemetry with PostHog `captureException`** — All CLI commands (sync, dashboard, init, status, reset, install-hook) and server analysis routes now capture exceptions with classified error types and enriched context via `captureError()`.
- **Structured parse errors** — Server analysis routes use `ParseResult<T>` type for structured LLM response parsing with error classification (`error_type`, `response_length`).
- **CLI ASCII art banner** — Branded ASCII banner displayed on `code-insights init` welcome message and `code-insights dashboard` launch.
- **Logo integration** — Monochrome logo component added to dashboard header and mobile nav. Favicon replaced with branded logo. Logo assets added to READMEs.
- **CI gate** — GitHub Actions workflow for automated build + test on push/PR to master.
- **Test coverage expansion** — New tests for `config.ts` utilities and `config.test.ts` server route. Existing `read-write.test.ts` and `prompts.test.ts` tests enhanced.

### Fixed

- **Server chunked analysis** — Guard against all chunks failing in chunked analysis path, preventing unhandled errors.

## [3.3.0] - 2026-03-02

### Changed

- **Telemetry migrated from Supabase to PostHog** — Replaces the custom Supabase Edge Function with PostHog for product analytics. Provides retention charts, feature funnels, and a real analytics dashboard instead of raw event storage.
- **Stable machine identity** — Machine IDs no longer rotate monthly, enabling accurate unique user counts and retention analysis. IDs remain anonymous (SHA-256 hash, no PII).
- **Expanded event schema** — All CLI commands now include `duration_ms` for performance tracking. Sync events include exact session counts and per-provider breakdowns. Analysis events capture LLM provider and model.
- **Dashboard telemetry** — Page views and load timing tracked via `posthog-js` (client-side). Configured with `autocapture: false`, `persistence: 'memory'`, `ip: false` for privacy.
- **`trackEvent` signature change** — Now accepts `(event: TelemetryEventName, properties?)` instead of `(command, success, subcommand?)`. Typed event names for autocomplete and typo prevention.

### Added

- **`GET /api/telemetry/identity`** — New server endpoint returns shared `distinct_id` for dashboard SPA initialization.
- **`shutdownTelemetry()`** — Graceful PostHog flush on server shutdown with 3-second timeout guard.
- **`posthog-node`** dependency in CLI (~20KB, lazy-initialized)
- **`posthog-js`** dependency in dashboard (~45KB, memory-only persistence)
- **Analysis failure tracking** — `analysis_run` events now fire on both success and failure for observability.

### Removed

- Supabase Edge Function endpoint, HMAC signing key, and `signPayload()`
- Monthly-rotating machine ID (`getMachineId()` with date salt)
- `getSessionCountBucket()` — replaced by exact `total_sessions` person property
- `getDataSource()` — always 'local', provided no value

### Fixed

- **`RecurringInsightResult.groups`** — Fixed type error using `.insights` instead of `.groups` for recurring insight count.

## [3.1.1] - 2026-03-02

### Fixed

- **Sync now updates existing sessions** — Previously, modified session files (e.g., active sessions gaining new messages) were skipped during sync because the session ID already existed in SQLite. Message counts, token usage, costs, and end times would remain stale after the initial sync. The sync now upserts session data and recalculates usage stats when existing sessions are updated.
- **Cursor virtual-path sessions re-sync on DB change** — When the backing `state.vscdb` file was modified (new messages in an existing composer), virtual-path sessions were incorrectly skipped. Now re-syncs all sessions from a multi-session DB when the file changes.
- **Improved sync summary** — Reports "new" vs "updated" session counts instead of a single "synced" number.

## [3.0.3] - 2026-02-28

### Fixed

- **`--version` now reads from package.json** — Previously hardcoded as `3.0.0`, causing `code-insights --version` to always report `3.0.0` regardless of installed version.

## [3.0.2] - 2026-02-28

### Fixed

- **Added missing server runtime dependencies** — `hono` and `@hono/node-server` added to CLI package.json so `code-insights dashboard` works for npm-installed users.

## [3.0.0] - 2026-02-28

See [MIGRATION.md](../MIGRATION.md) for the full upgrade guide from v2.

### Breaking Changes

- **Firebase removed** — No Firestore sync, no Firebase credentials, no service account required. All data is stored locally in SQLite at `~/.code-insights/data.db`.
- **`connect` command removed** — Generated Firebase connection URLs. No longer needed.
- **`init` config format changed** — v2 config had Firebase credentials fields. v3 config has only sync settings and optional LLM config. Re-run `code-insights init` after upgrading.
- **Data source changed to SQLite** — v2 wrote to Firestore. v3 writes to local SQLite. Existing Firestore data is not migrated. Re-sync with `code-insights sync --force`.
- **Hosted dashboard removed** — The dashboard at code-insights.app is no longer maintained.

### Added

- **`dashboard` command** — Starts a local Hono server and opens the built-in React SPA at `localhost:7890`. Replaces the hosted dashboard.
- **Embedded Vite + React SPA** — Full browser dashboard for session browsing, analytics, and insights. No external URL required.
- **Server-side LLM analysis** — API keys are stored and used server-side. No key exposure to the browser.
- **Multi-tool support** — Session providers for Cursor, Codex CLI, and Copilot CLI (in addition to Claude Code).
- **`config llm` command** — Interactive and non-interactive LLM provider configuration (Anthropic, OpenAI, Gemini, Ollama).
- **`--source <tool>` flag on `sync`** — Sync only from a specific tool.
- **`--verbose` flag on `sync`** — Show diagnostic warnings from providers.
- **`--regenerate-titles` flag on `sync`** — Regenerate session titles from content.
- **`--no-sync` flag on `stats`** — Skip auto-sync before displaying analytics.

### Changed

- **`init`** — No longer requires Firebase credentials. Sets up local SQLite database and config only.
- **`open`** — Now opens `localhost:7890` (local dashboard server) instead of code-insights.app.
- **`reset`** — Clears local SQLite database and sync state instead of Firestore data.
- **`sync`** — Writes to local SQLite instead of Firestore.
- **`status`** — Reports SQLite session counts and local sync state.

## [2.1.0] - 2026-02-27

### Added
- **CopilotProvider** — VS Code Copilot Chat session support (`sourceTool: 'copilot'`)
- **`status` command multi-tool summary** — displays session counts broken down by source tool (Claude Code, Cursor, Codex CLI, Copilot)
- **`reset` now clears `stats` collection** — ensures the `stats/usage` document is wiped on full reset

## [2.0.0] - 2026-02-26

### Added
- **Terminal analytics suite** — `stats`, `stats cost`, `stats projects`, `stats today`, `stats models` commands
- **Multi-tool support** — Cursor, Codex CLI, and Copilot CLI session providers
- **Zero-config mode** — Local-first stats without Firebase setup
- **`open` command** — Launch web dashboard from terminal
- **Anonymous telemetry** — Opt-out usage analytics (`telemetry` command)
- **Contextual tips** — Post-command suggestions and one-time welcome message
- **Fuzzy project matching** — `--project` flag uses Levenshtein distance matching

### Fixed
- Improved error messages for unconfigured commands
- Cross-platform path handling (experimental Windows support)

### Changed
- `init` defaults to local data source (Firebase optional)
- `firebase` config field is now optional for backward compatibility

## [1.0.2] - 2026-02-20

Initial public release with Claude Code session parsing, Firestore sync, and web dashboard integration.
