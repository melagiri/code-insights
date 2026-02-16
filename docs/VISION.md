# Code Insights Vision

## Philosophy

**Your data, your infrastructure, your insights.**

Code Insights is a tool that helps Claude Code users understand their AI-assisted development patterns. It's built on a simple principle: developers should own their data completely.

## Core Beliefs

### 1. Privacy by Architecture

There is no central Code Insights data server. Users connect the CLI tool to their own Firebase project. Session data never leaves their control. The hosted dashboard only reads from the user's Firestore — authentication is handled by Supabase Auth, and the dashboard collects anonymous aggregate analytics via Vercel Analytics, but never touches your Claude Code data.

### 2. Developers Can Handle It

Claude Code users are technical. They can:
- Create a Firebase project
- Copy configuration keys
- Run a CLI command

We don't need to hide complexity behind a managed service. Clear documentation beats magic.

### 3. Two-Repo Model

- **CLI** (open source, MIT) — The parser and sync engine. Community-driven, transparent.
- **Web Dashboard** (closed source) — The visualization layer. Hosted on Vercel, free to use.

### 4. Tool, Not Platform

Code Insights is a utility, not a product. It should:
- Do one thing well (extract insights from Claude sessions)
- Be easy to install and configure
- Stay out of the way once set up

## Long-Term Direction

### Phase 1: Foundation ✅
- CLI tool that parses JSONL → Firestore
- Web dashboard with session views, character classification, smart titles
- Manual export to Markdown formats

### Phase 2: Integration ✅
- Claude Code hook for automatic session sync
- Real-time dashboard updates via Firestore subscriptions
- CLI `insights` command for quick terminal views

### Phase 3: Intelligence ✅
- Multi-provider LLM analysis (OpenAI, Anthropic, Gemini, Ollama)
- On-demand and bulk session analysis
- Cross-session insight types (summary, decision, learning, technique)

### Phase 4: Community
- Shareable insight templates
- Plugin architecture for custom extractors
- Community-contributed dashboard widgets

## Non-Goals

- **Not a business** - No monetization, no paywall, no premium tier
- **Not a central platform** - No central database for user session data
- **Not a dependency** - Users can stop using it anytime, data remains theirs
- **Not comprehensive** - Focus on Claude Code, not every AI tool

## Success Looks Like

A developer installs Code Insights, spends 10 minutes on Firebase setup, and from then on has a personal dashboard showing:
- What they built with Claude this week
- Key decisions and why they made them
- Patterns in how they use AI assistance

They own all the data. They can export it. They can delete it. They can modify the CLI tool. Complete autonomy.
