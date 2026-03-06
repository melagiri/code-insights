# Code Insights Roadmap

## Overview

This roadmap outlines the development phases for Code Insights. Timelines are flexible—progress is driven by priorities and availability.

---

## Phase 1: Foundation ✅

**Goal:** Working end-to-end flow from AI session files to local dashboard

### Milestones

- [x] **1.1 Project Setup**
  - Single-repo pnpm workspace monorepo (`cli/`, `dashboard/`, `server/`)
  - TypeScript strict mode, ES Modules
  - Configuration system at `~/.code-insights/config.json`

- [x] **1.2 Claude Code Parser**
  - Parse Claude Code session files from `~/.claude/projects/`
  - Extract: sessions, messages, tool calls, timestamps
  - Smart session title generation (5-tier fallback)
  - Session character classification (7 types)
  - CLI command: `code-insights sync`

- [x] **1.3 SQLite Schema & Sync**
  - Local database at `~/.code-insights/data.db` (WAL mode)
  - Tables: projects, sessions, messages, insights
  - Incremental sync (tracks file modification times in `sync-state.json`)
  - Stable project IDs derived from git remote URLs
  - CLI command: `code-insights init`

- [x] **1.4 Basic Dashboard**
  - Session list view with filters (project, date)
  - Session detail view with message display
  - Insights display by type
  - Analytics page with Recharts charts

### Deliverables
- ✅ CLI tool that syncs sessions to local SQLite
- ✅ Local web dashboard served by `code-insights dashboard`

---

## Phase 2: Integration ✅

**Goal:** Seamless integration with Claude Code workflow and terminal analytics

### Milestones

- [x] **2.1 Claude Code Hook**
  - Post-session hook that triggers sync automatically
  - Quiet mode for background processing (`sync -q`)
  - `code-insights install-hook` / `code-insights uninstall-hook`

- [x] **2.2 CLI Stats Command Suite**
  - Terminal analytics: `stats`, `stats cost`, `stats projects`, `stats today`, `stats models`
  - Powered by local SQLite — zero external dependencies
  - Unicode sparklines, bar charts, semantic colors, responsive layout
  - Shared flags: `--period`, `--project`, `--source`, `--no-sync`

- [ ] **2.3 Enhanced Filtering**
  - Full-text search across sessions
  - Filter by: project, git branch, date range, insight type, source tool
  - Saved filters / bookmarks

### Deliverables
- ✅ Auto-sync via Claude Code hook
- ✅ CLI stats command suite with local analytics
- Enhanced filtering (pending)

---

## Phase 3: Intelligence ✅

**Goal:** LLM-powered deeper insights

### Milestones

- [x] **3.1 Multi-Provider LLM Integration**
  - Pluggable provider system (factory pattern)
  - OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo)
  - Anthropic (claude-sonnet, claude-haiku, claude-opus)
  - Google Gemini (gemini-2.0-flash, gemini-1.5-pro/flash)
  - Ollama for local models (llama3.2, mistral, codellama)
  - LLM calls proxied server-side via Hono API (no browser CORS)
  - Token input capped at 80k

- [x] **3.2 Session Analysis**
  - "Analyze" button on session detail page
  - Bulk analyze for unanalyzed sessions
  - Generates 4 insight types: summary, decision, learning, technique
  - Analysis versioning for re-analysis

- [x] **3.3 Cross-Session Patterns** ✅ (shipped as Reflect & Patterns in Phase 8)
  - Cross-session pattern detection via session facets
  - Project-level and overall-level friction/pattern synthesis
  - Recurring pattern identification via Levenshtein normalization

- [ ] **3.4 Learning Journal**
  - Auto-generate "lessons learned" from sessions
  - Track recurring patterns and mistakes
  - Suggest areas for improvement

### Deliverables
- ✅ Multi-provider LLM insight generation
- ✅ On-demand and bulk session analysis
- ✅ Cross-session patterns (shipped in Phase 8 as Reflect & Patterns)
- Learning journal (pending)

---

## Phase 4: Feature Parity ✅

**Goal:** Port all dashboard features to the embedded local SPA and add multi-source support

### Milestones

- [x] **4.1 Vite + React SPA Foundation**
  - Vite SPA replacing Next.js (no SSR needed for localhost)
  - Hono API server embedding the SPA
  - React Query for server state, Tailwind CSS 4 + shadcn/ui

