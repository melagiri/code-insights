# Development Practices — Code Insights

> Development rules, branch discipline, and operational procedures. Linked from [CLAUDE.md](../CLAUDE.md).

---

## Pre-Action Verification (CRITICAL)

Before any state-modifying command (git checkout, git push, git tag, file edits), run a **read-only check** to verify current state:

- **Branch names:** Never assume `main` vs `master` — run `git symbolic-ref refs/remotes/origin/HEAD` to detect the default branch
- **File existence:** Read a file before editing it; `ls` a directory before writing to it
- **API signatures:** When calling an unfamiliar endpoint or tool, read the function signature or documentation first
- **Build context:** Before running build scripts, verify you're in the correct sub-directory (`pwd`) and on the correct branch (`git branch`)

This applies to both **planning** and **execution**.

---

## Retry Discipline

If a command or tool call fails twice on the same input, **STOP**. Do not retry a third time. Report the failure, state what was attempted, and propose an alternative approach.

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

## Hookify Rules

| Rule | Type | Purpose |
|------|------|---------|
| `block-pr-merge` | **block** | Agents never merge PRs — founder only |
| `block-local-merge-to-main` | **block** | Prevent `git merge` — all merges via GitHub PRs |
| `branch-discipline` | warn | Dev agents verify feature branch before coding |
| `agent-parallel-warning` | warn | Verify no dependencies before parallelizing agents |
| `no-jira` | **block** | Prevent Jira/Atlassian API calls — use GitHub Issues instead |
| `use-git-rm-for-tracked-files` | **block** | Enforce `git rm` over `rm` for source files |
| `review-before-pr` | warn | Remind: code review required before PR creation (bash path) |
| `review-before-pr-mcp` | warn | Remind: code review required before PR creation (MCP path) |
| `verify-before-checkout` | warn | Verify branch exists before `git checkout/switch` |
| `default-subagent-execution` | warn | Auto-answer: default to subagent-driven execution |
| `tdd-domain-check` | warn | On `git commit`, remind to include tests when touching TDD domains |

**Native PreToolUse hooks** (in `settings.json`, not hookify):

| Trigger | Purpose |
|---------|---------|
| `gh pr create` (Bash) | Run `pnpm build && pnpm test` — blocks PR creation on failure |
| `create_pull_request` (MCP) | Same CI gate for GitHub MCP tool path |

---

## TDD Strategy

Code Insights uses **strategic TDD** — test-first development applied surgically where it delivers the most value. Not everything needs tests; the domains that do are those where silent regressions cause the most damage.

### Domain Classification

| Level | Domain | Path | Coverage Target | Rationale |
|-------|--------|------|----------------|-----------|
| **MUST TDD** | Source providers (parsers) | `cli/src/providers/` | 90%+ | External file formats break silently — a provider regression corrupts sync |
| **MUST TDD** | Normalizers | `server/src/llm/*-normalize.ts` | 85%+ | 40+ alias mappings; a regression silently corrupts every user's insights |
| **MUST TDD** | Analysis pricing | `server/src/llm/analysis-pricing.ts` | 85%+ | Cost calculations are silent — wrong math silently under/overcharges users |
| **MUST TDD** | Response parsers | `server/src/llm/response-parsers.ts` | 85%+ | LLM output parsing failures corrupt stored insights silently |
| **MUST TDD** | Migrations | `cli/src/db/migrate.ts`, `schema.ts` | 90%+ | Schema changes are irreversible; bugs in migrations can corrupt the database |
| **MUST TDD** | Shared utilities | `server/src/utils.ts`, `cli/src/utils/` | 85%+ | Pure functions — trivial to test, used across the codebase |
| **SHOULD TDD** | API routes | `server/src/routes/` | 70%+ | High-value but SQLite coupling makes setup harder |
| **SKIP TDD** | Dashboard components | `dashboard/src/` | — | Visual, React-rendered — unit tests deliver low value here |
| **SKIP TDD** | CLI command wiring | `cli/src/commands/`, `cli/src/index.ts` | — | Integration-level; verify via manual sync runs |

### Test-First Workflow (MUST Domains)

When changing a MUST TDD domain:

1. **Write the failing test first** — before any implementation
2. **Run `pnpm test`** — new test should fail (proves it's testing the right thing)
3. **Implement until the test passes**
4. **Commit test + implementation together** — never split them across commits

### Test Patterns

| Domain | Pattern | Example file |
|--------|---------|-------------|
| Normalizers | Table-driven: iterate over `[input, expected]` pairs in one `it()` | `server/src/llm/friction-normalize.test.ts` |
| Parsers | Fixture-based: real JSONL content written to temp files | `cli/src/providers/__tests__/claude-code.test.ts` |
| Migrations | In-memory SQLite: `new Database(':memory:')` + `runMigrations(db)` | `cli/src/db/__tests__/migrate.test.ts` |
| Utilities | Unit tests: pure function input/output, edge cases | `server/src/utils.test.ts` |

### Running Tests

```bash
# From repo root — runs all packages
pnpm test

# Watch mode for active development
pnpm test:watch

# Coverage report
pnpm test:coverage
```

Test runner: **vitest** (native ESM support, fast, shared with all packages via root `package.json`).

---

## Version Bump Procedure

When bumping the version (patch, minor, or major):

1. **`cli/package.json`** — Update the `"version"` field
2. **`cli/CHANGELOG.md`** — Add a new `## [x.y.z] - YYYY-MM-DD` section at the top with changes
3. **Commit** — `chore: bump version to vX.Y.Z` with a one-line summary of what changed
4. **Publish** — `cd cli && npm publish` (runs `prepublishOnly` which builds all packages)

Files touched: `cli/package.json` + `cli/CHANGELOG.md` (minimum). Optionally update `docs/ROADMAP.md`, `docs/VISION.md`, `docs/PRODUCT.md` for minor/major bumps.

---

## Configuration

| File | Purpose |
|------|---------|
| `~/.code-insights/config.json` | User config (mode 0o600) |
| `~/.code-insights/sync-state.json` | File modification tracking for incremental sync |
| `~/.code-insights/device-id` | Stable device identifier |
| `~/.code-insights/data.db` | SQLite database |

### Hook Integration

- `install-hook` modifies `~/.claude/settings.json` to add a Stop hook
- Hook runs `code-insights sync -q` automatically when Claude Code sessions end

---

## Development Notes

- TypeScript strict mode enabled
- ES Modules (`import`/`export`, not `require`)
- Test framework: **vitest** — run `pnpm test` from repo root
- No ESLint config file in CLI directory (lint script exists but needs config)
- pnpm is the package manager (workspace monorepo)
- CLI binary is `code-insights`
- npm package is `@code-insights/cli`
