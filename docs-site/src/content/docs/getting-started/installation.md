---
title: Installation
description: Install the Code Insights CLI and verify it works.
---

## Prerequisites

- **Node.js** 18 or later
- At least one supported AI coding tool with existing session history:
  - **Claude Code** — `~/.claude/projects/`
  - **Cursor** — Workspace storage (macOS, Linux, Windows)
  - **OpenAI Codex CLI** — `~/.codex/sessions/`
  - **GitHub Copilot CLI** — `~/.copilot/session-state/`
- A **Google account** (for Firebase — see [Firebase Setup](/guides/firebase-setup/))

## Install

```bash
npm install -g @code-insights/cli
```

## Verify

```bash
code-insights --version
```

You should see `1.0.0` (or the current version).

## Next Steps

Before you can sync sessions, you need a Firebase project. If you already have one configured, jump to [Quick Start](/getting-started/quick-start/). Otherwise, follow the [Firebase Setup](/guides/firebase-setup/) guide first.
