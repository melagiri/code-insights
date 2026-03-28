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
4. **LLM-powered analysis** — Two analysis paths:
   - **Native (zero-config):** Claude Code users get automatic analysis via `SessionEnd` hook using their existing Claude subscription. No API key needed. Install with `code-insights install-hook`.
   - **On-demand:** Configure any LLM provider (OpenAI, Anthropic, Gemini, Ollama) with your own API key for manual analysis from the dashboard or CLI.
5. **Visual dashboard** — Local web interface with charts, timelines, and filters at `http://localhost:7890`
6. **CLI analytics** — Terminal stats via `code-insights stats` and subcommands

## Who It's For

- **Developers using multiple AI coding tools** who want to understand their AI-assisted work patterns across Claude Code, Cursor, Codex CLI, Copilot CLI, and VS Code Copilot Chat
- **Learners** who want to review and reinforce what they've built with AI assistants
- **Privacy-conscious developers** who want insights without giving up their data to a cloud service

## Privacy Model

**Fully local. No cloud. No accounts.**

Code Insights stores all session data in a SQLite database at `~/.code-insights/data.db` on your own machine. There is no central server, no sign-up, and no data sent anywhere. The dashboard runs locally at `http://localhost:7890` — served by a Hono API process on your own machine.

LLM analysis uses your own API key, stored in `~/.code-insights/config.json` (mode 0o600). API calls go directly from the local server to your chosen LLM provider — not through any Code Insights infrastructure.

**Telemetry:** Anonymous, aggregate usage signals via PostHog. Opt-out model (enabled by default). Respects `CODE_INSIGHTS_TELEMETRY_DISABLED` and `DO_NOT_TRACK` environment variables. No PII collected. See `code-insights telemetry` to manage.

## Core Features

### Multi-Source Support

| Source Tool | What's Captured |
|-------------|-----------------|
| **Claude Code** | JSONL sessions from `~/.claude/projects/` |
| **Cursor** | Sessions from Cursor's local SQLite state |
| **Codex CLI** | Rollout files from `~/.codex/sessions/` |
| **Copilot CLI** | Event files from `~/.copilot/session-state/` |
| **VS Code Copilot Chat** | Sessions from VS Code Copilot Chat local storage |

### Insight Categories

| Category | What It Captures |
|----------|-----------------|
| **Summary** | High-level narrative of what was accomplished |
| **Decision** | Architecture choices, trade-offs, reasoning, alternatives considered |
| **Learning** | Technical discoveries, mistakes, transferable knowledge |
| **Technique** | Problem-solving approaches and debugging strategies |
| **Prompt Quality** | Categorized prompt analysis: 7 deficit + 3 strength categories, 5 dimension scores, two-layer output (user takeaways + Reflect findings) |

### Export

Two-tier export system for turning session knowledge into shareable and actionable artifacts:

**Session-level export** — per-session export of insights with two templates:
- **Knowledge Base** — Human-readable markdown with full insight content
- **Agent Rules** — Imperative instructions formatted for CLAUDE.md/.cursorrules

**Export Page** — LLM-powered cross-session synthesis:
- Reads across multiple sessions' insights to deduplicate, merge, and synthesize
- Generates agent rules via LLM (not just template formatting)
- 4 output formats: Agent Rules, Knowledge Brief, Obsidian (YAML frontmatter), Notion
- 3 depth presets: Essential (~25 insights), Standard (~80), Comprehensive (~200)
- SSE streaming with progress phases, AbortSignal support, token budget guard

### Reflect & Patterns

Cross-session pattern detection and synthesis, powered by session facets:

**Session Facets** — Structured metadata extracted during LLM analysis for each session:
- Outcome satisfaction (high/medium/low/mixed)
- Workflow pattern (iterative, plan-then-execute, exploratory, debugging, etc.)
- Friction points with 9 canonical AI-session-focused categories: wrong-approach, knowledge-gap, stale-assumptions, incomplete-requirements, context-loss, scope-creep, repeated-mistakes, documentation-gap, tooling-limitation
- Friction attribution model: each friction point is classified as user-actionable (better input would have prevented it), ai-capability (AI failed despite adequate input), or environmental (external constraint)
- Effective patterns (what worked well and why, with 8 canonical categories)
- Course correction tracking (whether the session changed direction and why)

