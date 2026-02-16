# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Project Overview

Code Insights CLI (`code-insights`) parses Claude Code session history (`~/.claude/projects/` JSONL files) and syncs structured data to the user's own Firebase Firestore. It follows a **Bring Your Own Firebase (BYOF)** privacy model - no central server, users own all their data.

This repo contains the **open-source CLI tool only**. The web dashboard lives in a separate closed-source repo (`code-insights-web`).

## Repository Structure

```
codeInsights/
├── code-insights/          # THIS REPO — Open-source CLI tool
│   ├── cli/                # Node.js CLI (code-insights)
│   ├── docs/               # Product docs, roadmap, vision
│   └── .claude/agents/     # Agent definitions (TA, fullstack-engineer, ux-designer, PM, chronicler)
│
└── code-insights-web/      # SEPARATE REPO — Closed-source web dashboard
    ├── src/                # Next.js 16 app
    ├── prisma/             # Auth schema (Vercel Postgres)
    └── generated/          # Prisma client output
```

## Commands

```bash
cd cli
pnpm install          # Install dependencies
pnpm dev              # Watch mode (tsc --watch)
pnpm build            # Compile TypeScript to dist/
pnpm lint             # Run ESLint (no config file yet - needs setup)

# After building, link for local testing:
pnpm link --global
code-insights init                     # Interactive Firebase setup wizard
code-insights sync                     # Sync sessions to Firestore
code-insights sync --force             # Re-sync all sessions
code-insights sync --dry-run           # Preview without changes
code-insights sync -q                  # Quiet mode (for hook usage)
code-insights sync --regenerate-titles # Regenerate session titles
code-insights status                   # Show sync statistics
code-insights connect                  # Generate dashboard connection URL
code-insights install-hook             # Auto-sync on session end
code-insights uninstall-hook           # Remove auto-sync hook
code-insights reset --confirm          # Delete all Firestore data
```

## Architecture

### Data Flow
```
~/.claude/projects/**/*.jsonl → CLI Parser → Firestore → Web Dashboard (separate repo)
```

### Directory Structure (`/cli/src/`)
- `commands/` - CLI commands (init, sync, status, connect, reset, install-hook)
- `parser/jsonl.ts` - JSONL file parsing and session metadata extraction
- `parser/titles.ts` - Smart session title generation (5-tier fallback strategy)
- `firebase/client.ts` - Firebase Admin SDK for Firestore reads/writes
- `utils/config.ts` - Configuration management (~/.code-insights/config.json)
- `utils/device.ts` - Device ID generation, git remote detection, stable project IDs
- `types.ts` - TypeScript type definitions
- `index.ts` - CLI entry point (Commander.js)

### Firestore Collections
- `projects` - Project metadata (id is hash of git remote URL or path)
- `sessions` - Session metadata with generated titles, character classification, device info
- `insights` - LLM-generated insights (types: summary, decision, learning, technique, prompt_quality)
- `messages` - Full message content (uploaded during sync)

### Cross-Repo Type Contract (CRITICAL)

Types are duplicated between repos. Manual alignment is required.

```
CLI (code-insights/cli/src/types.ts)     → Writes to Firestore
Web (code-insights-web/src/lib/types.ts) → Reads from Firestore
```

| Type | CLI | Web | Firestore Collection |
|------|-----|-----|---------------------|
| Project | ✅ | ✅ | `projects` |
| Session (ParsedSession) | ✅ | ✅ | `sessions` |
| Insight | ✅ | ✅ | `insights` |
| Message (ClaudeMessage) | ✅ | ✅ | `messages` |

**Rules:**
- New Firestore fields MUST be optional (backward compatible with existing data)
- Type changes in one repo require updating the other
- TA owns this contract — flag all type changes to `technical-architect`

---

## Multi-Agent Orchestration

### Agent Suite

