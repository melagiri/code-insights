# CLAUDE.md — Code Insights

> **Primary Claude Code workspace.** All sessions run from this repo root.

---

## Project Overview

**Code Insights** is an open-source CLI tool and embedded dashboard for analyzing AI coding sessions. It parses session history from multiple AI coding tools (Claude Code, Cursor, Codex CLI, Copilot CLI), stores structured data in a local SQLite database, and provides both terminal analytics and a browser-based dashboard with LLM-powered insights.

**Architecture:** Single-repo pnpm workspace monorepo with three packages: CLI, dashboard (Vite + React SPA), and server (Hono API).

**Privacy model:** Fully local-first. No cloud accounts, no sign-ups, no data leaves the machine. SQLite database at `~/.code-insights/data.db`.

**Purpose:** A free, open-source tool helping developers who use multiple AI coding tools analyze their sessions, collect insights, track decisions and learnings, and build knowledge over time.

---

## Development Philosophy (CRITICAL)

**No MVPs, no prototypes, no half-measures.** This product is LIVE with real users. Every feature ships as a full, complete implementation. We do not build "minimum viable" anything — we build the real thing, iterate based on feedback, and revert or update if it doesn't work out.

This principle applies to planning, designing, AND implementation:
- **Planning:** Don't scope down to "MVP facet set" vs "ideal set." Design the complete solution.
- **Designing:** Don't propose phased rollouts with "ship phase 1, add phase 2 later." Design it right the first time.
- **Implementing:** Don't cut corners with "we can add this later." Build it now or explicitly decide not to build it.

If something needs to change after shipping, we change it. That's cheaper than shipping incomplete work that creates technical debt and confuses users.

---

## Configuration Hierarchy

| Priority | Source | Scope |
|----------|--------|-------|
| 1 (Highest) | This project CLAUDE.md | Code Insights workflows, ceremony, agents |
| 2 | Session Mode | Educational context, learning mode |
| 3 | Global ~/.claude/CLAUDE.md | General best practices |

**Key overrides from global config:**

| Behavior | Global Default | Code Insights Override |
|----------|---------------|----------------------|
| Planning | Ask first | Sub-agents autonomous in their domain |
| File Creation | Ask first | Agents create files autonomously in their domain |
| Review Process | Single reviewer | Triple-layer (TA Insider + Outsider + Synthesis) |
| PR Merges | Normal | **BLOCKED** — only founder merges |

---

## Repository Structure

```
code-insights/
├── cli/                    # Node.js CLI (Commander.js, SQLite, providers)
│   └── src/
│       ├── commands/       # CLI commands (init, sync, status, stats, dashboard, config)
│       ├── commands/stats/ # Stats command suite (4-layer architecture)
│       ├── providers/      # Source tool providers (claude-code, cursor, codex, copilot-cli)
│       ├── parser/         # JSONL parsing, title generation
│       ├── db/             # SQLite schema, migrations, queries
│       ├── utils/          # Config, device, paths
│       ├── types.ts        # Type definitions (SINGLE SOURCE OF TRUTH)
│       └── index.ts        # CLI entry point
├── dashboard/              # Vite + React SPA
│   └── src/
│       ├── components/     # React components (shadcn/ui)
│       ├── hooks/          # React Query hooks
│       ├── lib/            # LLM providers, utilities
│       └── App.tsx         # SPA entry point
├── server/                 # Hono API server
│   └── src/
│       ├── routes/         # REST API endpoints
│       └── index.ts        # Server entry point
├── docs/                   # Product docs, plans, roadmap
│   └── plans/              # Design plans (pending implementation only)
└── .claude/                # Agent definitions, commands, hookify rules
    ├── agents/             # Agent definitions (engineer, TA, PM, etc.)
    └── commands/           # Team commands (start-feature, start-review)
```

---

## Supported Source Tools

