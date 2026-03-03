# Code Insights

## What It Is

Turn your AI coding sessions into knowledge. Code Insights extracts patterns from your conversations—what you built, decisions you made, lessons learned—and presents them in a local visual dashboard.

## The Problem

AI coding tools store every conversation as files on your machine. Claude Code uses JSONL in `~/.claude/projects/`. Cursor stores state in SQLite. Codex CLI and Copilot CLI write their own session formats. This is valuable data:
- What features did you work on last week?
- Why did you choose that architecture?
- What mistakes did you make (and fix)?
- How much time went into different parts of the codebase?

But it's trapped in raw files. You can't search it, visualize it, or learn from it.

## The Solution

Code Insights provides:

1. **Automated extraction** — Parses session files from multiple AI coding tools and structures the data
2. **Smart session titles** — Auto-generates meaningful titles from session content
3. **Session classification** — Categorizes sessions (deep focus, bug hunt, feature build, etc.)
4. **LLM-powered analysis** — Multi-provider insight generation (OpenAI, Anthropic, Gemini, Ollama) with your own API key
5. **Visual dashboard** — Local web interface with charts, timelines, and filters at `http://localhost:7890`
6. **CLI analytics** — Terminal stats via `code-insights stats` and subcommands

## Who It's For

- **Developers using multiple AI coding tools** who want to understand their AI-assisted work patterns across Claude Code, Cursor, Codex CLI, and Copilot CLI
- **Learners** who want to review and reinforce what they've built with AI assistants
- **Privacy-conscious developers** who want insights without giving up their data to a cloud service

## Privacy Model

**Fully local. No cloud. No accounts.**

Code Insights stores all session data in a SQLite database at `~/.code-insights/data.db` on your own machine. There is no central server, no sign-up, and no data sent anywhere. The dashboard runs locally at `http://localhost:7890` — served by a Hono API process on your own machine.

LLM analysis uses your own API key, stored in `~/.code-insights/config.json` (mode 0o600). API calls go directly from the local server to your chosen LLM provider — not through any Code Insights infrastructure.

## Core Features

### Multi-Source Support

| Source Tool | What's Captured |
|-------------|-----------------|
| **Claude Code** | JSONL sessions from `~/.claude/projects/` |
| **Cursor** | Sessions from Cursor's local SQLite state |
| **Codex CLI** | Rollout files from `~/.codex/sessions/` |
| **Copilot CLI** | Event files from `~/.copilot/session-state/` |

### Insight Categories

| Category | What It Captures |
|----------|------------------|
| **Summary** | High-level narrative of what was accomplished |
| **Decision** | Architecture choices, trade-offs, reasoning, alternatives |
| **Learning** | Technical discoveries, mistakes, transferable knowledge |
| **Technique** | Problem-solving approaches and debugging strategies |

### Dashboard Views

- **Daily/Weekly digest** — Summary of recent sessions
- **Project timeline** — Visual history of work per project
- **Decision log** — Searchable archive of "why" decisions
- **Analytics** — Charts showing effort distribution, patterns
- **Session detail** — Full session with analyze button for LLM insights

### CLI Stats Commands

```bash
code-insights stats              # Overview (last 7 days)
code-insights stats cost         # Cost breakdown by project and model
code-insights stats projects     # Per-project detail cards
code-insights stats today        # Today's sessions with details
code-insights stats models       # Model usage distribution
```

## Tech Stack

- **CLI**: Node.js (ES2022, ES Modules), Commander.js
- **Database**: SQLite (`better-sqlite3`) at `~/.code-insights/data.db` — WAL mode, local
- **Server**: Hono — lightweight API server, serves dashboard SPA at `localhost:7890`
- **Dashboard**: Vite + React 19 SPA, Tailwind CSS 4 + shadcn/ui
- **AI**: Multi-provider — OpenAI, Anthropic, Gemini, Ollama (your own API keys, proxied server-side)
- **Package manager**: pnpm (workspace monorepo: `cli/`, `dashboard/`, `server/`)

## Success Metrics

- Time to first insight: < 5 minutes from install
- User can answer "what did I work on this week?" in one click
- Decisions are searchable and linkable
- Zero cloud dependencies after install
