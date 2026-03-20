# Code Insights Vision

## Philosophy

**Your data, your machine, your insights.**

Code Insights is a free, open-source tool that helps developers who use multiple AI coding tools analyze their sessions, collect insights, track decisions and learnings, and build knowledge over time. It's built on a simple principle: your session data never leaves your machine.

## Core Beliefs

### 1. Privacy by Architecture

There is no central Code Insights server. No accounts, no sign-ups, no cloud. All session data lives in a local SQLite database at `~/.code-insights/data.db`. The dashboard runs locally at `http://localhost:7890` — it never phones home.

### 2. Developers Can Handle It

Developers using AI coding tools are technical. They can:
- Run `code-insights` and get a working dashboard immediately (no setup required)
- Optionally run `code-insights init` to customize settings and answer three questions
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
- Support multiple source tools (Claude Code, Cursor, Codex CLI, Copilot CLI, VS Code Copilot Chat)
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
- Multi-source support: Claude Code, Cursor, Codex CLI, Copilot CLI, VS Code Copilot Chat
- Full feature parity between CLI stats and dashboard views

### Phase 5: Telemetry ✅
- Anonymous aggregate usage signals via PostHog (opt-out model, enabled by default)
- 14 event types tracked (cli_sync, cli_stats, analysis_run, dashboard_loaded, export_run, etc.)
- Respects `CODE_INSIGHTS_TELEMETRY_DISABLED` and `DO_NOT_TRACK` environment variables

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
Session facets infrastructure (Schema V3, V4) shipped with per-session structured metadata: friction points, effective patterns, workflow pattern, and outcome satisfaction. Friction normalized to 9 AI-session-focused categories with attribution model (user-actionable / ai-capability / environmental). Effective patterns normalized to 8 canonical categories. Dashboard Patterns page with three sections: Friction & Wins, Rules & Skills, Working Style. `code-insights reflect` and `stats patterns` CLI commands.

### Phase 8.5: Taxonomy & Classification Refinement ✅
Effective pattern taxonomy upgraded with `driver` field (`user-driven`/`ai-driven`/`collaborative`), contrastive classification guidance, and in-session signal detection (PR #129). Prompt quality taxonomy revised to 7 deficit + 3 strength categories with 5 dimension scores and a two-layer output (user takeaways + Reflect findings) (PR #136). Reflect navigation switched from sliding windows to ISO week-based navigation with week history endpoint (PR #132). Attribution rewrite added CoT `_reasoning` scratchpad and actor-neutral friction definitions (PR #138). Backfill updated to find both missing and outdated sessions in one pass (PR #130).

### Phase 9: Infrastructure & Reliability ✅
Message classification V6 schema added `compact_count`, `auto_compact_count`, and `slash_commands` to sessions, with prompt alignment for V6 signals (PRs #151, #154). Prompt caching implemented using provider-native shared prefix caching for Anthropic (PR #180). LLM cost tracking V7 schema (`analysis_usage` table) captures per-session token counts, cache metrics, and estimated USD cost with a pricing calculator and dashboard cost UI (PR #181).

### Phase 10: User Experience & Shareability ✅
Zero-config first run: `code-insights` with no args auto-syncs and opens the dashboard — no `init` required (v4.1.0). Guided empty states for first-time users. Dashboard auto-sync before server start. Knowledge Journal page with chronological timeline of learnings and decisions by ISO week. Shareable AI Fluency Score card (v4.2.0–v4.3.0): 1200×630 PNG export with hero score (0–100 composite from 5 PQ dimensions), rainbow fingerprint bars, tool logos, effective pattern pills, and 4-week rolling scoring window.

### What's Next
- Progress tracking: "Am I getting better?" — weekly snapshots comparing friction trends and pattern emergence, tracking user-actionable friction declining and new patterns solidifying
- Friction-to-pattern affinity map (e.g., stale-assumptions friction → context-gathering pattern)
- Test suite expansion (Vitest)
- Session merging across tools (linking related sessions from different AI tools)
- Shareable badges Phase 2: stats card variant, milestone-specific cards

## Non-Goals

- **Not a business** — No monetization, no paywall, no premium tier
- **Not a central platform** — No central database for user session data
- **Not a dependency** — Users can stop using it anytime, data remains theirs
- **Not a team tool** — This is a personal learning tool; no org/team features

## Success Looks Like

A developer installs Code Insights, runs `code-insights` (or `npx @code-insights/cli`), installs the hook, and from then on has a local dashboard showing:
- What they built with AI coding tools this week
- Key decisions and why they made them
- Patterns in how they use AI assistance across tools

They own all the data. They can export it. They can delete it. They can modify the CLI tool. Complete autonomy.
