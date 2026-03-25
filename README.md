<p align="center">
  <img src="docs/assets/logo.svg" width="120" height="120" alt="Code Insights logo" />
</p>

<h1 align="center">Code Insights</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@code-insights/cli"><img src="https://img.shields.io/npm/v/@code-insights/cli" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@code-insights/cli"><img src="https://img.shields.io/npm/dm/@code-insights/cli" alt="npm downloads" /></a>
  <a href="https://github.com/melagiri/code-insights/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/@code-insights/cli" alt="license" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@code-insights/cli" alt="node version" /></a>
  <a href="https://socket.dev/npm/package/@code-insights/cli"><img src="https://badge.socket.dev/npm/package/@code-insights/cli" alt="Socket Badge" /></a>
</p>

<p align="center">
  <strong>Turn your AI coding sessions into knowledge.</strong><br/>
  Extract decisions, learnings, and prompt quality scores. Detect patterns. Get better at working with AI.
</p>

```bash
npx @code-insights/cli
```

<p align="center">
  <img src="docs/assets/screenshots/patterns-light.png" alt="Patterns — friction points, effective patterns, prompt quality, working style" width="800" />
</p>

Analyzes your sessions from **Claude Code, Cursor, Codex CLI, Copilot CLI, and VS Code Copilot Chat** to extract structured insights — decisions with trade-offs, learnings with root causes, prompt quality with actionable feedback, and cross-session patterns that surface what's working and what's not. All stored locally in SQLite, browsable through terminal analytics and a built-in dashboard.

**No accounts. No cloud. No data leaves your machine.**

---

> **Works with Ollama — free, local, zero API keys.**
> If you have [Ollama](https://ollama.com) installed, `code-insights` will detect it automatically and use it for AI analysis. No account, no cost, no data leaves your machine.
>
> ```bash
> ollama pull llama3.3   # recommended
> code-insights sync     # Ollama detected automatically
> ```

---

## What You Get

### Decisions, Learnings & Prompt Quality

Each session is analyzed to extract structured insights — decisions with trade-offs and alternatives, learnings with root causes, and prompt quality scores across 5 dimensions with actionable before/after takeaways.

<p align="center">
  <img src="docs/assets/screenshots/session-insight-light.png" alt="Session detail — insights, prompt quality, summary, decisions" width="800" />
</p>

### Cross-Session Patterns

Weekly synthesis detects friction points, effective patterns, and prompt quality trends across all your sessions. Navigate week-by-week to see how your habits evolve — and export generated rules for your CLAUDE.md or .cursorrules.

<p align="center">
  <img src="docs/assets/screenshots/patterns-rules-light.png" alt="Patterns — friction points, effective patterns, generated rules" width="800" />
</p>

### AI Fluency Score

All of the above rolls up into your AI Fluency Score — a shareable snapshot of your coding fingerprint, working style, and top patterns.

<p align="center">
  <img src="docs/assets/screenshots/code-insights-ai-fluency-score.png" alt="AI Fluency Score — your coding fingerprint" width="600" />
</p>

### Analytics & Cost Tracking

Activity charts, cost breakdown by project and model, session types, and multi-tool usage — all in one dashboard.

<p align="center">
  <img src="docs/assets/screenshots/analytics-light.png" alt="Analytics — activity charts, model usage, cost breakdown, project table" width="800" />
</p>

### Terminal Analytics

Don't need a browser? `code-insights stats` gives you the full picture from the terminal.

<p align="center">
  <img src="docs/assets/screenshots/stats.png" alt="Terminal stats — sessions, cost, activity chart, top projects" width="500" />
</p>

---

## Supported AI Tools

| Tool | Data Location |
|------|---------------|
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Cursor | Workspace storage SQLite (macOS, Linux, Windows) |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Copilot CLI | `~/.copilot/session-state/{id}/events.jsonl` |
| VS Code Copilot Chat | Platform-specific Copilot Chat storage |

Sessions from all tools are discovered automatically during sync.

---

## Quick Start

```bash
# Try instantly (no install needed)
npx @code-insights/cli

# Or install globally
npm install -g @code-insights/cli
code-insights                          # sync sessions + open dashboard
```

### Common Commands

```bash
code-insights                          # sync + open dashboard (zero-config)
code-insights stats                    # terminal analytics (last 7 days)
code-insights stats today              # today's sessions
code-insights stats cost               # cost breakdown by project and model
code-insights dashboard                # start dashboard server
code-insights sync                     # sync sessions only
code-insights sync --source cursor     # sync from a specific tool
code-insights reflect                  # cross-session pattern synthesis
code-insights reflect --week 2026-W11  # reflect on a specific week
code-insights config llm               # configure LLM provider
code-insights install-hook             # auto-sync when sessions end
```

See [`cli/README.md`](cli/README.md) for the full CLI reference.

---

## Architecture

```
Session files (Claude Code, Cursor, Codex CLI, Copilot CLI, VS Code Copilot Chat)
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
  │  stats/reflect │            │  Hono API server │
  │  (terminal)    │            │  + React SPA     │
  └───────────────┘            │  localhost:7890   │
                               └──────────────────┘
                                        │
                                        ▼
                               ┌──────────────────┐
                               │  LLM Providers   │  analysis, facets,
                               │  (your API key)  │  reflect, export
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

Session data stays on your machine in `~/.code-insights/data.db`. No accounts, no cloud sync. Anonymous usage telemetry is opt-out (`code-insights telemetry disable`). LLM analysis uses your own API key (or Ollama locally) — session content goes only to the provider you configure.

## License

MIT — see [LICENSE](LICENSE) for details.
