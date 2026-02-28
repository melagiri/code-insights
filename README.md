# Code Insights

A free, open-source, local-first tool for analyzing AI coding sessions.

Parses session history from Claude Code, Cursor, Codex CLI, and Copilot CLI. Stores structured data in a local SQLite database. Surfaces insights through terminal analytics and a built-in browser dashboard.

**No accounts. No cloud. No data leaves your machine.**

## Quick Start

```bash
npm install -g @code-insights/cli

code-insights init      # Set up config and local database
code-insights sync      # Parse sessions from all detected AI tools
code-insights dashboard # Open the built-in dashboard at localhost:7890
```

## What It Does

- **Multi-tool support** — parses sessions from Claude Code, Cursor, Codex CLI, and Copilot CLI
- **Terminal analytics** — `code-insights stats` shows cost, usage, and activity breakdowns
- **Built-in dashboard** — browser UI for session browsing, analytics charts, and LLM-powered insights
- **Auto-sync hook** — `install-hook` keeps your database up to date automatically
- **LLM analysis** — generates summaries, decisions, learnings, and techniques from session content (via your own API key or local Ollama)

## Supported AI Tools

| Tool | Data Location |
|------|---------------|
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Cursor | Workspace storage SQLite (macOS, Linux, Windows) |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Copilot CLI | `~/.copilot/session-state/{id}/events.jsonl` |

## CLI Reference

```bash
code-insights init                     # Interactive setup
code-insights sync                     # Sync sessions to local database
code-insights sync --force             # Re-sync all sessions
code-insights sync --source cursor     # Sync only from a specific tool
code-insights sync --dry-run           # Preview without making changes
code-insights status                   # Show sync statistics
code-insights dashboard                # Start dashboard server and open browser
code-insights dashboard --port 8080    # Custom port (default: 7890)
code-insights stats                    # Terminal overview (last 7 days)
code-insights stats cost               # Cost breakdown by project and model
code-insights stats projects           # Per-project detail cards
code-insights stats today              # Today's sessions
code-insights stats models             # Model usage distribution
code-insights config                   # Show configuration
code-insights config llm               # Configure LLM provider (interactive)
code-insights install-hook             # Auto-sync when Claude Code sessions end
code-insights reset --confirm          # Delete all local data
```

## Architecture

```
Session files (Claude Code, Cursor, Codex CLI, Copilot CLI)
                          │
                          ▼
               ┌──────────────────┐
               │   CLI Providers  │  discover + parse sessions
               └──────────────────┘
                          │
                          ▼
               ┌──────────────────┐
               │  SQLite Database │  ~/.code-insights/data.db
               └──────────────────┘
                    │          │
          ┌─────────┘          └──────────┐
          ▼                               ▼
  ┌───────────────┐            ┌──────────────────┐
  │  stats commands│            │  Hono API server │
  │  (terminal)    │            │  + React SPA     │
  └───────────────┘            │  localhost:7890   │
                               └──────────────────┘
```

The monorepo contains three packages:
- **`cli/`** — Node.js CLI, session providers, SQLite writes, terminal analytics
- **`server/`** — Hono API server, REST endpoints, LLM proxy (API keys stay server-side)
- **`dashboard/`** — Vite + React SPA, served by the Hono server

## Development

```bash
git clone https://github.com/melagiri/code-insights.git
cd code-insights
pnpm install
pnpm build
cd cli && npm link
code-insights --version
```

See [`cli/README.md`](cli/README.md) for the full CLI reference, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution guidelines.

## Privacy

Session data stays on your machine in `~/.code-insights/data.db`. No accounts, no cloud sync, no telemetry beyond anonymous usage counts. LLM analysis uses your own API key (or Ollama locally) — session content goes only to the provider you configure.

## License

MIT — see [LICENSE](LICENSE) for details.