| Agent | Model | Domain | Repo Scope |
|-------|-------|--------|------------|
| `technical-architect` | opus | Cross-repo architecture, type alignment, code review, LLD standards | Both repos |
| `fullstack-engineer` | sonnet | Implementation across CLI and web — features, fixes, tests | Both repos |
| `ux-designer` | opus | ASCII wireframes, user flows, personas, UX validation | Design docs |
| `product-manager` | sonnet | Task tracking (GitHub Issues), sprint planning, ceremony coordination | Both repos |
| `journey-chronicler` | opus | Capture learning moments, breakthroughs, course corrections | `docs/chronicle/` |

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

### Pre-Spawn Dependency Check (MANDATORY)

Before parallelizing agents, verify:

1. List each agent's **inputs** — What does it need?
2. List each agent's **outputs** — What does it produce?
3. Map **dependencies** — Does B need A's output?
4. Decide: **Sequential or Parallel**

**Safe to Parallelize:**
- Independent domains with no shared types or Firestore changes
- Read-only research tasks
- CLI bug fix + Web UI fix (if no shared state)

**Must Run Sequentially:**
- TA (type decision) → CLI engineer (implement types) → Web engineer (mirror types)
- TA (schema decision) → Either engineer (implement)
- Any change touching `types.ts` in either repo

---

## Development Ceremony (MANDATORY)

All feature work follows this 10-step ceremony:

```
Step 1:  Founder assigns task or identifies work
Step 2:  Orchestrator identifies the right agent(s)
Step 3:  Dev agent reviews context (source files, types, existing patterns)
Step 4:  Dev agent clarifies with TA (if cross-repo impact)
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
| 4 | Dev agent → TA | Questions resolved, no assumptions |
| 5 | TA | Explicit approval or changes requested |
| 6 | TA + Dev agent | Both confirm ready to implement |
| 7 | Dev agent | Clean repo, feature branch created |
| 8 | Dev agent | Code implemented, CI passes locally |
| 9 | TA + Outsider + Dev agent | All review comments addressed |
| 10 | **Founder only** | PR merged to main |

### When to Engage TA (Steps 4-5)

**Required (cross-repo impact):**
- Adding/modifying Firestore document fields
- Changing type definitions in `types.ts`
- Modifying sync contract (what data flows to web)
- Changing configuration format

**Not required (domain-internal):**
- New command flags
- Parser improvements
- Terminal UI changes
- Web component styling
- LLM provider additions

### CI Simulation Gate (Step 8 — BLOCKING)

Before creating ANY PR:

```bash
# CLI repo
cd cli && pnpm build

# Web repo
cd code-insights-web && pnpm build && pnpm lint
```

**If ANY check fails:** Fix before creating PR. Never rely on CI.

---

## Triple-Layer Code Review (MANDATORY)

All PRs go through multi-layer review:

### Phase 1: Parallel Independent Reviews (No Cross-Contamination)

| Role | Reviewer | Focus |
|------|----------|-------|
| **INSIDER** | `technical-architect` | Type alignment, Firestore contract, cross-repo impact, patterns |
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

### ⛔ CRITICAL: Agents NEVER Merge PRs

```
❌ FORBIDDEN: gh pr merge (or any merge command)
✅ CORRECT: Report "PR #XX is ready for merge" and STOP
```

**Only the founder merges PRs.** This is enforced by hookify rule `block-pr-merge`.

---

## Document Ownership & Delegation

Orchestrator MUST NOT directly edit documents it doesn't own. Always delegate.

| Document Type | Owner Agent | Action |
|---------------|------------|--------|
| `CLAUDE.md` | **Orchestrator** | Direct edit allowed |
| CLI code (`cli/src/`) | `fullstack-engineer` | Delegate to fullstack engineer |
| Web code (`code-insights-web/src/`) | `fullstack-engineer` | Delegate to fullstack engineer |
| Type alignment decisions | `technical-architect` | Delegate to TA |
| Architecture docs (`docs/`) | `technical-architect` | Delegate to TA |
| UX specs (`docs/ux/`) | `ux-designer` | Delegate to UX designer |
| Task tracking, sprints | `product-manager` | Delegate to PM |
| Journey chronicle (`docs/chronicle/`) | `journey-chronicler` | Delegate to chronicler |
| PR creation | Dev agent (whoever implemented) | Agent creates PR |

**Why delegation matters:** Each agent has git hygiene rules — they commit AND push immediately. Orchestrator editing code directly bypasses these safeguards.

---

## Branch Discipline (CRITICAL)

`main` is protected. Only receives commits via merged PRs.

**Rules for ALL agents:**

```bash
# BEFORE ANY COMMIT:
git branch  # Must show feature branch, NOT main