**CLI Commands:**
- `code-insights reflect` — Generate cross-session synthesis with LLM (friction analysis, rules/skills, working style)
- `code-insights reflect backfill` — Backfill facets for sessions analyzed before facet support
- `code-insights stats patterns` — View pattern summary in the terminal

**Dashboard Patterns Page** — Three synthesis sections:
- **Friction & Wins** — Top friction categories ranked by frequency, effective patterns that worked
- **Rules & Skills** — Auto-generated agent rules, skill recommendations, and hook suggestions
- **Working Style** — Workflow distribution, outcome trends, session character analysis

**Technical details:**
- Dedicated `session_facets` SQLite table (Schema V3) with indexed scalar columns and JSON arrays
- Facet extraction integrated into the existing analysis prompt (facets first, then insights)
- Lightweight facet-only backfill for previously-analyzed sessions (summary + first/last 20 messages); `reflect backfill` finds both missing and outdated sessions in one pass
- Friction category normalization via Levenshtein distance matching to 9 canonical categories, with alias mapping for legacy category migration
- Effective patterns use the `driver` field (`user-driven`/`ai-driven`/`collaborative`) to attribute who drove the pattern; CoT `_reasoning` scratchpad captured for prompt tuning
- Attribution model: each friction point classified as `user-actionable`, `ai-capability`, or `environmental`
- Synthesis prompts pre-aggregate data in code, then feed ranked summaries to LLM for narration
- Reflect uses ISO week navigation (e.g., `2026-W10`) rather than sliding windows; `--week` CLI flag, `GET /api/reflect/weeks` endpoint for week history
- Reflect snapshots cached in `reflect_snapshots` table (Schema V4); `period` column stores ISO week strings
- 8-session minimum threshold for weekly scope synthesis; coverage warning when < 50% analyzed

**Upcoming:** Progress tracking — "Am I getting better?" Weekly snapshots comparing friction trends and pattern emergence over time, helping developers see how their AI collaboration skills evolve.

### Share Card (AI Fluency Score)

A shareable 1200×630 PNG image (OG standard for Twitter/X, LinkedIn, Slack, Discord) that visualizes a developer's AI coding fluency. Downloaded from the Patterns page.

**What's on the card:**
- **Archetype tagline** — LLM-generated identity label from working-style synthesis (e.g., "The Methodical Achiever")
- **AI Fluency Score** — Composite 0–100 score derived from 5 Prompt Quality dimension averages, displayed as a hero circle with gradient arc
- **Fingerprint bars** — 5 rainbow-colored dimension bars showing per-dimension PQ scores:
  - Context (context_provision), Clarity (request_specificity), Focus (scope_management), Timing (information_timing), Orchestration (correction_quality)
- **Evidence lines** — "Score from N sessions · XK tokens · last 4 weeks" + "N lifetime sessions · [tool logos]"
- **Effective pattern pills** — Top 3 patterns by frequency (if data exists)
- **Tool logos** — Deduplicated source tool icons (Claude Code, Cursor, Codex CLI, GitHub Copilot)
- **CTA footer** — code-insights.app + `npx @code-insights/cli`

**Scoring window:** 4-week rolling window (last 4 ISO weeks) for stable, representative scores. Lifetime session count is all-time.

**Technical details:**
- Canvas 2D rendering at 2× DPR (2400×1260 internal) exported as 1200×630 PNG
- Dark gradient background with subtle radial glows
- System font stack with monospace fallback for code elements
- Tool logos loaded from `dashboard/public/icons/` static assets

### Zero-Config First Run

Running `code-insights` with no arguments works immediately — auto-creates the database, syncs sessions, and opens the dashboard. No `init` required. The dashboard includes guided empty states with CLI command snippets for first-time users.

### Knowledge Journal

The Journal page (`/journal`) provides a chronological view of learnings and decisions extracted from sessions:

