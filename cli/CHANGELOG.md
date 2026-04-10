# Changelog

All notable changes to `@code-insights/cli` will be documented in this file.

## [4.9.7] - 2026-04-10

### Fixed

- **Cursor raw JSON in messages (complete fix)** — The v4.9.6 fix correctly parsed Lexical JSON for new sessions, but existing sessions already stored in the database kept their raw JSON content because `INSERT OR IGNORE` never overwrites existing rows. `--force` sync now uses `INSERT OR REPLACE` for messages, so re-parsing overwrites stale content. Running `code-insights sync --force` will fix all affected sessions.

## [4.9.6] - 2026-04-10

### Fixed

- **Cursor raw JSON in messages** — User messages in Cursor sessions were displaying raw Lexical editor JSON (`{"root":{"children":[...`) instead of the actual message text. Newer Cursor versions store the Lexical editor state in the `text` bubble field rather than `richText`. The parser now detects and unwraps Lexical JSON from either field.

## [4.9.5] - 2026-04-10

### Fixed

- **Cursor timestamps** — All Cursor sessions previously showed epoch timestamps because `bubble.createdAt` does not exist in Cursor's storage format. Timestamps are now extracted from `timingInfo.clientRpcSendTime` on assistant bubbles (the actual Unix-ms wall clock). Sessions missing timing data fall back to `composerData.createdAt/lastUpdatedAt`, then epoch.

- **Cursor cost tracking** — Cursor sessions were showing $0 in the cost dashboard. Session cost is now populated from `composerData.usageData.default.costInCents`.

- **Cursor token counts** — Token usage is now aggregated from `tokenCount.inputTokens` / `tokenCount.outputTokens` across all assistant bubbles per session. Previously always `null`.

- **Cursor git branch** — `gitBranch` is now extracted from the `gitStatusRaw` field present on user bubbles (`/^On branch (.+)/m`). Previously hardcoded `null`.

- **`messageCount` consistency** — All non-Claude-Code providers (Cursor, Codex, Copilot CLI, VS Code Copilot Chat) now compute `messageCount` as `userMessageCount + assistantMessageCount`, consistent with the Claude Code provider. System messages are excluded from the semantic count.

## [4.9.4] - 2026-04-05

### Improved

- **Cleaner sync output** — Removed redundant discovery messages ("[claude-code] Discovered 598 JSONL files" and "total session files discovered"). The spinner is sufficient feedback during discovery.

- **Session counts in "up to date" status** — Providers with nothing to sync now show `✔ Up to date (170 sessions)` instead of just the provider name.

- **Condensed telemetry notice** — Replaced the 7-line telemetry disclosure banner with a single dim line: `Telemetry enabled · Disable: code-insights telemetry disable`.

- **Suppressed internal housekeeping messages** — The "Usage stats reconciled" message no longer appears after sync.

## [4.9.3] - 2026-04-05

### Fixed

- **Empty files re-parsed on every sync** — When `provider.parse()` returned `null` (empty or unsupported files), the file was not tracked in sync state. This caused those files to be re-discovered, re-stat'd, and re-parsed on every `code-insights sync` run. Now tracked with an `'__empty__'` sentinel in sync state, eliminating ~117 wasted file operations per sync for typical setups.

- **Telemetry banner shown on `--version`** — Running `code-insights --version` displayed the verbose telemetry disclosure notice. Now skipped for `--version`, `-V`, `--help`, and `-h` flags.

### Improved

- **Cleaner sync output** — Replaced verbose per-provider file counts ("Found 379 files / 69 need syncing / 310 already synced / 69 empty") with concise status lines: "up to date" or "Synced 1 new, 1 updated (583 messages)".

## [4.9.2] - 2026-04-05

### Fixed

- **llama.cpp token budget overflow** — Session analysis against local `llama-server` failed with `exceed_context_size_error` (HTTP 400) because the token budget didn't account for ~3K tokens of prompt overhead and 4K tokens reserved for output. Reduced the effective conversation budget from 24K to 12K tokens and changed the token estimation heuristic from `chars/4` to `chars/3` (more conservative for code-heavy content). Sessions that still exceed the context window now get a clear error message with the exact token counts and a suggested `-c` flag value.