- [x] **4.2 Multi-Source Provider Support**
  - `SessionProvider` interface for source tool abstraction
  - Providers: `claude-code`, `cursor`, `codex-cli`, `copilot-cli`
  - `--source` filter flag in all stats and sync commands
  - Source tool display in dashboard (colors, avatars, filters)

- [x] **4.3 Dashboard Feature Parity**
  - Sessions list with source, project, date, character filters
  - Session detail with full message display and analyze button
  - Analytics page with cost, models, projects breakdown
  - Stats overview and project cards

- [x] **4.4 Session-Level Export Templates** (v3.5.1)
  - Two export templates: Knowledge Base (human-readable) and Agent Rules (imperative instructions)
  - Export includes full insight content: summaries, decisions (with alternatives/reasoning), learnings (with root causes/takeaways), techniques, prompt quality
  - Template selector in Export wizard + Copy to Clipboard
  - Export by: session IDs, project, or all recent sessions

### Deliverables
- ✅ Embedded local dashboard via `code-insights dashboard`
- ✅ Multi-source support (Claude Code, Cursor, Codex CLI, Copilot CLI)
- ✅ Full feature parity with original hosted dashboard
- ✅ Session-level export with Knowledge Base and Agent Rules templates

---

## Phase 5: Telemetry ✅

**Goal:** Anonymous, opt-in usage signals to improve the tool without compromising privacy

### Milestones

- [x] **5.1 Anonymous Aggregate Signals**
  - Opt-in only, disabled by default
  - PostHog integration for anonymous event tracking (v3.3.0)
  - Events: `dashboard_started`, `analysis_run`, `export_run`
  - No PII collected — anonymous device ID only

- [ ] **5.2 Slash Commands**
  - `/insights` — Quick summary of recent sessions
  - `/insights today` — What you worked on today
  - `/insights decisions` — Recent architectural decisions

### Deliverables
- ✅ Anonymous telemetry via PostHog (opt-in)
- Slash commands (pending)

---

## Phase 6: Polish & Distribution ✅

**Goal:** Production-ready distribution and community foundation

### Milestones

- [x] **6.1 npm Distribution**
  - Published as `@code-insights/cli` on npm
  - Binary: `code-insights`
  - Pre-built dashboard SPA bundled in the package
  - Server runtime (`hono`, `@hono/node-server`) included as dependencies

- [x] **6.2 Documentation & Landing Page**
  - Landing page live at `code-insights.app`
  - 16 docs pages with MDX (next-mdx-remote + rehype-pretty-code)
  - README, MIGRATION.md, CONTRIBUTING.md, CHANGELOG.md

- [ ] **6.3 Plugin Architecture** (deferred)
  - Custom insight extractors
  - Dashboard widget API
  - Theme support

### Deliverables
- ✅ Published npm package (v3.0.0 – v3.4.0)
- ✅ Landing page and documentation site
- Plugin architecture (deferred)

---

## Phase 7: Export & Knowledge Pipeline

**Goal:** Turn session insights into actionable knowledge artifacts via LLM-powered synthesis

### Milestones

- [x] **7.1 Session-Level Export Templates** (v3.5.1) ✅
  - Knowledge Base template (human-readable markdown with full insight content)
  - Agent Rules template (imperative instructions for CLAUDE.md/.cursorrules)
  - Prompt quality analysis in exports (efficiency scores, anti-patterns, wasted turns)
  - Template selector + Copy to Clipboard in dashboard

- [x] **7.2 LLM-Powered Export Page** (v3.6.0) ✅
  - Cross-session insight synthesis via LLM (not just template formatting)
  - LLM reads decisions, learnings, techniques, prompt quality across sessions
  - Deduplicates overlapping learnings, resolves conflicting decisions
  - Generates agent rules as a coherent, contextual document
  - Uses existing multi-provider LLM abstraction (OpenAI, Anthropic, Gemini, Ollama)
  - 3 depth presets (Essential/Standard/Comprehensive) for controlling synthesis scope
  - SSE streaming with progress phases, AbortSignal support, token budget guard

- [x] **7.3 Multi-Format Export** (v3.6.0) ✅
  - Agent Rules (CLAUDE.md / .cursorrules / codex config)
  - Knowledge Brief (general purpose markdown, shareable)
  - Obsidian (markdown + YAML frontmatter, tags, wikilinks)
  - Notion (Notion-compatible markdown with toggle blocks, callouts, tables)

