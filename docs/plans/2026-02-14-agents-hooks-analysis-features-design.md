# Design: Agents, Hooks & Analysis Features

**Date:** 2026-02-14
**Status:** Approved
**Scope:** Both repos (code-insights CLI + code-insights-web)

---

## 1. Agents

### 1.1 CLI Repo Agents (`code-insights/.claude/agents/`)

#### technical-architect.md (ENHANCE existing)
- **Model:** opus
- **Adapt from:** Existing code-insights TA + batonship TA
- **Changes:**
  - Add LLD standards (500-line max, modular structure, README + subsystem docs)
  - Add expert pushback table
  - Add schema alignment verification section
  - Add progressive disclosure communication style
  - Keep: cross-repo type contract focus, Firestore schema authority

#### fullstack-engineer.md (NEW — replaces cli-engineer + web-engineer)
- **Model:** sonnet
- **Adapt from:** batonship's `principal-fullstack-engineer`
- **Key adaptations:**
  - Replace all Jira references with "task/issue description"
  - Replace `@batonship/shared` type architecture with CLI/Web type contract
  - Replace Supabase references with Firebase/Firestore
  - Replace `ENGG-XX` branch naming with `feature/description` or `fix/description`
  - Keep: ceremony steps 3-8, CI simulation gate, git worktrees, push-immediately rule
  - Keep: expert pushback identity, simplicity-first principles
  - Keep: triple-layer code review synthesis role
  - Remove: Team Mode section (no team spawning yet)
  - Remove: Frontend Standards section (different from batonship)

#### ux-designer.md (NEW)
- **Model:** opus
- **Adapt from:** batonship's `ux-designer-researcher`
- **Key adaptations:**
  - Replace personas: "Developer Dev" (reviews own AI sessions), "Team Lead Taylor" (reviews team patterns)
  - Remove batonship-specific assessment UX principles
  - Add code-insights UX principles: "Privacy first", "Your data is yours", "Insights not surveillance"
  - Keep: code-first design workflow, ASCII wireframe format, screen spec template, user flow format
  - Keep: research framework, pushback table
  - Adapt document ownership paths to `docs/ux/`

#### product-manager.md (NEW — Jira-free)
- **Model:** sonnet
- **Adapt from:** batonship's `product-manager`
- **Key adaptations:**
  - **Remove ALL Jira references** (Cloud ID, project key, API field restrictions)
  - Replace with: GitHub Issues as primary tracker (using `gh` CLI)
  - Fallback: Local tracking via `docs/implementation/CURRENT_SPRINT.md`
  - Keep: ceremony coordination (steps 1-2), handoff checklist, ceremony violation flags
  - Keep: progress reporting format, prioritization framework (MoSCoW)
  - Keep: dev completion handoff checklist
  - Remove: Jira API field restrictions section
  - Remove: story points in description workaround
  - Add: GitHub Issues workflow (create, label, assign, close)
  - Add: no-jira guard (the PM should never try to call Jira APIs)

#### journey-chronicler.md (NEW — near-direct copy)
- **Model:** opus
- **Adapt from:** batonship's `journey-chronicler`
- **Key adaptations:**
  - Replace "Batonship" stealth mode with code-insights open-source framing
  - Shareable version: No stealth needed (open source), but still useful for genericized blog content
  - Adapt thematic arcs for code-insights:
    - Arc 1: Building a Privacy-First Analytics Tool
    - Arc 2: AI Analyzing AI (meta — using LLMs to analyze LLM sessions)
    - Arc 3: Multi-Repo CLI-to-Dashboard Pipeline
    - Arc 4: Local-First vs Cloud-First Tensions
    - Arc 5: Developer Experience in Open Source
  - Keep: entry format, quality gates, tag taxonomy, suggest+approve pattern
  - Adapt document paths to `docs/chronicle/`

### 1.2 Web Repo Agents (`code-insights-web/.claude/agents/`)

#### web-engineer.md (NEW)
- **Model:** sonnet
- **Adapt from:** batonship's `frontend-architect` + existing code-insights `web-engineer`
- **Key focus:**
  - Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui
  - Firebase client SDK (Firestore real-time subscriptions)
  - Multi-provider LLM integration (OpenAI, Anthropic, Gemini, Ollama)
  - Auth: Supabase Auth (@supabase/ssr)
  - Charts: Recharts 3
  - Keep: code-first design workflow, component patterns
  - Ceremony steps 3, 4, 6, 7, 8 (same as fullstack-engineer)

---

## 2. Hooks

### 2.1 Existing Hooks (minor updates)

#### hookify.branch-discipline.local.md
- **Change:** Update agent pattern from `(engineer|frontend-architect)` to `(engineer|fullstack-engineer|web-engineer)`

#### hookify.agent-parallel-warning.local.md
- **Change:** Update sequential patterns to:
  ```
  PM (requirements) → Engineer (needs scope)
  TA (type defs)    → Engineer (needs types)
  PM (requirements) → TA (needs scope to design)
  ```

