# Code Insights

Transform your Claude Code session history into structured, searchable insights.

Code Insights parses Claude Code's JSONL session files (`~/.claude/projects/`) and syncs them to your own Firebase database, where you can visualize patterns, track decisions, and analyze your AI-assisted development workflow.

## Privacy Model

| What | Where | Who Can Access |
|------|-------|----------------|
| Your session data | Your Firebase | Only you |
| Login credentials | Hosted dashboard | Authentication only |
| Analytics | Vercel Analytics | Aggregate, anonymous |

**Your Claude Code data stays in YOUR Firebase** - the hosted dashboard just displays it.

## Quick Start

### 1. Set Up Firebase

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Firestore Database
3. Get credentials:
   - **Service Account**: Project Settings → Service Accounts → Generate New Private Key
   - **Web Config**: Project Settings → General → Your Apps → Web App config

### 2. Install & Configure CLI

```bash
cd cli
pnpm install && pnpm build && npm link

# One-time setup - collects both CLI and web credentials
claudeinsight init
```

### 3. Sync & Open Dashboard

```bash
# Sync your Claude Code sessions
claudeinsight sync

# Open the dashboard (auto-configured!)
claudeinsight open
```

That's it! The `open` command launches the hosted dashboard with your Firebase config pre-loaded.

## Architecture

```
~/.claude/projects/**/*.jsonl
           │
           ▼
    ┌─────────────┐
    │   CLI       │  Parse JSONL, extract metadata
    │  (Node.js)  │  Upload to YOUR Firestore
    └─────────────┘
           │
           ▼
    ┌─────────────┐
    │  Firestore  │  projects, sessions, messages, insights
    │  (YOUR DB)  │  ← You own this data
    └─────────────┘
           │
           ▼
    ┌─────────────────────────────────────┐
    │  Hosted Dashboard (Vercel)          │
    │  ├── Auth (Google/GitHub login)     │
    │  ├── Analytics (anonymous usage)    │
    │  └── UI connects to YOUR Firestore  │
    └─────────────────────────────────────┘
```

## Features

### CLI Commands
```bash
claudeinsight init          # Configure Firebase credentials
claudeinsight sync          # Sync sessions to Firestore
claudeinsight sync --force  # Re-sync all sessions
claudeinsight open          # Open dashboard in browser
claudeinsight status        # Show sync statistics
claudeinsight insights      # View recent insights
claudeinsight reset         # Clear all Firestore data
```

### Web Dashboard
- **Authentication** - Sign in with Google or GitHub
- **Real-time views** - Sessions, projects, insights
- **LLM Analysis** - Generate insights with your own API key
- **Analytics** - Usage patterns and trends
- **Export** - Markdown (plain, Obsidian, Notion)

## Insight Types

| Type | Description |
|------|-------------|
| **Summary** | High-level narrative of what was accomplished |
| **Decision** | Choices made with reasoning and alternatives |
| **Learning** | Technical discoveries and transferable knowledge |
| **Technique** | Problem-solving approaches and debugging strategies |

## Multi-Device Support

Sync from multiple machines to the same Firebase:
- Project IDs derived from git remote URLs (stable across devices)
- Each session tracks device metadata
- Session counts are idempotent

## Tech Stack

- **CLI**: Node.js, TypeScript, Commander.js, Firebase Admin SDK
- **Web**: Next.js 16, React 19, Tailwind CSS, shadcn/ui
- **Auth**: NextAuth.js (Google, GitHub)
- **Database**: Vercel Postgres (users), Firebase Firestore (your data)
- **Analytics**: Vercel Analytics
- **LLM**: OpenAI, Anthropic, Gemini, Ollama

## Self-Hosting

Want to host your own dashboard? See [web/README.md](/web/README.md) for deployment instructions.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style, and PR guidelines.

Please note that this project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT License - see [LICENSE](LICENSE) for details.