- **Timeline tab** — Weeks grouped by ISO week with visual timeline dots (yellow for learnings, blue for decisions). Week headers show learning/decision counts. Newest-first within each week.
- **Patterns tab** — Links to LLM analysis workflow for pattern discovery across sessions.

### Chat View Enhancements

Session detail chat view includes system event rendering:
- **Context break dividers** — Visual markers where conversation context was reset (compacts)
- **Inline event chips** — Slash commands displayed as inline chips (e.g., `/grep`, `/read`)
- **Raw message toggle** — Switch between filtered and full conversation view
- **Agent message rendering** — Task notifications (amber) and teammate messages (colored border)

### Dashboard Views

- **Dashboard** — Overview with activity charts
- **Sessions** — Session list with source, project, date, character filters
- **Session Detail** — Full session with analyze button, cost tracking, chat view enhancements
- **Insights** — Browse and search generated insights
- **Analytics** — Charts showing effort distribution, cost, models, projects
- **Patterns** — Cross-session pattern synthesis (Friction & Wins, Rules & Skills, Working Style) + Share Card download + Week-at-a-Glance strip with streak, session count, AI Fluency Score
- **Export** — LLM-powered export wizard (4 formats, 3 depths)
- **Journal** — Chronological timeline of learnings and decisions by ISO week
- **Settings** — Configuration UI

### CLI Command Reference

#### Setup & Sync

Running `code-insights` with no arguments automatically syncs sessions and opens the dashboard — no configuration required.

```bash
code-insights                              # Sync + open dashboard (zero-config)
code-insights init                         # Optional: customize settings (provider, API key)
code-insights sync                         # Sync sessions to SQLite
code-insights sync --force                 # Re-sync all sessions
code-insights sync --dry-run               # Preview without changes
code-insights sync -q                      # Quiet mode (for hook usage)
code-insights sync --source cursor         # Sync only from a specific tool
code-insights sync --verbose               # Verbose output
code-insights sync --regenerate-titles     # Regenerate session titles
code-insights sync prune                   # Soft-delete trivial sessions (≤2 messages, restorable with sync --force)
code-insights status                       # Show sync statistics
code-insights install-hook                 # Auto-sync on session end
code-insights uninstall-hook               # Remove auto-sync hook
```

#### Dashboard & Browser

```bash
code-insights dashboard                    # Start local server + open dashboard (auto-syncs first)
code-insights dashboard --no-sync          # Start server without syncing first
code-insights dashboard --port 8080        # Custom port (default: 7890)
code-insights dashboard --no-open          # Start server without opening browser
code-insights open                         # Open dashboard in browser (without starting server)
code-insights open --project               # Open filtered to the current project
```

#### Stats (Terminal Analytics)

```bash
code-insights stats                        # Overview (last 7 days)
code-insights stats cost                   # Cost breakdown by project and model
code-insights stats projects               # Per-project detail cards
code-insights stats today                  # Today's sessions with details
code-insights stats models                 # Model usage distribution
code-insights stats patterns               # Cross-session pattern summary
```

Stats shared flags:
- `--period 7d|30d|90d|all` — Time range (default: 7d)
- `--project <name>` — Scope to a specific project
- `--source <tool>` — Filter by source tool
- `--no-sync` — Skip auto-sync before showing stats

#### Reflect (Cross-Session Synthesis)

```bash
code-insights reflect                      # Cross-session LLM synthesis (current ISO week)
code-insights reflect --week 2026-W11      # Synthesis for a specific ISO week
code-insights reflect --section friction-wins   # Only generate one section
code-insights reflect --project myproject  # Scope to a specific project
code-insights reflect backfill             # Backfill facets for legacy sessions
code-insights reflect backfill --period 30d     # Backfill within time range (7d|30d|90d|all)
code-insights reflect backfill --project <name> # Backfill for specific project
code-insights reflect backfill --dry-run        # Show count without backfilling
code-insights reflect backfill --prompt-quality # Run prompt quality analysis instead of facets
```

Reflect `--section` values: `friction-wins`, `rules-skills`, `working-style`

#### Configuration

