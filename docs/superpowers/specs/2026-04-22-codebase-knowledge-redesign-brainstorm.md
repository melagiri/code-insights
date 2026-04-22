# Codebase Knowledge — Redesign Brainstorm Notes

**Date:** 2026-04-22  
**Branch:** feature/codebase-knowledge-redesign  
**Status:** Brainstorming complete — pending TA + UX review, then implementation plan  
**Context:** Continuation of the 2026-04-20 spec (`docs/superpowers/specs/2026-04-20-codebase-knowledge-design.md`)

---

## What Was Researched

Two parallel agents ran before this brainstorm:

1. **Spec analyst** — deep pros/cons of the 2026-04-20 `.code-insights.md` spec
2. **entire.io browser researcher** — explored entire.io's product: checkpoint-based git-native session archiving, orphan branch storage, `entire explain` retrieval command, team-shared checkpoint branches

### Key findings from entire.io

- entire.io is a **commit-anchored, full-fidelity archive** (raw transcripts in git). Code Insights is a **synthesized knowledge layer** (LLM-extracted decisions/learnings). Complementary, not competing.
- entire.io's `entire explain --commit <sha>` retrieval UX is as important as storage — retrieval interface matters.
- entire.io stores checkpoints in an orphan branch; uses commit trailers (`Entire-Checkpoint: <id>`) that survive rebase/squash.
- entire.io has no synthesis layer — it captures everything but analyzes nothing. Code Insights' LLM synthesis is the differentiator.

### Key weaknesses found in the 2026-04-20 spec

1. **Staleness is silent** — file goes stale with no signal. No `sessions_at_generation` counter, no dashboard warning.
2. **Authorship blindspot** — file appears authoritative but reflects one developer's sessions only. No attribution.
3. **CLAUDE.md relationship unresolved** — agents won't automatically find `.code-insights.md`; needs a CLAUDE.md reference.
4. **LLM hallucination in Key Decisions** — system prompt doesn't prohibit inferring reasoning not present in session data.
5. **Update cadence undefined** — "after more sessions" is not actionable.
6. **No retrieval interface** — the file is the only interaction surface; no way to query by topic.

---

## Design Direction Chosen: **B — The Intent Layer (Extended)**

Three options were presented; **B** was chosen by the user. The original B has been extended with a team knowledge sync model.

### What B delivers

1. **All fixes from the original spec** — attribution, staleness signal, CLAUDE.md bridge, LLM hallucination guard
2. **`code-insights context` retrieval command** — live query interface over the knowledge base
3. **Configurable auto-regeneration** — not just manual; session-count-delta or schedule triggers
4. **`--inject-rules`** — formal CLAUDE.md injection, not deferred
5. **Team knowledge sync via Supabase** — the major new direction (see below)

---

## The Major New Direction: Team Knowledge Sync

### The problem being solved

Each developer has their own `~/.code-insights/data.db`. Their extracted decisions and learnings are invisible to teammates. The committed `.code-insights.md` file is only one person's view. In a team of 4, three developers' AI session knowledge is lost.

### The architecture

**Two-tier model:**

| Tier | Storage | Contents | Access |
|------|---------|----------|--------|
| Personal (free) | Local SQLite `~/.code-insights/data.db` | Everything — sessions, transcripts, insights, extracted knowledge | Local only, never leaves machine |
| Team (paid) | Supabase PostgreSQL (bring-your-own) | Extracted knowledge only — decisions, learnings, patterns, friction | All team members read/write |

**Privacy boundary (CRITICAL):**

What **never** leaves your machine:
- Raw session transcripts
- Your prompts and messages
- Tool call contents
- File contents from sessions

What **syncs to team DB** (already LLM-processed and scrubbed):
- Extracted decisions (structured: choice, reasoning, category, confidence)
- Extracted learnings (structured: insight, topic, takeaway)
- Pattern categories + frequencies
- Friction categories + severity + attribution
- Reflect rules (already reviewed by user before syncing)

**Why this privacy story works:** The LLM synthesis step is the privacy boundary. Raw transcripts → LLM → structured decisions/learnings. By the time knowledge hits the team DB, it's been through two scrub passes and an LLM abstraction layer. You're sharing conclusions, not conversations.

### Team Supabase schema (proposed)