| Source Tool | Provider ID | Provider Class | Data Format | Location |
|-------------|-------------|---------------|-------------|----------|
| Claude Code | `claude-code` | `ClaudeCodeProvider` | JSONL | `~/.claude/projects/**/*.jsonl` |
| Cursor | `cursor` | `CursorProvider` | SQLite (state.vscdb) | Platform-specific (macOS/Linux/Windows) |
| Codex CLI | `codex-cli` | `CodexProvider` | JSONL (rollout files) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Copilot CLI | `copilot-cli` | `CopilotCliProvider` | JSONL (events) | `~/.copilot/session-state/{id}/events.jsonl` |

---

## Commands

```bash
cd cli
pnpm install          # Install dependencies
pnpm dev              # Watch mode (tsc --watch)
pnpm build            # Compile TypeScript to dist/
pnpm lint             # Run ESLint (no config file yet - needs setup)

# After building, link for local testing:
npm link
code-insights init                     # Interactive setup
code-insights sync                     # Sync sessions to SQLite
code-insights sync --force             # Re-sync all sessions
code-insights sync --dry-run           # Preview without changes
code-insights sync -q                  # Quiet mode (for hook usage)
code-insights sync --source cursor     # Sync only from a specific tool
code-insights status                   # Show sync statistics
code-insights dashboard                # Open the dashboard in browser
code-insights install-hook             # Auto-sync on session end
code-insights uninstall-hook           # Remove auto-sync hook
code-insights config                   # Show current configuration
code-insights reset --confirm          # Delete all local data

# Stats — terminal analytics
code-insights stats                    # Dashboard overview (last 7 days)
code-insights stats cost               # Cost breakdown by project and model
code-insights stats projects           # Per-project detail cards
code-insights stats today              # Today's sessions with details
code-insights stats models             # Model usage distribution

# Stats shared flags:
#   --period 7d|30d|90d|all   Time range (default: 7d)
#   --project <name>     Scope to a specific project
#   --source <tool>      Filter by source tool
#   --no-sync            Skip auto-sync before showing stats
```

---

## Architecture

### Data Flow

```
Source tool session files -> Provider (discover + parse) -> SQLite -> Dashboard (localhost)
                                                         -> CLI stats commands
```

### SQLite Database

- Location: `~/.code-insights/data.db`
- WAL mode enabled for concurrent reads during CLI sync
- Uses better-sqlite3 (synchronous, fast, no async overhead)
- Schema managed via versioned migrations applied on startup
- All timestamps stored as ISO 8601 strings

### Provider Architecture

All source tools are integrated via the `SessionProvider` interface (`providers/types.ts`):

```typescript
interface SessionProvider {
  getProviderName(): string;                                    // e.g. 'claude-code', 'cursor'
  discover(options?: { projectFilter?: string }): Promise<string[]>;  // Find session files
  parse(filePath: string): Promise<ParsedSession | null>;       // Parse into common format
}
```

Providers are registered in `providers/registry.ts`. To add a new source tool:
1. Create `providers/<name>.ts` implementing `SessionProvider`
2. Register it in `providers/registry.ts`
3. Add color entry to dashboard `SOURCE_TOOL_COLORS`
4. Add avatar case to dashboard `getAssistantConfig()`
5. Add tool name aliases if tool names differ
6. Add option to source filter dropdown

### Directory Structure (`/cli/src/`)
- `commands/` - CLI commands (init, sync, status, dashboard, reset, install-hook, config)
- `commands/stats/` - Stats command suite (4-layer architecture):
  - `data/types.ts` - `StatsDataSource` interface, `SessionRow`, error classes
  - `data/source.ts` - Data source factory
  - `data/local.ts` - SQLite data source implementation
  - `data/aggregation.ts` - Pure compute functions (overview, cost, projects, today, models)
  - `data/fuzzy-match.ts` - Levenshtein distance for `--project` name matching
  - `render/` - Terminal rendering (colors, format, charts, layout)
  - `actions/` - Action handlers for each subcommand + shared error handler
  - `index.ts` - Command tree with lazy imports
  - `shared.ts` - Shared CLI flags