```bash
code-insights config                       # Show current configuration
code-insights config set <key> <value>     # Set config value (e.g., telemetry)
code-insights config llm                   # Configure LLM provider interactively
code-insights config llm --provider openai # Set provider directly
code-insights config llm --model gpt-4o   # Set model
code-insights config llm --api-key <key>  # Set API key
code-insights config llm --base-url <url> # Set custom base URL (Ollama, proxies)
code-insights config llm --show           # Show current LLM configuration
```

#### Telemetry

```bash
code-insights telemetry                    # Show telemetry status
code-insights telemetry status             # Show state and what data is collected
code-insights telemetry disable            # Disable anonymous telemetry
code-insights telemetry enable             # Enable anonymous telemetry
```

#### Other

```bash
code-insights reset --confirm              # Delete all local data
```

### LLM Cost Tracking

Per-session analysis costs are tracked in the `analysis_usage` SQLite table (Schema V7). Each analysis call records provider, model, token counts (including cache creation/read tokens), estimated USD cost, and duration. The dashboard shows cost per session after analysis runs. Cost data is also available via the `/api/analysis/usage` endpoint.

### Message Classification (Schema V6)

The `sessions` table tracks three context signals from Claude Code sessions: `compact_count` (explicit `/compact` invocations), `auto_compact_count` (auto-compact triggers), and `slash_commands` (all non-exit slash commands used). These signals feed into session characterization and are available for display in session detail views.

## Multi-Source Architecture

Code Insights uses a **provider abstraction** to support multiple AI coding tools through a common interface:

```
Source tool session files -> Provider (discover + parse) -> SQLite -> Dashboard / CLI stats
```

Each provider implements the `SessionProvider` interface (`discover()`, `parse()`, `getProviderName()`), normalizing tool-specific formats into the shared `ParsedSession` schema.

### How Each Tool Stores Sessions

| Tool | Format | Location (macOS) |
|------|--------|-----------------|
| **Claude Code** | JSONL (append-only, one JSON object per line) | `~/.claude/projects/<path>/<id>.jsonl` |
| **Cursor** | SQLite key-value (`state.vscdb`, JSON blobs) | `~/Library/Application Support/Cursor/User/` |
| **Codex CLI** | JSONL (event-based stream) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| **Copilot CLI** | JSONL (events) | `~/.copilot/session-state/{id}/events.jsonl` |
| **VS Code Copilot Chat** | JSON | Platform-specific Copilot Chat storage |

### Platform Paths

| Tool | macOS | Linux | Windows |
|------|-------|-------|---------|
| Claude Code | `~/.claude/projects/` | `~/.claude/projects/` | `%USERPROFILE%\.claude\projects\` |
| Cursor | `~/Library/Application Support/Cursor/User/` | `~/.config/Cursor/User/` | `%APPDATA%\Cursor\User\` |
| Codex CLI | `~/.codex/sessions/` | `~/.codex/sessions/` | `%USERPROFILE%\.codex\sessions\` |
| Copilot CLI | `~/.copilot/session-state/` | `~/.copilot/session-state/` | `%USERPROFILE%\.copilot\session-state\` |

Adding a new source tool requires implementing the `SessionProvider` interface in `cli/src/providers/`, registering it in the provider registry, and adding dashboard display support (colors, avatars, filter options).

## Tech Stack

- **CLI**: Node.js (ES2022, ES Modules), Commander.js
- **Database**: SQLite (`better-sqlite3`) at `~/.code-insights/data.db` — WAL mode, local, Schema V7
- **Server**: Hono — lightweight API server, serves dashboard SPA at `localhost:7890`
- **Dashboard**: Vite + React 19 SPA, Tailwind CSS 4 + shadcn/ui
- **AI**: Multi-provider — OpenAI, Anthropic, Gemini, Ollama (your own API keys, proxied server-side)
- **Telemetry**: PostHog (opt-out, anonymous device ID, no PII)
- **Package manager**: pnpm (workspace monorepo: `cli/`, `dashboard/`, `server/`)

## Success Metrics

- Time to first insight: < 5 minutes from install
- User can answer "what did I work on this week?" in one click
- Decisions are searchable and linkable
- Zero cloud dependencies after install
