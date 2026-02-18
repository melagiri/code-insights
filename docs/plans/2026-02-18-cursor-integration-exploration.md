# Cursor Integration Exploration

> Deep-dive into integrating Cursor AI chat history into Code Insights.

**Date**: 2026-02-18
**Status**: Exploration / Research
**Parent**: `docs/MULTI-TOOL-VISION.md`

---

## Why Cursor First?

1. **Massive user base** — Cursor is one of the most popular AI coding tools
2. **Data is local and accessible** — SQLite databases on the user's machine
3. **Community tooling exists** — Multiple open-source projects already parse Cursor's data
4. **Rich conversation data** — Includes code blocks, tool calls, thinking traces

---

## Cursor Data Architecture

### Storage Locations

Cursor stores chat history in SQLite databases (`state.vscdb`):

| Location | Path (macOS) | Contains |
|----------|-------------|----------|
| **Global** | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` | App-wide chats (Composer, agent mode) |
| **Per-workspace** | `~/Library/Application Support/Cursor/User/workspaceStorage/<hash>/state.vscdb` | Workspace-scoped chats |

**Platform paths:**

| Platform | Base Directory |
|----------|---------------|
| macOS | `~/Library/Application Support/Cursor/User/` |
| Linux | `~/.config/Cursor/User/` |
| Windows | `%APPDATA%\Cursor\User\` |

### SQLite Schema

The `state.vscdb` files use a simple key-value table:

```sql
CREATE TABLE ItemTable (
  key TEXT PRIMARY KEY,
  value TEXT  -- JSON blob stored as text
);
```

### Relevant Keys

| Key | Format Version | Description |
|-----|---------------|-------------|
| `composer.composerData` | v3 (current) | Primary chat list — contains all Composer conversations |
| `composerData:<composerId>` | v3 | Individual conversation data |
| `workbench.panel.aichat.view.aichat.chatdata` | Legacy (v1/v2) | Older chat format — may still exist in some installations |
| `aiService.prompts` | N/A | Prompt history |
| `aiService.generations` | Older builds | Responses from older Cursor versions |

### composerData Schema (v3)

The `composer.composerData` key contains a JSON object:

```json
{
  "_v": 3,
  "allComposers": [
    {
      "composerId": "uuid",
      "createdAt": "ISO timestamp",
      "lastUpdatedAt": "ISO timestamp",
      "name": "conversation name or null",
      "latestConversationSummary": "summary text"
    }
  ]
}
```

Individual conversations at `composerData:<composerId>`:

```json
{
  "_v": 3,
  "conversation": [
    {
      "bubbleId": "uuid",
      "type": 1,
      "createdAt": "ISO timestamp",
      "text": "user's message",
      "codeBlocks": [],
      "toolFormerData": null,
      "thinking": null
    },
    {
      "bubbleId": "uuid",
      "type": 2,
      "createdAt": "ISO timestamp",
      "text": "assistant's response",
      "codeBlocks": [
        {
          "uri": "file:///path/to/file.ts",
          "content": "code content",
          "language": "typescript"
        }
      ],
      "toolFormerData": {
        "toolName": "edit_file",
        "input": {...},
        "output": {...}
      },
      "thinking": {
        "content": "thinking trace text"
      }
    }
  ]
}
```

**Message type mapping:**

| `type` value | Meaning |
|-------------|---------|
| 1 | User message |
| 2 | Assistant response |

### Workspace Hash Resolution

The `workspaceStorage/<hash>/` directories use VS Code-generated hashes. To resolve which hash maps to which project:

1. Each hash directory contains a `workspace.json` file
2. This file contains the workspace URI: `{"folder": "file:///Users/name/projects/myapp"}`
3. Parse the URI to get the project path

---

## Mapping to Code Insights Schema

### Session Mapping

| Code Insights Field | Cursor Source | Notes |
|--------------------|---------------|-------|
| `id` | `composerId` | UUID from Cursor |
| `projectId` | Derived from workspace path | Hash of git remote or path |
| `projectName` | Workspace directory name | From resolved workspace path |
| `projectPath` | Resolved from workspace hash | `workspace.json` → folder URI |
| `summary` | `latestConversationSummary` | Cursor provides this |
| `generatedTitle` | `name` field, or generate from first message | May need fallback logic |
| `startedAt` | `createdAt` of first bubble | |
| `endedAt` | `createdAt` of last bubble | |
| `messageCount` | Count of bubbles | |
| `userMessageCount` | Count of `type: 1` bubbles | |
| `assistantMessageCount` | Count of `type: 2` bubbles | |
| `toolCallCount` | Count of bubbles with `toolFormerData` | |
| `source` | `'cursor'` | **New field** |
| `sourceVersion` | Detect from `_v` field | e.g., `'cursor-v3'` |

### Message Mapping

| Code Insights Field | Cursor Source | Notes |
|--------------------|---------------|-------|
| `id` | `bubbleId` | UUID from Cursor |
| `sessionId` | Parent `composerId` | |
| `type` | `bubble.type` → map 1→'user', 2→'assistant' | |
| `content` | `bubble.text` | May need truncation to 10,000 chars |
| `toolCalls` | `bubble.toolFormerData` | Map to `{name, input}` format |
| `timestamp` | `bubble.createdAt` | Parse ISO timestamp |

### Fields That Don't Map Directly

| Code Insights Field | Status | Approach |
|--------------------|--------|----------|
| `gitBranch` | Not stored in Cursor data | Could detect from workspace git state at parse time |
| `claudeVersion` | N/A | Use `sourceVersion` instead |
| `deviceId` | Same device util | Reuse existing `getDeviceId()` |
| `sessionCharacter` | Not applicable | Either skip or adapt classification heuristics |
| `titleSource` | Different | Use `'cursor-name'` if name exists, generate otherwise |

---

## Technical Challenges

### 1. SQLite Read-Only Access

Cursor locks its SQLite databases while running. The parser must open in read-only mode:

```typescript
import Database from 'better-sqlite3';

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
```

**New dependency needed:** `better-sqlite3` (or `sql.js` for pure JS).

### 2. Schema Version Detection

The `_v` field in composerData indicates the schema version. Currently on v3, but has changed before (v1 → v2 → v3). The parser needs:

- Version detection from the `_v` field
- Version-specific parsing logic
- Graceful degradation for unknown versions (warn + skip, don't crash)

### 3. Workspace Hash Discovery

To map chats to projects, we need to:

1. Enumerate all directories in `workspaceStorage/`
2. Read `workspace.json` from each
3. Extract the folder URI
4. Match to projects

This is an additional discovery step that Claude Code doesn't need (project path is encoded in the directory name).

### 4. Global vs Workspace Storage

Cursor stores some conversations globally and some per-workspace. The parser needs to:

- Read both global and workspace-specific databases
- Deduplicate conversations that might appear in both
- Prefer workspace-specific data when available (has project context)

### 5. No Auto-Sync Hook

Claude Code has hooks (`Stop` event) that trigger auto-sync. Cursor has no equivalent. Options:

| Approach | Pros | Cons |
|----------|------|------|
| **Manual sync** (`code-insights sync --source cursor`) | Simple, explicit | User must remember to run |
| **File watcher** (watch `state.vscdb` for changes) | Real-time | Resource-heavy, complex |
| **Cron/scheduled** (e.g., launchd on macOS) | Set-and-forget | Platform-specific setup |
| **On Claude Code hook** (piggyback on existing hook) | Already works | Only syncs when Claude Code sessions end |

**Recommended:** Start with manual sync, add scheduled sync later.

### 6. Incremental Sync

Unlike JSONL (append-only, trackable by file modification time), SQLite databases are rewritten in place. Sync state tracking needs a different approach:

- Track last-seen `composerId` set and `lastUpdatedAt` timestamps
- On each sync, query for new or updated conversations
- Store sync state per-database (global + each workspace)

---

## Implementation Approach

### Phase 1: Read-Only Exploration (This Document)

- [x] Research Cursor storage format
- [x] Document schema and mapping
- [ ] Write a standalone script to dump Cursor chats (validation tool)
- [ ] Test on real Cursor data from user's machine

### Phase 2: Provider Interface

Refactor the CLI to support pluggable providers:

```typescript
interface SessionProvider {
  name: string;                    // 'claude-code' | 'cursor' | 'codex-cli'
  discover(): Promise<string[]>;   // Find session files/databases
  parse(source: string): Promise<ParsedSession[]>;  // Parse and normalize
  getSyncState(): ProviderSyncState;
  updateSyncState(state: ProviderSyncState): void;
}
```

### Phase 3: Cursor Provider Implementation

1. Add `better-sqlite3` dependency
2. Implement `CursorProvider` class
3. Platform-specific path resolution
4. Schema version detection + v3 parser
5. Workspace hash resolution
6. Sync state tracking for SQLite

### Phase 4: CLI Integration

- Add `--source` flag to `code-insights sync`: `code-insights sync --source cursor`
- Add `--source all` for syncing everything
- Add `code-insights status` to show per-provider session counts
- Update `code-insights connect` to configure Cursor path (if non-standard)

---

## New Dependencies

| Package | Purpose | Size | Alternative |
|---------|---------|------|-------------|
| `better-sqlite3` | SQLite3 access (native binding) | ~3MB | `sql.js` (pure WASM, ~1MB, no native deps) |

**Trade-off:** `better-sqlite3` is faster and more reliable but requires native compilation. `sql.js` is pure JavaScript/WASM and works everywhere without a C compiler. For a CLI tool that runs locally, `better-sqlite3` is the better choice.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cursor changes schema (v4) | Parser breaks | Version detection + graceful degradation |
| Cursor moves to cloud storage | Local data disappears | Monitor Cursor releases; add API-based provider later |
| SQLite locking issues | Sync fails while Cursor is open | Read-only mode + retry logic |
| Large databases (power users) | Slow parsing | Incremental sync, only parse new conversations |
| `better-sqlite3` build issues | Install fails on some systems | Offer `sql.js` fallback or prebuilt binaries |

---

## Validation Plan

Before building the full provider, validate with a standalone script:

1. Open the user's Cursor `state.vscdb` in read-only mode
2. List all keys matching `composer*`
3. Parse `composer.composerData` and dump conversation list
4. Parse one `composerData:<id>` and dump messages
5. Resolve one workspace hash to a project path
6. Confirm mapping to `ParsedSession`/`ParsedMessage` types works

This gives confidence before investing in the full implementation.

---

## Open Questions

1. **Cursor Composer vs Chat**: Cursor has both a "Chat" panel and "Composer" (agent mode). Are they stored differently? Do we want to capture both?
2. **Code blocks**: Cursor stores full code block content. Do we want to preserve this in our schema or just track tool call names?
3. **Thinking traces**: Cursor stores thinking/reasoning traces. Valuable for insights — should we add a field for this?
4. **Multi-model**: Cursor supports multiple AI models (GPT-4, Claude, etc.). Should we capture which model was used per session?
5. **Tab/file context**: Cursor captures which files were open/referenced. Worth storing for richer insights?