- `providers/` - Source tool providers (claude-code, cursor, codex, copilot-cli)
- `providers/types.ts` - `SessionProvider` interface
- `providers/registry.ts` - Provider registration and lookup
- `parser/jsonl.ts` - JSONL file parsing (used by ClaudeCodeProvider)
- `parser/titles.ts` - Smart session title generation (5-tier fallback strategy)
- `db/` - SQLite schema, migrations, query functions
- `utils/config.ts` - Configuration management (~/.code-insights/config.json)
- `utils/device.ts` - Device ID generation, git remote detection, stable project IDs
- `utils/paths.ts` - Virtual path handling (shared by sync and stats)
- `types.ts` - TypeScript type definitions (SINGLE SOURCE OF TRUTH)
- `index.ts` - CLI entry point (Commander.js)

### SQLite Tables
- `projects` - Project metadata (id is hash of git remote URL or path)
- `sessions` - Session metadata with generated titles, character classification, device info
- `insights` - LLM-generated insights (types: summary, decision, learning, technique, prompt_quality)
- `messages` - Full message content (stored during sync)

---

## Type Architecture (CRITICAL)

Types are defined **once** in `cli/src/types.ts`. This is the single source of truth for the entire monorepo.

```
CLI (cli/src/types.ts)       -> Writes to SQLite
Server (server/src/)         -> Reads from SQLite, exposes via API
Dashboard (dashboard/src/)   -> Reads from Server API
```

**Rules:**
- New SQLite columns MUST have defaults or be nullable (backward compatible)
- Type changes in `types.ts` must be reflected in SQLite migrations
- TA owns this contract — flag all type changes to `technical-architect`

### Key Types (`cli/src/types.ts`)
- `ClaudeMessage` - Individual message entry
- `ParsedSession` - Aggregated session with metadata, title, character
- `Insight` - Types: summary | decision | learning | technique | prompt_quality; source: 'llm'
- `SessionCharacter` - 7 session classifications: deep_focus | bug_hunt | feature_build | exploration | refactor | learning | quick_task
- `ClaudeInsightConfig` - Config format
- `SyncState` - File modification tracking for incremental sync

---

## Multi-Agent Orchestration

### Agent Suite

| Agent | Model | Domain |
|-------|-------|--------|
| `engineer` | sonnet | Implementation across CLI, dashboard, and server — features, fixes, tests |
| `technical-architect` | opus | Architecture, type alignment, SQLite schema, code review, LLD standards |
| `ux-engineer` | opus | UX design (wireframes, flows, specs) and UI implementation (React/Tailwind/shadcn) |
| `product-manager` | sonnet | Task tracking (GitHub Issues), sprint planning, ceremony coordination |
| `journey-chronicler` | opus | Capture learning moments, breakthroughs, course corrections |
| `devtools-cofounder` | opus | DevTools strategy, DX critique, competitive positioning (on-demand, not standard ceremony) |

Agent definitions live in `.claude/agents/`.

### Orchestrator Role (Main Claude)

The orchestrator (you, the main Claude session) coordinates agents. Rules:

**You CAN:**
- Edit `CLAUDE.md` directly (you own it)
- Delegate implementation to the appropriate agent
- Run agents in parallel IF no dependencies exist
- Make final decisions when agents disagree

**You MUST NOT:**
- Implement code directly when an agent should do it
- Skip the ceremony steps
- Merge PRs (only the founder does this)

### Unresponsive Agent Protocol

If a spawned agent fails to respond or produces no useful output:

1. **Retry once** — attempt one more communication
2. **Terminate if still unresponsive** — do not wait indefinitely
3. **Re-spawn or take over** — either spawn a fresh agent or handle the task directly
4. **Log the failure** — note which agent failed and at what step

**Do NOT** spawn duplicate agents alongside a stale one. Terminate first, then replace.

### Pre-Spawn Dependency Check (MANDATORY)

Before parallelizing agents, verify:

1. List each agent's **inputs** — What does it need?
2. List each agent's **outputs** — What does it produce?
3. Map **dependencies** — Does B need A's output?
4. Decide: **Sequential or Parallel**

**Safe to Parallelize:**
- Independent domains with no shared types or schema changes
- Read-only research tasks
- CLI bug fix + Dashboard UI fix (if no shared state)

