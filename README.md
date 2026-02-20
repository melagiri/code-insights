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

## Prerequisites

- **Node.js** 18 or later
- **Claude Code** installed with existing session history in `~/.claude/projects/`
- A **Google account** (for Firebase)

## Quick Start

### Step 1: Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"** (or **"Add project"**)
3. Enter a project name (e.g., `code-insights-yourname`)
4. Disable Google Analytics when prompted (not needed)
5. Click **"Create project"** and wait for it to finish

### Step 2: Enable Firestore Database

1. In your new project, click **"Build"** in the left sidebar
2. Click **"Firestore Database"**
3. Click **"Create database"**
4. Choose **"Start in production mode"**
5. Select the region closest to you (this cannot be changed later)
6. Click **"Enable"**

### Step 3: Download Service Account Key

The CLI uses this to write your session data to Firestore.

1. Click the **gear icon** next to "Project Overview" in the sidebar
2. Select **"Project settings"**
3. Go to the **"Service accounts"** tab
4. Click **"Generate new private key"** → **"Generate key"**
5. A JSON file will download — keep it somewhere safe (e.g., `~/Downloads/serviceAccountKey.json`)

You'll need three values from this file during setup: `project_id`, `client_email`, and `private_key`.

### Step 4: Register a Web App and Save Config

The web dashboard uses this config to read data from your Firestore.

1. Still in **Project settings**, go to the **"General"** tab
2. Scroll down to **"Your apps"**
3. Click the **Web icon** (`</>`) to add a web app
4. Enter a nickname (e.g., `code-insights-web`), click **"Register app"**
5. Firebase will show a code snippet — copy the entire snippet and save it to a file (e.g., `~/Downloads/firebase-web-config.js`):

```javascript
// You can paste the entire Firebase snippet as-is — no need to convert to JSON
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

The CLI automatically extracts the config from the JavaScript — no manual conversion needed.

### Step 5: Update Firestore Security Rules

The default production rules block all reads, which prevents the web dashboard from loading your data. Update them:

1. In Firebase Console, go to **Firestore Database** → **Rules**
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

3. Click **"Publish"**

> **Note:** These rules allow open access, which is fine for personal use since your project ID is not public. For shared or team use, see [Firebase Security Rules documentation](https://firebase.google.com/docs/firestore/security/get-started).

### Step 6: Install and Configure the CLI

```bash
npm install -g @code-insights/cli
```

Now configure it with the two JSON files from Steps 3 and 4:

```bash
code-insights init \
  --from-json ~/Downloads/serviceAccountKey.json \
  --web-config ~/Downloads/firebase-web-config.json
