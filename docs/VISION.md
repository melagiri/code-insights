# ClaudeInsight Vision

## Philosophy

**Your data, your infrastructure, your insights.**

ClaudeInsight is an open-source tool that helps Claude Code users understand their AI-assisted development patterns. It's built on a simple principle: developers should own their data completely.

## Core Beliefs

### 1. Privacy by Architecture

There is no central ClaudeInsight server. No analytics. No telemetry. Users connect the tool to their own Firebase project. Session data never leaves their control.

### 2. Developers Can Handle It

Claude Code users are technical. They can:
- Create a Firebase project
- Copy configuration keys
- Run a CLI command

We don't need to hide complexity behind a managed service. Clear documentation beats magic.

### 3. Open Source, Community Driven

This is a hobby project built for the community. Contributions welcome. No paid tiers, no premium features, no upsells.

### 4. Tool, Not Platform

ClaudeInsight is a utility, not a product. It should:
- Do one thing well (extract insights from Claude sessions)
- Be easy to install and configure
- Stay out of the way once set up

## Long-Term Direction

### Phase 1: Foundation
- CLI tool that parses JSONL → Firestore
- Basic web dashboard with insight views
- Manual export to Markdown formats

### Phase 2: Integration
- Claude Code hook for automatic session sync
- Slash command for quick insights (`/insights today`)
- Real-time dashboard updates

### Phase 3: Intelligence
- Gemini-powered insight enhancement (user's own API key)
- Cross-session pattern detection
- Learning journal generation

### Phase 4: Community
- Shareable insight templates
- Plugin architecture for custom extractors
- Community-contributed dashboard widgets

## Non-Goals

- **Not a business** - No monetization, no paywall, no premium tier
- **Not a platform** - No user accounts on our side, no central database
- **Not a dependency** - Users can stop using it anytime, data remains theirs
- **Not comprehensive** - Focus on Claude Code, not every AI tool

## Success Looks Like

A developer installs ClaudeInsight, spends 10 minutes on Firebase setup, and from then on has a personal dashboard showing:
- What they built with Claude this week
- Key decisions and why they made them
- Patterns in how they use AI assistance

They own all the data. They can export it. They can delete it. They can modify the tool. Complete autonomy.
