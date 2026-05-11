# Dispatch — Learnings-Curated Blog Post Generator

> **Status:** Design — Ready for implementation planning
> **Date:** 2026-05-10
> **Supersedes:** `2026-05-09-session-writeup-dispatch-ideation.md` (session-scoped approach abandoned)
> **Dependencies:** None — uses existing `insights` table and `/insights` dashboard page

---

## Problem

Developers accumulate structured learnings, decisions, and techniques across AI coding sessions. These live in the `insights` table — processed, categorized, and evidenced. But they never escape the tool. There is no way to turn them into something shareable: a blog post, a team write-up, a personal changelog entry.

The insight already exists. The developer just needs a way to tell the story around it.

---

## What Changed From the Original Vision

The original idea was session-scoped: one session → one blog post. That was critiqued and abandoned for three reasons:

1. **Granularity mismatch** — compelling engineering stories span multiple sessions; a single session produces a Stack Overflow answer, not a blog post
2. **Quality risk** — session transcripts contain half-formed AI reasoning and wrong mid-session conclusions
3. **Over-generation** — 1-click blog post generation without user intent produces low-quality, unauthentic output

**The revised approach:** The user *curates* 5–8 learnings from their insight library, provides a 2–3 sentence context paragraph explaining the story, and the LLM structures it into a publishable post. The user provides the narrative spine; the LLM provides the prose scaffolding.

---

## Core Design

### Mental Model

> "I select what I learned. I say why it matters. You write the post."

The developer is the author. The tool is the ghostwriter. The output is authentically theirs because the curation and framing are theirs.

---

## Data Model

### Source: `insights` table

Each selected insight contributes:

| Field | Use | Notes |
|-------|-----|-------|
| `type` | Section label | `learning` / `decision` / `technique` |
| `summary` | Always included | 1–2 sentence distilled point |
| `content` | Always included | 2–5 sentence fuller explanation |
| `bullets` | Conditional | Only if `content` is sparse (< 40 words); often redundant |
| `evidence` | **Excluded** | Raw transcript quotes — already distilled into `content`; including re-adds 25–60% token cost and produces choppy prose |
| `confidence` | Filtering only | Not sent to LLM; used for sort order and optional UI indicator |

**Estimated tokens per insight (without evidence):** ~220 tokens  
**At 8 insights:** ~1,760 insight tokens + ~200 user context + ~300 system prompt = **~2,300 total input tokens**

### What NOT to send to the LLM

- Raw session transcripts
- Evidence field (already processed into `content`)
- Session IDs or machine file paths
- `confidence` score (not relevant to prose generation)

---

## Selection Constraints

| Constraint | Value | Rationale |
|-----------|-------|-----------|
| Minimum | 3 insights | Below 3, insufficient material for a structured post |
| Sweet spot | 5–7 insights | Enough for intro + 2–3 body sections + conclusion without thematic sprawl |
| Hard cap | 8 insights | Beyond 8, output becomes a listicle; nudge user to narrow selection |

When the user tries to select a 9th insight, show: *"For the best post, keep it to 8 or fewer. Narrow your selection to the most connected learnings."*

---

## User Flow

### Entry Points

**Primary:** `/insights` page — checkbox on each insight card  
**Secondary:** `/journal` page — weekly learnings view; users browsing in reflection mode are already primed to write

### Step-by-Step

```
Step 1 — Browse & Select
  User browses /insights (or /journal)
  Checkbox appears on each card on hover
  Floating action bar appears once ≥ 3 selected:
    "5 learnings selected — Create Post →"

Step 2 — Context + Generate
  Slide-out drawer (right side, ~480px wide):
  ┌─────────────────────────────────────────┐
  │  Create Blog Post                     × │
  ├─────────────────────────────────────────┤
  │  Selected (5)          [Reorder ↕]      │
  │  ○ [learning]  SQLite WAL mode ...      │
  │  ○ [decision]  Skipped ORM migrations  │
  │  ○ [technique] Incremental builds ...  │
  │  ○ [learning]  Hono server config ...  │
  │  ○ [decision]  Two-step LLM pipeline   │
  ├─────────────────────────────────────────┤
  │  What's the story?                      │
  │  ┌───────────────────────────────────┐  │
  │  │ I spent two weeks rebuilding the  │  │
  │  │ export pipeline. These are the    │  │
  │  │ lessons that surprised me most... │  │
  │  └───────────────────────────────────┘  │
  │  (2–3 sentences · this shapes the arc)  │
  ├─────────────────────────────────────────┤
  │  Tone                                   │
  │  ● Technical deep-dive                  │
  │  ○ Accessible (broader audience)        │
  │  ○ Quick tips (bullet-forward)          │
  ├─────────────────────────────────────────┤
  │              [Generate Post]            │
  └─────────────────────────────────────────┘

Step 3 — Preview & Export
  Generated markdown rendered inline
  Tab: [Preview] [Markdown]
  Actions: [Copy] [Download .md]
  No publish infrastructure — manual paste to dev.to / Hashnode / blog
```

### Reorder

The order the user arranges insights in the drawer determines the section order in the output. The LLM respects this ordering as the intended narrative flow.

---

## LLM Architecture

### Prompt Structure

Two-part: system prompt (persona + constraints) + user turn (context first, then insights).