```

That's it — no manual copy-pasting needed. The CLI reads both files and configures everything automatically.

> **Alternative:** Run `code-insights init` without flags for an interactive setup wizard that prompts for each value individually.

### Step 7: Sync Your Sessions

```bash
code-insights sync
```

This parses all Claude Code JSONL files in `~/.claude/projects/` and uploads them to your Firestore. First sync may take a moment depending on how many sessions you have.

> **Large backlogs?** If you have months of Claude Code history, the initial sync may exceed Firebase's free tier (Spark plan) write limits. Consider temporarily switching to the [Blaze plan](https://firebase.google.com/pricing) (pay-as-you-go) — the cost is negligible for a one-time sync. You can switch back to the free tier after a day or two once the backlog is uploaded. Subsequent syncs are incremental and well within free tier limits.

### Step 8: Open the Dashboard

```bash
code-insights connect
```

This generates a URL to [code-insights.app](https://code-insights.app) with your Firebase config encoded in the link. Open it in your browser, sign in with Google or GitHub, and you'll see your synced sessions.

### Step 9 (Optional): Auto-Sync on Session End

```bash
code-insights install-hook
```

This adds a Claude Code hook that automatically runs `code-insights sync -q` whenever a Claude Code session ends — so your dashboard stays up to date without manual syncs.

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

The CLI and web dashboard are developed in separate repositories:
- **CLI** (this repo) — Open source, MIT licensed
- **Web Dashboard** ([code-insights-web](https://github.com/melagiri/code-insights-web)) — Closed source, hosted at Vercel

## CLI Commands

```bash
code-insights init                     # Interactive setup wizard
code-insights init --from-json <path>  # Import service account from JSON file
code-insights init --web-config <path> # Import web SDK config from JSON file
code-insights sync                     # Sync sessions to Firestore
code-insights sync --force             # Re-sync all sessions (ignores cache)
code-insights sync --project <name>    # Sync only a specific project
code-insights sync --dry-run           # Preview what would be synced
code-insights sync -q                  # Quiet mode (for hooks)
code-insights sync --regenerate-titles # Regenerate all session titles
code-insights status                   # Show sync statistics
code-insights connect                  # Generate dashboard connection URL
code-insights install-hook             # Auto-sync when Claude Code sessions end
code-insights uninstall-hook           # Remove the auto-sync hook
code-insights reset --confirm          # Delete all Firestore data and local state
```

## Web Dashboard

The hosted dashboard at [code-insights.app](https://code-insights.app) connects to your Firebase and provides:

- **Authentication** — Sign in with Google or GitHub
- **Session Browser** — Search, filter, and view full session transcripts
- **LLM Analysis** — Generate insights using your own API key (OpenAI, Anthropic, Gemini, or Ollama)
- **Analytics** — Usage patterns, activity charts, and trends
- **Export** — Download as Markdown (plain, Obsidian, or Notion format)

## Insight Types

| Type | Description |
|------|-------------|
| **Summary** | High-level narrative of what was accomplished |
| **Decision** | Choices made with reasoning and alternatives |
| **Learning** | Technical discoveries and transferable knowledge |
| **Technique** | Problem-solving approaches and debugging strategies |
| **Prompt Quality** | Efficiency analysis, wasted turns, and anti-patterns |

## Token Usage & Cost Tracking

The CLI captures token usage, estimated costs, and model information from session data when available. These stats are synced per-session and aggregated per-project, enabling cost analysis on the dashboard.

## Multi-Device Support

Sync from multiple machines to the same Firebase:

- Project IDs are derived from git remote URLs (stable across devices)
- Each session tracks device metadata
- Syncs are idempotent — running `sync` twice won't create duplicates

## Troubleshooting

### "Permission denied" when dashboard loads

Your Firestore security rules are blocking reads. Update them in Firebase Console → Firestore Database → Rules. See [Step 5](#step-5-update-firestore-security-rules) above.

### "Invalid service account" during sync

- Ensure the `private_key` value includes the full `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
- Check that `client_email` ends with `@your-project.iam.gserviceaccount.com`
- Re-run `code-insights init` to re-enter credentials

### Dashboard shows no data after sync

- Verify that the `projectId` in your web config matches the `project_id` in your service account JSON — they must point to the same Firebase project
- Run `code-insights status` to confirm sessions were uploaded
- Clear your browser's localStorage and re-open the dashboard link

### Sync is slow or times out

- First sync processes all session history and may take a minute
- Subsequent syncs are incremental and much faster
- Use `code-insights sync --dry-run` to preview how many sessions will be synced

### Ollama CORS errors on the dashboard

If you're using Ollama as your LLM provider on the dashboard and seeing CORS errors, the macOS Ollama app doesn't read shell environment variables (`.zshrc`/`.bashrc`). Try one of these:

**Option 1 — Run from terminal** (most reliable):
Quit the Ollama menu bar app first, then:
```bash
OLLAMA_ORIGINS="https://code-insights.app" ollama serve
```
Keep the terminal open while using the dashboard.

**Option 2 — launchctl** (persistent for macOS app):
```bash
launchctl setenv OLLAMA_ORIGINS "https://code-insights.app"
```
Then fully quit Ollama (menu bar icon → Quit Ollama) and reopen it.

**Option 3 — Shell profile** (only works with `ollama serve`):
```bash
echo 'export OLLAMA_ORIGINS="https://code-insights.app"' >> ~/.zshrc
source ~/.zshrc
ollama serve
```
Note: This does NOT work with the macOS Ollama desktop app — only when running `ollama serve` from the terminal.

## Tech Stack

- **CLI**: Node.js, TypeScript, Commander.js, Firebase Admin SDK
- **Web**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- **Auth**: Supabase Auth (Google, GitHub OAuth)
- **Database**: Firebase Firestore (your data) — auth handled by Supabase
- **Analytics**: Vercel Analytics
- **LLM**: OpenAI, Anthropic, Gemini, Ollama

## Documentation

Full documentation is available at [docs.code-insights.app](https://docs.code-insights.app). Source files are in the [`docs-site/`](docs-site/) directory.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style, and PR guidelines.

Please note that this project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT License - see [LICENSE](LICENSE) for details.
