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
- **pnpm** package manager (`npm install -g pnpm`)
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

### Step 4: Register a Web App

The web dashboard uses this config to read data from your Firestore.

1. Still in **Project settings**, go to the **"General"** tab
2. Scroll down to **"Your apps"**
3. Click the **Web icon** (`</>`) to add a web app
4. Enter a nickname (e.g., `code-insights-web`), click **"Register app"**
5. You'll see a config snippet — note these values for the setup wizard:

```
apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId
```

> **Tip:** Click the **"Config"** radio button (instead of "npm") to see the raw key-value pairs.

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
# From the repository root
cd cli
pnpm install
pnpm build
pnpm link --global
```

This makes `code-insights` available as a global command. Now run the setup wizard:

```bash
code-insights init
```

The wizard will prompt you for:
1. **Service account credentials** — `project_id`, `client_email`, and `private_key` from the JSON file you downloaded in Step 3
2. **Web SDK config** — the six values from Step 4 (`apiKey`, `authDomain`, etc.)
3. **Dashboard URL** — press Enter to accept the default (`https://code-insights.app`)

> **Tip:** Keep the service account JSON file open in a text editor so you can copy values during setup. The `private_key` is a long multi-line string starting with `-----BEGIN PRIVATE KEY-----`.

### Step 7: Sync Your Sessions

```bash
code-insights sync
```

This parses all Claude Code JSONL files in `~/.claude/projects/` and uploads them to your Firestore. First sync may take a moment depending on how many sessions you have.

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
code-insights sync                     # Sync sessions to Firestore
code-insights sync --force             # Re-sync all sessions (ignores cache)
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

## Tech Stack

- **CLI**: Node.js, TypeScript, Commander.js, Firebase Admin SDK
- **Web**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- **Auth**: NextAuth.js (Google, GitHub)
- **Database**: Vercel Postgres (auth only), Firebase Firestore (your data)
- **Analytics**: Vercel Analytics
- **LLM**: OpenAI, Anthropic, Gemini, Ollama

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style, and PR guidelines.

Please note that this project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT License - see [LICENSE](LICENSE) for details.
