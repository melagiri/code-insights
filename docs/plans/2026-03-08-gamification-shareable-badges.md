# Gamification & Shareable Badges — Design Plan

**Date:** 2026-03-08
**Status:** Future feature (design phase — not yet approved for implementation)
**Prerequisite:** Patterns Page Refinement (2026-03-08-patterns-page-refinement.md)
**Depends on:** Working Style hero card, tagline, streak computation

---

## Vision

Enable users to download shareable badge/image cards from Code Insights that they can post on LinkedIn, X/Twitter, and other social media. This serves as an organic growth channel — users share their "developer identity card" or "coding stats" and it drives awareness of Code Insights.

**Precedent:** GitHub Wrapped, Spotify Wrapped, WakaTime badges, GitPodcast. The "developer personality type" angle (like MBTI for coding) is the unique differentiator.

---

## Strategic Assessment (DevTools Cofounder)

### Why This Works
- Developer identity content gets shared (GitHub Wrapped proved this at scale)
- "AI coding session analysis" is a novel angle no competitor has
- The archetype tagline ("The Methodical Builder") is inherently share-worthy — it's identity-forming
- Multi-tool angle is unique: "I use 4 AI coding tools" is a flex developers want to make

### Risks
- **Gimmicky perception:** Mitigate by framing as "professional development insight" not "fun badge"
- **Low sharing rate:** Most developer tools see <5% share rate. That's fine — even 2% of users sharing generates organic reach
- **Privacy anxiety:** Users must feel 100% confident no sensitive data leaks into the card

### Growth Mechanics
- Card includes `code-insights.app` URL for attribution
- Consider a landing page explaining archetypes ("What's your coding style?")
- Comparison angle: "I'm a Methodical Builder — what are you?"
- Potential hashtag: `#MyCodeStyle` or `#CodeInsights`

---

## Shareable Surfaces (Phased)

### Phase 1: Working Style Card (Patterns Page)
The hero card from the Patterns page becomes the first shareable image.

### Phase 2: Stats Card (Stats Page) — Future
Monthly/period stats summary with key metrics.

### Phase 3: Milestone Cards — Future
Achievement-triggered cards (100 sessions, 30-day streak, etc.)

---

## Technical Architecture

### Image Generation: `html-to-image`

| Aspect | Decision |
|--------|----------|
| Library | `html-to-image` (~12KB gzip) |
| Approach | Purpose-built card component rendered off-screen, not a page screenshot |
| Format | PNG only (universal compatibility) |
| Dimensions | 1200x630px (1.91:1 — works on LinkedIn, X, general embeds) |
| Theme | Always dark gradient (brand identity, stands out on social feeds) |
| Pixel ratio | 2x for retina sharpness |
| Fonts | System fonts only (no web font loading/embedding issues) |
| Charts | Inline SVG donut (NOT Recharts — canvas compatibility) |
| Colors | Hardcoded hex values (no CSS variables — unreliable in canvas conversion) |

### Card Design (Working Style)

```
+====================================================================+
|  SHAREABLE CARD (1200x630, dark gradient)                          |
|  Background: linear-gradient(135deg, #0f0f23, #1a1a3e)            |
|  + radial glow top-right (#a855f7 at 20% opacity)                 |
|  + radial glow bottom-left (#3b82f6 at 15% opacity)               |
|                                                                    |
|  +--LEFT (60%)-------------------+  +--RIGHT (40%)-------------+  |
|  |                                |  |                           |  |
|  |  (Brain) CODE INSIGHTS         |  |  +---------------------+  |  |
|  |                                |  |  |   SESSION TYPES     |  |  |
|  |  "The Methodical               |  |  |   DONUT CHART       |  |  |
|  |   Builder"                     |  |  |   (3-4 segments     |  |  |
|  |  (text-4xl, gradient text      |  |  |    with legend)     |  |  |
|  |   blue-400 → purple-400)       |  |  +---------------------+  |  |
|  |                                |  |                           |  |
|  |  +-------+ +-------+ +------+ |  |  +------+ +------+       |  |
|  |  | 247   | | 30d   | | 4    | |  |  | 87%  | | 142  |       |  |
|  |  |sessions| |streak | |tools | |  |  |success| |analyzed     |  |
|  |  +-------+ +-------+ +------+ |  |  +------+ +------+       |  |
|  +--------------------------------+  +---------------------------+  |
|                                                                    |
|  ── (separator, #ffffff at 10%) ─────────────────────────────────  |
|  (Brain) code-insights.app                    Patterns · Mar 2026  |
+====================================================================+
```

