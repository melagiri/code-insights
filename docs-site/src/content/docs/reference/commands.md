---
title: CLI Commands
description: Complete reference for every code-insights command and flag.
---

## `code-insights init`

Configure Code Insights with your data source preference and optional Firebase credentials.

```bash
# Import from files (recommended — auto-sets data source to Firebase)
code-insights init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.js

# Interactive setup — prompts for data source + credentials
code-insights init
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--from-json <path>` | Path to Firebase service account JSON file |
| `--web-config <path>` | Path to Firebase web SDK config file (JSON or JS snippet) |

During interactive setup, the CLI first asks for your preferred data source:
- **Local** (recommended default) — Stats read from local session files. No Firebase required.
- **Firebase** — Stats read from Firestore. Requires credentials.

Using `--from-json` or `--web-config` automatically sets the data source to Firebase.

Configuration is stored in `~/.code-insights/config.json`. Web config is stored separately in `~/.code-insights/web-config.json`.

---

## `code-insights stats`

Terminal analytics for your AI coding sessions. Works without Firebase in local mode.

### `code-insights stats` (no subcommand)

Dashboard overview showing sessions, cost, time, activity sparkline, and top projects.

```bash
code-insights stats
code-insights stats --period 30d
code-insights stats --project my-project
```

### `code-insights stats cost`

Cost breakdown by project and model, with daily trend sparkline.

```bash
code-insights stats cost
code-insights stats cost --period 30d
```

### `code-insights stats projects`

Per-project detail cards with metrics, last active date, and activity sparkline.

```bash
code-insights stats projects
code-insights stats projects --project my-project
```

### `code-insights stats today`

Today's sessions listed most-recent-first. Shows time, project, duration, cost, title, model, and message count. Ignores `--period`.

```bash
code-insights stats today
```

### `code-insights stats models`

Model usage distribution with session/cost percentages, token breakdown, and trend sparkline.

```bash
code-insights stats models
code-insights stats models --period 30d
```

### Shared Flags (all stats subcommands)

| Flag | Short | Description |
|------|-------|-------------|
| `--local` | | Force local data source (no Firebase needed) |
| `--remote` | | Force Firestore data source (error if not configured) |
| `--period <range>` | | Time range: `7d`, `30d`, `90d`, or `all` (default: `7d`) |
| `--project <name>` | `-p` | Scope to a specific project (supports fuzzy matching) |
| `--source <tool>` | `-s` | Filter by source tool (e.g., `claude-code`, `cursor`) |
| `--no-sync` | | Skip auto-sync before displaying stats |

**Data source resolution:** `--local` flag > `--remote` flag > `config.dataSource` > inferred from Firebase credentials > local fallback.

---

## `code-insights config`

View and manage CLI configuration.

### `code-insights config` (no subcommand)

Show current data source preference, Firebase status, and config file location.

```bash
code-insights config
```

### `code-insights config set-source`

Switch the data source preference.

```bash
code-insights config set-source local     # Local-only mode (no Firebase)
code-insights config set-source firebase  # Firebase mode (requires credentials)
```

Setting to `firebase` requires Firebase credentials to be configured. Setting to `local` preserves any existing Firebase credentials (reversible).

---

## `code-insights sync`

Sync sessions from all supported tools (Claude Code, Cursor, Codex CLI, Copilot CLI) to Firestore.

```bash
# Sync new/modified sessions
code-insights sync

# Force re-sync all sessions
code-insights sync --force

# Preview what would be synced
code-insights sync --dry-run

# Sync a specific project only
code-insights sync --project "my-project"

# Sync only from a specific tool
code-insights sync --source cursor

# Quiet mode (for hooks)
code-insights sync -q

# Regenerate all session titles
code-insights sync --regenerate-titles

# Sync even when data source is set to local
code-insights sync --force-remote
```

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--force` | `-f` | Re-sync all sessions, ignoring the sync state cache |
| `--project <name>` | `-p` | Only sync sessions from the named project |
| `--source <name>` | `-s` | Only sync from a specific tool (e.g., `cursor`) |
| `--dry-run` | | Show what would be synced without uploading |
| `--quiet` | `-q` | Suppress all output (useful for hooks) |
| `--regenerate-titles` | | Regenerate titles for all sessions |
| `--force-remote` | | Sync even when data source is set to local |

When data source is set to `local`, sync shows a warning and exits. Use `--force-remote` to override.

Sync state is tracked in `~/.code-insights/sync-state.json`. Only new or modified files are processed unless `--force` is used.

---

## `code-insights status`

Show sync status, statistics, and data source preference.

```bash
code-insights status
```

Displays:
- Data source preference (local or Firebase)
- Configuration status
- Total sessions synced (if Firebase configured)
- Projects tracked
- Last sync time

No flags.

---

## `code-insights connect`

Generate a URL to connect the web dashboard to your Firebase.

```bash
code-insights connect
```

The URL includes your Firebase web config base64-encoded as a query parameter. Open it in a browser to connect the dashboard to your Firestore automatically.

No flags.

---

## `code-insights install-hook`

Install a Claude Code hook for automatic sync after each session ends.

```bash
code-insights install-hook
```

This adds a hook that runs `code-insights sync -q` whenever a Claude Code session ends, keeping your dashboard up to date automatically.

In local mode, this command warns that sync requires Firebase and skips installation.

No flags.

---

## `code-insights uninstall-hook`

Remove the automatic sync hook.

```bash
code-insights uninstall-hook
```

No flags.

---

## `code-insights reset`

Delete all data from Firestore and reset local sync state.

```bash
# Interactive (asks for confirmation)
code-insights reset

# Skip confirmation prompt
code-insights reset --confirm
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--confirm` | Skip the confirmation prompt |

In Firebase mode, this deletes all documents from the `projects`, `sessions`, `messages`, and `insights` collections in Firestore, and removes the local sync state file.

In local mode, this clears the local stats cache only.

---

## Global Options

```bash
code-insights --version    # Print version
code-insights --help       # Show help
code-insights <cmd> --help # Show help for a specific command
```
