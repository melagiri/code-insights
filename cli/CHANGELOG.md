# Changelog

All notable changes to `@code-insights/cli` will be documented in this file.

## [2.1.0] - 2026-02-27

### Added
- **CopilotProvider** — VS Code Copilot Chat session support (`sourceTool: 'copilot-cli'`)
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
