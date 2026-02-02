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

1. **Initialize** with your Firebase credentials:
   ```bash
   claudeinsight init
   ```

   You'll need a Firebase project with Firestore enabled. Get service account credentials from:
   **Firebase Console → Project Settings → Service Accounts → Generate New Private Key**

2. **Sync** your sessions:
   ```bash
   claudeinsight sync
   ```

3. **View insights** on the web dashboard:

   Visit [https://claudeinsight.vercel.app](https://claudeinsight.vercel.app) and configure your Firebase credentials.

## Commands

### `claudeinsight init`
Configure Firebase service account credentials. You'll be prompted for:
- Project ID
- Client Email
- Private Key

### `claudeinsight sync`
Sync Claude Code sessions from `~/.claude/projects/` to your Firestore.

Options:
- `--force` - Re-sync all sessions (ignores cache)
- `--project <name>` - Only sync sessions from a specific project
- `--dry-run` - Preview what would be synced without making changes
- `--quiet` - Suppress output (useful for hooks/automation)

### `claudeinsight status`
Show configuration status, sync history, and connection info.

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
