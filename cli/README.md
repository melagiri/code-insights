# Code Insights CLI

Command-line tool that parses AI coding session history and provides terminal analytics. Optionally syncs to your own Firebase Firestore for the web dashboard.

Full documentation: [docs.code-insights.app](https://docs.code-insights.app)

## Prerequisites

- **Node.js** 18 or later
- **For local-only stats:** No additional setup required
- **For Firebase sync + web dashboard:** A Firebase project with Firestore enabled (see [Quick Start](https://docs.code-insights.app/getting-started/quick-start/))

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

Configure Code Insights with your data source preference and optional Firebase credentials.

```bash
# Quick setup — import directly from files (recommended)
code-insights init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.js

# Interactive setup — prompts for data source + credentials
code-insights init
```

**Flags:**
- `--from-json <path>` — Path to the Firebase service account key (auto-sets data source to Firebase)
- `--web-config <path>` — Path to the Firebase web SDK config (JSON or JS snippet)

During interactive setup, the CLI first asks for your preferred data source:
- **Local** (recommended) — Stats read from local session files. No Firebase required.
- **Firebase** — Stats read from Firestore. Requires Firebase credentials.

Configuration is stored in `~/.code-insights/config.json`. Web config is stored separately in `~/.code-insights/web-config.json`.

### `code-insights stats`

Terminal analytics for your AI coding sessions. Works without Firebase.

```bash
# Dashboard overview (default: last 7 days)
code-insights stats

# Cost breakdown by project and model
code-insights stats cost

# Per-project detail cards with sparklines
code-insights stats projects

# Today's sessions with time, cost, model details
code-insights stats today

# Model usage distribution and cost chart
code-insights stats models
```

**Shared flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--local` | | Force local data source (no Firebase) |
| `--remote` | | Force Firestore data source |
| `--period <range>` | | Time range: `7d`, `30d`, `90d`, or `all` (default: `7d`) |
| `--project <name>` | `-p` | Scope to a specific project (fuzzy matching) |
| `--source <tool>` | `-s` | Filter by source tool (e.g., `claude-code`, `cursor`) |
| `--no-sync` | | Skip auto-sync before displaying stats |

### `code-insights config`

View and manage CLI configuration.

```bash
# Show current configuration
code-insights config

# Set data source preference
code-insights config set-source local     # Local-only mode
code-insights config set-source firebase  # Firebase mode
```

### `code-insights connect`

Generate a URL to connect the web dashboard to your Firebase.

```bash
code-insights connect
```

The URL includes your Firebase web config base64-encoded as a query parameter. Open it in a browser to connect the dashboard to your Firestore — no manual configuration needed.

### `code-insights sync`

Sync sessions from all supported tools to Firestore.

```bash
# Sync new/modified sessions
code-insights sync

# Force re-sync all sessions
code-insights sync --force

# Preview what would be synced
code-insights sync --dry-run

# Sync specific project only
code-insights sync --project "my-project"

# Sync only from a specific tool
code-insights sync --source cursor

# Quiet mode (for hooks)
code-insights sync --quiet

# Regenerate titles for all sessions
code-insights sync --regenerate-titles

# Sync even when data source is set to local
code-insights sync --force-remote
```

> **Note:** When data source is set to `local`, sync shows a warning and exits. Use `--force-remote` to override, or switch with `config set-source firebase`.

### `code-insights status`

Show sync status, statistics, and data source preference.

```bash
code-insights status
```

Displays:
- Data source preference (local or Firebase)
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

> **Note:** In local mode, this clears the local stats cache only. Firestore data is not affected.

### `code-insights install-hook`

Install a Claude Code hook for automatic sync after each session.

```bash
code-insights install-hook
```

> **Note:** In local mode, the hook is not installed (sync requires Firebase).

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