- **`<json>` tag wrapping in llama.cpp responses** — Small local models (e.g., Gemma 4) sometimes wrap valid JSON in `<json>...</json>` tags despite `response_format: json_object` being set. This caused the JSON validation retry to fail on both attempts, wasting inference time. Added provider-level tag stripping before JSON validation.

### Improved

- **llama.cpp inference timeout** — Increased default timeout from 2 minutes to 10 minutes. Local CPU inference at ~6-10 tok/s can take 3-5 minutes for a full session analysis; the old timeout was too aggressive.

- **llama.cpp output budget** — Reduced `max_tokens` from 8192 to 4096 to halve inference time on CPU and better fit within typical context windows.

## [4.9.1] - 2026-04-04

### Fixed

- **llama.cpp dashboard test connection** — The "Test Connection" button on the Settings page returned a 422 error for llama.cpp providers. The test prompt requested plain text `"ok"`, but the llamacpp provider enforces JSON mode on all responses — small local models replied with literal `ok`, failing JSON validation. Changed test prompt to request JSON output, fixing compatibility with both llama.cpp and Gemini (which also uses JSON mode).

## [4.9.0] - 2026-04-03

### Added

- **llama.cpp provider** — New `llamacpp` LLM provider for running session analysis against a local `llama-server` instance. Uses the OpenAI-compatible `/v1/chat/completions` API. No API key required — fully local, fully free. Configure with `code-insights config llm --provider llamacpp`.

- **Gemma 4 model support** — Google's Gemma 4 models (12B, 27B) added as default options across three providers: llama.cpp (GGUF quantizations), Ollama (`gemma4`, `gemma4:27b`), and Gemini API (`gemma-3-27b-it`).

- **Model discovery for llama.cpp** — Dashboard Settings page includes a "Discover Loaded Model" button that queries the running `llama-server` at `/v1/models`. New `GET /api/config/llm/llamacpp-models` endpoint.

- **Provider-aware token limits** — `getMaxInputTokens(provider)` caps input at 24K tokens for llama.cpp (small quantized models have limited context windows). All other providers retain the 80K default. Applied across session analysis, facet extraction, and prompt quality analysis.

### Changed

- **LLMProvider type** — Extended from 4 to 5 members: `'openai' | 'anthropic' | 'gemini' | 'ollama' | 'llamacpp'`. All provider checks updated across CLI, server, and dashboard.

- **Temperature 0.3 for llama.cpp** — Lower temperature than the default 0.7, producing more consistent structured JSON output from quantized models.

### Improved

- **JSON reliability for local models** — llama.cpp provider uses grammar-constrained JSON output (`response_format: { type: "json_object" }`), single retry on parse failure with validation of retry result, and 120s default timeout to prevent hangs during model loading.

## [4.8.4] - 2026-04-02

### Fixed

- **Tmpdir analysis sessions excluded from sync** — `claude -p` analysis sessions created by `ClaudeNativeRunner` (running in `tmpdir()`) were being discovered as real user sessions during sync. The Claude Code provider now skips project directories matching tmpdir patterns (`var-folders`, `-tmp`). Existing polluted sessions soft-deleted.

## [4.8.3] - 2026-04-02

### Added

- **`--model` flag for native analysis** — All native analysis paths (`insights`, `insights check`, `session-end`, `queue process`) now accept `--model <name>` to select the Claude model. Defaults to `sonnet` — cost-effective for structured JSON extraction tasks. Supports any model alias (`sonnet`, `opus`, `haiku`) or full model ID.

- **Batch native analysis script** — New `batch-native-analysis.sh` at repo root for analyzing all unanalyzed sessions via `claude -p`. Features rate-limit detection (stops immediately on 429), resume-safe design, configurable delay between calls, and `--retry-failed` mode.

### Changed

- **`analysis_usage.model` now stores actual model name** — Previously hardcoded `'claude-native'` for all native analysis. Now stores the model alias used (e.g., `'sonnet'`, `'opus'`), enabling cost and quality analysis per model.

### Fixed

- **LLM-generated title preservation** — Sync no longer overwrites LLM-generated session titles with parser-derived titles. Sessions that already have a `generated_title` from analysis retain it across re-syncs.

