# Agents, Hooks & Analysis Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Copy and adapt agents/hooks from batonship, then build session rename, analysis commands, prompt quality analysis, and Ollama enhancements in the web dashboard.

**Architecture:** Two repos (code-insights CLI + code-insights-web). Agents/hooks go in the CLI repo's `.claude/` directory (orchestrator level). Web features build on existing multi-provider LLM infrastructure, Firestore real-time hooks, and shadcn/ui components. All LLM processing is client-side (browser). New Firestore fields are optional for backward compatibility.

**Tech Stack:** Next.js 16, React 19, TypeScript, Firebase/Firestore, shadcn/ui, Ollama API, multi-provider LLM abstraction

---

## Phase 1: Foundation (Agents & Hooks)

### Task 1: Adapt the Technical Architect agent

**Files:**
- Modify: `code-insights/.claude/agents/technical-architect.md`

**Step 1: Read the existing TA agent**

Read `/home/srikanth/Workspace/code-insights/code-insights/.claude/agents/technical-architect.md` to understand current structure.

**Step 2: Enhance with batonship patterns**

Update the file to add these sections from batonship's TA (adapt for code-insights context):

1. **LLD Standards** — 500-line max, modular directory structure, README + subsystem docs, content rules table
2. **Expert Pushback (expanded)** — Add: premature scaling, contradictory requirements, scope creep rows
3. **Schema Alignment Verification** — Adapt for Firestore (instead of Supabase). Before approving LLD or implementation touching Firestore: verify collection structure, field types, optional vs required
4. **Communication Style** — Add: real-world analogies, progressive disclosure, "start with what/why before how"
5. **Frontend Architecture Standards** — Mention shadcn/ui, Recharts, Next.js App Router conventions, Tailwind CSS patterns

Keep all existing sections (cross-repo contract, type architecture, ceremony steps 5/9, triple-layer review).

**Step 3: Verify file is well-formed**

The file must have YAML frontmatter (name, description, model, color) followed by markdown body.

**Step 4: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add .claude/agents/technical-architect.md
git commit -m "docs(agents): enhance TA with LLD standards, pushback table, schema verification"
```

---

### Task 2: Create the Fullstack Engineer agent

**Files:**
- Create: `code-insights/.claude/agents/fullstack-engineer.md`

**Step 1: Create the agent file**

Adapt from batonship's `principal-fullstack-engineer.md` with these changes:

**YAML frontmatter:**
```yaml
---
name: fullstack-engineer
description: |
  Use this agent when you need to implement features, write production code, build frontend or backend components, write tests, or when you need pragmatic engineering feedback. Use after architectural decisions are made. Works across both CLI (code-insights/cli) and web dashboard (code-insights-web) codebases.

  Examples:

  <example>
  Context: User wants to add session rename feature.
  user: "Add the ability to rename sessions from the web dashboard"
  assistant: "I'll use the fullstack-engineer agent to implement the rename feature."
  </example>

  <example>
  Context: User wants to add a new LLM analysis command.
  user: "Add prompt quality analysis to the session detail page"
  assistant: "I'll use the fullstack-engineer agent to implement the prompt quality analysis feature."
  </example>
model: sonnet
---
```

**Body content — key adaptations from batonship:**

| Batonship Reference | Code-Insights Adaptation |
|---------------------|--------------------------|
| All Jira references (`ENGG-XX`, ticket, Jira API) | Replace with "task description" or "GitHub issue" |
| `@batonship/shared` / `@batonship/types` | Replace with `cli/src/types.ts` and `code-insights-web/src/lib/types.ts` |
| Supabase schema checks | Replace with Firestore collection checks |
| `batonship-ENGG-XX` worktree naming | Replace with `code-insights-feature/description` |
| `pnpm test` CI gate | Note: No test framework configured yet. CI gate = `pnpm build` |
| Team Mode / SendMessage section | Remove entirely (not using teams yet) |
| Frontend Standards (TanStack Query, Zod forms) | Replace with: shadcn/ui components, Firestore hooks, LLM providers |

**Keep verbatim (adapt wording only):**
- Identity section ("Principal Software Engineer with 15+ years...")
- Ceremony steps 3-8 with gate criteria
- CI Simulation Gate (Step 8.5) — adapt commands to `pnpm build && pnpm lint`
- Git hygiene (worktrees optional, branch discipline mandatory)
- Expert pushback table
- Communication style rules
- Code documentation standards (document WHY not WHAT)
- Triple-layer review synthesis role
- "Never Merge PRs" section
- Principles section

**Context Sources table:**
```markdown
| Need | Source |
|------|--------|
| CLI architecture | `code-insights/cli/src/` |
| Web architecture | `code-insights-web/src/` |
| CLI types | `code-insights/cli/src/types.ts` |
| Web types | `code-insights-web/src/lib/types.ts` |
| LLM providers | `code-insights-web/src/lib/llm/` |
| Firestore hooks | `code-insights-web/src/lib/hooks/useFirestore.ts` |
| Firebase operations | `code-insights/cli/src/firebase/client.ts` |
```

**Step 2: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add .claude/agents/fullstack-engineer.md
git commit -m "docs(agents): add fullstack-engineer adapted from batonship"
```

