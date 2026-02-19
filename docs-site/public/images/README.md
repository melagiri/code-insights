# Screenshot Manifest

Screenshots referenced in the documentation. Capture from [code-insights.app](https://code-insights.app) in light mode at 1512px viewport width.

## Required Screenshots

| Filename | Referenced In | What to Capture |
|----------|--------------|-----------------|
| `dashboard-overview.png` | `guides/web-dashboard.md` | Full dashboard: greeting, all 8 stat cards, activity chart with 30d selected |
| `session-sidebar.png` | `guides/sessions-and-chat.md` | Sessions page showing left sidebar with search bar, project filter, and session list |
| `session-overview.png` | `guides/sessions-and-chat.md` | Session detail Overview tab: title, metadata bar, summary, vitals cards with character badge (use a Deep Focus session) |
| `conversation-view.png` | `guides/sessions-and-chat.md` | Session detail Conversation tab: user message, Claude response with thinking block, tool call badges |
| `prompt-quality.png` | `guides/insights-and-analysis.md` | Prompt Quality Analysis card: score (75-85 range), anti-patterns with counts, wasted turns, tips |
| `insight-cards.png` | `guides/insights-and-analysis.md` | Insights browse page: mix of Learning, Decision, Summary cards with type badges |
| `analytics-charts.png` | `guides/analytics-and-export.md` | Analytics page: summary cards + Activity Over Time chart + Insight Types donut + Top Projects bar |
| `export-wizard.png` | `guides/analytics-and-export.md` | Export page step 1: three scope cards (Everything, Project, Daily Digest) |

## Suggested Sessions for Screenshots

These sessions have rich data suitable for documentation screenshots:

- `d9474210` — "Pre-launch audits, fixes, and docs site deployment" (Prompt Quality 75, 5 learnings, 3 decisions)
- `29ebf872` — "Deep work: sheet.tsx" (Deep Focus character, 5h 24m, 249 messages)
- `0d4b2de8` — Good conversation view examples
- `7de0525b` — Variety of insight types

## Capture Notes

- Use light mode (default for docs)
- Viewport: 1512 x 775 (standard MacBook Pro)
- Crop to content area (remove browser chrome)
- Save as PNG, optimize with `sharp` or `pngquant`
- Recommended max width: 1200px for retina displays
