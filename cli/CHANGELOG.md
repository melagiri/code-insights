# Changelog

All notable changes to `@code-insights/cli` will be documented in this file.

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
