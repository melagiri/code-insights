---
title: Quick Start
description: Go from install to dashboard in five minutes.
---

This guide assumes you've already [installed the CLI](/getting-started/installation/) and [set up Firebase](/guides/firebase-setup/). If not, do those first.

## 1. Configure the CLI

Point the CLI at your Firebase project using the two JSON files from the Firebase setup:

```bash
code-insights init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.js
```

The CLI reads both files and configures everything automatically. No manual copy-pasting needed.

:::tip
You can also run `code-insights init` without flags for an interactive setup wizard that prompts for each value.
:::

## 2. Sync Your Sessions

```bash
code-insights sync
```

This parses all Claude Code JSONL files in `~/.claude/projects/` and uploads them to your Firestore. The first sync may take a moment depending on how many sessions you have.

:::note
If you have months of Claude Code history, the initial sync may exceed Firebase's free tier write limits. Consider temporarily upgrading to the [Blaze plan](https://firebase.google.com/pricing) (pay-as-you-go) for the initial sync. The cost is negligible. Subsequent syncs are incremental and stay well within the free tier.
:::

## 3. Open the Dashboard

```bash
code-insights connect
```

This generates a URL to [code-insights.app](https://code-insights.app) with your Firebase config encoded in the link. Open it in your browser, sign in with Google or GitHub, and you'll see your synced sessions.

## 4. Set Up Auto-Sync (Optional)

```bash
code-insights install-hook
```

This installs a Claude Code hook that automatically runs `code-insights sync -q` whenever a session ends. Your dashboard stays up to date without manual syncs.

## What's Next

- [Syncing Sessions](/guides/syncing-sessions/) — Learn about incremental sync, filtering, and force re-sync
- [Web Dashboard](/guides/web-dashboard/) — Explore what the dashboard offers
- [CLI Commands](/reference/commands/) — Full reference for every command and flag
