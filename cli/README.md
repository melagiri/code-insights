# ClaudeInsight CLI

Sync your Claude Code sessions to Firebase for analysis.

## Installation

```bash
npm install -g claudeinsight
```

Or with pnpm:
```bash
pnpm add -g claudeinsight
```

## Quick Start

### 1. Set up Firebase

See [Firebase Setup Guide](docs/FIREBASE_SETUP.md) for detailed instructions.

### 2. Configure the CLI

**Option A: Quick Setup (Recommended)**

If you have the Firebase JSON files downloaded:

```bash
claudeinsight init --from-json ~/Downloads/serviceAccountKey.json
```

**Option B: With Web Dashboard Link**

Include web config for instant dashboard connection:

```bash
claudeinsight init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.json
```

**Option C: Interactive Setup**

```bash
claudeinsight init
```

### 3. Sync your sessions

```bash
claudeinsight sync
```

### 4. Connect the Dashboard

```bash
claudeinsight link
```

This generates a URL and QR code to auto-configure the web dashboard.

Or visit [claude-insights.vercel.app](https://claude-insights.vercel.app) and configure manually.

## Commands

| Command | Description |
|---------|-------------|
| `init` | Configure Firebase credentials interactively |
| `init --from-json <path>` | Import service account from JSON file |
| `init --web-config <path>` | Also configure web dashboard linking |
| `sync` | Sync sessions to Firestore |
| `sync --force` | Re-sync all sessions (ignores cache) |
| `sync --dry-run` | Preview without uploading |
| `sync --quiet` | Suppress output (for automation) |
| `status` | Show configuration and sync status |
| `link` | Generate dashboard connection URL/QR code |
| `link --no-qr` | URL only, skip QR code |
| `install-hook` | Auto-sync on Claude Code session end |
| `uninstall-hook` | Remove auto-sync hook |

## How It Works

1. The CLI reads Claude Code session files from `~/.claude/projects/`
2. Parses JSONL files and extracts session metadata + messages
3. Uploads to your Firebase Firestore database
4. The web dashboard reads from your Firestore and provides:
   - Chat conversation view
   - LLM-powered insight generation
   - Analytics and export features

## Data Privacy

**Your data, your infrastructure.** All session data is stored in your own Firebase project. The CLI only uploads to Firebase credentials you provide. Nothing is sent to ClaudeInsight servers.

## Multi-Device Support

Sessions are identified by git remote URL (when available) or project path. This means you can sync from multiple machines to the same Firebase project.

## Requirements

- Node.js 18+
- Firebase project with Firestore enabled
- Claude Code installed with session history