### Deliverables
- ✅ Session-level export with two templates
- ✅ LLM-powered cross-session synthesis
- ✅ Multi-format output (Agent Rules, Knowledge Brief, Obsidian, Notion)

---

## Phase 8: Reflect & Patterns

**Goal:** Cross-session pattern detection and synthesis — turning individual session facets into actionable insights about friction, effective patterns, and working style

### Milestones

- [x] **8.1 Session Facets Infrastructure** (v3.6.1) ✅
  - New `session_facets` SQLite table (Schema V3 migration)
  - Per-session structured metadata: outcome satisfaction, workflow pattern, friction points, effective patterns, course correction tracking
  - Facet extraction integrated into existing analysis prompt (facets first, then insights)
  - Lightweight facet-only backfill for previously-analyzed sessions (summary + bookend messages)

- [x] **8.2 Friction Normalization** (v3.6.1) ✅
  - Canonical friction categories (~15-20) defined in analysis prompt
  - Levenshtein distance matching (exact → distance ≤ 2 → substring → passthrough)
  - Prevents category fragmentation during aggregation

- [x] **8.3 Server APIs** (v3.6.1) ✅
  - Shared aggregation module (`shared-aggregation.ts`) — used by facets and reflect routes
  - `GET /api/facets` — session facets with period/project/source filters
  - `GET /api/facets/aggregated` — pre-aggregated friction categories, patterns, distributions
  - `POST /api/facets/backfill` — SSE streaming facet extraction for sessions missing facets
  - `POST /api/reflect/generate` — SSE streaming LLM synthesis (friction-wins, rules-skills, working-style)

- [x] **8.4 CLI Commands** (v3.6.1) ✅
  - `code-insights reflect` — Generate cross-session synthesis with LLM
  - `code-insights stats patterns` — View pattern summary in terminal

- [x] **8.5 Dashboard Patterns Page** (v3.6.1) ✅
  - Three-tab layout: Friction & Wins, Rules & Skills, Working Style
  - Facet backfill progress indicator for sessions missing facets
  - Copy-to-clipboard for generated rules, skills, and hooks
  - ARIA-accessible tab navigation

### Deliverables
- ✅ Session facets with Schema V3 migration
- ✅ Cross-session pattern synthesis via LLM
- ✅ CLI reflect command and stats patterns subcommand
- ✅ Dashboard Patterns page with three synthesis sections

---

## Version Milestones

| Version | Phase | Key Features | Status |
|---------|-------|--------------|--------|
| 0.1.0 | 1 | CLI sync, SQLite schema, basic dashboard | ✅ Done |
| 0.2.0 | 1 | Smart titles, session classification | ✅ Done |
| 0.3.0 | 2 | Claude Code hook, CLI stats commands | ✅ Done |
| 0.4.0 | 3 | Multi-LLM analysis, bulk analyze | ✅ Done |
| 0.5.0 | 4 | Vite SPA + Hono server, embedded dashboard | ✅ Done |
| 0.6.0 | 4 | Multi-source support (Cursor, Codex, Copilot CLI) | ✅ Done |
| 3.0.0 | 6 | npm publish, local-first migration, README rewrite | ✅ Done |
| 3.1.0 | 6 | Server runtime deps fix, dashboard path fallback | ✅ Done |
| 3.2.0 | 4 | Dashboard polish — skeletons, ErrorCard, toasts, bundle audit | ✅ Done |
| 3.3.0 | 5 | PostHog anonymous telemetry (opt-in) | ✅ Done |
| 3.4.0 | — | Multi-source parser fixes (Codex, Cursor, Copilot), agent message rendering | ✅ Done |
| 3.5.1 | 7 | Session-level export templates (Knowledge Base, Agent Rules), prompt quality in exports | ✅ Done |
| 3.6.0 | 7 | LLM-powered Export Page (cross-session synthesis, 4 formats, depth presets, SSE streaming) | ✅ Done |
| 3.6.1 | 8 | Reflect & Patterns (session facets, friction normalization, cross-session synthesis, Patterns page) | ✅ Done |

---

## Contributing

This is an open source project. Contributions welcome!

- **Issues**: Bug reports, feature requests
- **PRs**: Code contributions (please discuss first for large changes)
- **Docs**: Improvements to documentation
- **Providers**: New source tool providers

See CONTRIBUTING.md for guidelines.
