# Code Insights CLI

Command-line tool that parses Claude Code session history and syncs it to your own Firebase Firestore.

Full documentation: [docs.code-insights.app](https://docs.code-insights.app)

## Prerequisites

- **Node.js** 18 or later
- A **Firebase project** with Firestore enabled (see [Quick Start](https://docs.code-insights.app/getting-started/quick-start/))

## Installation

```bash
npm install -g @code-insights/cli
```

Verify it works:

```bash
code-insights --version
```

## Commands

### `code-insights init`

Configure Code Insights with your Firebase credentials.

```bash
# Quick setup — import directly from files (recommended)
code-insights init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.js

# Interactive setup — prompts for each value
code-insights init
```

**Flags:**
- `--from-json <path>` — Path to the Firebase service account key (downloaded from Firebase Console > Project Settings > Service Accounts)
- `--web-config <path>` — Path to the Firebase web SDK config (saved from Firebase Console > Project Settings > General > Your Apps). Accepts both JSON and the JavaScript snippet from Firebase.

You can use one flag, both, or neither. Any values not provided via flags will be collected interactively.

Configuration is stored in `~/.code-insights/config.json`. Web config is stored separately in `~/.code-insights/web-config.json`.

### `code-insights connect`

Generate a URL to connect the web dashboard to your Firebase.

```bash
code-insights connect
```

**Flags:**
- `--no-qr` — Skip QR code output (prints URL only)

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
- Token usage, estimated costs, and model information (when available)

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

## Contributing

See [CONTRIBUTING.md](https://github.com/melagiri/code-insights/blob/master/CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

MIT License — see [LICENSE](https://github.com/melagiri/code-insights/blob/master/LICENSE) for details.