**Must Run Sequentially:**
- TA (type decision) -> Engineer (implement types)
- TA (schema decision) -> Engineer (implement)
- Any change touching `types.ts`

---

## Development Ceremony (MANDATORY)

All feature work follows this 10-step ceremony:

```
Step 1:  Founder assigns task or identifies work
Step 2:  Orchestrator identifies the right agent(s)
Step 3:  Dev agent reviews context (source files, types, existing patterns)
Step 4:  Dev agent clarifies with TA (if schema impact)
Step 5:  TA reviews approach and gives approval
Step 6:  Consensus checkpoint (TA + dev agent agree on approach)
Step 7:  Dev agent: git prechecks + create feature branch
Step 8:  Dev agent: implement, commit in logical chunks, CI gate
Step 9:  Triple-layer code review (TA insider + outsider + synthesis)
Step 10: Founder merges PR
```

### Step-by-Step Ownership

| Step | Owner | Gate Criteria |
|------|-------|---------------|
| 1-2 | Orchestrator | Correct agent identified |
| 3 | Dev agent | Files reviewed, understanding confirmed |
| 4 | Dev agent -> TA | Questions resolved, no assumptions |
| 5 | TA | Explicit approval or changes requested |
| 6 | TA + Dev agent | Both confirm ready to implement |
| 7 | Dev agent | Clean repo, feature branch created |
| 8 | Dev agent | Code implemented, CI passes locally |
| 9 | TA + Outsider + Dev agent | All review comments addressed |
| 10 | **Founder only** | PR merged to main |

### When to Engage TA (Steps 4-5)

**Required (schema/contract impact):**
- Adding/modifying SQLite columns or tables
- Changing type definitions in `types.ts`
- Modifying data contract (what providers write vs what dashboard reads)
- Changing configuration format
- Adding new server API endpoints

**Not required (domain-internal):**
- New command flags
- Parser improvements
- Terminal UI changes
- Dashboard component styling
- LLM provider additions

### CI Simulation Gate (Step 8 — BLOCKING)

Before creating ANY PR:

```bash
pnpm build    # Must pass across the workspace
```

**If ANY check fails:** Fix before creating PR. Never rely on CI.

---

## Dynamic Team Workflow (Feature Development)

For non-trivial features, use `/start-feature` to spin up a coordinated agent team. This is the **standard approach** for feature development.

### Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/start-feature <description>` | Creates worktree, team, and spawns PM to lead ceremony | Any feature requiring 3+ files or architectural decisions |
| `/start-review <PR#>` | Runs triple-layer code review (TA insider + outsider + synthesis) | After dev creates a PR |

### Team Structure

```
/start-feature "add demo mode onboarding"
    |
    +-- Orchestrator: Creates worktree + team, spawns PM
    |
    +-- PM (team lead): Scopes feature, creates task graph, spawns agents
    |     |
    |     +-- TA: Reviews architecture alignment (skipped for internal changes)
    |     +-- Dev (engineer): Implements in worktree, creates PR
    |
    +-- /start-review (triggered by PM after PR created)
          |
          +-- TA (insider review)
          +-- Outsider review
          +-- Wild card (if needed)
          |
          +-- TA synthesis -> Consolidated fix list -> Dev implements fixes
```

### When to Use Teams vs Direct Delegation

| Scenario | Approach |
|----------|----------|
| Multi-file feature, architectural decisions | `/start-feature` (full ceremony) |
| Internal change, clear scope, <3 files | Direct `engineer` dispatch (skip ceremony overhead) |
| Bug fix with clear root cause | Direct `engineer` dispatch |
| Code review for any PR | `/start-review` |

### Worktree Naming

```bash
# Feature worktrees live alongside the main repo:
../code-insights-<feature-slug>/    # e.g., ../code-insights-add-demo-mode-onboarding/
```

---

## Triple-Layer Code Review (MANDATORY)

All PRs go through multi-layer review:

### Phase 1: Parallel Independent Reviews (No Cross-Contamination)

