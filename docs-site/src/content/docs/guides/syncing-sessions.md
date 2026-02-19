---
title: Syncing Sessions
description: How session sync works — incremental updates, filtering, and auto-sync.
---

The `sync` command reads Claude Code JSONL files from `~/.claude/projects/` and uploads them to your Firestore.

## How It Works

Each JSONL file represents a Claude Code session. The CLI:

1. Scans `~/.claude/projects/` for JSONL files
2. Parses each file to extract messages, metadata, and tool calls
3. Generates a title for each session (based on content)
4. Classifies the session character (deep focus, bug hunt, feature build, etc.)
5. Uploads projects, sessions, and messages to Firestore

## Incremental Sync

Sync state is tracked in `~/.code-insights/sync-state.json`. On each run:

- File modification times are compared against the last sync
- Only new or modified files are processed
- Syncs are idempotent — running `sync` twice won't create duplicates

This means subsequent syncs are fast. Only the first sync processes your entire history.

## Filtering by Project

Sync only a specific project:

```bash
code-insights sync --project "my-project"
```

The project name matches the directory name under `~/.claude/projects/`.

## Force Re-Sync

To re-process and re-upload everything (ignoring the sync state cache):

```bash
code-insights sync --force
```

This is useful if you suspect data is out of sync, or after a schema update.

## Dry Run

Preview what would be synced without actually uploading:

```bash
code-insights sync --dry-run
```

## Quiet Mode

Suppress all output. Useful when running from hooks:

```bash
code-insights sync -q
```

## Regenerate Titles

Force the CLI to regenerate titles for all sessions:

```bash
code-insights sync --regenerate-titles
```

## Auto-Sync with Hooks

Instead of manually running `sync`, you can install a Claude Code hook that syncs automatically when each session ends:

```bash
code-insights install-hook
```

This adds a hook that runs `code-insights sync -q` after every session. To remove it:

```bash
code-insights uninstall-hook
```

## Multi-Device Sync

You can sync from multiple machines to the same Firebase:

- **Git-based projects** get stable IDs derived from the git remote URL. Same repo on different machines = same project ID in Firestore.
- **Non-git projects** fall back to a path-based hash (these will differ across machines).
- Each session records device metadata (hostname, platform) so you can tell where it came from.

## Troubleshooting

### Sync is slow on first run

The first sync processes your entire history. Depending on how many sessions you have, this can take a minute or two. Subsequent syncs are incremental and much faster.

### "Permission denied" errors

Your Firebase service account credentials may be invalid or expired. Re-run `code-insights init` to re-enter them.

### Dashboard shows no data after sync

- Verify that the `projectId` in your web config matches the `project_id` in your service account JSON — they must point to the same Firebase project.
- Run `code-insights status` to confirm sessions were uploaded.
- Check that your [Firestore security rules](/guides/firebase-setup/#update-firestore-security-rules) allow reads.
