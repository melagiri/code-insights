# ClaudeInsight Roadmap

## Overview

This roadmap outlines the development phases for ClaudeInsight. As a hobby project, timelines are flexible—progress happens when time allows.

---

## Phase 1: Foundation

**Goal:** Working end-to-end flow from JSONL to dashboard

### Milestones

- [ ] **1.1 Project Setup**
  - Initialize Next.js project with Tailwind + shadcn/ui
  - Set up Firebase SDK integration
  - Create configuration system for user's Firebase credentials
  - Basic project structure and tooling (ESLint, TypeScript)

- [ ] **1.2 JSONL Parser**
  - Parse Claude Code session files from `~/.claude/projects/`
  - Extract: sessions, messages, tool calls, timestamps
  - Pattern matching for insights (decisions, learnings, work items)
  - CLI command: `claudeinsight sync`

- [ ] **1.3 Firestore Schema & Sync**
  - Design document structure for sessions and insights
  - Implement upload to user's Firestore
  - Handle incremental sync (only new/changed sessions)
  - CLI command: `claudeinsight init` (Firebase setup wizard)

- [ ] **1.4 Basic Dashboard**
  - Session list view with filters (project, date)
  - Session detail view (conversation replay)
  - Simple insights display (extracted patterns)
  - Local development server

- [ ] **1.5 Marketing Site**
  - Landing page at claudeinsight.com
  - What it is, how it works, privacy model
  - Quick start guide
  - Link to GitHub repo
  - Creator credits

### Deliverables
- CLI tool that syncs sessions to Firestore
- Web dashboard showing sessions and basic insights
- Marketing site live

---

## Phase 2: Integration

**Goal:** Seamless integration with Claude Code workflow

### Milestones

- [ ] **2.1 Claude Code Hook**
  - Post-session hook that triggers sync automatically
  - Background processing (no impact on Claude Code performance)
  - Hook installation command: `claudeinsight install-hook`

- [ ] **2.2 Slash Command**
  - `/insights` - Quick summary of recent sessions
  - `/insights today` - What you worked on today
  - `/insights decisions` - Recent architectural decisions

- [ ] **2.3 Real-time Dashboard**
  - Firestore real-time listeners
  - Live updates as sessions complete
  - Notification for new insights

- [ ] **2.4 Enhanced Filtering**
  - Full-text search across sessions
  - Filter by: project, git branch, date range, insight type
  - Saved filters / bookmarks

### Deliverables
- Auto-sync via Claude Code hooks
- Slash commands for quick insights
- Real-time dashboard updates

---

## Phase 3: Intelligence

**Goal:** AI-powered deeper insights using Gemini

### Milestones

- [ ] **3.1 Gemini Integration**
  - User configures their own Gemini API key
  - On-demand insight generation (not automatic, to control costs)
  - "Enhance this session" button in dashboard

- [ ] **3.2 Smart Summaries**
  - Daily/weekly digest generation
  - "What did I accomplish?" summaries
  - Automatic categorization of work types

- [ ] **3.3 Decision Extraction**
  - LLM-powered decision identification
  - Extract: what was decided, why, alternatives considered
  - Link decisions to code changes

- [ ] **3.4 Learning Journal**
  - Auto-generate "lessons learned" from sessions
  - Track recurring patterns and mistakes
  - Suggest areas for improvement

### Deliverables
- Gemini-powered insight enhancement
- Smart summaries and decision extraction
- Learning journal generation

---

## Phase 4: Export & Sharing

**Goal:** Get insights out of the dashboard into your workflow

### Milestones

- [ ] **4.1 Markdown Export**
  - Export by: session, day, week, project
  - Formats: Plain Markdown, Obsidian (with wikilinks), Notion
  - Customizable templates

- [ ] **4.2 Scheduled Reports**
  - Weekly email digest (optional, user's email service)
  - Export to file system on schedule

- [ ] **4.3 API Access**
  - REST API for programmatic access to insights
  - Webhook support for external integrations

### Deliverables
- Multi-format markdown export
- Scheduled report generation
- API for custom integrations

---

## Phase 5: Community

**Goal:** Enable community contributions and customization

### Milestones

- [ ] **5.1 Plugin Architecture**
  - Custom insight extractors
  - Dashboard widget API
  - Theme support

- [ ] **5.2 Shared Templates**
  - Community-contributed export templates
  - Insight pattern libraries
  - Dashboard layouts

- [ ] **5.3 Documentation**
  - Comprehensive setup guide
  - API documentation
  - Contribution guidelines

### Deliverables
- Extensible plugin system
- Community template library
- Full documentation

---

## Version Milestones

| Version | Phase | Key Features |
|---------|-------|--------------|
| 0.1.0 | 1 | CLI sync, basic dashboard |
| 0.2.0 | 1 | Marketing site, Firestore integration |
| 0.3.0 | 2 | Claude Code hook, slash commands |
| 0.4.0 | 2 | Real-time updates, search |
| 0.5.0 | 3 | Gemini integration, smart summaries |
| 0.6.0 | 4 | Markdown export, scheduled reports |
| 1.0.0 | 5 | Plugin architecture, community features |

---

## Contributing

This is an open source hobby project. Contributions welcome!

- **Issues**: Bug reports, feature requests
- **PRs**: Code contributions (please discuss first for large changes)
- **Docs**: Improvements to documentation
- **Templates**: Export templates, insight patterns

See CONTRIBUTING.md for guidelines.
