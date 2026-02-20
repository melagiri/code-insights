# Code Insights Roadmap

## Overview

This roadmap outlines the development phases for Code Insights. Timelines are flexible—progress is driven by priorities and availability.

---

## Phase 1: Foundation ✅

**Goal:** Working end-to-end flow from JSONL to dashboard

### Milestones

- [x] **1.1 Project Setup**
  - Next.js project with Tailwind + shadcn/ui
  - Firebase SDK integration (Admin for CLI, Client for web)
  - Configuration system for user's Firebase credentials
  - TypeScript strict mode, pnpm workspaces

- [x] **1.2 JSONL Parser**
  - Parse Claude Code session files from `~/.claude/projects/`
  - Extract: sessions, messages, tool calls, timestamps
  - Smart session title generation (5-tier fallback)
  - Session character classification (7 types)
  - CLI command: `code-insights sync`

- [x] **1.3 Firestore Schema & Sync**
  - Document structure: projects, sessions, messages, insights
  - Upload to user's Firestore via Admin SDK
  - Incremental sync (tracks file modification times)
  - Multi-device support (git remote-based project IDs)
  - CLI command: `code-insights init` (Firebase setup wizard)

- [x] **1.4 Basic Dashboard**
  - Session list view with filters (project, date)
  - Session detail view with message display
  - Insights display by type
  - Analytics page with Recharts charts

- [x] **1.5 Marketing Site & Documentation**
  - Landing page at code-insights.app
  - What it is, how it works, privacy model
  - Docs site with guides, reference, and quick start
  - Link to GitHub repo

### Deliverables
- ✅ CLI tool that syncs sessions to Firestore
- ✅ Web dashboard showing sessions and insights
- ✅ Marketing site and docs at docs.code-insights.app

---

## Phase 2: Integration ✅

**Goal:** Seamless integration with Claude Code workflow

### Milestones

- [x] **2.1 Claude Code Hook**
  - Post-session hook that triggers sync automatically
  - Quiet mode for background processing (`sync -q`)
  - `code-insights install-hook` / `code-insights uninstall-hook`

- [ ] **2.2 Slash Command**
  - `/insights` - Quick summary of recent sessions
  - `/insights today` - What you worked on today
  - `/insights decisions` - Recent architectural decisions

- [x] **2.3 Real-time Dashboard**
  - Firestore real-time listeners via `onSnapshot`
  - Live updates as sessions complete
  - Custom React hooks: useProjects, useSessions, useInsights, useAnalytics

- [ ] **2.4 Enhanced Filtering**
  - Full-text search across sessions
  - Filter by: project, git branch, date range, insight type
  - Saved filters / bookmarks

### Deliverables
- ✅ Auto-sync via Claude Code hooks
- Slash commands (pending)
- ✅ Real-time dashboard updates

---

## Phase 3: Intelligence ✅

**Goal:** LLM-powered deeper insights

### Milestones

- [x] **3.1 Multi-Provider LLM Integration**
  - Pluggable provider system (factory pattern)
  - OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo)
  - Anthropic (claude-sonnet, claude-haiku, claude-opus)
  - Google Gemini (gemini-2.0-flash, gemini-1.5-pro/flash)
  - Ollama for local models (llama3.2, mistral, codellama)
  - User configures their own API key, stored in localStorage
  - Token input capped at 80k

- [x] **3.2 Session Analysis**
  - "Analyze" button on session detail page
  - Bulk analyze for unanalyzed sessions
  - Generates 4 insight types: summary, decision, learning, technique
  - Analysis versioning for re-analysis

- [ ] **3.3 Cross-Session Patterns**
  - Cross-session pattern detection
  - Project-level and overall-level insights
  - Recurring pattern identification

- [ ] **3.4 Learning Journal**
  - Auto-generate "lessons learned" from sessions
  - Track recurring patterns and mistakes
  - Suggest areas for improvement

### Deliverables
- ✅ Multi-provider LLM insight generation
- ✅ On-demand and bulk session analysis
- Cross-session patterns (pending)
- Learning journal (pending)

---

## Phase 4: Export & Sharing (Partially Complete)

**Goal:** Get insights out of the dashboard into your workflow

### Milestones

- [x] **4.1 Markdown Export**
  - Export by: session, day, week, project
  - Formats: Plain Markdown, Obsidian (with wikilinks), Notion
  - Export page in dashboard

- [ ] **4.2 Scheduled Reports**
  - Weekly email digest (optional, user's email service)
  - Export to file system on schedule
  - Export reminder logic (partially implemented)

- [ ] **4.3 API Access**
  - REST API for programmatic access to insights
  - Webhook support for external integrations

### Deliverables
- ✅ Multi-format markdown export
- Scheduled reports (partially implemented)
- API for custom integrations (pending)

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
  - Contribution guidelines (done: CONTRIBUTING.md)

### Deliverables
- Extensible plugin system
- Community template library
- Full documentation

---

## Version Milestones

| Version | Phase | Key Features | Status |
|---------|-------|--------------|--------|
| 0.1.0 | 1 | CLI sync, basic dashboard | ✅ Done |
| 0.2.0 | 1 | Firestore integration, smart titles | ✅ Done |
| 0.3.0 | 2 | Claude Code hook, real-time updates | ✅ Done |
| 0.4.0 | 3 | Multi-LLM analysis, bulk analyze | ✅ Done |
| 0.5.0 | 4 | Markdown export | ✅ Done |
| 0.6.0 | 4 | Scheduled reports, API access | Planned |
| 1.0.0 | 5 | Plugin architecture, community features | Planned |

---

## Contributing

This is an open source project. Contributions welcome!

- **Issues**: Bug reports, feature requests
- **PRs**: Code contributions (please discuss first for large changes)
- **Docs**: Improvements to documentation
- **Templates**: Export templates, insight patterns

See CONTRIBUTING.md for guidelines.