---

### Task 3: Create the UX Designer agent

**Files:**
- Create: `code-insights/.claude/agents/ux-designer.md`

**Step 1: Create the agent file**

Adapt from batonship's `ux-designer-researcher.md`:

**YAML frontmatter:**
```yaml
---
name: ux-designer
description: |
  No Figma Required. Use this agent for UX work:
  - ASCII wireframes and screen layouts
  - User flow diagrams (text-based)
  - User research (interview guides, synthesis)
  - Personas and journey maps
  - UX validation and heuristic analysis

  Workflow with fullstack-engineer:
  1. ux-designer → wireframes, flows, specs
  2. fullstack-engineer → implements in React/Tailwind/shadcn
  3. Iterate in browser (code-first design)
model: opus
color: cyan
---
```

**Key adaptations:**

1. **Replace personas** — Remove "Developer Dana" and "Recruiter Rachel". Add:
   - **"Developer Dev"**: Mid-senior developer who uses Claude Code daily. Wants to understand their AI usage patterns, improve prompting skills, reduce wasted turns. Privacy-conscious.
   - **"Team Lead Taylor"**: Engineering manager. Wants team-level insights on AI tool adoption, coaching opportunities, identify developers struggling with AI tools.

2. **Replace UX Principles** — Remove "Assessment UX Principles". Add:
   - **Privacy first**: User data never leaves their control
   - **Insights not surveillance**: Help users improve, don't judge them
   - **Quick to value**: Dashboard should show useful info within 30 seconds
   - **Progressive detail**: High-level overview → drill into sessions → see individual messages

3. **Keep verbatim (adapt references only):**
   - Code-first design workflow diagram
   - ASCII wireframe format
   - User flow format
   - Screen specification template
   - User research framework
   - Feedback synthesis framework
   - Pushback table
   - Quality checklist
   - Document ownership (adapt paths to `docs/ux/`)

**Step 2: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add .claude/agents/ux-designer.md
git commit -m "docs(agents): add ux-designer adapted from batonship"
```

---

### Task 4: Create the Product Manager agent (Jira-free)

**Files:**
- Create: `code-insights/.claude/agents/product-manager.md`

**Step 1: Create the agent file**

Adapt from batonship's `product-manager.md`:

**YAML frontmatter:**
```yaml
---
name: product-manager
description: |
  Use this agent for product development coordination, tracking tasks (GitHub Issues or local), sprint planning, progress reporting, and development ceremony management. This PM does NOT use Jira — it works with GitHub Issues and local markdown tracking.

  Examples:

  <example>
  Context: User wants to plan the next sprint.
  user: "Plan the next sprint for the web dashboard features"
  assistant: "I'll use the product-manager to review priorities and create a sprint plan."
  </example>

  <example>
  Context: User wants a status update.
  user: "What's the status of our current work?"
  assistant: "I'll use the product-manager to compile a progress report."
  </example>