# If on main → STOP:
git checkout -b feature/description

# After EVERY commit:
git push origin $(git branch --show-current)  # Push IMMEDIATELY
```

**Branch naming:**
- `feature/description` (new functionality)
- `fix/description` (bug fixes)
- `docs/description` (documentation only)

**Pre-commit checklist (ALL agents):**
1. `git branch` — Am I on feature branch?
2. If on `main` → STOP, create feature branch
3. Commit to feature branch
4. Push immediately after commit

---

## Key Patterns

### Session Character Classification
Sessions are classified into one of 7 types based on tool call patterns:
- `deep_focus`, `bug_hunt`, `feature_build`, `exploration`, `refactor`, `learning`, `quick_task`

### Title Generation
Multi-tier fallback: Claude summary → user message (scored) → character-based → generic fallback.

### Firebase Integration
- CLI uses Admin SDK with service account credentials
- Batch writes capped at 500 operations per batch
- Incremental sync tracks file modification times in ~/.code-insights/sync-state.json
- Project IDs derived from git remote URLs (stable across devices) with path-hash fallback

### Configuration
- Config stored at `~/.code-insights/config.json` (mode 0o600)
- Sync state at `~/.code-insights/sync-state.json`
- Device ID at `~/.code-insights/device-id`

### Hook Integration
- `install-hook` modifies `~/.claude/settings.json` to add a Stop hook
- Hook runs `code-insights sync -q` automatically when Claude Code sessions end

### Types
Key types defined in `/cli/src/types.ts`:
- `ClaudeMessage` - Individual JSONL message entry
- `ParsedSession` - Aggregated session with metadata, title, character
- `Insight` - Types: summary | decision | learning | technique | prompt_quality; source: 'llm'
- `SessionCharacter` - 7 session classifications
- `ClaudeInsightConfig` - Firebase + optional Gemini + sync config
- `SyncState` - File modification tracking for incremental sync

## Tech Stack

- **Runtime**: Node.js (ES2022, ES Modules)
- **CLI Framework**: Commander.js
- **Firebase**: Admin SDK (^13.4.0) for Firestore writes
- **UI**: Chalk (^5.4.1) for colors, Ora (^8.2.0) for spinners
- **Prompts**: Inquirer (^12.6.1) for interactive setup
- **Utilities**: date-fns, uuid

## Hookify Rules

| Rule | Type | Purpose |
|------|------|---------|
| `block-pr-merge` | **block** | Agents never merge PRs — founder only |
| `branch-discipline` | warn | Dev agents verify feature branch before coding |
| `cross-repo-type-sync` | warn | Flag type changes that affect both repos |
| `cli-binary-name` | warn | Prevent using `claudeinsight` instead of `code-insights` |
| `agent-parallel-warning` | warn | Verify no dependencies before parallelizing agents |
| `no-jira` | **block** | Prevent Jira/Atlassian API calls — use GitHub Issues instead |

## Development Notes

- TypeScript strict mode enabled
- ES Modules (`import`/`export`, not `require`)
- No test framework configured yet
- No ESLint config file in CLI directory (lint script exists but needs config)
- pnpm is the package manager
- Dashboard URL: `https://code-insights.app`
- CLI binary is `code-insights`
