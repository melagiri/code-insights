# Source Tool Format Analysis & Parser Gap Report

> Comprehensive audit of all 5 source tool providers, their raw data formats,
> parser correctness, and identified gaps. March 2026.

---

## Summary

| Tool | Sessions | Health | Critical Gaps |
|------|----------|--------|---------------|
| **Claude Code** | 128 | **Excellent** | None — fully functional |
| **Copilot (VS Code)** | 307 | **Good** | No token usage (expected), NULL models, NULL character |
| **Cursor** | 55 | **Moderate** | All projects = "global", 20% content as Lexical JSON, tool call URIs broken |
| **Codex CLI** | 9 | **Broken** | 0 assistant messages, 0 tool calls — parser written for old format |
| **Copilot CLI** | 2 | **Functional** | Timestamps collapse to file mtime, no token data, model not tracked |

---

## 1. Claude Code

### Format

- **File type:** JSONL (one JSON object per line)
- **Location:** `~/.claude/projects/**/*.jsonl`
- **Event types:** `user`, `assistant`, `system`, `progress`, `file-history-snapshot`

### Structure

```jsonl
{"type":"user","message":{"role":"human","content":[{"type":"text","text":"..."},{"type":"tool_result","tool_use_id":"...","content":"..."}]},"timestamp":"..."}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."},{"type":"thinking","thinking":"..."},{"type":"tool_use","id":"...","name":"...","input":{}}]},"costUSD":0.05,"usage":{"input_tokens":1000,"output_tokens":500,"cache_creation_input_tokens":0,"cache_read_input_tokens":500},"model":"claude-opus-4-6"}
```

### What the Parser Handles

| Element | Status | Notes |
|---------|--------|-------|
| User text | Extracted | From `content[].type === 'text'` |
| Assistant text | Extracted | From `content[].type === 'text'` |
| Extended thinking | Extracted | From `content[].type === 'thinking'` |
| Tool calls | Extracted | From `content[].type === 'tool_use'` — id, name, input |
| Tool results | Extracted | From user messages, `content[].type === 'tool_result'` |
| Per-message usage | Extracted | model, input/output/cache tokens, cost |
| Session aggregation | Correct | Totals, primary model by frequency |
| Timestamps | Correct | Per-message ISO 8601 |
| Git branch / version | Extracted | From first message metadata |
| Meta messages | Filtered | `isMeta: true` skipped (slash commands, hooks) |

### DB Quality

```
128 sessions, 50,525 messages (19,124 user + 31,401 assistant)
91% have usage data, 93% have primary model
4,332 messages with thinking content
Avg 394.7 messages/session, 125.8 tool calls/session
```

### Gaps: None

Parser is production-quality. Handles all current format features.

---

## 2. Copilot (VS Code)

### Format

- **File type:** JSON (one file per session)
- **Location:** `~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/*.json`
  and `~/Library/Application Support/Code/User/globalStorage/emptyWindowChatSessions/*.json`
- **Structure:** VS Code Copilot Chat session format v3

### Structure

```json
{
  "version": 3,
  "sessionId": "...",
  "creationDate": 1710000000000,
  "lastMessageDate": 1710000300000,
  "customTitle": "Implement feature X",
  "requests": [
    {
      "requestId": "...",
      "timestamp": 1710000000000,
      "message": { "text": "user prompt" },
      "response": [
        { "kind": "text-value", "value": "assistant text" },
        { "kind": "thinking", "value": "thinking..." },
        { "kind": "toolInvocationSerialized", "value": "{\"toolCallId\":\"...\",\"name\":\"...\",\"input\":\"...\"}" }
      ],
      "result": {
        "metadata": {
          "toolCallRounds": [{ "toolCalls": [{ "callId": "...", "name": "...", "input": "..." }] }]
        }
      },
      "modelId": "gpt-4-turbo"
    }
  ]
}
```

### What the Parser Handles

