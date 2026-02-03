# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Code Insights CLI syncs Claude Code session history (`~/.claude/projects/` JSONL files) to the user's Firebase Firestore. It follows a **Bring Your Own Firebase (BYOF)** privacy model - users own all their data.

The web dashboard is hosted separately at [code-insights.ai](https://code-insights.ai).

## Commands

```bash
cd cli
pnpm install          # Install dependencies
pnpm dev              # Watch mode (tsc --watch)
pnpm build            # Compile TypeScript to dist/
pnpm lint             # Run ESLint

# After building, link for local testing:
npm link
code-insights init                     # Configure Firebase credentials
code-insights sync                     # Sync sessions to Firestore
code-insights sync --force             # Re-sync all sessions
code-insights sync --dry-run           # Preview without changes
code-insights status                   # Show sync statistics
```

## Architecture

### Data Flow
```
~/.claude/projects/**/*.jsonl → CLI Parser → User's Firestore → Web Dashboard
```

### CLI Structure (`/cli/src/`)
- `commands/` - CLI commands (init, sync, status, install-hook, reset)
- `parser/jsonl.ts` - JSONL file parsing
- `parser/titles.ts` - Smart session title generation
- `firebase/client.ts` - Firebase Admin SDK for Firestore writes
- `utils/config.ts` - Configuration management (~/.code-insights/)
- `utils/device.ts` - Device ID and stable project ID generation
- `types.ts` - TypeScript types

### Firestore Collections (written by CLI)
- `projects` - Project metadata (id is hash of git remote or path)
- `sessions` - Session metadata with device info
- `messages` - Full message content for LLM analysis

## Key Patterns

### Session Parsing
- Streams JSONL files line-by-line
- Extracts messages, tool calls, timestamps
- Generates smart titles based on content/character

### Session Title Generation (`parser/titles.ts`)
Priority: Claude summary → User message scoring → Session character → Fallback

Session characters: `deep_focus`, `bug_hunt`, `feature_build`, `exploration`, `refactor`, `learning`, `quick_task`

### Stable Project IDs (`utils/device.ts`)
- Primary: Hash of git remote URL (stable across devices)
- Fallback: Hash of project path
- Enables multi-device sync to same Firebase

### Firebase Integration
- Uses Admin SDK with service account credentials
- Batch writes capped at 500 operations
- Incremental sync tracks file modification times
- Messages truncated to 10KB, tool inputs to 1KB

## Configuration

Stored in `~/.code-insights/`:
- `config.json` - Firebase credentials (mode 0o600)
- `sync-state.json` - File modification tracking
- `device-id` - Persistent device identifier

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **CLI Framework**: Commander.js
- **Firebase**: Admin SDK
- **UI**: Chalk, Ora (spinners)
- **Package Manager**: pnpm

## Development Notes

- No test framework configured yet
- ESLint configured
- Build output in `dist/`
