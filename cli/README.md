# Code Insights CLI

Analyze AI coding sessions from the terminal. Parses session history from Claude Code, Cursor, Codex CLI, and Copilot CLI — stores everything in a local SQLite database — and serves a built-in browser dashboard.

**Local-first. No accounts. No cloud. No data leaves your machine.**

## Install

```bash
npm install -g @code-insights/cli
```

Verify:

```bash
code-insights --version
```

## Quick Start

```bash
# 1. Initialize (creates ~/.code-insights/ config and database)
code-insights init

# 2. Sync sessions from all detected AI tools
code-insights sync

# 3. Open the built-in dashboard
code-insights dashboard
```

The dashboard opens at `http://localhost:7890` and shows your sessions, analytics, and LLM-powered insights.

## Supported Tools

| Tool | Data Location |
|------|---------------|
| **Claude Code** | `~/.claude/projects/**/*.jsonl` |
| **Cursor** | Workspace storage SQLite (macOS, Linux, Windows) |
| **Codex CLI** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| **Copilot CLI** | `~/.copilot/session-state/{id}/events.jsonl` |

Sessions from all tools are discovered automatically during sync.

## Dashboard

```bash
code-insights dashboard
```

Opens the built-in React dashboard at `http://localhost:7890`. The dashboard provides:

- **Session Browser** — search, filter, and view full session details
- **Analytics** — usage patterns, cost trends, activity charts
- **LLM Insights** — AI-generated summaries, decisions, learnings, and techniques
- **Settings** — configure your LLM provider for analysis

> **Screenshot:** _Coming soon_

### Custom Port

```bash
code-insights dashboard --port 8080
```

## CLI Commands

### Setup & Configuration

```bash
# Interactive setup — prompts for Claude dir, excluded projects, etc.
code-insights init

# Show current configuration
code-insights config

# Configure LLM provider for session analysis (interactive)
code-insights config llm

# Configure LLM provider with flags (non-interactive)
code-insights config llm --provider anthropic --model claude-sonnet-4-20250514 --api-key sk-ant-...

# Show current LLM configuration
code-insights config llm --show

# Set a config value (e.g., disable telemetry)
code-insights config set telemetry false
```

### Sync

```bash
# Sync new and modified sessions (incremental)
code-insights sync

# Force re-sync all sessions
code-insights sync --force

# Preview what would be synced (no changes made)
code-insights sync --dry-run

# Sync only from a specific tool
code-insights sync --source cursor
code-insights sync --source claude-code
code-insights sync --source codex-cli
code-insights sync --source copilot-cli

# Sync only sessions from a specific project
code-insights sync --project "my-project"

# Quiet mode (useful for hooks)
code-insights sync -q

# Show diagnostic warnings from providers
code-insights sync --verbose

# Regenerate titles for all sessions
code-insights sync --regenerate-titles
```

### Terminal Analytics

```bash
# Overview: sessions, cost, activity (last 7 days)
code-insights stats

# Cost breakdown by project and model
code-insights stats cost

# Per-project detail cards
code-insights stats projects

# Today's sessions with time, cost, and model details
code-insights stats today

# Model usage distribution and cost chart
code-insights stats models
```

**Shared flags for all `stats` subcommands:**

| Flag | Description |
|------|-------------|
| `--period 7d\|30d\|90d\|all` | Time range (default: `7d`) |
| `--project <name>` | Scope to a specific project (fuzzy matching) |
| `--source <tool>` | Filter by source tool |
| `--no-sync` | Skip auto-sync before displaying stats |

### Status & Maintenance

```bash
# Show sync statistics (sessions, projects, last sync)
code-insights status

# Open the local dashboard in your browser (server must already be running)
code-insights open

# Delete all local data and reset sync state
code-insights reset --confirm
```

### Auto-Sync Hook

```bash
# Install a Claude Code hook — auto-syncs when sessions end
code-insights install-hook

# Remove the hook
code-insights uninstall-hook
```

### Telemetry

Anonymous usage telemetry is opt-out. No PII is collected.

```bash
code-insights telemetry status   # Check current status
code-insights telemetry disable  # Disable telemetry
code-insights telemetry enable   # Re-enable telemetry
```

Alternatively, set the environment variable:

```bash
CODE_INSIGHTS_TELEMETRY_DISABLED=1 code-insights sync
```

## LLM Configuration

Session analysis (summaries, decisions, learnings) requires an LLM provider. Configure it via CLI or the dashboard Settings page.

```bash
code-insights config llm
```

**Supported providers:**

| Provider | Models | Requires API Key |
|----------|--------|-----------------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, etc. | Yes |
| OpenAI | gpt-4o, gpt-4o-mini, etc. | Yes |
| Google Gemini | gemini-2.0-flash, gemini-2.0-pro, etc. | Yes |
| Ollama | llama3.2, qwen2.5-coder, etc. | No (local) |

API keys are stored in `~/.code-insights/config.json` (mode 0o600, readable only by you).

## Development

This is a pnpm workspace monorepo with three packages: `cli`, `dashboard`, and `server`.

```bash
# Clone
git clone https://github.com/melagiri/code-insights.git
cd code-insights

# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Link CLI for local testing
cd cli && npm link
code-insights --version

# Watch mode (CLI only)
cd cli && pnpm dev
```

### Workspace Structure

```
code-insights/
├── cli/        # This package — Node.js CLI, SQLite, providers
├── dashboard/  # Vite + React SPA
└── server/     # Hono API server (serves dashboard + REST API)
```

### Contributing

See [CONTRIBUTING.md](https://github.com/melagiri/code-insights/blob/master/CONTRIBUTING.md) for code style, PR guidelines, and how to add a new source tool provider.

## Privacy

- All session data is stored in `~/.code-insights/data.db` (SQLite) on your machine
- No cloud accounts required
- No data is transmitted anywhere (unless you explicitly use an LLM provider with a remote API key)
- Anonymous telemetry collects only aggregate usage counts — no session content, no file paths

## License

MIT — see [LICENSE](https://github.com/melagiri/code-insights/blob/master/LICENSE) for details.