| Element | Status | Notes |
|---------|--------|-------|
| User text | Extracted | From `request.message.text` |
| Assistant text | Extracted | From `response[].kind === 'text-value'` |
| Thinking | Extracted | From `response[].kind === 'thinking'` (rare — 13/2094 msgs) |
| Tool calls | Extracted | Merged from `response[]` + `toolCallRounds[]` with dedup |
| Tool results | **Missing** | Not structured separately in Copilot format |
| Token usage | **N/A** | Copilot doesn't expose token counts |
| Model | **Bug** | Extracted but not stored in `models_used`/`primary_model` columns |
| Session character | **Bug** | `detectSessionCharacter()` called but result not saved — all NULL |
| Timestamps | Correct | From `creationDate`/`lastMessageDate` |
| Project path | Partial | 35% fail lookup → "unknown" project |

### DB Quality

```
307 sessions, 4,189 messages (2,107 user + 2,082 assistant)
0% have token usage (expected — Copilot limitation)
0% have models_used populated (BUG — model extracted but not written)
0% have session_character (BUG — classification runs but not stored)
88% of assistant messages have tool calls
```

### Gaps

| Priority | Issue | Impact |
|----------|-------|--------|
| Medium | `models_used` / `primary_model` NULL for all sessions | Dashboard model analytics empty |
| Medium | `session_character` NULL for all sessions | Character filter broken |
| Low | 35% "unknown" project (workspace.json missing) | Project grouping incomplete |
| N/A | No token usage | Copilot limitation, can't fix |

---

## 3. Cursor

### Formats

Modern Cursor Agent sessions are exported as JSONL:

- **Location:** `~/.cursor/projects/<encoded-cwd>/agent-transcripts/<session-id>/<session-id>.jsonl`
- **Records:** `{role, message: {content}}` user/assistant entries plus lifecycle records such as `turn_ended`
- **Content:** text, thinking, and tool-use input blocks; tool outputs may be absent

The provider also retains support for the legacy Cursor IDE SQLite storage:

- **File type:** SQLite (VS Code `state.vscdb`)
- **Location:** `~/Library/Application Support/Cursor/User/workspaceStorage/<hash>/state.vscdb`
  and `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Tables:** `ItemTable` (key-value), `cursorDiskKV` (key-value)

### Structure

Sessions stored as JSON blobs in SQLite:

```
ItemTable key: "composer.composerData"
  → JSON object with array of {composerId, ...} entries

cursorDiskKV key: "composerData:<composerId>"
  → Full session data with messages/bubbles

cursorDiskKV key: "bubbleId:<composerId>:<bubbleId>"
  → Individual message bubble content