model: sonnet
color: green
---
```

**Critical adaptations:**

1. **Remove ALL Jira sections:**
   - Delete: Cloud ID, Jira URL, Project Key, Project ID
   - Delete: Jira API Field Restrictions section
   - Delete: Story points workaround
   - Delete: Issue Type IDs
   - Delete: `atlassian-reauth` references

2. **Replace with GitHub Issues workflow:**
   ```markdown
   ## Task Management

   **Primary**: GitHub Issues via `gh` CLI
   **Secondary**: Local tracking in `docs/implementation/CURRENT_SPRINT.md`

   ### Creating Issues
   - Use `gh issue create` with labels, milestone
   - Labels: `feature`, `bug`, `docs`, `analysis`, `infrastructure`
   - No story points — use T-shirt sizes in description (S/M/L/XL)
   ```

3. **Keep (adapt references):**
   - Development ceremony coordination (all 10 steps)
   - Ceremony violation flags table
   - Dev completion handoff checklist
   - Progress reporting format
   - MoSCoW prioritization framework
   - Document commit policy (push immediately)
   - Communication style
   - Never Merge PRs
   - Quick Reference (local tracking file)

4. **Add guard note at the top of body:**
   ```markdown
   ## ⚠️ No Jira in This Project
   This project does NOT use Jira. Do NOT call Jira/Atlassian APIs.
   Use GitHub Issues (`gh issue`) or local tracking in `docs/implementation/CURRENT_SPRINT.md`.
   ```

**Step 2: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add .claude/agents/product-manager.md
git commit -m "docs(agents): add product-manager (Jira-free) adapted from batonship"
```

---

### Task 5: Create the Journey Chronicler agent

**Files:**
- Create: `code-insights/.claude/agents/journey-chronicler.md`

**Step 1: Create the agent file**

Near-direct copy from batonship's `journey-chronicler.md`:

**YAML frontmatter:**
```yaml
---
name: journey-chronicler
description: |
  Use this agent to capture pivotal learning moments, breakthroughs, course corrections, and insights during development. Invoke when you detect learning signals like "I just realized...", "Turns out...", "That didn't work because...", or when a debugging breakthrough, pattern recognition, or process innovation occurs.
model: opus
color: amber
---
```

**Adaptations:**

1. **Replace stealth mode** — Code-insights is open source. Replace "Batonship stealth mode" with:
   ```markdown
   ## Open Source Context
   Code Insights is open source. Shareable versions don't need stealth
   treatment, but should still be genericized for broader blog/LinkedIn appeal.
   Replace project-specific details with universal developer insights.
   ```

2. **Adapt genericization guide:**
   ```markdown
   | Internal Term | Public Alternative |
   |---------------|-------------------|
   | Code Insights | "the tool", "a session analytics platform" |
   | Claude Code sessions | "AI coding sessions", "LLM conversations" |
   | Firestore sync | "cloud sync", "data pipeline" |
   | Prompt quality analysis | "conversation analysis", "prompt optimization" |
   ```

3. **Adapt thematic arcs:**
   ```markdown
   | Arc | Theme |
   |-----|-------|
   | Arc 1: Building a Privacy-First Analytics Tool | BYOF model, user data ownership |
   | Arc 2: AI Analyzing AI | Meta — using LLMs to analyze LLM conversations |
   | Arc 3: Multi-Repo CLI-to-Dashboard Pipeline | Cross-repo challenges, type contracts |
   | Arc 4: Local-First vs Cloud-First Tensions | Ollama vs API providers, privacy |
   | Arc 5: Developer Experience in Open Source | CLI UX, installation friction, onboarding |
   ```

4. **Adapt document paths:**
   - `docs/chronicle/JOURNEY_MOMENTS.md`
   - `docs/chronicle/THEMATIC_ARCS.md`

5. **Keep everything else** — Entry format, quality gates, tag taxonomy, suggest+approve pattern, voice guidelines.

**Step 2: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add .claude/agents/journey-chronicler.md
git commit -m "docs(agents): add journey-chronicler adapted from batonship"
```

---

### Task 6: Create web repo .claude directory with web-engineer agent

**Files:**
- Create: `code-insights-web/.claude/agents/web-engineer.md`

**Step 1: Create the directory structure**

```bash
mkdir -p /home/srikanth/Workspace/code-insights/code-insights-web/.claude/agents
```

**Step 2: Create the web-engineer agent**

The existing `code-insights/.claude/agents/web-engineer.md` content is excellent and comprehensive. Copy it to the web repo so it's available when working in that repo context:

```bash
cp /home/srikanth/Workspace/code-insights/code-insights/.claude/agents/web-engineer.md \
   /home/srikanth/Workspace/code-insights/code-insights-web/.claude/agents/web-engineer.md
```

**Step 3: Commit in web repo**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights-web
git add .claude/agents/web-engineer.md
git commit -m "docs(agents): add web-engineer agent definition"
```

---

### Task 7: Update existing hooks

