# ClaudeInsight Architecture Design

**Date:** 2026-01-20
**Status:** Draft
**Author:** ClaudeInsight Team

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            USER'S MACHINE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────────────────────┐  │
│  │   Claude Code    │     │            ClaudeInsight CLI                 │  │
│  │                  │     │                                              │  │
│  │  ~/.claude/      │────▶│  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │  │
│  │  projects/       │     │  │ Parser  │─▶│ Insight │─▶│  Firestore  │  │  │
│  │  *.jsonl         │     │  │         │  │ Extract │  │   Uploader  │  │  │
│  └──────────────────┘     │  └─────────┘  └─────────┘  └──────┬──────┘  │  │
│                           │                                    │         │  │
│           ┌───────────────┴────────────────────────────────────┘         │  │
│           │  Hook (Phase 2)                                              │  │
│           ▼                                                              │  │
│  ┌──────────────────┐                                                    │  │
│  │ Post-session     │                                                    │  │
│  │ auto-sync        │                                                    │  │
│  └──────────────────┘                                                    │  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER'S FIREBASE PROJECT                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │    Firestore     │  │  Firebase Host   │  │     Gemini API           │  │
│  │                  │  │  (Dashboard)     │  │     (Phase 3)            │  │
│  │  - sessions      │  │                  │  │                          │  │
│  │  - insights      │  │  Next.js app     │  │  User's API key          │  │
│  │  - projects      │  │  served here     │  │  for enhanced insights   │  │
│  │                  │  │                  │  │                          │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────────────┘  │
│           │                     │                                           │
│           └──────────┬──────────┘                                           │
│                      │                                                      │
└──────────────────────┼──────────────────────────────────────────────────────┘
                       │
                       │ Real-time subscriptions
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER'S BROWSER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      ClaudeInsight Dashboard                          │  │
│  │                                                                       │  │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │  │
│  │   │  Sessions   │  │  Insights   │  │  Analytics  │  │   Export   │  │  │
│  │   │    View     │  │    View     │  │    View     │  │    View    │  │  │
│  │   └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 CLI Tool (`@claudeinsight/cli`)

```
claudeinsight/
├── cli/
│   ├── index.ts              # Entry point, command routing
│   ├── commands/
│   │   ├── init.ts           # Firebase setup wizard
│   │   ├── sync.ts           # Parse & upload sessions
│   │   ├── status.ts         # Show sync status
│   │   └── install-hook.ts   # Install Claude Code hook
│   ├── parser/
│   │   ├── jsonl.ts          # JSONL file parser
│   │   ├── session.ts        # Session data extractor
│   │   ├── message.ts        # Message parser (user/assistant/tool)
│   │   └── insights/
│   │       ├── patterns.ts   # Pattern matching rules
│   │       ├── decisions.ts  # Decision extractor
│   │       ├── learnings.ts  # Learning extractor
│   │       └── worklog.ts    # Work item extractor
│   ├── firebase/
│   │   ├── config.ts         # Load user's Firebase config
│   │   ├── uploader.ts       # Batch upload to Firestore
│   │   └── schema.ts         # Document type definitions
│   └── utils/
│       ├── config.ts         # Local config (~/.claudeinsight/config.json)
│       └── logger.ts         # CLI output formatting
```

### 2.2 Web Dashboard (`@claudeinsight/web`)

```
web/
├── app/
│   ├── layout.tsx            # Root layout with providers
│   ├── page.tsx              # Home / session list
│   ├── sessions/
│   │   └── [id]/page.tsx     # Session detail view
│   ├── insights/
│   │   ├── page.tsx          # All insights
│   │   ├── decisions/        # Decision log
│   │   ├── learnings/        # Learning journal
│   │   └── worklog/          # Work history
│   ├── analytics/
│   │   └── page.tsx          # Charts and metrics
│   └── export/
│       └── page.tsx          # Export wizard
├── components/
│   ├── ui/                   # shadcn/ui components
│   ├── sessions/
│   │   ├── SessionList.tsx
│   │   ├── SessionCard.tsx
│   │   └── SessionDetail.tsx
│   ├── insights/
│   │   ├── InsightCard.tsx
│   │   ├── DecisionLog.tsx
│   │   └── LearningJournal.tsx
│   ├── charts/
│   │   ├── ActivityTimeline.tsx
│   │   ├── EffortChart.tsx
│   │   └── ProjectBreakdown.tsx
│   └── export/
│       ├── ExportWizard.tsx
│       └── FormatSelector.tsx
├── lib/
│   ├── firebase.ts           # Firebase client init
│   ├── hooks/
│   │   ├── useSessions.ts    # Real-time session data
│   │   ├── useInsights.ts    # Real-time insights
│   │   └── useAnalytics.ts   # Computed metrics
│   └── export/
│       ├── markdown.ts       # Plain MD generator
│       ├── obsidian.ts       # Obsidian format
│       └── notion.ts         # Notion format
└── public/
    └── ...
```

