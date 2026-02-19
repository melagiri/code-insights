---
title: Introduction
description: What Code Insights is, why it exists, and how it works.
---

Code Insights parses your Claude Code session history — the JSONL files stored in `~/.claude/projects/` — and syncs them to your own Firebase database. From there, a web dashboard lets you browse sessions, generate LLM-powered insights, and track patterns in how you work with AI.

## Why?

Claude Code stores every conversation as JSONL. That's valuable data: what you built, why you made certain choices, what went wrong and how you fixed it. But raw JSON isn't searchable or browsable. Code Insights makes it useful.

## Privacy: Bring Your Own Firebase

There is no central Code Insights server storing your data. The architecture is simple:

| What | Where | Who can access |
|------|-------|----------------|
| Your session data | Your Firebase | Only you |
| Login credentials | Supabase Auth | Authentication only |
| Analytics | Vercel Analytics | Aggregate, anonymous |

You create a Firebase project, point the CLI at it, and your data stays there. The hosted dashboard at [code-insights.app](https://code-insights.app) connects to *your* Firestore to display it — it never stores your session data.

## How It Works

```
~/.claude/projects/**/*.jsonl
           |
           v
    +--------------+
    |   CLI         |  Parse JSONL, extract metadata
    |  (Node.js)    |  Upload to YOUR Firestore
    +--------------+
           |
           v
    +--------------+
    |  Firestore    |  projects, sessions, messages
    |  (YOUR DB)    |  <- You own this data
    +--------------+
           |
           v
    +------------------------------------+
    |  Web Dashboard (code-insights.app) |
    |  Reads from YOUR Firestore         |
    |  LLM insights with YOUR API key    |
    +------------------------------------+
```

The system has two parts:

- **CLI** (this repo, open source) — Parses JSONL files, generates session titles, classifies session types, and syncs everything to Firestore.
- **Web Dashboard** (closed source, hosted at Vercel) — Visualizes sessions, runs LLM analysis, and exports data to Markdown.

## What You Get

- **Session browser** — Search, filter, and read full session transcripts.
- **Smart titles** — Sessions are automatically titled based on content, so you can find things later.
- **Session classification** — Each session gets a character type: deep focus, bug hunt, feature build, exploration, refactor, learning, or quick task.
- **LLM analysis** — Generate summaries, decisions, learnings, and technique insights using your own API key (OpenAI, Anthropic, Gemini, or Ollama).
- **Multi-device sync** — Sync from multiple machines to the same Firebase. Project IDs are stable across devices when using git.
- **Markdown export** — Download insights in plain, Obsidian, or Notion format.

## Next Steps

Ready to set it up? Head to [Installation](/getting-started/installation/).