**Files:**
- Modify: `code-insights/.claude/hookify.branch-discipline.local.md`
- Modify: `code-insights/.claude/hookify.agent-parallel-warning.local.md`

**Step 1: Update branch-discipline hook**

In `hookify.branch-discipline.local.md`, change the pattern from:
```yaml
pattern: (cli-engineer|web-engineer)
```
to:
```yaml
pattern: (cli-engineer|web-engineer|fullstack-engineer|ux-designer)
```

**Step 2: Update agent-parallel-warning hook**

In `hookify.agent-parallel-warning.local.md`, update the "Common Sequential Patterns" section:
```markdown
**Common Sequential Patterns (DO NOT parallelize):**
```
PM (requirements) → Fullstack Engineer (needs scope)
TA (type alignment) → Fullstack Engineer (needs type decision)
PM (requirements) → TA (needs scope to design)
TA (type alignment) → Web Engineer (needs type decision)
```
```

**Step 3: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add .claude/hookify.branch-discipline.local.md .claude/hookify.agent-parallel-warning.local.md
git commit -m "docs(hooks): update branch-discipline and parallel-warning for new agent names"
```

---

### Task 8: Create the no-jira hook

**Files:**
- Create: `code-insights/.claude/hookify.no-jira.local.md`

**Step 1: Create the hook file**

```markdown
---
name: no-jira
enabled: true
event: all
action: block
conditions:
  - field: content
    operator: regex_match
    pattern: (createJiraIssue|jira_create_issue|atlassian\.net|batonship\.atlassian|ENGG-\d+)
---

**Jira Not Available**

This project does **NOT** use Jira. Do NOT call Jira/Atlassian APIs.

**Use instead:**
- **GitHub Issues**: `gh issue create`, `gh issue list`
- **Local tracking**: `docs/implementation/CURRENT_SPRINT.md`

If you need to create a task, use:
```bash
gh issue create --title "Title" --body "Description" --label "feature"
```

This is a hard block — Jira API calls will not execute.
```

**Step 2: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add .claude/hookify.no-jira.local.md
git commit -m "docs(hooks): add no-jira guard to prevent Jira API calls"
```

---

### Task 9: Remove old cli-engineer and web-engineer from CLI repo

Now that fullstack-engineer replaces both, remove the old single-domain agents.

**Files:**
- Delete: `code-insights/.claude/agents/cli-engineer.md`
- Delete: `code-insights/.claude/agents/web-engineer.md`

**Step 1: Verify fullstack-engineer exists**

Read `code-insights/.claude/agents/fullstack-engineer.md` to confirm it was created in Task 2.

**Step 2: Delete old agents**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
rm .claude/agents/cli-engineer.md .claude/agents/web-engineer.md
```

**Step 3: Update CLAUDE.md agent table**

In `code-insights/CLAUDE.md`, update the Agent Suite table:

Replace:
```markdown
| Agent | Model | Domain | Repo Scope |
|-------|-------|--------|------------|
| `technical-architect` | opus | Cross-repo architecture, type alignment, code review | Both repos |
| `cli-engineer` | sonnet | CLI implementation, parser, commands, Firebase writes | `code-insights/cli/` |
| `web-engineer` | sonnet | Dashboard implementation, components, hooks, LLM providers | `code-insights-web/` |
```

With:
```markdown
| Agent | Model | Domain | Repo Scope |
|-------|-------|--------|------------|
| `technical-architect` | opus | Cross-repo architecture, type alignment, code review | Both repos |
| `fullstack-engineer` | sonnet | Feature implementation, backend/frontend code, pragmatic feedback | Both repos |
| `ux-designer` | opus | User flows, wireframes, personas, UX validation | Both repos |
| `product-manager` | sonnet | Task tracking (GitHub Issues), ceremony coordination, progress reporting | Both repos |
| `journey-chronicler` | opus | Learning capture, breakthroughs, development insights | Both repos |
```

Also update the Hookify Rules table to add:
```markdown
| `no-jira` | **block** | Prevent agents from calling Jira APIs (not configured) |
```

**Step 4: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add -A .claude/agents/ CLAUDE.md
git commit -m "docs(agents): replace cli-engineer + web-engineer with fullstack-engineer, update CLAUDE.md"
```

---

## Phase 2: Core Web Features

### Task 10: Add `customTitle` field to types (both repos)