---

## 3. Data Flow

### 3.1 Sync Flow (CLI → Firestore)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SYNC FLOW                                      │
└─────────────────────────────────────────────────────────────────────────┘

   ~/.claude/projects/
         │
         ▼
┌─────────────────┐
│  Discover       │ ─── Find all project directories
│  Projects       │     and .jsonl files
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Load Sync      │ ─── Check ~/.claudeinsight/sync-state.json
│  State          │     to find last synced timestamp per file
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Parse JSONL    │ ─── For each new/modified file:
│  Files          │     - Read line by line
└────────┬────────┘     - Parse JSON objects
         │              - Build session tree (parent/child messages)
         │
         ▼
┌─────────────────┐
│  Extract        │ ─── Pattern matching:
│  Insights       │     - "decided to..." → decision
└────────┬────────┘     - "learned that..." → learning
         │              - tool_use(Edit/Write) → work item
         │
         ▼
┌─────────────────┐
│  Transform      │ ─── Convert to Firestore document format
│  to Documents   │     - Session doc
└────────┬────────┘     - Insight docs (linked to session)
         │
         ▼
┌─────────────────┐
│  Batch Upload   │ ─── Firestore batch writes
│  to Firestore   │     (max 500 docs per batch)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Update Sync    │ ─── Save new timestamps
│  State          │     to sync-state.json
└─────────────────┘
```

### 3.2 Dashboard Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DASHBOARD DATA FLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│   User opens     │
│   dashboard      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│  Load Firebase   │────▶│  Initialize      │
│  Config          │     │  Firestore       │
└──────────────────┘     └────────┬─────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
         ▼                                                 ▼
┌──────────────────┐                            ┌──────────────────┐
│  Subscribe to    │                            │  Subscribe to    │
│  sessions        │                            │  insights        │
│  collection      │                            │  collection      │
└────────┬─────────┘                            └────────┬─────────┘
         │                                               │
         │              Real-time updates                │
         │◀─────────────────────────────────────────────▶│
         │                                               │
         ▼                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        React State                                │
│                                                                   │
│   sessions[]    insights[]    computed analytics                  │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                        UI Components                              │
│                                                                   │
│   SessionList    InsightCards    Charts    ExportWizard          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Firestore Schema

### 4.1 Collections

```
firestore/
├── projects/                    # One doc per Claude Code project
│   └── {projectId}/
│       ├── name: string         # e.g., "batonship"
│       ├── path: string         # e.g., "/Users/.../batonship"
│       ├── sessionCount: number
│       ├── lastActivity: timestamp
│       └── createdAt: timestamp
│
├── sessions/                    # One doc per session
│   └── {sessionId}/
│       ├── projectId: string    # Reference to project
│       ├── summary: string      # Auto-generated title
│       ├── startedAt: timestamp
│       ├── endedAt: timestamp
│       ├── messageCount: number
│       ├── toolCallCount: number
│       ├── gitBranch: string
│       ├── version: string      # Claude Code version
│       └── syncedAt: timestamp
│
├── messages/                    # One doc per message (optional, for replay)
│   └── {messageId}/
│       ├── sessionId: string
│       ├── type: "user" | "assistant" | "system"
│       ├── content: string      # Text content (truncated if large)
│       ├── toolCalls: array     # Tool use summary
│       ├── timestamp: timestamp
│       └── parentId: string     # For threading
│
└── insights/                    # Extracted insights
    └── {insightId}/
        ├── sessionId: string
        ├── projectId: string
        ├── type: "decision" | "learning" | "workitem" | "effort"
        ├── title: string        # Short summary
        ├── content: string      # Full extracted text
        ├── confidence: number   # 0-1, how confident the extraction is
        ├── source: "pattern" | "llm"  # How it was extracted
        ├── metadata: object     # Type-specific data
        │   ├── (decision) alternatives: string[]
        │   ├── (decision) reasoning: string
        │   ├── (workitem) files: string[]
        │   ├── (workitem) type: "feature" | "bugfix" | "refactor"
        │   └── (effort) tokens: number
        ├── timestamp: timestamp
        └── createdAt: timestamp
```

### 4.2 Indexes

```typescript
// Required Firestore indexes

// Sessions by project, ordered by date
sessions: projectId ASC, startedAt DESC

// Insights by project and type
insights: projectId ASC, type ASC, timestamp DESC

