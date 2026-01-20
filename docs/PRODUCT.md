# ClaudeInsight

## What It Is

ClaudeInsight transforms your Claude Code session history into structured, searchable insights. It extracts patterns from your conversations—what you built, decisions you made, lessons learned—and presents them in a visual dashboard.

## The Problem

Claude Code stores every conversation as JSONL files in `~/.claude/projects/`. This is valuable data:
- What features did you work on last week?
- Why did you choose that architecture?
- What mistakes did you make (and fix)?
- How much time went into different parts of the codebase?

But it's trapped in raw JSON. You can't search it, visualize it, or learn from it.

## The Solution

ClaudeInsight provides:

1. **Automated extraction** - Parses JSONL files and structures the data
2. **Pattern-matched insights** - Identifies decisions, learnings, and work summaries
3. **LLM-enhanced analysis** - Optional Gemini-powered deeper insights (your own API key)
4. **Visual dashboard** - Web interface with charts, timelines, and filters
5. **Markdown export** - Download insights as Obsidian, plain MD, or Notion format

## Who It's For

- **Claude Code developers** who want to track their AI-assisted work
- **Learners** who want to review and reinforce what they've built with Claude
- **Privacy-conscious users** who want insights without giving up their data

## Privacy Model

**Bring Your Own Firebase (BYOF)**

ClaudeInsight has no central server. Users:
1. Create their own Firebase project (free tier is sufficient)
2. Configure their credentials locally
3. Data syncs to their own Firestore

Nothing is sent to ClaudeInsight maintainers. No telemetry. No analytics. Complete data ownership.

## Core Features

### Insight Categories

| Category | What It Captures |
|----------|------------------|
| **Work Log** | Features built, bugs fixed, files modified |
| **Decisions** | Architecture choices, trade-offs discussed |
| **Learnings** | New patterns, mistakes, insights gained |
| **Effort** | Token usage, session duration, activity by area |

### Dashboard Views

- **Daily/Weekly digest** - Summary of recent sessions
- **Project timeline** - Visual history of work per project
- **Decision log** - Searchable archive of "why" decisions
- **Analytics** - Charts showing effort distribution, patterns

### Export Options

- Filter by: project, date range, session
- Formats: Obsidian (with `[[links]]`), plain Markdown, Notion

## Tech Stack

- **Parser/ETL**: Node.js CLI (runs standalone or as Claude Code hook)
- **Database**: User's Firebase Firestore
- **AI**: User's Gemini API key (optional, for enhanced insights)
- **Web**: Next.js + Tailwind + shadcn/ui
- **Hosting**: User deploys to their own Firebase Hosting or runs locally

## Success Metrics

- Time to first insight: < 5 minutes from install
- User can answer "what did I work on this week?" in one click
- Decisions are searchable and linkable