**Files:**
- Modify: `code-insights/cli/src/types.ts`
- Modify: `code-insights-web/src/lib/types.ts`

**Step 1: Read both type files**

Read `code-insights/cli/src/types.ts` and `code-insights-web/src/lib/types.ts`. Find the Session/ParsedSession interface.

**Step 2: Add `customTitle` field to CLI types**

In `cli/src/types.ts`, add to the `ParsedSession` interface:
```typescript
customTitle?: string;
```

**Step 3: Add `customTitle` field to web types**

In `code-insights-web/src/lib/types.ts`, add to the `Session` interface:
```typescript
customTitle?: string;
```

**Step 4: Commit in CLI repo**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add cli/src/types.ts
git commit -m "feat(types): add optional customTitle field to ParsedSession"
```

**Step 5: Commit in web repo**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights-web
git add src/lib/types.ts
git commit -m "feat(types): add optional customTitle field to Session"
```

---

### Task 11: Implement session rename in web dashboard

**Files:**
- Modify: `code-insights-web/src/components/sessions/SessionCard.tsx` (or equivalent session list component)
- Modify: `code-insights-web/src/app/sessions/[id]/page.tsx`
- Possibly create: `code-insights-web/src/components/sessions/RenameSessionDialog.tsx`

**Step 1: Read the session components**

Read the session card and session detail page to understand current title display.

**Step 2: Create the rename dialog component**

Create `RenameSessionDialog.tsx` using shadcn/ui Dialog + Input:

```tsx
'use client';

import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirebaseApp } from '@/app/providers';
import type { Session } from '@/lib/types';

interface Props {
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameSessionDialog({ session, open, onOpenChange }: Props) {
  const { db } = useFirebaseApp();
  const [title, setTitle] = useState(session.customTitle || session.generatedTitle || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!db || !title.trim()) return;
    setSaving(true);
    try {
      const sessionRef = doc(db, 'sessions', session.id);
      await updateDoc(sessionRef, {
        customTitle: title.trim(),
        updatedAt: serverTimestamp(),
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to rename session:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Session</DialogTitle>
        </DialogHeader>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Session title..."
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Update session title display**

Everywhere session titles are displayed, use:
```typescript
const displayTitle = session.customTitle || session.generatedTitle || session.id;
```

Add a rename button (pencil icon) next to the title that opens the dialog.

**Step 4: Verify it builds**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights-web
pnpm build
```

**Step 5: Commit**

```bash
git add src/components/sessions/RenameSessionDialog.tsx src/components/sessions/ src/app/sessions/
git commit -m "feat(web): add session rename with Firestore write-back"
```

---

### Task 12: Add `prompt_quality` insight type

**Files:**
- Modify: `code-insights/cli/src/types.ts`
- Modify: `code-insights-web/src/lib/types.ts`

**Step 1: Update InsightType in CLI types**

Find the `InsightType` definition and add `'prompt_quality'`:
```typescript
type InsightType = 'summary' | 'decision' | 'learning' | 'technique' | 'prompt_quality';
```

**Step 2: Update InsightType in web types**

Same change in `code-insights-web/src/lib/types.ts`.

**Step 3: Add PromptQualityResult interface to web types**

```typescript
export interface PromptQualityResult {
  efficiencyScore: number;
  wastedTurns: Array<{
    messageIndex: number;
    reason: string;
    suggestedRewrite: string;
  }>;
  antiPatterns: Array<{
    name: string;
    count: number;
    examples: string[];
  }>;
  tips: string[];
  potentialMessageReduction: number;
}
```

**Step 4: Commit both repos**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights
git add cli/src/types.ts
git commit -m "feat(types): add prompt_quality insight type"

cd /home/srikanth/Workspace/code-insights/code-insights-web
git add src/lib/types.ts
git commit -m "feat(types): add prompt_quality insight type and PromptQualityResult interface"
```

---

### Task 13: Create prompt quality analysis prompt template

**Files:**
- Modify: `code-insights-web/src/lib/llm/prompts.ts`

**Step 1: Read the existing prompts file**

Already read above.

**Step 2: Add prompt quality system prompt and generator**

Append to `prompts.ts`:

```typescript
/**
 * System prompt for prompt quality analysis
 */
