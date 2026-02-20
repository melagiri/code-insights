# Multi-Tool Vision: Beyond Claude Code

> Expanding Code Insights to capture sessions from all AI coding tools.

---

## Motivation

Code Insights was built to capture insights from Claude Code sessions. But developers increasingly use multiple AI coding tools — sometimes within the same project. The conversation data from these tools is trapped in proprietary formats, scattered across different locations, and inaccessible for reflection.

**The opportunity:** Become the universal session insights layer for AI-assisted development, regardless of which tool generated the conversation.

## Target Tools

| Tool | Type | Storage Format | Local? | Feasibility |
|------|------|---------------|--------|-------------|
| Claude Code | CLI | JSONL | Yes | **Already supported** |
| Cursor | IDE (VS Code fork) | SQLite + JSON blobs | Yes | **High** (Phase 1) |
| OpenAI Codex CLI | CLI | JSONL | Yes | **High** (Phase 2) |
| GitHub Copilot | VS Code extension | JSON in workspaceStorage | Yes | **Medium-Low** (Phase 3) |
| Gemini CLI | CLI | TBD (investigate) | TBD | **Unknown** (Phase 4) |

---

## How Each Tool Stores Conversations

### Claude Code (Current)

- **Location**: `~/.claude/projects/<encoded-project-path>/<session-id>.jsonl`
- **Format**: JSONL — one JSON object per line, append-only
- **Entry types**: `user`, `assistant`, `system`, `summary`
- **Key fields**: `uuid`, `type`, `message.content`, `timestamp`, `cwd`, `gitBranch`, `version`
- **Session discovery**: Walk `~/.claude/projects/` directories, each `.jsonl` file is one session
- **Platform paths**:
  - macOS/Linux: `~/.claude/projects/`
  - Windows: `%USERPROFILE%\.claude\projects\`

### Cursor

- **Location**: SQLite databases (`state.vscdb`) in two locations:
  - Global: `<cursor-data-dir>/globalStorage/state.vscdb`
  - Per-workspace: `<cursor-data-dir>/workspaceStorage/<hash>/state.vscdb`
- **Platform-specific data directory**:
  - macOS: `~/Library/Application Support/Cursor/User/`
  - Linux: `~/.config/Cursor/User/`
  - Windows: `%APPDATA%\Cursor\User\`
- **Format**: SQLite key-value table (`ItemTable`) with JSON blobs as values
- **Key DB keys**:
  - `composer.composerData` — primary chat list (v3 format)
  - `composerData:<composerId>` — individual conversation data
  - `workbench.panel.aichat.view.aichat.chatdata` — legacy chat storage
- **Message schema** (composerData v3):
  ```json
  {
    "bubbleId": "uuid",
    "type": 2,
    "createdAt": "ISO timestamp",
    "text": "message content",
    "codeBlocks": [...],
    "toolFormerData": {...},
    "thinking": {...}
  }
  ```
  - `type: 1` = user message, `type: 2` = assistant response
- **Challenges**:
  - Schema is undocumented, has changed across versions (v1 → v3)
  - Must open SQLite in read-only mode while Cursor is running
  - Workspace hash directories require resolution to actual project paths
- **Community tools**: [cursor-view](https://github.com/saharmor/cursor-view), [cursor-db-mcp](https://github.com/jbdamask/cursor-db-mcp), [cursor-conversations-mcp](https://www.pulsemcp.com/servers/cursor-chat-history)

### OpenAI Codex CLI

- **Location**: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
- **Format**: JSONL — event-based stream, append-only
- **Event types**: `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, `error`
- **Key fields**: Per-turn token counts (input, cached, output, reasoning), model info
- **Session discovery**: Walk `~/.codex/sessions/` by date directories
- **Resume**: `codex resume --all` lists all sessions
- **Challenges**:
  - Event schema not fully documented publicly
  - Rollout format may differ between CLI and VS Code extension versions
