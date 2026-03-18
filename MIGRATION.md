# Migration Guide — v2 to v3

## What Changed in v3

v3 is a complete architectural rewrite. Firebase is gone. The dashboard is now built-in and runs locally.

| Aspect | v2 | v3 |
|--------|----|----|
| Data store | Firebase Firestore (your cloud project) | SQLite at `~/.code-insights/data.db` |
| Dashboard | Hosted at code-insights.app | Built-in, runs at `localhost:7890` |
| Authentication | Google/GitHub via Supabase | None (local-only) |
| `connect` command | Generates Firebase connection URL | **Removed** |
| `init` | Required Firebase credentials | No credentials needed |
| `sync` | Uploads to Firestore | Writes to local SQLite |
| `open` | Opened code-insights.app | Opens `localhost:7890` |
| `reset` | Cleared Firestore + local state | Clears local SQLite + sync state |

**No external accounts or API keys are required to use v3.** LLM analysis (optional) uses your own API key stored locally.

---

## Migration Steps

### Step 1: Install v3

```bash
npm install -g @code-insights/cli@latest
```

Verify:

```bash
code-insights --version
# Should print 3.0.0
```

### Step 2: Re-initialize

```bash
code-insights init
```

This creates `~/.code-insights/config.json` and initializes the SQLite database at `~/.code-insights/data.db`. No Firebase credentials are required.

> **Note:** `init` is optional for new installations, but required when upgrading from v2 because the config format changed.

### Step 3: Re-sync All Sessions

```bash
code-insights sync --force
```

`--force` re-parses all session files from scratch. This is necessary because v2 sync state is incompatible with v3. Depending on how many sessions you have, this may take a moment.

### Step 4: Open the Dashboard

```bash
code-insights dashboard
```

The built-in dashboard starts at `http://localhost:7890`. No Firebase connection URL needed.

Or simply run `code-insights` (no arguments) to sync and open the dashboard in one step.

### Step 5 (Optional): Re-configure LLM Analysis

If you used AI-powered session analysis in v2, re-configure your LLM provider:

```bash
code-insights config llm
```

Supported providers: Anthropic, OpenAI, Google Gemini, Ollama (local, no API key needed).

### Step 6 (Optional): Re-install the Auto-Sync Hook

```bash
code-insights uninstall-hook  # Remove old hook if installed
code-insights install-hook    # Install v3 hook
```

---

## What's Preserved

Session data is re-synced from the original source files (JSONL files for Claude Code, workspace databases for Cursor, etc.). All sessions that existed on disk are recovered.

---

## What's Lost

| Lost | Reason |
|------|--------|
| **Custom session titles** | Titles are regenerated from session content during `sync --force`. Any titles you manually edited in the v2 dashboard are not recoverable. |
| **LLM-generated insights** | Insights (summaries, decisions, learnings) stored in Firestore are not migrated. Re-generate them from the dashboard after syncing. |
| **Firebase Firestore data** | Your Firestore data remains in Firebase — Code Insights no longer reads it. You can delete the Firebase project if you want. |

---

## FAQ

**Can I delete my Firebase project?**

Yes. v3 doesn't use Firebase at all. Your Firestore data won't be deleted by uninstalling the CLI — you'll need to delete the Firebase project manually from the Firebase Console if you want to clean it up.

**Do I need a Google account for v3?**

No. v3 is fully local. No accounts of any kind are required.

**Will my session history be complete after migrating?**

Yes, as long as your source session files are still on disk. v3 re-parses from the original files, so nothing is lost that wasn't already gone from your machine.

**What happened to the hosted dashboard at code-insights.app?**

The hosted dashboard is no longer maintained. All dashboard functionality is now built into the CLI and served locally.

**What if I had sessions on multiple devices synced to Firebase?**

v3 tracks sessions per-device. Run `code-insights sync --force` on each machine independently. Sessions from different devices will have separate records in each machine's local database.

**Can I use v3 alongside v2?**

The CLI binary is the same (`code-insights`). Installing v3 replaces v2. The config format changed, so `code-insights init` is required after upgrading to write the new config.