export const PROMPT_QUALITY_SYSTEM_PROMPT = `You are an expert at evaluating how effectively developers communicate with AI coding assistants. Your task is to analyze the user's prompts in a Claude Code session and assess their prompting effectiveness.

You will evaluate:
1. **Efficiency Score** (0-100): How effectively did the user communicate their intent?
2. **Wasted Turns**: Messages that could have been avoided with better initial prompting
3. **Anti-Patterns**: Recurring prompting mistakes
4. **Improvement Tips**: Actionable advice for better prompting

Guidelines:
- A "wasted turn" is when the user had to clarify, correct, or repeat themselves because their initial prompt was unclear
- Consider: Was context provided upfront? Were file paths specified? Was the desired outcome clear?
- Score 90-100: Minimal wasted turns, clear context, specific instructions
- Score 70-89: Some clarifications needed, generally clear
- Score 50-69: Multiple clarifications, missing context, vague instructions
- Score 0-49: Excessive back-and-forth, unclear goals, constant corrections

Respond with valid JSON only.`;

/**
 * Generate prompt for prompt quality analysis
 */
export function generatePromptQualityPrompt(
  projectName: string,
  formattedMessages: string,
  messageCount: number
): string {
  return \`Analyze the user's prompting effectiveness in this Claude Code session.

Project: \${projectName}
Total messages: \${messageCount}

--- CONVERSATION ---
\${formattedMessages}
--- END CONVERSATION ---

Analyze the user's prompts (not the assistant's responses) and return JSON:
{
  "efficiencyScore": <0-100>,
  "wastedTurns": [
    {
      "messageIndex": <index of the user message that caused a wasted exchange>,
      "reason": "Why this message led to wasted turns (e.g., 'Missing file path', 'Vague instruction')",
      "suggestedRewrite": "A better version of the user's prompt that would have avoided the follow-up"
    }
  ],
  "antiPatterns": [
    {
      "name": "Pattern name (e.g., 'Vague Instructions', 'Missing Context', 'Incremental Revealing')",
      "count": <how many times this pattern appeared>,
      "examples": ["Brief example from the conversation"]
    }
  ],
  "tips": [
    "Specific, actionable tip for this user based on their patterns"
  ],
  "potentialMessageReduction": <estimated number of messages that could have been saved>
}

Focus on the most impactful issues. It's better to highlight 2-3 significant patterns than list every minor issue. If the user prompted well, say so — don't manufacture problems.

Respond with valid JSON only, no other text.\`;
}

/**
 * Parse prompt quality analysis response
 */
export interface PromptQualityResponse {
  efficiencyScore: number;
  wastedTurns: Array<{
    messageIndex: number;
    reason: string;
    suggestedRewrite: string;
  }>;
  antiPatterns: Array<{
    name: string;
    count: number;
    examples: string[];
  }>;
  tips: string[];
  potentialMessageReduction: number;
}

export function parsePromptQualityResponse(response: string): PromptQualityResponse | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in prompt quality response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as PromptQualityResponse;

    // Validate structure
    if (typeof parsed.efficiencyScore !== 'number') {
      console.error('Invalid prompt quality response structure');
      return null;
    }

    // Ensure arrays exist
    parsed.wastedTurns = parsed.wastedTurns || [];
    parsed.antiPatterns = parsed.antiPatterns || [];
    parsed.tips = parsed.tips || [];
    parsed.potentialMessageReduction = parsed.potentialMessageReduction || 0;

    // Clamp score
    parsed.efficiencyScore = Math.max(0, Math.min(100, parsed.efficiencyScore));

    return parsed;
  } catch (error) {
    console.error('Failed to parse prompt quality response:', error);
    return null;
  }
}
```

**Step 3: Verify it builds**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights-web
pnpm build
```

**Step 4: Commit**

```bash
git add src/lib/llm/prompts.ts
git commit -m "feat(llm): add prompt quality analysis prompt template and parser"
```

---

### Task 14: Add prompt quality analysis to the analysis engine

**Files:**
- Modify: `code-insights-web/src/lib/llm/analysis.ts`

**Step 1: Read analysis.ts**

Already read above.

**Step 2: Add `analyzePromptQuality` function**

Add a new exported function to `analysis.ts`:

```typescript
import {
  PROMPT_QUALITY_SYSTEM_PROMPT,
  generatePromptQualityPrompt,
  parsePromptQualityResponse,
  type PromptQualityResponse,
} from './prompts';

/**
 * Analyze prompt quality for a session
 */
export async function analyzePromptQuality(
  session: Session,
  messages: Message[]
): Promise<{
  success: boolean;
  result: PromptQualityResponse | null;
  insights: Insight[];
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  if (!isLLMConfigured()) {
    return {
      success: false,
      result: null,
      insights: [],
      error: 'LLM not configured. Go to Settings to configure an AI provider.',
    };
  }

  if (messages.length === 0) {
    return {
      success: false,
      result: null,
      insights: [],
      error: 'No messages found for this session.',
    };
  }

  try {
    const client = createLLMClient();
    const formattedMessages = formatMessagesForAnalysis(messages);

    // Truncate if too long
    const estimatedTokens = client.estimateTokens(formattedMessages);
    const truncated = estimatedTokens > MAX_INPUT_TOKENS
      ? formattedMessages.slice(0, MAX_INPUT_TOKENS * 4) // rough char-to-token
      : formattedMessages;

    const prompt = generatePromptQualityPrompt(
      session.projectName,
      truncated,
      messages.length
    );

    const response = await client.chat([
      { role: 'system', content: PROMPT_QUALITY_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]);

    const parsed = parsePromptQualityResponse(response.content);
    if (!parsed) {
      return {
        success: false,
        result: null,
        insights: [],
        error: 'Failed to parse LLM response. Please try again.',
      };
    }

    // Convert to insight for storage
    const projectId = generateProjectId(session.projectPath);
    const insight: Insight = {
      id: generateInsightId(),
      sessionId: session.id,
      projectId,
      projectName: session.projectName,
      type: 'prompt_quality' as InsightType,
      title: `Prompt Efficiency: ${parsed.efficiencyScore}/100`,
      content: JSON.stringify(parsed),
      summary: `Efficiency score: ${parsed.efficiencyScore}/100. ${parsed.potentialMessageReduction} messages could have been saved.`,
      bullets: parsed.tips,
      confidence: 0.85,
      source: 'llm',
      metadata: {
        efficiencyScore: parsed.efficiencyScore,
        wastedTurnCount: parsed.wastedTurns.length,
        antiPatternCount: parsed.antiPatterns.length,
        potentialMessageReduction: parsed.potentialMessageReduction,
      },
      timestamp: session.endedAt,
      createdAt: new Date(),
      scope: 'session',
      analysisVersion: ANALYSIS_VERSION,
    };

    await saveInsights([insight]);

    return {
      success: true,
      result: parsed,
      insights: [insight],
      usage: response.usage,
    };
  } catch (error) {
    return {
      success: false,
      result: null,
      insights: [],
      error: error instanceof Error ? error.message : 'Prompt quality analysis failed',
    };
  }
}
```

Also add the missing import at the top:
```typescript
import { formatMessagesForAnalysis } from './prompts';
```

**Step 3: Verify it builds**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights-web
pnpm build
```

**Step 4: Commit**

```bash
git add src/lib/llm/analysis.ts
git commit -m "feat(llm): add prompt quality analysis function"
```

---

### Task 15: Enhance Ollama with model discovery

**Files:**
- Modify: `code-insights-web/src/lib/llm/providers/ollama.ts`

**Step 1: Read the Ollama provider**

Already read above.

**Step 2: Add model discovery function**

Append to `ollama.ts`:

```typescript
/**
 * Discover installed Ollama models
 */
export async function discoverOllamaModels(
  baseUrl?: string
): Promise<{ name: string; size: number; modifiedAt: string }[]> {
  const url = baseUrl || DEFAULT_OLLAMA_URL;
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || []).map((m: { name: string; size: number; modified_at: string }) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Check if Ollama is running
 */
export async function checkOllamaConnection(
  baseUrl?: string
): Promise<boolean> {
  const url = baseUrl || DEFAULT_OLLAMA_URL;
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

**Step 3: Verify it builds**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights-web
pnpm build
```

**Step 4: Commit**

```bash
git add src/lib/llm/providers/ollama.ts
git commit -m "feat(ollama): add model discovery and connection check"
```

---

### Task 16: Build prompt quality UI components

**Files:**
- Create: `code-insights-web/src/components/analysis/PromptQualityCard.tsx`
- Create: `code-insights-web/src/components/analysis/AnalyzePromptQualityButton.tsx`
- Modify: `code-insights-web/src/app/sessions/[id]/page.tsx`

**Step 1: Read session detail page**

Read `/home/srikanth/Workspace/code-insights/code-insights-web/src/app/sessions/[id]/page.tsx` to understand layout and existing components.

**Step 2: Create PromptQualityCard component**

```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PromptQualityResult } from '@/lib/types';

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  if (score >= 50) return 'text-orange-600';
  return 'text-red-600';
}

function scoreBadgeVariant(score: number) {
  if (score >= 70) return 'default' as const;
  if (score >= 50) return 'secondary' as const;
  return 'destructive' as const;
}

export function PromptQualityCard({ data }: { data: PromptQualityResult }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Prompt Quality Analysis</CardTitle>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${scoreColor(data.efficiencyScore)}`}>
            {data.efficiencyScore}
          </span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.potentialMessageReduction > 0 && (
          <p className="text-sm text-muted-foreground">
            ~{data.potentialMessageReduction} messages could have been saved with better prompting
          </p>
        )}

        {data.antiPatterns.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Anti-Patterns Detected</h4>
            <div className="flex flex-wrap gap-2">
              {data.antiPatterns.map((p, i) => (
                <Badge key={i} variant={scoreBadgeVariant(data.efficiencyScore)}>
                  {p.name} ({p.count}x)
                </Badge>
              ))}
            </div>
          </div>
        )}

        {data.wastedTurns.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Rewrite Suggestions</h4>
            <div className="space-y-2">
              {data.wastedTurns.slice(0, 3).map((turn, i) => (
                <div key={i} className="rounded border p-3 text-sm">
                  <p className="text-muted-foreground mb-1">{turn.reason}</p>
                  <p className="font-medium">&ldquo;{turn.suggestedRewrite}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.tips.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Tips</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {data.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 3: Create AnalyzePromptQualityButton component**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { analyzePromptQuality } from '@/lib/llm/analysis';
import type { Session, Message } from '@/lib/types';
import type { PromptQualityResponse } from '@/lib/llm/prompts';

interface Props {
  session: Session;
  messages: Message[];
  onResult: (result: PromptQualityResponse) => void;
}

export function AnalyzePromptQualityButton({ session, messages, onResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzePromptQuality(session, messages);
      if (result.success && result.result) {
        onResult(result.result);
      } else {
        setError(result.error || 'Analysis failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button
        onClick={handleAnalyze}
        disabled={loading}
        variant="outline"
        size="sm"
      >
        <Sparkles className="mr-2 h-4 w-4" />
        {loading ? 'Analyzing...' : 'Analyze Prompt Quality'}
      </Button>
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}
```

**Step 4: Integrate into session detail page**

Add the PromptQualityCard and AnalyzePromptQualityButton to the session detail page. The exact placement depends on the current page layout (read first, then integrate).

**Step 5: Verify it builds**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights-web
pnpm build
```

**Step 6: Commit**

```bash
git add src/components/analysis/ src/app/sessions/
git commit -m "feat(web): add prompt quality analysis UI components"
```

---

### Task 17: Update CLAUDE.md in web repo

**Files:**
- Modify: `code-insights-web/CLAUDE.md`

**Step 1: Update the Insight Types section**

Add `prompt_quality` to the list:
```markdown
### Insight Types
- `summary` — High-level session narrative
- `decision` — Choices with reasoning and alternatives
- `learning` — Technical discoveries and knowledge
- `technique` — Problem-solving approaches
- `prompt_quality` — Prompt efficiency analysis with rewrite suggestions
```

**Step 2: Update LLM Analysis section**

Add note about Ollama model discovery:
```markdown
- **Ollama** (local): Auto-discovers installed models, falls back to llama3.2, mistral, codellama
```

**Step 3: Commit**

```bash
cd /home/srikanth/Workspace/code-insights/code-insights-web
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with prompt_quality insight type and Ollama discovery"
```

---

## Summary

| Phase | Tasks | What Gets Built |
|-------|-------|-----------------|
| **Phase 1: Foundation** | Tasks 1-9 | 5 adapted agents, 1 new hook, 2 updated hooks, CLAUDE.md updated |
| **Phase 2: Features** | Tasks 10-17 | Session rename, prompt quality analysis, Ollama model discovery, UI components |

**Total:** 17 tasks across both repos. All new Firestore fields are optional (backward compatible). All LLM processing is client-side.