- **Community tools**: [ccusage](https://github.com/ryoppippi/ccusage) (token tracking), [ccmanager](https://github.com/kbwo/ccmanager) (session management)

### GitHub Copilot

- **Location**: VS Code's internal workspace storage
  - macOS: `~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/*.json`
  - Linux: `~/.config/Code/User/workspaceStorage/<hash>/chatSessions/*.json`
  - Windows: `%APPDATA%\Code\User\workspaceStorage/<hash>/chatSessions/*.json`
- **Format**: JSON files per workspace
- **Challenges**:
  - Schema is not publicly documented and varies across extension versions
  - Workspace directories use opaque hashes (need to discover/map to project paths)
  - No native export CLI — only VS Code command palette (`Chat: Export Session...`)
  - Agent mode sessions may use different storage than regular chat
  - GitHub has been asked repeatedly for better history/export — still limited
- **Workarounds**: Third-party extensions like SpecStory auto-save to `.specstory/` directories

---

## Architecture: Provider Abstraction

The CLI needs a **provider abstraction** — a common interface that each tool's parser implements:

```
┌──────────────────────────────────────────────────────────┐
│                    CLI Pipeline                           │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │  Discovery   │───▶│   Parser     │───▶│  Sync to   │  │
│  │  (find files)│    │  (normalize) │    │  Firestore │  │
│  └─────────────┘    └──────────────┘    └────────────┘  │
│         │                  │                              │
│         ▼                  ▼                              │
│  ┌─────────────────────────────────┐                     │
│  │      Provider Interface         │                     │
│  │                                 │                     │
│  │  discover() → FilePath[]        │                     │
│  │  parse(file) → ParsedSession    │                     │
│  │  getProviderName() → string     │                     │
│  └─────────────────────────────────┘                     │
│         ▲         ▲         ▲                            │
│  ┌──────┴──┐ ┌────┴────┐ ┌─┴───────┐                    │
│  │ Claude  │ │ Cursor  │ │ Codex   │  ...                │
│  │Provider │ │Provider │ │Provider │                     │
│  └─────────┘ └─────────┘ └─────────┘                    │
└──────────────────────────────────────────────────────────┘
```

Each provider must normalize its native format into the existing `ParsedSession` and `ParsedMessage` types. This means mapping tool-specific concepts to our schema:

| Our Field | Claude Code | Cursor | Codex CLI | Copilot |
|-----------|-------------|--------|-----------|---------|
| `sessionId` | Filename UUID | composerId | Rollout filename | Chat session JSON name |
| `type` (user/assistant) | `entry.type` | `bubble.type` (1/2) | Event payloads | TBD |
| `content` | `message.content` | `bubble.text` | Event item text | TBD |
| `toolCalls` | `tool_use` content parts | `toolFormerData` | Tool events | TBD |
| `timestamp` | `entry.timestamp` | `bubble.createdAt` | Event timestamp | TBD |
| `projectPath` | Encoded in directory name | Workspace hash → resolve | CWD from thread.started | Workspace hash → resolve |

### New Firestore Fields

To track multi-tool sessions, add to the `sessions` collection:

```typescript
{
  // ... existing fields ...
  source: 'claude-code' | 'cursor' | 'codex-cli' | 'copilot'  // NEW
  sourceVersion?: string  // e.g., "cursor-0.49", "codex-1.2.0"
}
```

---

## Platform Support

### Current State

The CLI currently works on **macOS** and should work on **Linux** without changes. **Windows has bugs** that need fixing before multi-tool support:

| Issue | File | Problem |
|-------|------|---------|
| `process.env.HOME` assumption | `device.ts:7`, `reset.ts:9` | `HOME` not set on Windows; should use `os.homedir()` |
| Hardcoded `/` path separator | `jsonl.ts:206` | `filePath.split('/')` fails on Windows `\` paths |
| Unix path decoding | `jsonl.ts:216-224` | Assumes `-Users-name-path` format; Windows uses `C:\Users\...` |
| `config.ts` | (correct) | Already uses `os.homedir()` — inconsistency, not design |

### Required Fixes (Pre-Requisite for Multi-Tool)

1. Replace all `process.env.HOME` with `os.homedir()`
2. Use `path.sep` or `path.basename()` instead of hardcoded `/`
3. Make project path decoding platform-aware
4. Test on Windows (WSL at minimum)

### Platform Path Matrix (All Tools)

| Tool | macOS | Linux | Windows |
|------|-------|-------|---------|
| Claude Code | `~/.claude/projects/` | `~/.claude/projects/` | `%USERPROFILE%\.claude\projects\` |
| Cursor | `~/Library/Application Support/Cursor/User/` | `~/.config/Cursor/User/` | `%APPDATA%\Cursor\User\` |
| Codex CLI | `~/.codex/sessions/` | `~/.codex/sessions/` | `%USERPROFILE%\.codex\sessions\` |
| Copilot | `~/Library/Application Support/Code/User/` | `~/.config/Code/User/` | `%APPDATA%\Code\User\` |

---

## Phased Rollout

### Phase 1: Cursor Integration (Target first)

**Why first:** Largest user base among AI coding tools, data is locally accessible, community parsers exist as reference.

### Phase 2: Codex CLI

**Why second:** Lowest implementation effort — same JSONL philosophy as Claude Code. Date-organized, local-first, similar pipeline architecture.

**Effort estimate:** Parser reuse ~70% of existing Claude Code pipeline.

### Phase 3: GitHub Copilot

**Why third:** Wait for GitHub to improve their export/history story. In the meantime, consider supporting the SpecStory extension's `.specstory/` directory format as an interim solution.

### Phase 4: Gemini CLI + Others

**Why last:** Emerging tools, formats may still be changing. Revisit when they stabilize.

---

## Prior Art

Tools that already tackle multi-tool session parsing:

| Tool | Focus | Relevant For Us |
|------|-------|-----------------|
| [ccusage](https://github.com/ryoppippi/ccusage) | Token/cost tracking for Claude + Codex | Parser logic for JSONL formats |
| [cass](https://github.com/Dicklesworthstone/coding_agent_session_search) | Unified search across 11+ tools | Normalization patterns, tool discovery |
| [ccmanager](https://github.com/kbwo/ccmanager) | Session management for 7+ tools | Multi-tool session discovery |
| [cursor-view](https://github.com/saharmor/cursor-view) | Browse/export Cursor chat history | Cursor SQLite parsing |
| [cursor-db-mcp](https://github.com/jbdamask/cursor-db-mcp) | MCP server for Cursor chat history | Cursor key-value schema details |

---

## Impact on Vision

This changes the VISION.md "Non-Goals" section. Currently it says:

> **Not comprehensive** - Focus on Claude Code, not every AI tool

This would evolve to:

> **Tool-agnostic** - Capture insights from any AI coding tool that stores conversations locally

The core philosophy remains unchanged: your data, your infrastructure, your insights. Multi-tool support just means more data sources feeding the same privacy-first pipeline.

---

## Open Questions

1. **CLI naming**: The npm package is `@code-insights/cli`, not `claude-insights`. Already tool-agnostic in branding.
2. **Dashboard UX**: How to filter/visualize sessions from different tools? New filter? Color-coded by source?
3. **Hook integration**: Claude Code uses hooks for auto-sync. Cursor/Codex have no equivalent — need a watcher or cron-based approach?
4. **Session merging**: If a user works on the same project in both Claude Code and Cursor, should we detect and link related sessions?
5. **Title generation**: Current smart title algorithm is Claude-specific. Need tool-specific title generation strategies.