## [4.8.2] - 2026-04-01

### Added

- **Analysis queue system** — New `analysis_queue` SQLite table (Schema V9) provides durable, retry-aware job queue for hook-triggered analysis. Supports pending/processing/completed/failed states with atomic claim (`RETURNING *`), 3-retry max, and stale item reset.

- **`session-end` command** — New hook entry point replaces the old `insights --hook` flow. Reads Claude Code's stdin JSON, syncs the session file, enqueues for analysis, and spawns a detached worker — all in under 1 second.

- **`queue` command suite** — `code-insights queue status` (view queue), `queue process` (run pending items), `queue retry` (reset failed items), `queue prune` (clean old completed items).

- **Dashboard analysis badges** — Sessions actively being analyzed via hook show "Analyzing..." indicators in both the session list and detail panel. Auto-refreshes insights when analysis completes.

### Changed

- **Single SessionEnd hook** — `install-hook` now installs one `SessionEnd` hook (was Stop + SessionEnd). The noisy `Stop` hook that fired on every Claude response is removed. Old Stop hooks are cleaned up on reinstall.

- **`--hook` flag removed from `insights`** — Replaced by the `session-end` command. Passing `--hook` now shows a clear error message directing users to `install-hook`.

### Fixed

- **`CODE_INSIGHTS_HOOK_ACTIVE` propagation** — The recursion guard env var is now set in `ClaudeNativeRunner.execFileSync` (was only set in the detached spawn), preventing infinite hook loops regardless of how analysis is triggered.

- **LLM-generated title from CLI path** — `applyGeneratedTitle()` moved to shared `analysis-db.ts` so both CLI hook analysis and dashboard-triggered analysis update the session title from the summary insight.

## [4.8.1] - 2026-04-01

### Fixed

- **Hook analysis detached execution** — `claude -p` spawned synchronously within a `SessionEnd` hook was cancelled by Claude Code's hook manager (process-tree containment). Analysis now runs in a detached background process: the hook syncs the session (foreground), then spawns `insights <id> --native -q` in its own process group. Background output logged to `~/.code-insights/hook-analysis.log`.

- **Infinite hook loop prevention** — The detached `claude -p` process creates its own Claude Code session, which fires `SessionEnd` again, re-triggering the hook. Added `CODE_INSIGHTS_HOOK_ACTIVE` env guard to break the cycle.

- **`claude -p` session isolation** — Native runner now sets `cwd: tmpdir()` so `claude -p` writes its session JSONL to `~/.claude/projects/-tmp/` instead of the user's project directory. Prevents the next full sync from picking up analysis sessions as real user sessions.

- **Trivial session filter in `syncSingleFile`** — The hook-path sync was missing the ≤2 message data quality filter that the full sync has. Context restoration artifacts and `claude -p` artifacts could pollute the database.

- **`sync prune` query fix** — `getTrivialSessions()` referenced a non-existent `title` column. Now uses `COALESCE(custom_title, generated_title)`.

## [4.8.0] - 2026-03-31

### Added

- **Native session analysis** — New `code-insights insights` command analyzes sessions using `claude -p` (your Claude subscription) or any configured LLM provider. Supports `--native`, `--hook`, `--force`, `--quiet`, and `--source` flags. Two-pass analysis: session insights + prompt quality, with results saved to SQLite.

- **Zero-config SessionEnd hook** — `code-insights install-hook` now installs both a `Stop` (sync) hook and a `SessionEnd` (analysis) hook. When a Claude Code session ends, insights are generated automatically using your Claude subscription — no API key needed. Supports `--sync-only` and `--analysis-only` flags.

- **Backfill and recovery** — `code-insights insights check` finds unanalyzed sessions (last 7 days) with count-based behavior: auto-analyzes 1-2 silently, suggests `--analyze` for 3+, shows time estimate for 11+. `--days` flag overrides lookback window.

- **AnalysisRunner interface** — Pluggable abstraction layer with `ClaudeNativeRunner` (uses `claude -p`) and `ProviderRunner` (uses configured LLM). Adding a new runner means implementing one interface.

