# Session Writeup / Dispatch — Feature Ideation

> **Status:** Ideation — Thoughts maturing, not ready for implementation
> **Date:** 2026-05-09
> **Triggered by:** Entire.io "Dispatch" feature observation
> **Depends on:** `.code-insights.md` Phase 1 (`code-insights attach`) — must ship first

---

## The Spark

Entire.io shipped a "Dispatch" feature: scope a repo + time window, choose a voice (Neutral / Marvin / Custom), get a newsletter-style narrative of what shipped that week — sourced from git commits.

The observation: Code Insights can tell a *richer* story. Entire.io reads commits → produces a **what**. Code Insights reads AI sessions → can produce a **why** — the decisions made, the friction encountered, the collaboration patterns. That's structurally better and only Code Insights can tell it.

---

## Founder's Vision (2026-05-09)

A **"Dispatch" button on the session detail page** in the dashboard that generates an engineering blog post from that session's conversation and analysis data — ready to post on dev.to, Hashnode, or a personal engineering blog.

Key intent:
- Session-scoped (one session → one story)
- Entry point: button on session detail in dashboard UI
- Output: blog post, not a data dump
- Released in phases

---

## Strategic Critique (devtools-cofounder)

### The Granularity Problem

Single-session → publishable blog post has a structural mismatch. The session taxonomy proves it:

- `bug_hunt` session → reads like a Stack Overflow answer, not a blog post
- `feature_build` → missing "why" context from earlier exploration sessions
- `learning` → potentially fits, but rare

Most compelling engineering stories span multiple sessions. The interesting narrative is "how I shipped X" — and X almost never lives in one session.

### Who Is This For?

~5% of developers blog actively. The real question: does a 1-click generate button turn non-bloggers into bloggers? Probably not — Hashnode/dev.to are already saturated with low-effort AI posts. Adding another generation spigot doesn't differentiate Code Insights.

**The 80% use case is personal retrospective, not publishing.** The feature should acknowledge this.

### Quality Risk

One click + session transcript + LLM = potential exposure of:
- Internal file paths and service names
- Half-formed reasoning from mid-session AI mistakes
- Technically incorrect conclusions the AI made before correcting itself

Published under the developer's name, this is a brand risk *for them*.

### Verdict

Reframe the feature:

- **Phase 1:** "Session Writeup" — a generated retrospective *for the developer*, presented as markdown the user can adapt for blogging. Sets honest expectations.
- **Phase 2:** Multi-session bundling — pick 2–5 related sessions, generate a real narrative blog post. This is the publishable artifact. This belongs on the Export page, not the session detail page.

**Label matters:** "Write up this session" or "Generate writeup" sets the right expectation. "Dispatch" sounds like broadcasting; "Generate blog post" overpromises on Phase 1 quality.

---

## LLM Architecture Critique (llm-expert)

### Context Selection

Skip the raw transcript. Use structured extractions already in SQLite:
- Session summary + character
- All facets: friction (with attribution + evidence), effective patterns (with driver)
- All insights: decisions, learnings, techniques (with reasoning + evidence)

Estimated input: ~3–5K tokens — high signal, low cost.

**What's lost without the transcript:** The texture of the conversation — failed attempts, the moment something clicked, the exact back-and-forth of a breakthrough. **Mitigation:** The `evidence` field on each insight and facet is a raw quote anchored to the conversation. If evidence fields are well-populated, most texture is recoverable without the full transcript.

For sessions over 200 messages, if transcript access is needed: extract the first + last 10 messages plus any message flagged as a decision/learning anchor. Never sample randomly.

### Pipeline: Two Steps, Not One

| Step | Call | Temperature | Purpose |
|------|------|-------------|---------|
| 1 | Generate outline: section titles + one-sentence descriptions + story arc (problem → attempt → turning point → resolution) | 0.2 | Forces narrative structure, prevents listicle default |
| 2 | Expand each section | 0.7 | Voice, texture, readable prose |

