<p align="center">
  <img src="https://raw.githubusercontent.com/melagiri/code-insights/master/docs/assets/logo.svg" width="80" height="80" alt="Code Insights logo" />
</p>

<h1 align="center">Code Insights CLI</h1>

Analyze AI coding sessions from the terminal. Parses session history from Claude Code, Cursor, Codex CLI, Copilot CLI, and VS Code Copilot Chat — stores everything in a local SQLite database — and serves a built-in browser dashboard with cross-session pattern detection.

**Local-first. No accounts. No cloud. No data leaves your machine.**

<p align="center">
  <img src="https://raw.githubusercontent.com/melagiri/code-insights/master/docs/assets/screenshots/dashboard-light.png" alt="Dashboard — activity chart, session stats, recent insights" width="800" />
</p>

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
# Try instantly (no install needed)
npx @code-insights/cli

# Or after installing globally:
code-insights                          # sync sessions + open dashboard
```

The dashboard opens at `http://localhost:7890` and shows your sessions, analytics, and LLM-powered insights.

### Individual commands

```bash
code-insights stats                    # terminal analytics (no dashboard needed)
code-insights stats today              # today's sessions

code-insights dashboard                # start dashboard server (auto-syncs first)
code-insights dashboard --no-sync      # start dashboard without syncing
code-insights sync                     # sync sessions only
code-insights init                     # customize settings (optional)
```

<p align="center">
  <img src="https://raw.githubusercontent.com/melagiri/code-insights/master/docs/assets/screenshots/session-insight-light.png" alt="Session detail — insights, learnings, decisions, and conversation" width="800" />
</p>

## Supported Tools

| Tool | Data Location |
|------|---------------|
| **Claude Code** | `~/.claude/projects/**/*.jsonl` |
| **Cursor** | Workspace storage SQLite (macOS, Linux, Windows) |
| **Codex CLI** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| **Copilot CLI** | `~/.copilot/session-state/{id}/events.jsonl` |
| **VS Code Copilot Chat** | Platform-specific Copilot Chat storage |

Sessions from all tools are discovered automatically during sync.

## Dashboard

```bash
code-insights dashboard
```

Opens the built-in React dashboard at `http://localhost:7890`. The dashboard provides:

- **Session Browser** — search, filter, soft-delete, and view full session details with chat view
- **Analytics** — usage patterns, cost trends, activity charts
- **LLM Insights** — AI-generated summaries, decisions, learnings, and prompt quality analysis (7 deficit + 3 strength categories with dimension scores)
- **Patterns** — weekly cross-session synthesis: friction points (with attribution), effective patterns (with driver classification), working style rules
- **Export** — LLM-powered cross-session synthesis in 4 formats (Agent Rules, Knowledge Brief, Obsidian, Notion)
- **Settings** — configure your LLM provider for analysis

<p align="center">
  <img src="https://raw.githubusercontent.com/melagiri/code-insights/master/docs/assets/screenshots/insights-light.png" alt="Insights page — browse decisions, learnings, and prompt quality across all sessions" width="800" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/melagiri/code-insights/master/docs/assets/screenshots/analytics-light.png" alt="Analytics — activity charts, model usage, cost breakdown, project table" width="800" />
</p>

### Options

```bash
code-insights dashboard --port 8080    # Custom port
code-insights dashboard --no-open      # Start server without opening browser
```

## CLI Commands

### Setup & Configuration

```bash
# Sync sessions and open dashboard — no setup required
code-insights

# Customize settings (optional) — prompts for Claude dir, excluded projects, etc.
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

# Soft-delete sessions (preview + confirm)
code-insights sync prune
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

# Cross-session patterns summary
code-insights stats patterns
```

<p align="center">
  <img src="https://raw.githubusercontent.com/melagiri/code-insights/master/docs/assets/screenshots/stats.png" alt="Terminal stats — sessions, cost, activity chart, top projects" width="500" />
</p>

**Shared flags for all `stats` subcommands:**

| Flag | Description |
|------|-------------|
| `--period 7d\|30d\|90d\|all` | Time range (default: `7d`) |
| `--project <name>` | Scope to a specific project (fuzzy matching) |
| `--source <tool>` | Filter by source tool |
| `--no-sync` | Skip auto-sync before displaying stats |

### Reflect & Patterns

Cross-session pattern detection and synthesis. Requires an LLM provider to be configured.

```bash
# Generate weekly cross-session synthesis (current week)
code-insights reflect

# Reflect on a specific ISO week
code-insights reflect --week 2026-W11

# Scope to a specific project
code-insights reflect --project "my-project"

# Backfill facets for sessions that were synced before Reflect existed
code-insights reflect backfill

# Backfill prompt quality analysis
code-insights reflect backfill --prompt-quality
```

The Reflect feature analyzes your sessions to surface:
- **Friction points** — recurring obstacles classified into 9 categories with attribution (user-actionable, AI capability, environmental)
- **Effective patterns** — working strategies across 8 categories with driver classification (user-driven, AI-driven, collaborative)
- **Prompt quality** — how well you communicate with AI tools (7 deficit + 3 strength categories)
- **Working style** — rules and skills derived from your sessions

### Status & Maintenance

```bash
# Show sync statistics (sessions, projects, last sync)
code-insights status

# Open the local dashboard in your browser
code-insights open
code-insights open --project           # Open filtered to the current project

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

Session analysis (summaries, decisions, learnings, facets) and Reflect synthesis require an LLM provider. Configure it via CLI or the dashboard Settings page.

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
