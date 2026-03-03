<p align="center">
  <img src="docs/assets/logo.svg" width="120" height="120" alt="Code Insights logo" />
</p>

<h1 align="center">Code Insights</h1>

Turn your AI coding sessions into knowledge.

Parses session history from Claude Code, Cursor, Codex CLI, and Copilot CLI. Stores structured data in a local SQLite database. Surfaces insights through terminal analytics and a built-in browser dashboard.

**No accounts. No cloud. No data leaves your machine.**

<p align="center">
  <img src="docs/assets/screenshots/dashboard-light.png" alt="Dashboard — activity chart, session stats, recent insights" width="800" />
</p>

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
- **LLM analysis** — generates summaries, decisions (with context, reasoning, and trade-offs), learnings (with root cause and transferable takeaway), and prompt quality analysis with session traits (via your own API key or local Ollama)
- **Session character** — each session is classified into one of 7 types (deep_focus, bug_hunt, feature_build, exploration, refactor, learning, quick_task) using LLM analysis
- **PR link detection** — GitHub PR links referenced in sessions are automatically extracted and displayed

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

<p align="center">
  <img src="docs/assets/screenshots/stats.png" alt="Terminal stats — sessions, cost, activity chart, top projects" width="500" />
</p>

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
