---
title: CLI Commands
description: Complete reference for every code-insights command and flag.
---

## `code-insights init`

Configure Code Insights with your Firebase credentials.

```bash
# Import from files (recommended)
code-insights init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.js

# Interactive setup
code-insights init
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--from-json <path>` | Path to Firebase service account JSON file |
| `--web-config <path>` | Path to Firebase web SDK config file (JSON or JS snippet) |

You can use one flag, both, or neither. Values not provided via flags are collected interactively.

Configuration is stored in `~/.code-insights/config.json`. Web config is stored separately in `~/.code-insights/web-config.json`.

---

## `code-insights sync`

Sync Claude Code sessions to Firestore.

```bash
# Sync new/modified sessions
code-insights sync

# Force re-sync all sessions
code-insights sync --force

# Preview what would be synced
code-insights sync --dry-run

# Sync a specific project only
code-insights sync --project "my-project"

# Quiet mode (for hooks)
code-insights sync -q

# Regenerate all session titles
code-insights sync --regenerate-titles
```

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--force` | `-f` | Re-sync all sessions, ignoring the sync state cache |
| `--project <name>` | `-p` | Only sync sessions from the named project |
| `--dry-run` | | Show what would be synced without uploading |
| `--quiet` | `-q` | Suppress all output (useful for hooks) |
| `--regenerate-titles` | | Regenerate titles for all sessions |

Sync state is tracked in `~/.code-insights/sync-state.json`. Only new or modified files are processed unless `--force` is used.

---

## `code-insights status`

Show sync status and statistics.

```bash
code-insights status
```

Displays:
- Configuration status
- Total sessions synced
- Projects tracked
- Last sync time

No flags.

---

## `code-insights connect`

Generate a URL to connect the web dashboard to your Firebase.

```bash
# Print URL and QR code
code-insights connect

# URL only, no QR code
code-insights connect --no-qr
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--no-qr` | Skip QR code output (print URL only) |

The URL includes your Firebase web config base64-encoded as a query parameter. Open it in a browser to connect the dashboard to your Firestore automatically.

---

## `code-insights install-hook`

Install a Claude Code hook for automatic sync after each session.

```bash
code-insights install-hook
```

This adds a hook that runs `code-insights sync -q` whenever a Claude Code session ends. No flags.

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

This deletes all documents from the `projects`, `sessions`, `messages`, and `insights` collections in Firestore, and removes the local sync state file.

---

## Global Options

```bash
code-insights --version    # Print version
code-insights --help       # Show help
code-insights <cmd> --help # Show help for a specific command
```