### Stats Card (Future — Phase 2)

```
+====================================================================+
|  STATS CARD (1200x630, same dark gradient)                         |
|                                                                    |
|  (Brain) CODE INSIGHTS                                             |
|                                                                    |
|  "March 2026"                                                      |
|                                                                    |
|  +--------+  +--------+  +--------+  +--------+                   |
|  | 47     |  | $12.40 |  | 14-day |  | 89%    |                   |
|  |sessions|  | cost   |  | streak |  |success |                   |
|  +--------+  +--------+  +--------+  +--------+                   |
|                                                                    |
|  [Activity sparkline — 30-day mini chart]                          |
|                                                                    |
|  [tool icon] [tool icon] [tool icon]   "Uses 3 AI tools"          |
|                                                                    |
|  ── separator ──                                                   |
|  code-insights.app                              Stats · Mar 2026   |
+====================================================================+
```

---

## Privacy Model

### Safe to Include on Shareable Cards

| Data | Rationale |
|------|-----------|
| Working style tagline | LLM-generated archetype, inherently generic |
| Total session count | Aggregate number, no specifics |
| Session character distribution (%) | Generic categories (deep_focus, bug_hunt, etc.) |
| Outcome success rate (%) | Aggregate metric |
| Number of AI tools used | Count only, no tool-specific details |
| Time period | "Last 30 days", "March 2026" |
| Active streak (days) | Positive metric |
| Cost total (Stats card only) | User opt-in decision — some want to flex spend |

### Must NEVER Include

| Data | Rationale |
|------|-----------|
| Project names | May reveal company names, client names, repo names |
| File paths | Reveals codebase structure |
| Session titles | May contain feature descriptions revealing proprietary work |
| Friction examples | May reference project-specific code/repos |
| Git branches/remotes | Reveals internal tooling |
| API keys, model names | Security/privacy concern |
| Username/email | PII |
| LLM narrative text | May reference project-specific details |

---

## Download UX

### Trigger
- **Icon button** (lucide `Download`) on the hero card, top-right corner
- Only visible when reflect results exist (after Generate)
- Tooltip: "Download shareable card"

### Flow
1. User clicks Download button
2. System renders hidden 1200x630 `div` off-screen (`position: absolute; left: -9999px`)
3. `html-to-image` converts to PNG at 2x pixel ratio
4. Browser triggers download: `code-insights-working-style.png`
5. Sonner toast: "Card downloaded"

### No Preview Modal
The hero card on the page IS the preview — it visually matches the downloadable card. WYSIWYG.

### One Format, One Size
PNG only. 1200x630px only. No format picker, no aspect ratio picker. Simplicity over configurability.

---

## Computed Milestones (Not Persistent Badges)

Instead of a full achievement system with DB tables, compute milestones on-the-fly from existing data:

| Milestone | Trigger | Card Display |
|-----------|---------|-------------|
| Session count | 50, 100, 250, 500, 1000 | Badge pill: "500 sessions" |
| Active streak | 7, 14, 30, 60, 90 days | Flame icon: "14-day streak" |
| Multi-tool | 2+, 3+, 4 source tools | Tool icons: "Uses 3 AI tools" |
| Analysis coverage | >80% analyzed | "Deep Analyzer" label |
| Success rate | >85% over 30+ sessions | "High Success" indicator |

