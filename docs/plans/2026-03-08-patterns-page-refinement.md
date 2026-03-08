# Patterns Page Refinement — Design Plan

**Date:** 2026-03-08
**Status:** Approved for implementation
**Prerequisite:** Phase 8 Reflect & Patterns (complete — PRs #109, #110)

---

## Problem Statement

The Patterns page has three issues identified through real usage:

1. **Skills generation is mediocre** — The LLM generates skills "for the sake of generating." Example: a `plan-task` skill that should be part of an existing agent system prompt, not a standalone skill. Rules and hooks add value; skills are filler that undermines trust in the entire Artifacts section.

2. **Working Style lacks a memorable identity** — The 3-5 sentence narrative is informative but not shareable or memorable. Users need a short, "brag-worthy" tagline that characterizes their coding style — something they'd screenshot or share.

3. **Tab organization doesn't match user mental models** — Three tabs (Friction & Wins | Rules & Skills | Working Style) split related content. Friction data and working style are both "who am I?" insights that belong together. Rules and hooks are "what should I change?" artifacts.

---

## Design Decisions

### Decision 1: Remove Skills Section

**Rationale (unanimous across TA, UX Engineer, DevTools Cofounder):**
- Quality problem is structural, not fixable by prompt tuning — LLM lacks context about the developer's agent setup
- Removing low-quality content increases trust in remaining high-quality content (rules + hooks)
- Rules work because they're short, specific, copy-pasteable. Hooks work because they're concrete commands. Skills require multi-step workflow context the LLM doesn't have.

**Changes:**
- Remove `skillTemplates` from `RULES_SKILLS_SYSTEM_PROMPT` in `reflect-prompts.ts`
- Remove `skillTemplates` from the JSON response format in `generateRulesSkillsPrompt()`
- Remove Skill Templates card from `PatternsPage.tsx`
- Bump max rules from 5 to 6 (filling freed space)
- Keep max hooks at 3

### Decision 2: Add Working Style Tagline

**Format:** 2-4 word archetype label, title-cased. Examples:
- "The Methodical Builder"
- "Relentless Debugger"
- "Architecture-First Thinker"
- "The Pattern Hunter"
- "Rapid Prototyper"

**LLM prompt constraints (CRITICAL):**
- "The tagline should be empowering and descriptive, never critical or negative"
- "Base it on the dominant session types, workflow patterns, and outcome distribution"
- "Think of it like a developer personality type — specific and earned, not generic"

**Type change:**
```typescript
// cli/src/types.ts — WorkingStyleResult
export interface WorkingStyleResult {
  section: 'working-style';
  tagline: string;              // NEW: 2-4 word archetype label
  narrative: string;
  workflowDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  characterDistribution: Record<string, number>;
  generatedAt: string;
}
```

**Schema impact:** None. `tagline` lives inside the JSON blob in `reflect_snapshots.results`. Old snapshots without `tagline` render with a fallback (no tagline shown, just narrative).

### Decision 3: Two-Tab Layout

**Current:** 3 tabs (Friction & Wins | Rules & Skills | Working Style)
**New:** 2 tabs (Insights | Artifacts)

| Tab | Content | Mental Model |
|-----|---------|-------------|
| **Insights** (default) | Working Style hero (tagline + narrative) → 3 pie charts → Friction narrative → Friction bar chart → Rate limit card → Effective patterns | "Who am I as a developer?" |
| **Artifacts** | CLAUDE.md Rules → Hook Configs → Pattern Ingredients fallback | "What should I change?" |

### Decision 4: Working Style Hero Card

The hero card sits **above the tab navigation**, always visible regardless of active tab. It uses a dark gradient background (`linear-gradient(135deg, #0f0f23, #1a1a3e)`) even in light-mode dashboard — this serves as both the page identity element and the future shareable card template (see gamification design doc).

**Hero card content:**
- Brain icon + "CODE INSIGHTS" branding (small)
- Tagline in large gradient text (blue-400 → purple-400)
- 3 stat pills: Sessions analyzed | Active streak (days) | AI tools used
- Simplified donut chart: session character distribution (top 3-4 types)

**Before generation state:** Shows distribution charts (from facet aggregation, always available) with placeholder text: "Generate patterns to discover your working style"

**After generation:** Full hero with tagline, stats, donut chart

### Decision 5: Streak Computation

Compute active streak from synced session timestamps:
- Count consecutive days (backward from today) that have at least one session
- Data source: `sessions` table, `started_at` column
- Computation: server-side in a new utility or in `shared-aggregation.ts`
- Return as part of `AggregatedData` or as a separate lightweight endpoint

### Decision 6: Visual Polish

1. **Friction bar chart:** Color-code bars by severity (green → amber → orange → red)
2. **Effective patterns:** Upgrade from plain list to divided card with styled frequency badges (`7x` in `bg-primary/10 text-primary`)
3. **Tabs:** Switch from custom buttons to shadcn `<Tabs>` component
4. **Metadata line:** Move "Generated 2h ago · 45 sessions" into header area near controls
5. **Rules cards:** Use `<Badge variant="secondary">` for friction source tags, tighter spacing

---

## Information Hierarchy (Insights Tab)

1. **Identity** (tagline + narrative) — instant gratification, "who am I?"
2. **Evidence** (3 pie charts) — data backing up the narrative
3. **Friction** (bar chart + narrative) — "what's slowing me down?"
4. **Positive close** (effective patterns) — ends on what's working

---

## File Changes

| Action | File | Change |
|--------|------|--------|
| Modify | `cli/src/types.ts` | Add `tagline: string` to `WorkingStyleResult` |
| Modify | `server/src/llm/reflect-prompts.ts` | Add tagline to working style prompt, remove skills from rules prompt |
| Modify | `server/src/routes/shared-aggregation.ts` | Add streak computation to `AggregatedData` |
| Modify | `dashboard/src/pages/PatternsPage.tsx` | 2-tab layout, hero card, remove skills section, visual polish |
| Create | `dashboard/src/components/patterns/WorkingStyleHeroCard.tsx` | Hero card component (dark gradient, tagline, stats, donut) |
| Modify | `dashboard/src/lib/api.ts` | Add streak to `FacetAggregation` type if needed |

---

## Future Compatibility

This design is built with the gamification/shareability roadmap in mind (see `2026-03-08-gamification-shareable-badges.md`):

- The hero card's dark gradient design matches the planned shareable card template
- The hero card component will be reusable as the render target for `html-to-image` export
- Stat pills (sessions, streak, tools) are the same data points planned for the shareable badge
- The inline SVG donut chart (not Recharts) ensures canvas-compatible rendering for future image export
- No Recharts components inside the hero card — static SVG only

---

## Out of Scope

- Shareable image download (separate feature — see gamification doc)
- Stats page changes
- Achievement/badge system
- Gamification mechanics
- New SQLite migrations
