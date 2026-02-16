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
pnpm link --global    # Makes `code-insights` available globally
```

After linking, verify it works:

```bash
code-insights --version
```

## Commands

### `code-insights init`

Configure Code Insights with your Firebase credentials (CLI + Web). This is an interactive setup wizard.

```bash
code-insights init
```

You'll be prompted for:

**Step 1 - CLI Sync (Service Account):**
- Firebase Project ID
- Service Account Email (`client_email` from JSON)
- Private Key (`private_key` from JSON)

**Step 2 - Web Dashboard (Client Config):**
- API Key
- Auth Domain
- Storage Bucket
- Messaging Sender ID
- App ID

**Step 3 - Dashboard URL:**
- Press Enter to accept the default (`https://code-insights.app`)

Configuration is stored in `~/.code-insights/config.json`. Web config is stored separately in `~/.code-insights/web-config.json`.

### `code-insights connect`

Generate a URL to connect the web dashboard to your Firebase.

```bash
code-insights connect
```

The URL includes your Firebase web config base64-encoded as a query parameter. Open it in a browser to connect the dashboard to your Firestore — no manual configuration needed.

### `code-insights sync`

Sync Claude Code sessions to Firestore.

```bash
# Sync new/modified sessions
code-insights sync

# Force re-sync all sessions
code-insights sync --force

# Preview what would be synced
code-insights sync --dry-run

# Sync specific project only
code-insights sync --project "my-project"

# Quiet mode (for hooks)
code-insights sync --quiet

# Regenerate titles for all sessions
code-insights sync --regenerate-titles
```

### `code-insights status`

Show sync status and statistics.

```bash
code-insights status
```

Displays:
- Configuration status
- Total sessions synced
- Projects tracked
- Last sync time

### `code-insights reset`

Delete all data from Firestore and reset local sync state.

```bash
# Interactive (asks for confirmation)
code-insights reset

# Skip confirmation
code-insights reset --confirm
```

### `code-insights install-hook`

Install a Claude Code hook for automatic sync after each session.

```bash
code-insights install-hook
```

### `code-insights uninstall-hook`

Remove the automatic sync hook.

```bash
code-insights uninstall-hook
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

Sync state is tracked in `~/.code-insights/sync-state.json`:
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
│   │   ├── init.ts          # Interactive Firebase configuration
│   │   ├── sync.ts          # Main sync logic
│   │   ├── connect.ts       # Generate dashboard connection URL
│   │   ├── status.ts        # Status display
│   │   ├── reset.ts         # Clear all data
│   │   └── install-hook.ts  # Hook management
│   ├── firebase/
│   │   └── client.ts        # Firestore operations
│   ├── parser/
│   │   ├── jsonl.ts         # JSONL file parsing
│   │   └── titles.ts        # Title generation
│   ├── utils/
│   │   ├── config.ts        # Config management
│   │   ├── device.ts        # Device identification
│   │   └── firebase-json.ts # Firebase JSON validation & URL generation
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

The CLI is written in TypeScript with ES Modules and compiled to `dist/`. After `pnpm link --global`, changes rebuild automatically in watch mode.

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
