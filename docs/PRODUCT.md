# Code Insights

## What It Is

Code Insights transforms your Claude Code session history into structured, searchable insights. It extracts patterns from your conversations—what you built, decisions you made, lessons learned—and presents them in a visual dashboard.

## The Problem

Claude Code stores every conversation as JSONL files in `~/.claude/projects/`. This is valuable data:
- What features did you work on last week?
- Why did you choose that architecture?
- What mistakes did you make (and fix)?
- How much time went into different parts of the codebase?

But it's trapped in raw JSON. You can't search it, visualize it, or learn from it.

## The Solution

Code Insights provides:

1. **Automated extraction** - Parses JSONL files and structures the data
2. **Smart session titles** - Auto-generates meaningful titles from session content
3. **Session classification** - Categorizes sessions (deep focus, bug hunt, feature build, etc.)
4. **LLM-powered analysis** - Multi-provider insight generation (OpenAI, Anthropic, Gemini, Ollama) with your own API key
5. **Visual dashboard** - Web interface with charts, timelines, and filters
6. **Markdown export** - Download insights as Obsidian, plain MD, or Notion format

## Who It's For

- **Claude Code developers** who want to track their AI-assisted work
- **Learners** who want to review and reinforce what they've built with Claude
- **Privacy-conscious users** who want insights without giving up their data

## Privacy Model

**Bring Your Own Firebase (BYOF)**

Code Insights stores all user session data in the user's own Firebase Firestore. The hosted dashboard:
- Requires Google/GitHub login for access control
- Collects anonymous aggregate analytics via Vercel Analytics
- **Does NOT store or access your Claude Code data** — that stays in your Firebase

## Core Features

### Insight Categories

| Category | What It Captures |
|----------|------------------|
| **Summary** | High-level narrative of what was accomplished |
| **Decision** | Architecture choices, trade-offs, reasoning, alternatives |
| **Learning** | Technical discoveries, mistakes, transferable knowledge |
| **Technique** | Problem-solving approaches and debugging strategies |

### Dashboard Views

- **Daily/Weekly digest** - Summary of recent sessions
- **Project timeline** - Visual history of work per project
- **Decision log** - Searchable archive of "why" decisions
- **Analytics** - Charts showing effort distribution, patterns
- **Session detail** - Full session with analyze button for LLM insights

### Export Options

- Filter by: project, date range, session
- Formats: Obsidian (with `[[links]]`), plain Markdown, Notion

## Tech Stack

- **CLI**: Node.js CLI (runs standalone or as Claude Code hook)
- **Database**: User's Firebase Firestore (session data) — auth handled by Supabase
- **AI**: Multi-provider — OpenAI, Anthropic, Gemini, Ollama (user's own API keys)
- **Web**: Next.js 16 + Tailwind CSS 4 + shadcn/ui
- **Auth**: Supabase Auth (Google, GitHub OAuth)
- **Hosting**: Vercel (dashboard), user's Firebase (data)

## Success Metrics

- Time to first insight: < 5 minutes from install
- User can answer "what did I work on this week?" in one click
- Decisions are searchable and linkable
