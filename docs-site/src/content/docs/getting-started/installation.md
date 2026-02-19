---
title: Installation
description: Install the Code Insights CLI and verify it works.
---

## Prerequisites

- **Node.js** 18 or later
- **pnpm** package manager (`npm install -g pnpm`)
- **Claude Code** installed with existing session history in `~/.claude/projects/`
- A **Google account** (for Firebase — see [Firebase Setup](/guides/firebase-setup/))

## Install from Source

```bash
git clone https://github.com/melagiri/code-insights.git
cd code-insights/cli
pnpm install
pnpm build
npm link
```

The `npm link` step makes `code-insights` available as a global command.

## Verify

```bash
code-insights --version
```

You should see `1.0.0` (or the current version).

## Next Steps

Before you can sync sessions, you need a Firebase project. If you already have one configured, jump to [Quick Start](/getting-started/quick-start/). Otherwise, follow the [Firebase Setup](/guides/firebase-setup/) guide first.