Thread session ID across both calls for prompt cache key.

### Quality Gating (Gate Hard)

| Session Character | Eligibility |
|-------------------|-------------|
| `feature_build` | ✅ Eligible |
| `bug_hunt` | ✅ Eligible |
| `exploration` | ✅ Eligible |
| `refactor` | ⚠ Soft gate — require ≥3 decisions extracted, confidence ≥ 0.7 avg |
| `deep_focus` | ⚠ Soft gate — same threshold |
| `learning` | ❌ Block |
| `quick_task` | ❌ Block |

Additional minimum: session duration ≥ 20 minutes. Surface a clear message if session doesn't pass ("This session is too short for a meaningful writeup — try a feature build or bug hunt session").

### Output Format

- Frontmatter: title, 3–5 tags (auto-generated), 2-sentence tldr, estimated read time
- Target length: **800–1200 words** regardless of session length (synthesize depth, don't pad or compress linearly)
- Format: Markdown, ready to paste into dev.to / Hashnode / Ghost

### Prompt Guardrails

Ban these words in system prompt: "leveraged", "utilized", "seamlessly", "delve", "straightforward".

Persona instruction: *"You write like an engineer who built this and wants to share something genuinely useful with other engineers. You are not writing documentation."*

Include a negative example inline: show what the output should NOT look like (a bullet summary of what happened — the thing every AI defaults to).

### Model

**Sonnet at temperature 0.7** for expansion. Opus is not justified — this is narrative generation, not reasoning. Two-step Sonnet matches single-shot Opus quality at ~1/5 the cost. Temperature 0.2 for frontmatter (deterministic metadata).

---

## Phased Plan (Synthesized)

### Phase 1 — "Session Writeup" (Personal Retrospective)

**Entry point:** Button on session detail page in dashboard — "Write up this session"  
**Output:** Markdown retrospective — what happened, why decisions were made, what was learned  
**Framing:** For the developer themselves. Copy-to-clipboard. No publish infrastructure.  
**Quality gate:** Block `quick_task` and `learning`; require ≥ 20 min duration  
**LLM:** Sonnet, two-step pipeline, structured extractions only (no raw transcript)  
**Privacy:** Same 3-layer scrubbing as `.code-insights.md` — pre-LLM, prompt instruction, post-LLM  
**No:** Auto-publish, platform integrations, sharing infrastructure

### Phase 2 — Multi-Session Blog Post (Publishable)

**Entry point:** Export page (where users think "package this for elsewhere")  
**Scope:** Select 2–5 related sessions (by branch, by date range, or manually)  
**Output:** Full engineering blog post with frontmatter, narrative arc, 800–1200 words  
**Framing:** Ready to publish. This is the "Dispatch" vision.  
**Dependency:** Phase 1 usage data should justify Phase 2 before building

---

## Open Questions (Unresolved — Founder to Decide)

1. **What's the right label for Phase 1?** "Write up", "Session Writeup", "Generate Writeup"?  
2. **Should Phase 1 output be stored in SQLite?** Or generated on demand each time?  
3. **Does `.code-insights.md` Phase 1 need to ship before this, or can they be parallel?**  
4. **Is the quality gate message shown inline on the session detail page** (disabled button with tooltip) or only after clicking?  
5. **Phase 2 entry point:** Is the Export page the right home, or a dedicated "Create Post" flow?  

---

## Relationship to Other Features

| Feature | Relationship |
|---------|-------------|
| `code-insights attach` (`.code-insights.md`) | Prerequisite for Phase 2 multi-session post — shares decision/pattern aggregation logic |
| `code-insights reflect` | Parallel feature — Reflect is for self, Writeup/Dispatch is shareable |
| Export page | Phase 2 lives here; Phase 1 lives on session detail page |
| Entire.io Dispatch | Inspiration only. Don't position against — position against the blank page. |