- **V8 schema migration** — `session_message_count` column on `analysis_usage` for resume detection. Sessions that are resumed after analysis get re-analyzed automatically.

- **Dashboard dual-path CTA** — `LlmNudgeBanner` now shows "Install the Claude Code hook" as primary CTA (zero-config), with API provider configuration as secondary. Analysis provenance badge shows "Analyzed via Claude Code" on session detail for native-analyzed sessions.

### Changed

- **Prompt modules migrated to CLI** — 9 analysis modules (prompt builders, parsers, normalizers) moved from `server/src/llm/` to `cli/src/analysis/`. Server files become thin re-exports. Eliminates circular dependency and enables CLI-only analysis.

- **DB helpers consolidated** — `analysis-db.ts` and `analysis-usage-db.ts` moved to CLI with server re-exports. Uses `COALESCE` pattern for shared upsert safety. Removed ~170 lines of inline duplicates.

### Fixed

- **Native runner auth** — Removed `--bare` flag from `claude -p` invocation, which was blocking OAuth/keychain subscription auth. Increased timeout from 120s to 300s for large sessions.

## [4.7.0] - 2026-03-25

### Added

- **Ollama auto-detection** — On `code-insights sync` or `code-insights dashboard`, if no LLM is configured, the CLI probes localhost:11434 for a running Ollama instance. If found, auto-configures the best available model (preferring llama3.3 → qwen3:14b → mistral → qwen2.5-coder) and persists to config. Zero manual setup required.

- **Dashboard LLM nudge banner** — Insights and Patterns pages now show a dismissible info banner when no LLM provider is configured, guiding users to set up Ollama (free & local) or any other provider. Dismissal persists via localStorage. Uses existing `useLlmConfig()` hook — no extra network requests.

- **README Ollama callout** — Prominent "Free & Local" section near the top of the README highlighting zero-config Ollama support.

### Changed

- **Unified Ollama model list** — CLI and dashboard now recommend the same modern models: llama3.3, qwen3:14b, mistral, qwen2.5-coder. Previously the CLI suggested older models (llama3.2, codellama).

- **Improved auto-detect confirmation message** — Changed from "using" to "configured" with a next-step hint pointing users to the dashboard Analyze button.

## [4.6.1] - 2026-03-22

### Added

- **User profile for share cards** — New localStorage-based profile (name + GitHub username) that personalizes the AI Fluency Score card footer with a circular avatar and name. Profile section on Settings page with live avatar preview. Profile prompt dialog shown before download if profile is incomplete.

### Fixed

- **Avatar CORS on share card** — GitHub's avatar redirect (`github.com/{user}.png` → `avatars.githubusercontent.com`) strips CORS headers, breaking Canvas export. Avatars are now fetched from `avatars.githubusercontent.com` directly and cached as base64 data URLs in localStorage — works offline, no CORS issues.

## [4.6.0] - 2026-03-22

### Changed

- **README positioning rewrite** — Restructured both READMEs to lead with core value (decisions, learnings, prompt quality) rather than metrics. Feature showcase with 5 screenshot sections, trimmed CLI reference with pointer to cli/README.md. Primary CTA changed from `npm install -g` to `npx @code-insights/cli`.

### Added

- **Dashboard screenshots** — Patterns page (light/dark), Patterns rules tab (light/dark), and AI Fluency Score card added to docs/assets.

## [4.5.0] - 2026-03-21

### Added

- **Parallel LLM analysis** — Multiple sessions can now be analyzed concurrently. Replaced the single-state analysis guard with a per-session Map, enabling simultaneous session and prompt quality analysis without blocking. Each analysis owns its own AbortController and toast notification.

### Fixed

- **Search ESCAPE clause** — Fixed `ESCAPE '\'` in template literal SQL queries producing an empty string (JS escape sequence consumed the backslash), causing 500 errors on every search query. Now correctly produces `ESCAPE '\\'`.

### Improved

- **Dynamic code review specialists** — Replaced static outsider + wild card reviewers with 1–2 domain specialists (SQL/Database, React/Frontend, etc.) selected based on PR content. Includes a Runtime Verification Rule requiring reviewers to execute queries/assertions before approving.

## [4.4.0] - 2026-03-21

### Added

