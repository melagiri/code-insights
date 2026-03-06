# Code Insights Vision

## Philosophy

**Your data, your machine, your insights.**

Code Insights is a free, open-source tool that helps developers who use multiple AI coding tools analyze their sessions, collect insights, track decisions and learnings, and build knowledge over time. It's built on a simple principle: your session data never leaves your machine.

## Core Beliefs

### 1. Privacy by Architecture

There is no central Code Insights server. No accounts, no sign-ups, no cloud. All session data lives in a local SQLite database at `~/.code-insights/data.db`. The dashboard runs locally at `http://localhost:7890` — it never phones home.

### 2. Developers Can Handle It

Developers using AI coding tools are technical. They can:
- Run `code-insights init` and answer three questions
- Install a post-session hook with one command
- Open a local dashboard that just works

We don't need to hide complexity behind a managed service. Clear documentation beats magic.

### 3. Single-Repo, Local-First

Everything ships in one repository:
- **CLI** (open source, MIT) — the parser, sync engine, and stats commands
- **Dashboard** (embedded SPA) — served locally by a Hono server via `code-insights dashboard`
- **Server** (local API) — Hono API on `localhost:7890`, proxies LLM calls server-side

No hosted infrastructure. No Vercel. No Firebase. No Supabase. One install, zero cloud dependencies.

### 4. Tool, Not Platform

Code Insights is a utility, not a product. It should:
- Do one thing well (extract insights from AI coding sessions)
- Support multiple source tools (Claude Code, Cursor, Codex CLI, Copilot CLI)
- Be easy to install and configure
- Stay out of the way once set up

## Long-Term Direction

### Phase 1: Foundation ✅
- CLI tool that parses JSONL → SQLite
- Web dashboard with session views, character classification, smart titles
- Claude Code hook for automatic session sync

### Phase 2: Integration ✅
- Auto-sync via Claude Code post-session hook
- CLI stats command suite (`stats`, `stats cost`, `stats projects`, `stats today`, `stats models`)
- Terminal analytics powered by local SQLite

### Phase 3: Intelligence ✅
- Multi-provider LLM analysis (OpenAI, Anthropic, Gemini, Ollama)
- On-demand and bulk session analysis
- Cross-session insight types (summary, decision, learning, technique)

### Phase 4: Feature Parity ✅
- Vite + React SPA replacing the hosted web dashboard
- Hono server embedding the SPA — served via `code-insights dashboard`
- Multi-source support: Claude Code, Cursor, Codex CLI, Copilot CLI
- Full feature parity between CLI stats and dashboard views

### Phase 5: Telemetry ✅
- Anonymous aggregate usage signals via PostHog (opt-in, disabled by default)
- Events: dashboard started, analysis run, export run

### Phase 6: Polish & Distribution ✅
- Published as `@code-insights/cli` on npm (v3.0.0 – v3.3.0)
- Landing page and docs at `code-insights.app`
- README, CONTRIBUTING.md, MIGRATION.md, CHANGELOG.md

### Phase 7: Export & Knowledge Pipeline ✅
- Session-level export with Knowledge Base and Agent Rules templates (v3.5.1) ✅
- Prompt quality analysis insight type (efficiency scores, anti-patterns, wasted turns) ✅
- LLM-powered Export Page: cross-session synthesis into agent rules, Obsidian, Notion formats (v3.6.0) ✅
- Export Page uses the multi-provider LLM abstraction (same as session analysis) ✅

### Phase 8: Reflect & Patterns ✅
- Session facets: per-session structured metadata (friction, patterns, workflow, outcome) extracted during analysis
- Dedicated `session_facets` SQLite table (Schema V3) with indexed scalar columns
- Friction category normalization via Levenshtein distance matching
- `code-insights reflect` CLI command for cross-session LLM synthesis
- `code-insights stats patterns` for terminal pattern viewing
- Dashboard Patterns page with three sections: Friction & Wins, Rules & Skills, Working Style
- Facet backfill endpoint for previously-analyzed sessions

### What's Next
- Test suite expansion (Vitest)
- Slash commands for quick insights from the terminal
- LLM cost tracking per call (app-wide)
- Feedback mechanism for friction category learning
- Session merging across tools (linking related sessions from different AI tools)

## Non-Goals

- **Not a business** — No monetization, no paywall, no premium tier
- **Not a central platform** — No central database for user session data
- **Not a dependency** — Users can stop using it anytime, data remains theirs
- **Not a team tool** — This is a personal learning tool; no org/team features

## Success Looks Like

A developer installs Code Insights, runs `code-insights init`, installs the hook, and from then on has a local dashboard showing:
- What they built with AI coding tools this week
- Key decisions and why they made them
- Patterns in how they use AI assistance across tools

They own all the data. They can export it. They can delete it. They can modify the CLI tool. Complete autonomy.