| Role | Reviewer | Focus |
|------|----------|-------|
| **INSIDER** | `technical-architect` | Type alignment, schema contract, architecture patterns |
| **OUTSIDER** | `code-review:code-review` skill | Security, best practices, logic bugs, fresh perspective |

**CRITICAL:** Phase 1 reviews run in parallel. TA must NOT read outsider comments during initial review.

### Phase 2: TA Synthesis (After Both Reviews Complete)

TA reads outsider comments, does 2nd pass, and creates consolidated list:

```markdown
## TA Synthesis: [PR Title]

**Must Fix:**
1. [issue and required fix]

**Won't Fix (With Rationale):**
1. [outsider comment] - Reason: [domain-specific justification]

**Final Verdict:** Ready / Changes Required / Escalate to Founder
```

### Phase 3: Dev Agent Implements Fixes

Dev agent receives consolidated list, implements fixes, re-runs CI gate, updates PR.

### CRITICAL: Agents NEVER Merge PRs

```
FORBIDDEN: gh pr merge (or any merge command)
CORRECT: Report "PR #XX is ready for merge" and STOP
```

**Only the founder merges PRs.** This is enforced by hookify rule `block-pr-merge`.

---

## Document Ownership & Delegation

Orchestrator MUST NOT directly edit documents it doesn't own. Always delegate.

| Document Type | Owner Agent | Action |
|---------------|------------|--------|
| `CLAUDE.md` | **Orchestrator** | Direct edit allowed |
| CLI code (`cli/src/`) | `engineer` | Delegate to engineer |
| Dashboard code (`dashboard/src/`) | `engineer` | Delegate to engineer |
| Server code (`server/src/`) | `engineer` | Delegate to engineer |
| Type alignment decisions | `technical-architect` | Delegate to TA |
| Product docs (`docs/`) | `technical-architect` | Delegate to TA |
| Task tracking, sprints | `product-manager` | Delegate to PM |
| PR creation | Dev agent (whoever implemented) | Agent creates PR |

**Why delegation matters:** Each agent has git hygiene rules — they commit AND push immediately. Orchestrator editing code directly bypasses these safeguards.

---

## Pre-Action Verification (CRITICAL)

Before any state-modifying command (git checkout, git push, git tag, file edits), run a **read-only check** to verify current state:

- **Branch names:** Never assume `main` vs `master` — run `git symbolic-ref refs/remotes/origin/HEAD` to detect the default branch
- **File existence:** Read a file before editing it; `ls` a directory before writing to it
- **API signatures:** When calling an unfamiliar endpoint or tool, read the function signature or documentation first — assume undocumented defaults exist (pagination limits, required properties, parameter naming)
- **Build context:** Before running build scripts, verify you're in the correct sub-directory (`pwd`) and on the correct branch (`git branch`)

This applies to both **planning** (verify assumptions before presenting a plan) and **execution** (verify state before running commands).

---

## Retry Discipline

If a command or tool call fails twice on the same input, **STOP**. Do not retry a third time. Report the failure, state what was attempted, and propose an alternative approach. Blind retries waste tokens and time.

---

## Branch Discipline (CRITICAL)

`main` is the production branch. Only receives commits via merged PRs.

**Rules for ALL agents:**

```bash
# BEFORE ANY COMMIT:
git branch  # Must show feature branch, NOT main

# If on main -> STOP:
git checkout -b feature/description

# After EVERY commit:
git push origin $(git branch --show-current)  # Push IMMEDIATELY
```

**Branch naming:**
- `feature/description` (new functionality)
- `fix/description` (bug fixes)
- `docs/description` (documentation only)
- `chore/description` (maintenance, deps, config)

**Pre-commit checklist (ALL agents):**
1. `git branch` — Am I on feature branch?
2. If on `main` -> STOP, create feature branch
3. Commit to feature branch
4. Push immediately after commit

---

## Key Patterns

### Session Character Classification
Sessions are classified into one of 7 types based on tool call patterns:
- `deep_focus`, `bug_hunt`, `feature_build`, `exploration`, `refactor`, `learning`, `quick_task`

### Title Generation
Multi-tier fallback: Claude summary -> user message (scored) -> character-based -> generic fallback.