These require NO new database tables — they're computed from existing session data at render time.

---

## Component Architecture

```
ShareableCardRenderer (orchestrator)
├── WorkingStyleShareCard (purpose-built, hardcoded hex colors, system fonts)
│   ├── Left column: branding, tagline, stat pills
│   └── Right column: SVG donut chart, secondary stats
├── StatsShareCard (future — Phase 2)
│   ├── Period header, stat pills
│   └── Activity sparkline, tool icons
└── Download utility (html-to-image wrapper)
    ├── toPng(element, { pixelRatio: 2, backgroundColor: '#0f0f23' })
    └── Trigger <a> download with data URL
```

### Separation from Page Components
The shareable card is a **separate component** from the hero card on the page. They share the same visual design, but:
- Page hero: uses Tailwind classes, CSS variables, responsive sizing
- Shareable card: hardcoded hex colors, fixed 1200x630 dimensions, system fonts, inline SVG

This separation ensures the export is reliable regardless of CSS variable resolution or responsive breakpoints.

---

## Open Questions (To Resolve Before Implementation)

### 1. User Authentication / Identity
Should the shareable card include the user's name or handle?
- **Current state:** Code Insights has no user accounts. It's fully local-first.
- **Option A:** No user identity on card — anonymous stats only
- **Option B:** Add a lightweight "display name" config (`code-insights config set name "John"`) — stored in `~/.code-insights/config.json`, purely optional
- **Option C:** Allow user to type their name in a modal before downloading
- **Recommendation:** Start with Option A (no identity). If users request it, add Option B as a simple config value. No authentication needed — this is a local tool.

### 2. Landing Page for Archetypes
Should `code-insights.app` have a page explaining the archetypes?
- Could drive traffic: "I'm a Methodical Builder — discover yours at code-insights.app/style"
- Requires web repo changes (separate PR)
- **Recommendation:** Build after validating share rate with v1 cards

### 3. Share vs Download
Should we offer direct social sharing (share API) in addition to download?
- `navigator.share()` works on mobile and some desktops
- Falls back to download on unsupported platforms
- **Recommendation:** Start with download only. Add share API later if users request it.

### 4. Card Customization
Should users be able to customize the card (color theme, which stats to show)?
- **Recommendation:** No. One design, one format. Customization adds complexity without proportional value. The dark gradient IS the brand identity.

### 5. Cost Data on Stats Card
Including API cost on the Stats card is a flex some developers want to make, but it could also be:
- Embarrassing (high spend)
- Irrelevant (users on free tiers)
- Misleading (doesn't account for employer-paid plans)
- **Recommendation:** Exclude cost from shareable cards. Keep it dashboard-only.

---

## Implementation Priority

| Phase | Feature | Depends On |
|-------|---------|-----------|
| **Current** | Patterns page refinement (tagline, 2-tab, skills removal, hero card) | — |
| **Next** | Shareable Working Style card (download button, html-to-image) | Hero card component |
| **Future** | Stats page shareable card | Stats page data hooks |
| **Future** | Milestone markers on cards | Streak computation |
| **Future** | Archetype landing page on website | Web repo, share rate validation |

---

## Success Metrics

- **Share rate:** % of users who download a card (target: >5% of active users)
- **Attribution clicks:** Traffic to code-insights.app from shared cards
- **Regeneration rate:** Users who regenerate patterns to get a new tagline (indicates engagement)
- **Retention signal:** Users returning to Patterns page regularly

---

## Dependencies on Patterns Refinement

The shareable card feature depends on these outputs from the Patterns page refinement:
1. `tagline` field in `WorkingStyleResult` type
2. Hero card component with dark gradient design
3. Streak computation in aggregation layer
4. Inline SVG donut chart (not Recharts)

These are being built as part of the current Patterns refinement with future shareability explicitly in mind.