```sql
-- All tables are project-scoped and author-attributed

team_decisions (
  id, project_id, author_git_user, author_email,
  topic_tags[], choice_text, reasoning, alternatives_rejected,
  tradeoff, revisit_condition, confidence, context_note,
  created_at, superseded_by_id (nullable)
)

team_learnings (
  id, project_id, author_git_user, author_email,
  topic_tags[], insight_text, root_cause, takeaway,
  session_character, created_at
)

team_patterns (
  id, project_id, author_git_user, author_email,
  category, description, frequency, driver, created_at
)

team_friction (
  id, project_id, author_git_user, author_email,
  category, description, severity, frequency,
  attribution, mitigation, created_at
)

team_conflict_alerts (
  id, new_entry_id, new_entry_type,
  conflicting_entry_id, conflicting_entry_type,
  keyword_overlap[], resolved_as ('supersedes' | 'complements' | 'ignored'),
  resolved_at, resolved_by
)
```

### Sync trigger

- **Default: automatic** — extracted knowledge syncs as part of `code-insights sync` after session analysis
- **Configurable** — can be set to: `on-sync` (default) / `on-attach` / `manual`
- User can always preview what will be pushed before it goes

### BYOS (Bring Your Own Supabase)

- Teams configure their own Supabase project — paste connection string into `code-insights config`
- Code Insights never runs infra; never touches the data
- Enterprise teams can self-host Supabase entirely on-premise
- Row-level security isolates project data

---

## The Conflict Resolution Model

**Decision:** Latest timestamp takes precedence (mirrors how ADRs work in practice — a newer ADR supersedes an older one).

**But:** The system must surface potential conflicts at *write time* so the author is never blindsided.

### Conflict detection flow

1. Developer's session produces a new extracted decision (e.g., "use raw SQL for migrations")
2. Before pushing to team DB, the system keyword-matches against existing team decisions in the same project
3. If overlap detected: **conflict alert surfaced** — "⚠ This may relate to an existing decision by @alice (Jan 2026): 'Use ORM for migrations'"
4. Author chooses:
   - **Supersedes** — mark old decision as superseded, new one is canonical
   - **Complements** — both decisions coexist under the topic (different aspect)
   - **Ignore** — push without linking (not recommended but allowed)

**Keyword matching strategy (TBD with TA):** Options are fuzzy text match, embedding similarity, or topic-tag overlap. Needs TA input on what's feasible without adding heavy infra.

### Dashboard topic grouping

The dashboard should show decisions **grouped by topic** with the evolution timeline visible:

```
Topic: database/migrations
  ✓ [Jan 2026] @alice — Use ORM for migrations          [superseded]
  ✓ [Mar 2026] @bob   — Use raw SQL in applyVN()        [current · supersedes above]

Topic: database/connections
  ✓ [Feb 2026] @alice — Use WAL mode for all SQLite     [current]
  ✓ [Apr 2026] @bob   — WAL mode confirmed, add timeout [complements above]
```

This is a natural knowledge evolution UI — not just a flat list of rules, but a versioned decision history per topic.

---

## The `code-insights context` Command

### `code-insights context --topics`

Lists all topics where the team has decisions and learnings:

```
Topics with knowledge (project: code-insights)

database/sqlite      12 decisions · 8 learnings · 3 authors
auth                  5 decisions · 4 learnings · 2 authors
packaging             4 decisions · 2 learnings · 1 author
migrations            3 decisions · 6 learnings · 2 authors
dashboard/build       2 decisions · 3 learnings · 1 author
```

### `code-insights context <topic>`

Returns all knowledge for a topic, merged from local DB + team Supabase:

```
Context: database/sqlite   (3 sources · last updated Apr 2026)

Decisions
  [confidence: 95]  Use WAL mode for all SQLite connections
                    @alice · Jan 2026 · "Prevents SQLITE_BUSY under concurrent reads"
  [confidence: 92]  Write migrations as raw SQL in applyVN()
                    @bob · Mar 2026 · "ORM failed silently on V6" · supersedes ORM decision

Learnings
  @alice · Feb 2026 · WAL mode must be set at connection open, not per-query
  @bob   · Mar 2026 · ALTER TABLE in SQLite can't drop columns — use recreate pattern

Active friction
  stale-assumptions (high · 23 occurrences) — @team
  Mitigation: grep for current schema version before touching migrations
```