### SQLite Integration
- Uses better-sqlite3 with WAL mode for concurrent access
- Schema versioned via migrations applied on startup
- Incremental sync tracks file modification times in `~/.code-insights/sync-state.json`
- Project IDs derived from git remote URLs (stable across devices) with path-hash fallback

### Configuration
- Config stored at `~/.code-insights/config.json` (mode 0o600)
- Sync state at `~/.code-insights/sync-state.json`
- Device ID at `~/.code-insights/device-id`
- SQLite database at `~/.code-insights/data.db`

### Hook Integration
- `install-hook` modifies `~/.claude/settings.json` to add a Stop hook
- Hook runs `code-insights sync -q` automatically when Claude Code sessions end

### Multi-Source Support

The CLI and dashboard support sessions from multiple AI coding tools via the `sourceTool` field.

**Supported sources:** `'claude-code'` (default), `'cursor'`, `'codex-cli'`, `'copilot-cli'`

**Adding a new source tool:**
1. CLI: Create a new provider in `cli/src/providers/` implementing `SessionProvider`
2. Register in `cli/src/providers/registry.ts`
3. Dashboard: Add color entry to `SOURCE_TOOL_COLORS`
4. Dashboard: Add avatar case to `getAssistantConfig()`
5. Dashboard: Add tool name aliases (if tool names differ)
6. Dashboard: Add option to source filter dropdown

---

## Tech Stack

- **Runtime**: Node.js (ES2022, ES Modules)
- **CLI Framework**: Commander.js
- **Database**: SQLite (better-sqlite3) — WAL mode, local at `~/.code-insights/data.db`
- **Dashboard**: Vite + React 19 SPA
- **Server**: Hono
- **UI**: Tailwind CSS 4 + shadcn/ui (New York), Lucide icons
- **Server State**: React Query (TanStack Query)
- **Charts**: Recharts 3
- **LLM**: OpenAI, Anthropic, Gemini, Ollama (multi-provider abstraction)
- **Terminal UI**: Chalk (colors), Ora (spinners), Inquirer (prompts)
- **Utilities**: date-fns, uuid
- **Package Manager**: pnpm (workspace monorepo)
- **npm Package**: `@code-insights/cli`
- **Binary**: `code-insights`

---

## Hookify Rules

| Rule | Type | Purpose |
|------|------|---------|
| `block-pr-merge` | **block** | Agents never merge PRs — founder only |
| `branch-discipline` | warn | Dev agents verify feature branch before coding |
| `cli-binary-name` | warn | Prevent using `claudeinsight` instead of `code-insights` |
| `agent-parallel-warning` | warn | Verify no dependencies before parallelizing agents |
| `no-jira` | **block** | Prevent Jira/Atlassian API calls — use GitHub Issues instead |
| `review-before-pr` | warn | Remind: code review required before PR creation (bash path) |
| `review-before-pr-mcp` | warn | Remind: code review required before PR creation (MCP path) |
| `verify-before-checkout` | warn | Verify branch exists before `git checkout/switch` — never assume main vs master |

---

## Version Bump Procedure

When bumping the version (patch, minor, or major):

1. **`cli/package.json`** — Update the `"version"` field
2. **`cli/CHANGELOG.md`** — Add a new `## [x.y.z] - YYYY-MM-DD` section at the top with changes
3. **Commit** — `chore: bump version to vX.Y.Z` with a one-line summary of what changed
4. **Publish** — `cd cli && npm publish` (runs `prepublishOnly` which builds all packages)

Files touched: `cli/package.json` + `cli/CHANGELOG.md` (minimum). Optionally update `docs/ROADMAP.md`, `docs/VISION.md`, `docs/PRODUCT.md` for minor/major bumps.

---

## Development Notes

- TypeScript strict mode enabled
- ES Modules (`import`/`export`, not `require`)
- No test framework configured yet
- No ESLint config file in CLI directory (lint script exists but needs config)
- pnpm is the package manager (workspace monorepo)
- CLI binary is `code-insights`
- npm package is `@code-insights/cli`