- **Global search & command palette** — `Cmd+K` opens a full-text search across sessions, insights, and patterns. Results show highlighted matches with context and link directly to the relevant page. New `/api/search` endpoint with `q`, date range, and outcome filter params.
- **Advanced session filtering** — Sessions page gains date range picker, outcome filter (success/mixed/failure), and saved filter presets that persist in localStorage.
- **Insight type multi-select pills** — Replaced the single-select dropdown on Insights page with multi-select pill chips for filtering by insight type, with saved filter support.
- **React ErrorBoundary** — Dashboard-wide error boundary prevents white-screen crashes, showing a recovery UI instead.

### Fixed

- **Tooling-limitation friction classification** — Improved LLM prompt accuracy for distinguishing `tooling-limitation` from other friction categories across all providers.
- **SQLite BUSY/LOCKED handling** — `write.ts` now handles `SQLITE_BUSY` and `SQLITE_CONSTRAINT` errors gracefully instead of crashing.
- **Cursor provider JSON.parse guard** — Unguarded `JSON.parse()` calls in the Cursor provider no longer crash on malformed data.
- **TOCTOU race in Claude Code provider** — `fs.statSync()` guarded against `ENOENT` race conditions during file discovery.
- **Graceful LLM provider errors** — Provider initialization failures now show user-friendly messages instead of stack traces.
- **File discovery warning** — CLI warns when total discovered files across providers exceeds 500, helping users diagnose slow syncs.

### Improved

- **Type safety hardening** — API validation with `Array.isArray` guards, shared `safeParseJson` helper, union exhaustiveness checks, and metadata narrowing across server routes.
- **Standardized error responses** — `requireLLM()` helper returns consistent `{ error }` JSON shape across all LLM-dependent routes.
- **Removed deprecated code** — Deleted legacy prompt exports from `prompts.ts`, removed `[cot-monitor]` and `[pq-monitor]` console.warn calls.
- **Ollama provider resilience** — Improved error handling and response parsing for the Ollama LLM provider.

## [4.3.0] - 2026-03-19

### Added

- **AI Fluency Score card** — Complete redesign of the share card (1200×630 PNG) around a single hero metric: AI Fluency Score (0-100), computed as the grand average of 5 prompt quality dimensions. Features a visual fingerprint of 5 colored bars (context, clarity, focus, timing, orchestration) without numbers — the information gap drives people to run the tool. Includes effective pattern pills, tool logos with labels, and `npx @code-insights/cli` CTA.
- **PQ dimension scores API** — `computePQScores()` returns per-dimension averages (previously only the grand average). New `PQDimensionScores` type with `overall` + 5 individual dimension scores (each `number | null` for unmeasured dimensions).
- **Lifetime session count** — All-time session count query alongside the scoring window data, shown as "N total sessions" on the share card.
- **Token count in aggregation** — Sum of input + output tokens for sessions in the scoring window, displayed as abbreviated format (e.g., "794K tokens").
- **Tool logo rendering** — Official brand marks for Claude Code (SVG), Cursor, Codex CLI, and GitHub Copilot rendered as 18×18 circles on the Canvas share card. Copilot + Copilot CLI deduplicated to one icon.
- **Lucide icon Canvas renderer** — `share-card-icons.ts` renders Lucide icon SVG paths directly on Canvas 2D via Path2D.

### Changed

- **Canvas 2D rendering pipeline** — Share card now draws at 2× DPR (2400×1260 internal) and exports at 1200×630 for crisp text on all displays. Replaced the html-to-image library approach entirely.
- **Share card color palette** — Sky blue → indigo → violet → fuchsia → warm rose progression for fingerprint bars. Designed for distinguishability at thumbnail size.
- **Evidence lines** — "Score from N sessions · XK tokens · last 4 weeks" and "N total sessions · [tool logos with labels]" replace the old stat boxes.

### Removed

- **Stat boxes** — Sessions/streak/prompt clarity boxes replaced by hero score circle.
- **Character distribution bar** — Removed from share card.
- **#MyCodeStyle hashtag** — Replaced by `npx @code-insights/cli` command CTA.
- **html-to-image dependency** — Removed from dashboard package.json.

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