**Attribution model:** Every entry shows git user + timestamp. Merged view: local DB entries (your sessions) + team Supabase entries (teammates).

---

## The `.code-insights.md` Evolution

With team DB, the committed file becomes a **team artifact** rather than a personal one:

- Generated from the team Supabase DB (all members' knowledge), not just the local DB
- Attribution in the frontmatter: `authors: [alice, bob, srikanth]` instead of `author: srikanth`
- YAML `rules[]` are ranked by confidence across all contributors
- Key Decisions section represents the team's collective architectural history
- Staleness solved: file generated from live team DB, always reflects current state

---

## Fixes Retained from Original Spec Analysis

These fixes from the spec analyst were confirmed and remain in scope:

1. **Author attribution** — `author` in YAML frontmatter, byline in markdown header (team version: `authors: [...]`)
2. **CLAUDE.md bridge** — after first generation, CLI prompts: "Add to CLAUDE.md: `See .code-insights.md for AI-extracted codebase knowledge.`"
3. **Staleness signal** — `sessions_at_generation` in frontmatter; passive dashboard warning when delta > 50 sessions
4. **LLM hallucination guard** — add to system prompt: "Do not infer reasoning not explicitly present in the session data. Omit a decision if its reasoning is unclear."
5. **`--no-llm` as CI mode** — reframe as first-class CI use case, not just a fallback

---

## Product Strategy Implications

**Current VISION.md says:** "No team/org features. No cloud sync. No monetization."

**This design adds all three** — but as an optional team tier:
- Free tier: unchanged — local SQLite, fully personal, everything as today
- Team tier: opt-in, bring-your-own Supabase, self-hosted-first, privacy-preserving

**Key framing:** This is not a pivot away from local-first. It's adding a team sync layer where the privacy boundary is the LLM synthesis step. Raw data never leaves the machine; only structured conclusions sync.

**Monetization model (to be decided):** Likely seat-based pricing for team tier, with free personal tier unchanged. BYOS means Code Insights doesn't run the database infra.

---

## Open Questions (for TA + UX inputs)

**Technical:**
- What keyword/semantic matching strategy for conflict detection? (fuzzy text, embeddings, topic-tag overlap?)
- PostgreSQL schema design for multi-tenant team DB with row-level security
- Sync protocol: how does the CLI authenticate to team Supabase? (connection string? Supabase anon key + JWT?)
- Topic extraction: LLM tags topics at analysis time, or derived on-the-fly via keyword search?
- How does `code-insights context` handle offline mode when team DB is unreachable?

**UX:**
- What does the conflict alert look like at the terminal (non-blocking? blocking with prompt)?
- Dashboard topic grouping: flat list with headers, or expandable tree?
- What's the visual treatment for superseded vs current decisions?
- How does the dashboard show team member attribution? Avatars? Git usernames?
- Where does the team DB config live in the dashboard settings flow?

---

## Implementation Sequence (Tentative, Pre-TA Review)

The original spec's implementation sequence is no longer sufficient given the team DB scope. A new sequence is needed:

**Phase 1: Personal tier (the original spec + fixes)**
- `cli/src/utils/project-root.ts`, `cli/src/utils/scrub.ts`
- `server/src/llm/repo-export-prompts.ts`
- `server/src/routes/export.ts` + two new endpoints
- `cli/src/commands/export.ts` + `attach` alias
- Dashboard: Repo format card + Step 4 review UI

**Phase 2: Retrieval command**
- `code-insights context --topics` and `code-insights context <topic>` (local DB only first)

**Phase 3: Team sync (Supabase)**
- Team DB schema + Supabase auth config
- Sync mechanism (`code-insights sync --push-knowledge`)
- `code-insights context` extended to read from team DB
- Conflict detection + alert flow
- Dashboard topic grouping view

**Phase 4: Team `.code-insights.md`**
- `code-insights attach` generates from team DB when configured
- Multi-author attribution in frontmatter

---

## Next Steps

1. TA reviews technical architecture — schema, sync, conflict detection feasibility
2. UX engineer reviews dashboard topic grouping + conflict alert UX
3. Update VISION.md to reflect team tier direction (after founder decision)
4. Write implementation plan starting with Phase 1 (original spec + fixes)
5. Phase 2–4 get separate specs and plans
