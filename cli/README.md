# Code Insights CLI

Command-line tool that parses Claude Code session history and syncs it to your own Firebase Firestore.

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9 (`npm install -g pnpm` if needed)
- A **Firebase project** with Firestore enabled (see [Quick Start](../README.md#quick-start))

## Installation

```bash
# From the repo root
cd cli
pnpm install
pnpm build
npm link    # Makes `claudeinsight` available globally
```

After linking, verify it works:

```bash
claudeinsight --version
```

## Commands

### `claudeinsight init`

Configure ClaudeInsight with your Firebase credentials (CLI + Web).

```bash
claudeinsight init
```

You'll be prompted for:

**Step 1 - CLI Sync (Service Account):**
- Firebase Project ID
- Service Account Email (client_email from JSON)
- Private Key (private_key from JSON)

**Step 2 - Web Dashboard (Client Config):**
- API Key
- Auth Domain
- Storage Bucket
- Messaging Sender ID
- App ID

Configuration is stored in `~/.claudeinsight/config.json`.

### `claudeinsight open`

Open the ClaudeInsight dashboard in your browser.

```bash
# Open dashboard with auto-configured Firebase
claudeinsight open

# Just print the URL (don't open browser)
claudeinsight open --url
```

The dashboard URL includes your Firebase config encoded in the URL, so you don't need to configure it manually in the browser.

### `claudeinsight sync`

Sync Claude Code sessions to Firestore.

```bash
# Sync new/modified sessions
claudeinsight sync

# Force re-sync all sessions
claudeinsight sync --force

# Preview what would be synced
claudeinsight sync --dry-run

# Sync specific project only
claudeinsight sync --project "my-project"

# Quiet mode (for hooks)
claudeinsight sync --quiet

# Regenerate titles for all sessions
claudeinsight sync --regenerate-titles
```

### `claudeinsight status`

Show sync status and statistics.

```bash
claudeinsight status
```

Displays:
- Configuration status
- Total sessions synced
- Projects tracked
- Last sync time

### `claudeinsight insights`

View recent insights from Firestore.

```bash
# Show recent insights
claudeinsight insights

# Filter by type
claudeinsight insights --type decision

# Filter by project
claudeinsight insights --project "my-project"

# Today's insights only
claudeinsight insights --today

# Limit results
claudeinsight insights --limit 10
```

### `claudeinsight reset`

Delete all data from Firestore and reset local sync state.

```bash
# Interactive (asks for confirmation)
claudeinsight reset

# Skip confirmation
claudeinsight reset --confirm
```

### `claudeinsight install-hook`

Install a Claude Code hook for automatic sync after each session.

```bash
claudeinsight install-hook
```

### `claudeinsight uninstall-hook`

Remove the automatic sync hook.

```bash
claudeinsight uninstall-hook
```

## How It Works

### Session Parsing

The CLI reads JSONL files from `~/.claude/projects/` which contain:
- User and assistant messages
- Tool calls (Edit, Write, Bash, etc.)
- Timestamps and metadata

Each session is parsed to extract:
- Project name and path
- Start/end times and duration
- Message counts
- Tool call statistics
- Git branch (if available)
- Claude version

### Incremental Sync

Sync state is tracked in `~/.claudeinsight/sync-state.json`:
- File modification times are recorded
- Only new or modified files are processed
- Use `--force` to bypass and re-sync everything

### Multi-Device Support

Project IDs are generated from git remote URLs when available:
- Same repo on different machines → same project ID
- Non-git projects fall back to path-based hash
- Each session records device metadata (hostname, platform)

### Title Generation

Sessions are automatically titled based on:
1. Claude's own title (if present in session)
2. First user message (cleaned up)
3. Session character detection (deep focus, bug hunt, etc.)
4. Fallback to timestamp

## Project Structure

```
cli/
├── src/
│   ├── commands/
│   │   ├── init.ts          # Firebase configuration
│   │   ├── sync.ts          # Main sync logic
│   │   ├── open.ts          # Open dashboard in browser
│   │   ├── status.ts        # Status display
│   │   ├── insights.ts      # View insights
│   │   ├── reset.ts         # Clear all data
│   │   └── install-hook.ts  # Hook management
│   ├── firebase/
│   │   └── client.ts        # Firestore operations
│   ├── parser/
│   │   ├── jsonl.ts         # JSONL file parsing
│   │   └── titles.ts        # Title generation
│   ├── utils/
│   │   ├── config.ts        # Config management
│   │   └── device.ts        # Device identification
│   ├── types.ts             # TypeScript types
│   └── index.ts             # CLI entry point
├── dist/                    # Compiled output
├── package.json
└── tsconfig.json
```

## Development

```bash
pnpm dev    # Watch mode — recompiles on save
pnpm build  # One-time compile
pnpm lint   # Run ESLint
```

The CLI is written in TypeScript with ES Modules and compiled to `dist/`. After `npm link`, changes rebuild automatically in watch mode.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full development workflow, code style, and PR guidelines.

## Firestore Collections

The CLI writes to these collections:

### `projects`
```typescript
{
  id: string;           // Hash of git remote URL or path
  name: string;         // Project directory name
  path: string;         // Full path on syncing device
  gitRemoteUrl: string | null;
  projectIdSource: 'git-remote' | 'path-hash';
  sessionCount: number;
  lastActivity: Timestamp;
}
```

### `sessions`
```typescript
{
  id: string;           // From JSONL filename
  projectId: string;
  projectName: string;
  summary: string | null;
  generatedTitle: string | null;
  startedAt: Timestamp;
  endedAt: Timestamp;
  messageCount: number;
  toolCallCount: number;
  gitBranch: string | null;
  deviceId: string;
  deviceHostname: string;
  devicePlatform: string;
}
```

### `messages`
```typescript
{
  id: string;
  sessionId: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: Array<{ name: string; input: string }>;
  timestamp: Timestamp;
}
```