### 2.2 No Changes Needed
- `hookify.block-pr-merge.local.md` — Already correct
- `hookify.cross-repo-type-sync.local.md` — Already correct
- `hookify.cli-binary-name.local.md` — Already correct

### 2.3 New Hook

#### hookify.no-jira.local.md
- **Event:** all
- **Action:** block
- **Pattern:** `(jira|atlassian|createJiraIssue|ENGG-)`
- **Purpose:** Prevent PM agent from calling Jira APIs (not configured for this project)
- **Message:** "This project does not use Jira. Use GitHub Issues (`gh issue`) or local tracking in `docs/implementation/CURRENT_SPRINT.md`."

---

## 3. Web Dashboard Features

### 3.1 Session Rename

**Type change (both repos):**
```typescript
// Add to Session/ParsedSession interface
customTitle?: string;
```

**Display logic:**
```
customTitle || generatedTitle || session.id
```

**Implementation:**
- Inline edit on session list (SessionCard) and session detail page
- Click title → edit mode → save writes `customTitle` to Firestore
- `updateDoc(doc(db, 'sessions', sessionId), { customTitle, updatedAt: serverTimestamp() })`

### 3.2 Analysis Commands (New Prompt Templates)

All analysis happens client-side using the existing LLM provider infrastructure.

#### Summarize
- **Input:** Session messages
- **Output:** Concise summary (what was worked on, key decisions, outcomes)
- **Insight type:** `summary` (existing)

#### Learnings
- **Input:** Session messages
- **Output:** TIL moments, debugging insights, pattern discoveries
- **Insight type:** `learning` (existing)

#### Generate Insights
- **Input:** Session messages
- **Output:** Decisions with reasoning, techniques used
- **Insight types:** `decision`, `technique` (existing)
- **Enhancement:** Improve existing prompts for better quality output

### 3.3 Prompt Quality Analysis (NEW)

#### New Insight Type
Add `prompt_quality` to the insight type union:
```typescript
type InsightType = 'summary' | 'decision' | 'learning' | 'technique' | 'prompt_quality';
```

#### Analysis Output Structure
```typescript
interface PromptQualityInsight {
  efficiencyScore: number;      // 0-100
  wastedTurns: WastedTurn[];
  antiPatterns: AntiPattern[];
  tips: string[];
  potentialMessageReduction: number; // "could've done this in N fewer messages"
}

interface WastedTurn {
  messageIndex: number;
  reason: string;               // "clarification needed", "missing context", "repeated instruction"
  suggestedRewrite: string;     // Better version of the original prompt
}

interface AntiPattern {
  name: string;                 // "Vague Instructions", "Missing File Paths", etc.
  count: number;
  examples: string[];
}
```

#### LLM Prompt Template
System prompt instructs LLM to:
1. Identify user messages where clarification, correction, or repetition occurred
2. For each wasted turn, suggest a better initial prompt
3. Score overall efficiency (0-100)
4. List anti-patterns with examples
5. Provide actionable tips

#### UI Components
- **PromptQualityCard** — Summary badge with efficiency score on session detail page
- **WastedTurnTimeline** — Visual timeline highlighting problematic exchanges
- **RewriteSuggestion** — Expandable card showing original vs suggested prompt
- **AntiPatternSummary** — Cards showing detected anti-patterns

### 3.4 Ollama Enhancements

#### Model Discovery
- On settings page, when Ollama is selected, call `GET /api/tags` to list installed models
- Show discovered models instead of hardcoded list
- Graceful fallback to hardcoded list if Ollama is not running

#### Connection Status
- Settings page shows connection indicator: "Connected" (green) / "Not Running" (red)
- Auto-check on page load and on provider selection

#### Custom URL
- Settings page allows configuring Ollama URL (default: `http://localhost:11434`)
- Store in localStorage alongside other LLM config

---

## 4. Implementation Order

**Phase 1: Foundation (agents + hooks)**
1. Copy and adapt all agents
2. Update existing hooks + create new no-jira hook
3. Create `.claude/` directory in web repo with web-engineer agent

**Phase 2: Core Features**
4. Session rename (Firestore write-back)
5. Enhanced analysis prompts (summarize, learnings)
6. Ollama model discovery + connection status

**Phase 3: Prompt Quality Analysis**
7. New insight type + LLM prompt template
8. Prompt quality UI components
9. Integration with existing analysis flow

---

## 5. Cross-Repo Type Impact

| Change | CLI types.ts | Web types.ts | Firestore |
|--------|-------------|-------------|-----------|
| `customTitle` field | Add optional | Add optional | sessions collection |
| `prompt_quality` insight type | Add to union | Add to union | insights collection |
| `PromptQualityInsight` structure | Not needed (web-only) | New interface | insights.content (JSON) |

All new fields are **optional** — backward compatible with existing data.