// Insights by session
insights: sessionId ASC, timestamp ASC

// Full-text search (if using Algolia extension)
// - sessions.summary
// - insights.title
// - insights.content
```

---

## 5. Insight Extraction

### 5.1 Pattern Matching Rules

```typescript
// Decision patterns
const DECISION_PATTERNS = [
  /decided to (.+)/i,
  /chose (.+) over (.+)/i,
  /went with (.+) because (.+)/i,
  /trade-off: (.+)/i,
  /approach: (.+)/i,
  /\*\*decision\*\*:? (.+)/i,
];

// Learning patterns
const LEARNING_PATTERNS = [
  /learned that (.+)/i,
  /TIL:? (.+)/i,
  /insight:? (.+)/i,
  /realized (.+)/i,
  /mistake: (.+)/i,
  /note to self:? (.+)/i,
];

// Work item detection
const WORKITEM_SIGNALS = {
  feature: ['added', 'implemented', 'created', 'built'],
  bugfix: ['fixed', 'resolved', 'patched', 'corrected'],
  refactor: ['refactored', 'restructured', 'reorganized', 'cleaned'],
};

// Tool calls that indicate work
const WORKITEM_TOOLS = ['Edit', 'Write', 'Bash'];
```

### 5.2 LLM Enhancement (Phase 3)

```typescript
// Gemini prompt for decision extraction
const DECISION_PROMPT = `
Analyze this Claude Code conversation and extract any decisions made.

For each decision, provide:
1. What was decided
2. Why (reasoning)
3. Alternatives considered (if mentioned)

Format as JSON array.

Conversation:
{conversation}
`;

// Gemini prompt for session summary
const SUMMARY_PROMPT = `
Summarize this Claude Code session in 2-3 sentences.
Focus on: what was accomplished, key decisions, any problems solved.

Conversation:
{conversation}
`;
```

---

## 6. Configuration

### 6.1 User Config (`~/.claudeinsight/config.json`)

```json
{
  "firebase": {
    "apiKey": "user's-api-key",
    "authDomain": "user-project.firebaseapp.com",
    "projectId": "user-project-id",
    "storageBucket": "user-project.appspot.com",
    "messagingSenderId": "123456789",
    "appId": "1:123:web:abc"
  },
  "gemini": {
    "apiKey": "user's-gemini-key"  // Optional, for Phase 3
  },
  "sync": {
    "claudeDir": "~/.claude/projects",
    "autoSync": false,  // True after hook installed
    "excludeProjects": []  // Projects to skip
  },
  "dashboard": {
    "port": 3000  // Local dev server port
  }
}
```

### 6.2 Sync State (`~/.claudeinsight/sync-state.json`)

```json
{
  "lastSync": "2026-01-20T10:30:00Z",
  "files": {
    "/path/to/session1.jsonl": {
      "lastModified": "2026-01-20T10:00:00Z",
      "lastSyncedLine": 1250,
      "sessionId": "abc-123"
    }
  }
}
```

---

## 7. Security Considerations

### 7.1 Local Security

- Firebase credentials stored in `~/.claudeinsight/config.json`
- File permissions: `chmod 600` on config files
- No credentials in environment variables (avoid shell history)

### 7.2 Firebase Security Rules

```javascript
// Firestore rules (user deploys to their own project)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow all access - single user, their own project
    // Users can customize if they want stricter rules
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 7.3 Data Privacy

- No data leaves user's machine except to their own Firebase
- No telemetry, analytics, or tracking
- Session content can be truncated/excluded if sensitive

---

## 8. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | Firestore | NoSQL fits session/insight documents; real-time built-in; user familiarity |
| Web Framework | Next.js 14+ | App router, server components, Vercel-friendly |
| Styling | Tailwind + shadcn/ui | Fast to build, consistent design system |
| CLI Framework | Commander.js | Simple, well-documented, TypeScript support |
| Charting | Recharts | React-native, good for dashboards |
| State Management | React hooks + Firestore SDK | Real-time subscriptions handle most state |
| Export | Custom generators | Simple string templating, no heavy deps |

---

## 9. Open Questions

1. **Message storage**: Store full messages or just summaries? (Storage vs. replay capability)
2. **Rate limiting**: How to handle Gemini API rate limits gracefully?
3. **Large sessions**: Some sessions are 100MB+. Paginate or truncate?
4. **Multi-device**: If user runs CLI on multiple machines, how to handle conflicts?

---

## 10. Next Steps

1. Initialize Next.js project with basic structure
2. Implement JSONL parser with tests
3. Create Firestore schema and upload logic
4. Build basic session list UI
5. Test end-to-end flow with real session data
