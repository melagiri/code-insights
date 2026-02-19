---
title: Analytics & Export
description: Visualize usage patterns across sessions and export your insights as Markdown for Obsidian, Notion, or plain files.
---

Analytics show the big picture: how you use AI coding tools over time, which projects demand the most attention, where your money goes, and what kinds of insights emerge from your sessions. The dashboard's Analytics page turns raw Firestore data into charts and summaries that reveal patterns you wouldn't notice session by session. And when you want to take that data somewhere else — into your note-taking app, a team wiki, or a personal knowledge base — the Export wizard packages everything as clean Markdown files.

## Analytics Overview

The Analytics page aggregates your entire session history into a single view. At the top, four summary cards give you the headline numbers:

- **Total Sessions** — Every session synced to Firestore, across all projects and devices
- **Total Insights** — The combined count of all LLM-generated insights (summaries, decisions, learnings, techniques, and prompt quality reports)
- **Active Projects** — How many distinct codebases you've worked on
- **Estimated Cost** — Approximate total spend based on token counts and model pricing

These cards update in real-time as new sessions sync and new insights are generated. They're your at-a-glance health check — a way to gauge the scale and cost of your AI-assisted development without digging into individual sessions.

## Charts

Below the summary cards, five charts break your data down into visual patterns.

### Activity Over Time

A full-width area chart showing two metrics across your entire history:

- **Sessions** (blue) — How many sessions you started each day
- **Tool calls** (green) — How many tool invocations Claude made each day, a proxy for session complexity

Unlike the dashboard home page, which defaults to a 30-day window, the Analytics chart shows everything from your first session onward. Hover over any point to see the exact daily counts. This is where you spot long-term trends: a ramp-up before a release, a quiet stretch during vacation, or a steady cadence that tells you your workflow is stable.

### Insight Types

A donut chart showing the distribution of your insight categories:

- **Decisions** (blue) — Architectural and design choices the LLM identified
- **Learnings** (green) — New knowledge or techniques you picked up
- **Prompt Quality** (red) — Analysis of how effectively you prompted Claude
- **Summaries** (purple) — High-level session recaps

This chart helps you see whether your analysis is balanced or skewed. If you're generating mostly summaries and few decisions, you might want to run decision-focused analysis on older sessions. If prompt quality reports dominate, that's a signal you're actively working on improving your prompting habits.

### Top Projects

A horizontal bar chart ranking your projects by session count. The longest bar is the project that gets the most AI attention. This is useful for understanding where your time goes — and for spotting projects that might benefit from more structured analysis.

### Cost Over Time

An area chart tracking your estimated spending day by day. The shape of this chart tells a story: did switching from Opus to Sonnet flatten the curve? Did that week-long refactor spike your costs? Are you spending more or less than last month? Pair this with the Activity chart to understand whether cost changes come from volume (more sessions) or intensity (more tokens per session).

### Model Usage

A donut chart showing which Claude models you use most frequently — for example, `sonnet-4` at 67% and `opus-4-6` at 32%. This helps you understand your model preferences and their cost implications. If you're trying to reduce spend, this chart shows exactly where the tokens are going.

![Analytics page showing activity chart and insight type distribution](/images/analytics-charts.png)

:::tip
The Analytics page is a good place to visit at the end of each week. Spend two minutes scanning the charts: is your activity trending up or down? Are costs where you expect them? Are you generating insights across all categories? These quick checks keep you aware of your patterns without requiring deep analysis.
:::

## Export

The Export page walks you through a 4-step wizard to download your sessions and insights as Markdown files. Everything runs client-side — the dashboard reads from your Firestore, formats the data locally, and hands you a file. Nothing leaves your browser.

### Step 1: What to Export

Choose your scope:

- **Everything** — All sessions and insights across all projects. You can optionally narrow this with a date range in the next step.
- **Project** — All insights from a single project. Useful when you want a focused export for one codebase.
- **Daily Digest** — A summary for a specific day. Pulls together all sessions and insights from that date into a single document.

### Step 2: Configure

Set the parameters for your chosen scope:

- **Everything** — Pick a start and end date to filter, or leave blank to export your full history
- **Project** — Select a project from the dropdown (populated from your Firestore data)
- **Daily Digest** — Choose a specific date

### Step 3: Format

Choose your output format. All three produce valid Markdown — they differ in how they handle structure and linking.

- **Plain Markdown** — Standard `.md` with headers, lists, and code blocks. Works everywhere: GitHub, VS Code preview, any text editor. This is the safe default.
- **Obsidian** — Adds callout blocks (`> [!note]`, `> [!tip]`, `> [!warning]`) for visual emphasis, and `[[wiki-style]]` backlinks between related sessions and insights. Import the file directly into your Obsidian vault and the links resolve automatically if you export multiple files into the same vault.
- **Notion** — Uses HTML `<details>` toggle blocks for collapsible sections. When you paste this Markdown into Notion, the toggles render natively as expandable/collapsible blocks — useful for long exports that would otherwise be overwhelming to scroll through.

:::note
The format choice only affects presentation. The underlying data is identical across all three formats. You can always re-export in a different format later.
:::

### Step 4: Preview & Download

The wizard generates a live preview of the Markdown output. Scroll through it to verify the content and formatting look right, then click **Download** to save the `.md` file to your machine.

![Export wizard showing scope selection](/images/export-wizard.png)

## Use Cases

A few practical ways to use Analytics and Export together:

- **Weekly retrospective** — Export a Daily Digest for each day of the week into Obsidian. Review the digests in sequence to see how the week unfolded: what you built, what you decided, what you learned. The `[[backlinks]]` in Obsidian format connect related sessions across days.

- **Personal knowledge base** — Run LLM analysis on all your sessions, then export all Learnings and Techniques to Obsidian. Over time, this builds a personal wiki of patterns, tools, and approaches you've encountered — searchable and cross-linked.

- **Team sharing** — Export a project's Decisions as Plain Markdown and paste them into a PR description, a team wiki page, or a Slack thread. The plain format renders cleanly anywhere without requiring a specific tool.

- **Cost tracking** — Check the Analytics cost chart weekly. If spending is higher than expected, use the Model Usage donut to see whether you're over-indexing on expensive models. Adjust your LLM provider settings accordingly.

:::tip
Export pairs well with the [Insights](/guides/web-dashboard/#main-navigation) page. Use Insights to review and curate what the LLM generated, then use Export to pull the curated results into your preferred tool.
:::