**System prompt:**
```
You are a technical ghostwriter helping a software engineer publish their learnings.
The engineer has selected specific learnings and provided context about the story.

Write a blog post of 800–1000 words in markdown.
Structure: opening paragraph, 2–4 body sections (each anchored to a theme from the
selected insights), closing takeaway paragraph.
Use plain, direct prose — write like an engineer sharing hard-won knowledge,
not a content marketer. Do not use: "leveraged", "utilized", "seamlessly", "delve".
Include a title (h1) and 3–5 suggested tags as a frontmatter block.
```

**User turn structure (order matters — context BEFORE insights):**
```
CONTEXT: <user's 2–3 sentence framing paragraph>

SELECTED INSIGHTS:
[learning] <summary>
<content>

[decision] <summary>
<content>

[technique] <summary>
<content>
...
```

> **Why context comes first:** It functions as a topic sentence for the entire prompt. The model applies the narrative frame when reading the insight list. If context comes after, attention is allocated to insights without the frame — producing a generic post.

### Pipeline

**Single call** — no two-step outline + expand pipeline needed. The user's context paragraph IS the outline. The model's job is prose expansion, not structure discovery.

### Model & Temperature

| Setting | Value | Reason |
|---------|-------|--------|
| Model | Sonnet | Narrative coherence and voice consistency matter; Haiku shows quality regression on multi-paragraph writing |
| Temperature (post body) | 0.7 | Voice variation and readable prose |
| Temperature (frontmatter) | 0.2 | Deterministic title and tag generation |

**Estimated cost per generation:** ~$0.001–0.003 at current Sonnet pricing (~2,300 input + ~1,000 output tokens)

---

## Output Format

```markdown
---
title: "What Rebuilding the Export Pipeline Taught Me About SQLite"
tags: [sqlite, architecture, lessons-learned, backend, typescript]
tldr: "Two weeks, five surprises, one WAL mode revelation."
---

# What Rebuilding the Export Pipeline Taught Me About SQLite

[Opening paragraph — user's context reframed as a hook]

## WAL Mode Is Not Optional

[Section anchored to the SQLite WAL learning...]

## Why I Stopped Trusting ORM Migrations

[Section anchored to the migration decision...]

## The Two-Step Pipeline That Changed Everything

[Section anchored to the LLM pipeline technique...]

## What I'd Tell Myself Before Starting

[Closing takeaway paragraph]
```

**Target length:** 800–1000 words regardless of insight count — synthesize depth, do not pad or compress linearly.

---

## Privacy & Scrubbing

Insights are already processed and scrubbed at analysis time. The blog post generation pipeline does not touch raw transcripts. However, apply the same post-LLM scrub pass as `.code-insights.md` to catch anything that leaked through:

- Machine file paths (`/Users/...`)
- Internal service names (pattern-matched against project config)
- IP addresses and AWS ARNs

The user context paragraph is NOT scrubbed — the user wrote it intentionally. Only the LLM output is scrubbed.

---

## What This Feature Is NOT

- Not a publish integration — no API connections to dev.to, Hashnode, Medium, or any platform
- Not an auto-generator — requires deliberate user selection and context
- Not a session-to-post converter — session transcripts are never used
- Not a team feature — personal insights only (no cross-author aggregation in Phase 1)

---

## Implementation Touchpoints

### New

| File | Purpose |
|------|---------|
| `server/src/llm/dispatch-prompts.ts` | System prompt, `buildDispatchContext()`, output parsing |
| `dashboard/src/components/dispatch/` | `DispatchDrawer.tsx`, `InsightSelector.tsx`, `PostPreview.tsx` |

### Modified

| File | Change |
|------|--------|
| `server/src/routes/export.ts` | Add `format: 'dispatch'` to `POST /api/export/generate` |
| `dashboard/src/lib/api.ts` | Add `generateDispatch()` API function |
| `dashboard/src/pages/InsightsPage.tsx` | Add checkbox selection + floating action bar |
| `dashboard/src/pages/JournalPage.tsx` | Secondary entry point — checkbox + action bar |

### No schema changes needed

All required data (`insights` table) exists in Schema V9. No new tables, no migrations.

---

## Phasing

### Phase 1 — Core Generator

- Selection UI on `/insights` page (checkboxes, floating action bar)
- Drawer with reorder, context field, tone selector
- Single-call Sonnet generation
- Markdown preview with copy + download
- Hard cap: 8 insights

### Phase 2 — Journal Integration

- Secondary entry point on `/journal` page (weekly view)
- Pre-selection by ISO week ("Use this week's learnings")

### Phase 3 — Post History (if validated)

- `dispatches` table in SQLite to cache generated posts
- "Your posts" section on the Insights page
- Regenerate / edit context and regenerate

---

## Open Questions

1. **Tone presets** — are the three options (Technical / Accessible / Quick tips) the right set, or should there be a free-text voice field (like Entire.io's custom voice)?
2. **Journal as primary entry point** — should Phase 1 include Journal, or keep it to Insights only and add Journal in Phase 2?
3. **Selection persistence** — if the user closes the drawer and reopens it, should selection be remembered (session storage) or reset?
4. **Regeneration UX** — if the user edits the context and regenerates, overwrite in-place or show side-by-side diff?
5. **CLI equivalent** — `code-insights dispatch --insights <id1,id2,id3> --context "..."` for power users? Or dashboard-only feature?
