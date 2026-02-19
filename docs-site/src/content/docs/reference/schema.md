---
title: Firestore Schema
description: Collections and document structure used by Code Insights.
---

The CLI writes three collections to Firestore. The web dashboard reads from these collections and additionally writes an `insights` collection for LLM-generated analysis.

## `projects`

Each project corresponds to a directory under `~/.claude/projects/`. Project IDs are derived from the git remote URL when available, making them stable across devices.

```typescript
{
  id: string                // Hash of git remote URL or path
  name: string              // Project directory name
  path: string              // Full path on the syncing device
  gitRemoteUrl: string | null
  projectIdSource: 'git-remote' | 'path-hash'
  sessionCount: number      // Incremented only for new sessions
  lastActivity: Timestamp
  updatedAt: Timestamp      // Server timestamp

  // Aggregate usage (when sessions have token data)
  totalInputTokens?: number
  totalOutputTokens?: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
  estimatedCostUsd?: number
}
```

## `sessions`

One document per Claude Code session. The session ID comes from the JSONL filename.

```typescript
{
  id: string                    // From JSONL filename
  projectId: string
  projectName: string
  projectPath: string
  gitRemoteUrl: string | null
  summary: string | null        // Claude's session summary (if present)
  customTitle?: string          // User-editable title (set by dashboard)
  generatedTitle: string | null // CLI-generated title
  titleSource: 'claude' | 'user_message' | 'insight' | 'character' | 'fallback' | null
  sessionCharacter: 'deep_focus' | 'bug_hunt' | 'feature_build'
    | 'exploration' | 'refactor' | 'learning' | 'quick_task' | null
  startedAt: Timestamp
  endedAt: Timestamp
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  toolCallCount: number
  gitBranch: string | null
  claudeVersion: string | null

  // Device info
  deviceId: string
  deviceHostname: string
  devicePlatform: string
  syncedAt: Timestamp           // Server timestamp

  // Usage stats (present when token data is available in JSONL)
  totalInputTokens?: number
  totalOutputTokens?: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
  estimatedCostUsd?: number
  modelsUsed?: string[]
  primaryModel?: string
  usageSource?: 'jsonl'
}
```

### Session Characters

The CLI classifies each session into one of seven character types based on message patterns:

| Character | Criteria |
|-----------|----------|
| `deep_focus` | 50+ messages, concentrated file work |
| `bug_hunt` | Error patterns and fixes |
| `feature_build` | Multiple new files created |
| `exploration` | Heavy Read/Grep usage, few edits |
| `refactor` | Many edits, same file count |
| `learning` | Questions and explanations |
| `quick_task` | Fewer than 10 messages, completed |

### Title Sources

Sessions are titled using the best available source:

| Source | Description |
|--------|-------------|
| `claude` | Claude's own title (present in some sessions) |
| `user_message` | First user message, cleaned up |
| `insight` | Derived from session insight analysis |
| `character` | Based on session character classification |
| `fallback` | Timestamp-based fallback |

## `messages`

Individual messages within a session. Content and tool inputs are truncated to keep Firestore documents within size limits.

```typescript
{
  id: string                // Message UUID
  sessionId: string
  type: 'user' | 'assistant' | 'system'
  content: string           // Max 10,000 characters
  thinking: string | null   // Extracted thinking content (max 5,000 chars)
  toolCalls: Array<{
    id: string              // tool_use_id
    name: string            // Tool name (e.g., Edit, Write, Bash)
    input: string           // Serialized input, max 1,000 characters
  }>
  toolResults: Array<{
    toolUseId: string       // References toolCalls[].id
    output: string          // Tool output, max 2,000 characters
  }>
  timestamp: Timestamp
  parentId: string | null

  // Per-message usage (assistant messages only)
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
    model: string
    estimatedCostUsd: number
  }
}
```

## `insights` (written by dashboard)

The web dashboard writes this collection when you run LLM analysis on a session. The CLI does not write to this collection.

```typescript
{
  id: string
  sessionId: string
  projectId: string
  projectName: string
  type: 'summary' | 'decision' | 'learning' | 'technique' | 'prompt_quality'
  title: string
  content: string
  summary: string
  bullets: string[]
  confidence: number        // 0.8-0.9 depending on type
  source: 'llm'
  metadata: {
    alternatives?: string[]     // decisions
    reasoning?: string          // decisions
    context?: string            // learnings
    applicability?: string      // techniques
  }
  timestamp: Timestamp      // Session's endedAt
  createdAt: Timestamp
  scope: 'session' | 'project' | 'overall'
  analysisVersion: string   // Currently '1.0.0'
}
```

## Truncation Limits

To stay within Firestore's 1 MB document size limit, the CLI truncates large fields:

| Field | Max Length |
|-------|-----------|
| `messages.content` | 10,000 characters |
| `messages.thinking` | 5,000 characters |
| `messages.toolCalls[].input` | 1,000 characters |
| `messages.toolResults[].output` | 2,000 characters |
