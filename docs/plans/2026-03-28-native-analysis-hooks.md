# Native Analysis via Claude Code Hooks

**Date:** 2026-03-28
**Status:** Approved for implementation
**Target Version:** v4.8.0 (Phase 12)
**Estimated PRs:** 5-6

---

## Problem Statement

Code Insights requires a separately configured LLM API key (OpenAI, Anthropic, Gemini, or Ollama) to generate session insights and prompt quality analysis. This is the single biggest adoption friction: users install, sync, see the dashboard, then hit a wall when they want AI-powered analysis.

Every Claude Code user already has a Claude subscription that can run LLM inference. By leveraging Claude Code's `SessionEnd` hook and `claude -p` non-interactive mode, we can analyze sessions at zero incremental cost using the tool that created them.

---

## Solution Overview

A unified `code-insights insights` CLI command that works in two modes:

| Mode | Flag | LLM Backend | Trigger |
|------|------|-------------|---------|
| **Native** | `--native` | `claude -p` (user's Claude subscription) | SessionEnd hook or manual CLI |
| **Provider** | (default) | Configured LLM (OpenAI/Anthropic/Gemini/Ollama) | Manual CLI, dashboard, or API |

Both modes produce identical output, use the same prompt builders, the same response parsers, and the same SQLite write path.

---

## High-Level Design (HLD)

### Architecture

```
                  +-----------------------------------------+
                  |       Claude Code Session               |
                  +-------------------+---------------------+
                                      | SessionEnd event
                                      | stdin: { session_id, transcript_path }
                                      v
                  +-----------------------------------------+
                  |  code-insights insights                  |
                  |    --hook --native -q                    |
                  +-------------------+---------------------+
                                      |
                    +-----------------+-----------------+
                    v                                   v
            syncSingleFile()                 Check: already analyzed
            (targeted sync)                  with same message_count?
                    |                            |yes -> exit 0
                    |                            |no
                    v                            v
            +----------------------------------------------+
            |    Shared Prompt Builders                     |
            |  (cli/src/analysis/prompts.ts)                |
            +-------------------+--------------------------+
                                |
              +-----------------+-----------------+
              v                                   v
    +---------------------+           +---------------------+
    |  Native Runner       |           |  Provider Runner    |
    |  claude -p           |           |  LLM abstraction    |
    |  --json-schema       |           |  (existing)         |
    +---------+-----------+           +---------+-----------+
              |                                   |
              v                                   v
    +------------------------------------------------------+
    |    Shared Response Parsers + DB Write                  |
    |    (DELETE+INSERT transaction, upsert)                 |
    +------------------------------------------------------+
```

### Key Design Principles (SOLID)

1. **Single Responsibility**: `insights` command orchestrates; `NativeRunner` handles `claude -p`; `ProviderRunner` handles LLM abstraction; prompt builders build prompts; parsers parse responses.
2. **Open/Closed**: Adding a new native runner (e.g., Cursor CLI) means implementing an `AnalysisRunner` interface, not modifying existing code.
3. **Liskov Substitution**: Both runners produce the same `AnalysisResponse` / `PromptQualityResponse` types -- callers don't care which runner was used.
4. **Interface Segregation**: The `AnalysisRunner` interface is minimal: `runAnalysis(params) -> result`.
5. **Dependency Inversion**: The `insights` command depends on abstractions (runner interface), not on `claude -p` directly.

### Runner Interface

```typescript
interface AnalysisRunner {
  readonly name: string;                        // e.g. 'claude-code-native', 'anthropic'
  runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult>;
}

interface RunAnalysisParams {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema?: object;          // For native mode (claude -p --json-schema)
}

interface RunAnalysisResult {
  rawJson: string;              // Raw JSON response
  durationMs: number;
  // Native mode: tokens are 0 (counted in session)
  // Provider mode: actual token counts
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model: string;
  provider: string;
}
```

### Data Flow -- Native Mode Detail

```
1. SessionEnd hook fires
   stdin: { session_id: "abc", transcript_path: "/path/to.jsonl", cwd: "/project" }

2. code-insights insights --hook --native -q
   a. Parse stdin JSON -> extract session_id, transcript_path
   b. syncSingleFile(transcript_path, session_id)
      - Parse JSONL using ClaudeCodeProvider
      - Upsert session + messages to SQLite
      - ~50-200ms

3. Resume detection
   - Query analysis_usage for session_message_count where session_id and analysis_type='session'
   - Load current message count from sessions table
   - If counts match -> exit 0 (already analyzed at this state)
   - If different or no record -> proceed with analysis

4. Session Analysis (call 1 of 2)
   a. Load session + messages from SQLite
   b. Build prompt: buildSessionAnalysisInstructions() + formatConversation()
   c. Write system prompt to temp file
   d. Execute: claude -p --output-format json
               --json-schema <path>/session-analysis.json
               --append-system-prompt-file /tmp/ci-XXXX.txt
               --bare
               (conversation piped via stdin)
   e. Parse JSON response -> AnalysisResponse
   f. Save: DELETE existing insights + INSERT new (transaction)
   g. Save facets: INSERT OR REPLACE into session_facets
   h. Save usage: INSERT OR REPLACE into analysis_usage
      (provider='claude-code-native', tokens=0, cost=0)
   i. ~5-15s

5. Prompt Quality Analysis (call 2 of 2)
   a. Build prompt: buildPromptQualityInstructions() + formatHumanMessages()
   b. Same claude -p execution pattern
   c. Parse -> PromptQualityResponse
   d. Save insights (type='prompt_quality') + usage
   e. ~5-15s

6. Print summary (unless -q):
   [Code Insights] Session analyzed: 4 insights, PQ 72/100

7. Exit 0
```

---

## Low-Level Design (LLD)

### 1. New CLI Command: `insights`

**File:** `cli/src/commands/insights.ts`

```
code-insights insights <session_id> [options]

Options:
  --native         Use calling AI tool (claude -p) instead of configured LLM
  --hook           Read session context from stdin (for hook invocation)
  --source <tool>  Source tool identifier (default: claude-code)
  --force          Re-analyze even if insights already exist
  --quiet, -q      Suppress output
```

**Behavior matrix:**

| Invocation | session_id source | Runner | Sync behavior |
|-----------|-------------------|--------|---------------|
| `--hook --native` | stdin JSON | NativeRunner | syncSingleFile from transcript_path |
| `--hook` (no native) | stdin JSON | ProviderRunner | syncSingleFile from transcript_path |
| `<session_id> --native` | positional arg | NativeRunner | no sync (assume already synced) |
| `<session_id>` | positional arg | ProviderRunner | no sync (assume already synced) |

### 2. Prompt Sharing -- File Migration

Move pure prompt/parser modules from `server/src/llm/` to `cli/src/analysis/`:

| File | From | To | Reason |
|------|------|----|--------|
| `prompt-types.ts` | `server/src/llm/` | `cli/src/analysis/` | Types -- no server deps |
| `prompt-constants.ts` | `server/src/llm/` | `cli/src/analysis/` | Constants -- no server deps |
| `prompts.ts` | `server/src/llm/` | `cli/src/analysis/` | Prompt builders -- pure functions |
| `message-format.ts` | `server/src/llm/` | `cli/src/analysis/` | Message formatting -- pure function |
| `response-parsers.ts` | `server/src/llm/` | `cli/src/analysis/` | JSON extraction/repair -- pure function |
| `normalize-utils.ts` | `server/src/llm/` | `cli/src/analysis/` | Shared normalization infra |
| `friction-normalize.ts` | `server/src/llm/` | `cli/src/analysis/` | Friction normalizer |
| `pattern-normalize.ts` | `server/src/llm/` | `cli/src/analysis/` | Pattern normalizer |
| `prompt-quality-normalize.ts` | `server/src/llm/` | `cli/src/analysis/` | PQ normalizer |

Server re-exports (backward compatible):
```typescript
// server/src/llm/prompt-types.ts (becomes re-export)
export type {
  AnalysisResponse,
  PromptQualityResponse,
  SQLiteMessageRow,
  // ... all types
} from '@code-insights/cli/analysis/prompt-types';
```

**New CLI package.json exports:**
```json
{
  "./analysis/prompts": "./dist/analysis/prompts.js",
  "./analysis/prompt-types": "./dist/analysis/prompt-types.js",
  "./analysis/prompt-constants": "./dist/analysis/prompt-constants.js",
  "./analysis/message-format": "./dist/analysis/message-format.js",
  "./analysis/response-parsers": "./dist/analysis/response-parsers.js",
  "./analysis/normalize-utils": "./dist/analysis/normalize-utils.js",
  "./analysis/friction-normalize": "./dist/analysis/friction-normalize.js",
  "./analysis/pattern-normalize": "./dist/analysis/pattern-normalize.js",
  "./analysis/prompt-quality-normalize": "./dist/analysis/prompt-quality-normalize.js",
  "./analysis/schemas/session-analysis.json": "./dist/analysis/schemas/session-analysis.json",
  "./analysis/schemas/prompt-quality.json": "./dist/analysis/schemas/prompt-quality.json"
}
```

### 3. Native Runner

**File:** `cli/src/analysis/native-runner.ts`

Uses `execFileSync` (NOT `exec`) to avoid shell injection. The `claude` CLI is invoked with
array arguments, and conversation text is piped via stdin buffer.

```typescript
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AnalysisRunner, RunAnalysisParams, RunAnalysisResult } from './runner-types.js';

export class ClaudeNativeRunner implements AnalysisRunner {
  readonly name = 'claude-code-native';

  /** Validate claude CLI is available. Throws if not found. */
  static validate(): void {
    try {
      execFileSync('claude', ['--version'], { stdio: 'pipe' });
    } catch {
      throw new Error(
        'claude CLI not found in PATH. --native requires Claude Code to be installed.'
      );
    }
  }

  async runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult> {
    const start = Date.now();

    // Write system prompt to temp file
    const promptFile = join(tmpdir(), `ci-prompt-${Date.now()}.txt`);
    writeFileSync(promptFile, params.systemPrompt);

    // Write JSON schema to temp file (if provided)
    let schemaFile: string | undefined;
    if (params.jsonSchema) {
      schemaFile = join(tmpdir(), `ci-schema-${Date.now()}.json`);
      writeFileSync(schemaFile, JSON.stringify(params.jsonSchema));
    }

    try {
      const args = [
        '-p',
        '--output-format', 'json',
        '--append-system-prompt-file', promptFile,
        '--bare',
      ];
      if (schemaFile) {
        args.push('--json-schema', schemaFile);
      }

      const result = execFileSync('claude', args, {
        input: params.userPrompt,
        encoding: 'utf-8',
        timeout: 120_000,  // 2 minute timeout per call
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      return {
        rawJson: result,
        durationMs: Date.now() - start,
        inputTokens: 0,    // Counted in session's overall tokens
        outputTokens: 0,
        model: 'claude-native',
        provider: 'claude-code-native',
      };
    } finally {
      // Clean up temp files
      try { unlinkSync(promptFile); } catch { /* ignore */ }
      if (schemaFile) try { unlinkSync(schemaFile); } catch { /* ignore */ }
    }
  }
}
```

### 4. JSON Schema Files

**File:** `cli/src/analysis/schemas/session-analysis.json`

Hand-maintained, flat JSON Schema derived from `AnalysisResponse` type. Validated against TypeScript types in tests.

**File:** `cli/src/analysis/schemas/prompt-quality.json`

Hand-maintained, flat JSON Schema derived from `PromptQualityResponse` type.

**Test validation:** `cli/src/analysis/schemas/__tests__/schema-sync.test.ts` -- ensures JSON schema properties match TypeScript interface fields. Fails in CI if they diverge.

### 5. Targeted Sync: `syncSingleFile()`

**File:** `cli/src/commands/sync.ts` (new export)

```typescript
/**
 * Sync a single session file to SQLite.
 * Used by the insights --hook path to guarantee fresh data before analysis.
 * Much faster than full sync (no directory scanning, no other providers).
 */
export async function syncSingleFile(
  transcriptPath: string,
  sessionId: string,
  sourceTool: string = 'claude-code'
): Promise<void> {
  const provider = getProvider(sourceTool);
  const session = await provider.parse(transcriptPath);
  if (!session) return;
  // Upsert to SQLite (same as full sync, but for one file)
  upsertSession(session);
  upsertMessages(session.messages);
}
```

### 6. Schema V8 Migration

**File:** `cli/src/db/migrate.ts`

```sql
-- V8: Add session_message_count to analysis_usage for resume detection
ALTER TABLE analysis_usage ADD COLUMN session_message_count INTEGER;
```

This column stores the session's message count at the time of analysis. On re-invocation, if the count hasn't changed, analysis is skipped.

### 7. Hook Installation Update

**File:** `cli/src/commands/install-hook.ts`

Update `installHookCommand()` to install both hooks:

```typescript
// Existing Stop hook (sync)
const stopHook: HookConfig = {
  hooks: [{ type: 'command', command: `node ${cliPath} sync -q` }],
};

// New SessionEnd hook (analysis)
const sessionEndHook: HookConfig = {
  hooks: [{
    type: 'command',
    command: `node ${cliPath} insights --hook --native -q`,
    timeout: 120000,  // 2 minutes
  }],
};
```

Update `uninstallHookCommand()` to clean both `Stop` and `SessionEnd` hooks.

Add `--sync-only` and `--analysis-only` flags for granular control.

### 8. Backfill / Recovery: `check-unanalyzed`

**File:** `cli/src/commands/insights.ts` (subcommand)

```
code-insights insights check [options]
  --days <n>       Lookback window (default: 7)
  --quiet, -q      Machine-readable output (just count)
```

Called from a `SessionStart` hook (optional) or manually. Queries SQLite for sessions in the last N days that lack analysis (LEFT JOIN analysis_usage WHERE analysis_type IS NULL).

**Behavior by count:**
- 0: silent exit
- 1-2: auto-analyze inline (calls `insights <id> --native` for each)
- 3+: print suggestion message + count

### 9. Dashboard Changes

**Updated `LlmNudgeBanner`**: Claude Code hook as primary CTA, API key as secondary.

**Analysis provenance**: Subtle "Analyzed via Claude Code" line on session detail when `provider = 'claude-code-native'`.

**No new pages, no new routes, no API changes.** The dashboard reads from the same `insights`, `session_facets`, and `prompt_quality` data regardless of how it was generated.

---

## Session Resume Handling

| Scenario | Behavior |
|----------|----------|
| Session ends, analyzed, never resumed | Normal -- analysis is final |
| Session ends, analyzed, resumed, ends again | SessionEnd fires again -> insights command detects message_count changed -> re-analyzes (upsert) |
| Session ends, analyzed, resumed, user runs `insights --force` | Force re-analysis regardless of message count |
| Hook fails mid-analysis | Session shows as "Not analyzed" -- recovered on next SessionEnd or manual invocation |

---

## Cost Tracking for Native Mode

- `provider`: `'claude-code-native'`
- `model`: `'claude-native'` (we don't know the exact model claude -p uses)
- `input_tokens`: `0`
- `output_tokens`: `0`
- `estimated_cost_usd`: `0`
- `session_message_count`: actual count at time of analysis
- `duration_ms`: wall-clock time of `claude -p` call

Rationale: Token usage is counted as part of the overall Claude Code session. Code Insights does not incur separate cost.

---

## Files Impacted

### New Files
| File | Purpose |
|------|---------|
| `cli/src/commands/insights.ts` | New `insights` CLI command |
| `cli/src/analysis/runner-types.ts` | `AnalysisRunner` interface |
| `cli/src/analysis/native-runner.ts` | `ClaudeNativeRunner` implementation |
| `cli/src/analysis/provider-runner.ts` | `ProviderRunner` wrapping existing LLM client |
| `cli/src/analysis/schemas/session-analysis.json` | JSON schema for `claude -p` |
| `cli/src/analysis/schemas/prompt-quality.json` | JSON schema for `claude -p` |
| `cli/src/analysis/schemas/__tests__/schema-sync.test.ts` | Schema <-> TypeScript sync validation |

### Moved Files (server -> cli, server re-exports)
| File | Notes |
|------|-------|
| `prompt-types.ts` | Types -- zero server deps |
| `prompt-constants.ts` | Classification guidance strings |
| `prompts.ts` | Prompt builders -- pure functions |
| `message-format.ts` | Message formatting |
| `response-parsers.ts` | JSON extraction/repair |
| `normalize-utils.ts` | Levenshtein matching |
| `friction-normalize.ts` | Friction normalizer |
| `pattern-normalize.ts` | Pattern normalizer |
| `prompt-quality-normalize.ts` | PQ normalizer |

### Modified Files
| File | Change |
|------|--------|
| `cli/src/index.ts` | Register `insights` command |
| `cli/src/commands/install-hook.ts` | Add SessionEnd hook, --sync-only/--analysis-only flags |
| `cli/src/commands/sync.ts` | Export `syncSingleFile()` |
| `cli/src/db/migrate.ts` | V8 migration (session_message_count column) |
| `cli/package.json` | New exports for `./analysis/*` |
| `server/src/llm/*.ts` (9 files) | Convert to re-exports from `@code-insights/cli/analysis/*` |
| `dashboard/src/components/empty-states/LlmNudgeBanner.tsx` | Updated CTA (hook as primary) |
| `server/src/routes/analysis.ts` | Minimal -- add provenance display support |

### Documentation Updates
| File | Change |
|------|--------|
| `CLAUDE.md` | Add `insights` command to Commands section |
| `docs/ARCHITECTURE.md` | Add `cli/src/analysis/` to repo structure, runner interface diagram |
| `docs/ROADMAP.md` | Add Phase 12, version milestone v4.8.0 |
| `docs/PRODUCT.md` | Add native analysis to features list |
| `docs/DEVELOPMENT.md` | Add hook testing notes |
| `README.md` | Update features section, add hook install to quickstart |

---

## Implementation Plan -- GitHub Issues

### Issue 1: Prompt Module Migration (server -> cli)
**Labels:** `refactor`, `foundation`
**Depends on:** nothing
**PR scope:**
- Move 9 prompt/parser/normalizer files from `server/src/llm/` to `cli/src/analysis/`
- Add CLI package.json exports for `./analysis/*`
- Convert server files to re-exports
- Update all server imports
- Ensure all existing tests pass (server tests import from re-exports)
- No functional changes -- pure refactor

### Issue 2: Runner Interface + Native Runner
**Labels:** `feature`, `core`
**Depends on:** Issue 1
**PR scope:**
- Create `runner-types.ts` (AnalysisRunner interface)
- Create `native-runner.ts` (ClaudeNativeRunner using execFileSync for safety)
- Create `provider-runner.ts` (ProviderRunner -- wraps existing LLM client)
- Hand-maintain JSON schema files for session-analysis and prompt-quality
- Schema sync test (JSON schema <-> TypeScript types)
- Unit tests for both runners

### Issue 3: `insights` CLI Command
**Labels:** `feature`, `core`
**Depends on:** Issue 1, Issue 2
**PR scope:**
- Create `cli/src/commands/insights.ts` with full flag support
- `--hook` mode (stdin JSON parsing)
- `--native` mode (delegates to ClaudeNativeRunner)
- Default mode (delegates to ProviderRunner)
- `--force` flag for re-analysis
- `--quiet` flag for hook usage
- `syncSingleFile()` implementation in sync.ts
- Resume detection (message_count comparison)
- V8 schema migration (session_message_count on analysis_usage)
- Register command in `cli/src/index.ts`
- Integration tests

### Issue 4: Hook Installation Update
**Labels:** `feature`, `ux`
**Depends on:** Issue 3
**PR scope:**
- Update `install-hook.ts` to install both Stop + SessionEnd hooks
- Add `--sync-only` and `--analysis-only` flags
- Update `uninstall-hook.ts` to clean both hook types
- Updated installation output messaging
- Telemetry events for hook type installed

### Issue 5: Backfill Check + Recovery
**Labels:** `feature`, `ux`
**Depends on:** Issue 3
**PR scope:**
- `code-insights insights check` subcommand
- 7-day lookback window query
- Auto-analyze threshold (1-2 sessions)
- Suggestion message for 3+ sessions
- Optional SessionStart hook for automatic check

### Issue 6: Dashboard + Docs Updates
**Labels:** `ui`, `docs`
**Depends on:** Issue 3
**PR scope:**
- Update `LlmNudgeBanner` with Claude Code hook as primary CTA
- Analysis provenance line ("Analyzed via Claude Code")
- Update CLAUDE.md, ARCHITECTURE.md, ROADMAP.md, PRODUCT.md, DEVELOPMENT.md
- Update README.md quickstart section

---

## Rollout Plan

1. **Issue 1** -- foundation refactor, zero risk, pure move
2. **Issue 2** -- runner abstraction, testable in isolation
3. **Issue 3** -- the core feature, end-to-end testable via `code-insights insights <id> --native`
4. **Issue 4** -- hook installation, makes it automatic
5. **Issue 5** -- recovery mechanism, polish
6. **Issue 6** -- dashboard updates, docs, release prep

Version bump to **v4.8.0** after Issue 6 merges.

---

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | NativeRunner, ProviderRunner | Mock execFileSync / LLM client |
| Unit | JSON schema <-> TypeScript sync | Structural comparison test |
| Unit | Resume detection logic | SQLite fixture with known message counts |
| Integration | `insights` command end-to-end | Test session in SQLite + mock `claude -p` |
| Integration | `install-hook` writes correct JSON | Read back settings.json, validate structure |
| Manual | Full flow with real Claude Code | Run a session, exit, verify insights appear |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `claude -p` output format changes | Analysis breaks silently | JSON schema validation + response parser error handling |
| `claude -p` not available (old Claude Code) | Hook fails | Validate claude CLI at command start, clear error message |
| Large sessions timeout (>2min) | Partial analysis | 120s timeout, fallback to manual analysis from dashboard |
| Prompt file migration breaks server imports | Build failure | Re-export pattern preserves all public APIs, CI catches breaks |
| Session resume produces duplicate insights | Stale data | Upsert (DELETE+INSERT), message_count comparison |

---

## Non-Goals

- **Cursor native runner** -- designed for, not implemented. `AnalysisRunner` interface ready.
- **Streaming progress in native mode** -- `claude -p` is batch, not streaming. Dashboard analysis can still stream via API.
- **Token counting in native mode** -- tokens are part of the Claude subscription, not tracked separately.
- **Dashboard setup wizard** -- CLI is the config surface. Dashboard views data only.
- **Prompt version in dashboard** -- implementation detail, not user-facing.