```

**Two message formats coexist:**

1. **Headers-only** (~72%): `fullConversationHeadersOnly[]` with bubble refs, content loaded separately
2. **Inline** (~28%): Messages embedded in `conversation`/`messages`/`bubbles`/`turns`/`history` arrays

**Message content types:**
- Plain text strings (most assistant messages)
- **Lexical JSON** (some user messages): `{"root":{"children":[{"children":[{"text":"actual text"}],"type":"paragraph"}]}}`

### What the Parser Handles

| Element | Status | Notes |
|---------|--------|-------|
| User text | **Partial** | 20% stored as raw Lexical JSON blobs instead of extracted text |
| Assistant text | Extracted | From bubble text/content fields |
| Tool calls | **Broken** | Only 11 across 55 sessions; `uri` objects cast to string → `[object Object]` |
| Tool results | Missing | Cursor doesn't track tool results separately |
| Token usage | **N/A** | Cursor doesn't store token counts |
| Model | Missing | Not extracted from Cursor's data |
| Project path | **Broken** | All 55 sessions → `project_name = "global"` due to workspace.json lookup failure |
| Timestamps | Correct | From bubble metadata or composerData |

### DB Quality

```
55 sessions, 1,387 messages (284 user + 1,103 assistant)
0% have token usage (expected — Cursor limitation)
0% have models (not extracted)
All project_name = "global" (BUG)
Only 11 tool calls total (mostly code edits from codeBlocks[])
```

### Gaps

| Priority | Issue | Root Cause | Impact |
|----------|-------|-----------|--------|
| High | All projects = "global" | workspace.json missing, no fallback | Project analytics useless |
| High | 20% user messages = Lexical JSON | `richText` field not parsed | Content unreadable in dashboard |
| Medium | Tool call file paths = `[object Object]` | VSCode URI object cast as string | Tool panel broken |
| Low | No model info | Not extracted from Cursor data | Model analytics empty |
| N/A | No token usage | Cursor limitation | Can't fix |

---

## 4. Codex CLI

### Formats (Two Distinct Versions)

#### Format A: New JSONL (v0.104.0+, 2026)

- **File type:** JSONL
- **Location:** `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`
- **Currently discovered:** 9 files

```jsonl
{"timestamp":"...","type":"session_meta","payload":{"id":"...","cwd":"...","model_provider":"openai","cli_version":"0.104.0"}}
{"timestamp":"...","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"..."}]}}
{"timestamp":"...","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"<permissions>..."}]}}
{"timestamp":"...","type":"event_msg","payload":{"type":"user_message","message":"actual user prompt"}}
{"timestamp":"...","type":"event_msg","payload":{"type":"agent_reasoning","text":"**Starting...**"}}
{"timestamp":"...","type":"response_item","payload":{"type":"reasoning","summary":[{"type":"summary_text","text":"..."}]}}
{"timestamp":"...","type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"ls\"}","call_id":"call_..."}}
{"timestamp":"...","type":"response_item","payload":{"type":"function_call_output","call_id":"call_...","output":"..."}}
{"timestamp":"...","type":"response_item","payload":{"type":"custom_tool_call","name":"apply_patch","call_id":"call_...","input":"..."}}
{"timestamp":"...","type":"response_item","payload":{"type":"custom_tool_call_output","call_id":"call_...","output":"..."}}
{"timestamp":"...","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"..."}]}}
{"timestamp":"...","type":"event_msg","payload":{"type":"agent_message","message":"assistant final text"}}
{"timestamp":"...","type":"event_msg","payload":{"type":"task_complete","turn_id":"...","last_agent_message":"..."}}
```

**Event type distribution (from sample session with 510 events):**

| Envelope | Payload type | Role | Count | Parser handles? |
|----------|-------------|------|-------|----------------|
| `event_msg` | `token_count` | — | 202 | N/A (skip) |
| `turn_context` | — | — | 102 | N/A (skip) |
| `event_msg` | `agent_reasoning` | — | 88 | **NO** |
| `response_item` | `function_call` | — | 88 | **NO** |
| `response_item` | `function_call_output` | — | 88 | **NO** |
| `response_item` | `reasoning` | — | 80 | YES (partial) |
| `response_item` | `message` | `user` | 10 | YES (but includes system context) |
| `response_item` | `custom_tool_call` | — | 8 | **NO** |
| `response_item` | `custom_tool_call_output` | — | 8 | **NO** |
| `event_msg` | `task_started` | — | 7 | NO (skip OK) |
| `event_msg` | `user_message` | — | 7 | YES (redundant) |
| `response_item` | `message` | `assistant` | 6 | **BUGGY** |
| `event_msg` | `agent_message` | — | 6 | **NO** |
| `event_msg` | `task_complete` | — | 6 | **NO** (expects `turn.completed`) |
| `response_item` | `message` | `developer` | 3 | YES (skip correct) |

#### Format B: Old JSON (pre-2025, April 2025)

- **File type:** Pretty-printed single JSON object (NOT JSONL)
- **Location:** `~/.codex/sessions/rollout-<date>-<uuid>.json` (flat, not date-organized)
- **Currently NOT discovered:** 29 files (provider filters for `.jsonl` only)

```json
{
  "session": {
    "timestamp": "2025-04-19T07:47:53.257Z",
    "id": "0ced326d-...",
    "instructions": ""
  },
  "items": [
    {"role": "user", "type": "message", "content": [{"type": "input_text", "text": "..."}]},
    {"type": "reasoning", "id": "rs_...", "summary": [], "duration_ms": 3753},
    {"type": "function_call", "id": "fc_...", "name": "shell", "arguments": "{...}", "call_id": "call_...", "status": "completed"},
    {"type": "function_call_output", "call_id": "call_...", "output": "{...}"}
  ]
}
```

**Key differences from Format A:**
- Single JSON object, not JSONL
- No `response_item`/`event_msg` envelope — items are bare objects
- No `payload` wrapper — type/role/content directly on items
- No `timestamp` on individual items
- No assistant text message — only reasoning + function calls
- No `agent_message` or `task_complete` events
- `function_call.arguments` uses `{"command": ["bash", "-lc", "..."]}` format

### Parser State: BROKEN

The parser was written for a hypothetical intermediate format that doesn't match either real version.

**What the parser's switch statement handles:**
- `message` (role user/assistant) — partially works for Format A user messages
- `user_message` / `userMessage` — works for `event_msg/user_message`
- `agent_message` / `agentMessage` / `item.completed` — **WRONG** for Format A, non-existent in data
- `turn.completed` — **WRONG**, actual event is `task_complete`

**5 Critical Bugs:**

1. **`function_call` not in switch** — 88 tool calls per session silently dropped
2. **`function_call_output` not in switch** — 88 tool results per session silently dropped
3. **`custom_tool_call` / `custom_tool_call_output` not handled** — `apply_patch` etc. lost
4. **`extractUserContent` misses `output_text`** — Assistant messages have `content: [{type: "output_text", text: "..."}]` but function only checks for `text` and `input_text`
5. **`event_msg/agent_message` not handled** — Primary assistant text source ignored
6. **`task_complete` vs `turn.completed`** — Turn boundaries never detected, usage never captured
7. **Envelope timestamps ignored** — All messages get `meta.timestamp`, not per-event timestamps
8. **User messages include system context** — Developer role messages + AGENTS.md/environment context captured as user messages

### DB Quality

```
9 sessions, 46 messages (46 user + 0 assistant + 0 tool calls)
100% of assistant content lost
100% of tool calls lost
100% of tool results lost
All timestamps identical within each session
```

### Gaps

| Priority | Issue | Root Cause |
|----------|-------|-----------|
| **Critical** | 0 assistant messages | `function_call`, `agent_message`, `message/assistant` unhandled |
| **Critical** | 0 tool calls | `function_call`, `custom_tool_call` not in switch |
| **Critical** | 0 tool results | `function_call_output`, `custom_tool_call_output` not in switch |
| **Critical** | Timestamps all identical | Envelope-level timestamps ignored |
| **Critical** | Turn boundaries broken | `task_complete` vs `turn.completed` mismatch |
| High | System context as user messages | No filtering of developer role / system context |
| High | Old `.json` files not discovered | Provider only finds `.jsonl` extension |
| Medium | No usage/tokens captured | `task_complete` not parsed (has no token data anyway) |

---

## 5. Copilot CLI

### Format

- **File type:** JSONL
- **Location:** `~/.copilot/session-state/<session-id>/events.jsonl`
  and `~/.copilot/history-session-state/<session-id>/events.jsonl`
- **Companion file:** `workspace.yaml` (metadata: cwd, branch, model, repository)

### Structure

```jsonl
{"type":"session.start","data":{"sessionId":"...","version":"...","copilotVersion":"...","context":{"cwd":"...","gitRoot":"...","branch":"..."}}}
{"type":"user.message","data":{"content":"user prompt"}}
{"type":"assistant.turn_start","data":{}}
{"type":"assistant.message","data":{"content":"partial text...","toolRequests":[{"toolCallId":"...","name":"...","arguments":"..."}]}}
{"type":"tool.execution_start","data":{"toolCallId":"...","model":"...","name":"..."}}
{"type":"tool.execution_complete","data":{"toolCallId":"...","success":true,"result":{"content":"..."}}}
{"type":"assistant.turn_end","data":{}}
{"type":"session.idle","data":{}}
{"type":"session.model_change","data":{"model":"gpt-4.1"}}
{"type":"session.error","data":{"message":"query execution error"}}
```

### What the Parser Handles

| Element | Status | Notes |
|---------|--------|-------|
| User messages | Extracted | From `user.message` events |
| Assistant text | Extracted | Accumulated from `assistant.message` + `assistant.message_delta` |
| Tool calls | Extracted | From `toolRequests[]` in `assistant.message` |
| Tool results | Extracted | From `tool.execution_complete` events |
| Subagent calls | Extracted | `subagent.started/completed` → prefixed `subagent:` tool calls |
| Turn boundaries | Correct | Flushes on `session.idle` or next `user.message` |
| Timestamps | **Bug** | Falls back to file mtime — all messages in session share same time |
| Model | **Bug** | `session.model_change` parsed but not applied to model field |
| Token usage | **N/A** | Copilot CLI doesn't expose token counts |
| Errors | Ignored | `session.error` events not captured |

### DB Quality

```
2 sessions, 8 messages (5 user + 3 assistant)
100% have tool calls where expected
0% have token usage (expected)
0% have per-event timestamps (BUG — all messages same time)
Model field empty (BUG)
```

### Gaps

| Priority | Issue | Root Cause |
|----------|-------|-----------|
| High | All timestamps identical per session | Only uses file mtime, ignores event-level timestamps |
| Medium | Model field empty | `session.model_change` not updating model |
| Medium | Tool call IDs synthetic | Uses `copilot-tool-N` instead of original `toolCallId` |
| Low | `session.error` events ignored | No error field in message/session schema |
| N/A | No token usage | Copilot CLI limitation |

---

## Fix Plan

### PR 1: Codex CLI Parser Rewrite (Critical — conversations completely broken)

**Scope:** `cli/src/providers/codex.ts` — major rewrite

**Changes:**
1. Add switch cases for Format A (new JSONL):
   - `function_call` → create tool call (name, arguments, call_id)
   - `function_call_output` → create tool result (call_id, output)
   - `custom_tool_call` → create tool call
   - `custom_tool_call_output` → create tool result
   - `agent_message` (from event_msg) → append to assistant text
   - `task_complete` → flush turn boundary
2. Fix `extractUserContent` to handle `output_text` content type
3. Use envelope-level `timestamp` for per-event timestamps
4. Filter out `developer` role and system context from user messages
5. Identify real user messages using `event_msg/user_message` as marker
6. Add Format B support (old `.json` files):
   - Discovery: accept `.json` extension alongside `.jsonl`
   - Parse single JSON object with `session` + `items` structure
   - Map bare `function_call`/`function_call_output`/`reasoning` items

**Estimated size:** ~200-300 lines changed

### PR 2: Cursor Provider Fixes (High — project mapping and content broken)

**Scope:** `cli/src/providers/cursor.ts`

**Changes:**
1. Parse Lexical JSON in `parseBubbles()` — extract nested text nodes from `richText` fields
2. Fix VSCode URI handling — extract `_fsPath` from URI objects instead of casting to string
3. Improve project path resolution:
   - Try `workspace.json` first (current behavior)
   - Fallback: extract project path from file paths in code blocks
   - Fallback: use workspace hash directory name

**Estimated size:** ~50-80 lines changed

### PR 3: Copilot VS Code & Copilot CLI Metadata Fixes (Medium — data completeness)

**Scope:** `cli/src/providers/copilot.ts` + `cli/src/providers/copilot-cli.ts`

**Changes for Copilot VS Code:**
1. Ensure `models_used` / `primary_model` fields populated from extracted model data
2. Ensure `session_character` result is stored (may be a sync-layer issue, not provider)

**Changes for Copilot CLI:**
1. Use event-level timestamps instead of file mtime
2. Apply `session.model_change` to track model mid-session
3. Use original `toolCallId` instead of synthetic `copilot-tool-N`

**Estimated size:** ~40-60 lines changed

---

## Recommended Execution Order

1. **PR 1 (Codex CLI)** — Most impactful. Conversations are completely broken.
2. **PR 2 (Cursor)** — Second most impactful. Content and project mapping broken.
3. **PR 3 (Copilot VS Code + CLI)** — Metadata completeness. Lower priority since conversations render correctly.

After each PR: run `code-insights sync --force --source <tool>` to re-parse and verify.
