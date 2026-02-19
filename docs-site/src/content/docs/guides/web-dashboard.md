---
title: Web Dashboard
description: Connect your Firebase, explore your dashboard stats, activity charts, and navigate the Code Insights app.
---

The web dashboard at [code-insights.app](https://code-insights.app) connects to your Firebase project and gives you a visual home for everything the CLI collects. Once connected, your sessions, messages, and tool call data stream in through real-time Firestore listeners — no polling, no refresh button. The dashboard is where raw JSONL files become browsable transcripts, actionable insights, and patterns you can actually learn from.

Because Code Insights follows the Bring Your Own Firebase model, the dashboard never stores your data on a central server. It reads directly from your Firestore instance, and any LLM analysis runs client-side with your own API keys. You own everything.

## Connecting to the Dashboard

There are two ways to link the dashboard to your Firebase project.

### Recommended: The Connect Command

After you've synced at least one session, run:

```bash
code-insights connect
```

This generates a URL with your Firebase web app config encoded as a base64 query parameter. Open the URL in your browser, and you'll be prompted to sign in with Google or GitHub via Supabase Auth. On first load, the dashboard reads the config from the URL, validates it, saves it to `localStorage`, and clears the query string — so the URL is clean for bookmarking.

You only need to use the connect URL once. After that, returning to [code-insights.app](https://code-insights.app) picks up your saved config automatically.

:::tip
If you switch to a different Firebase project later, just run `code-insights connect` again. The new config will overwrite the previous one in localStorage.
:::

### Manual: Firebase Config Dialog

If you prefer to configure things by hand, open the dashboard and go to **Settings** (gear icon, top-right). In the Firebase Config dialog, paste the web app config JSON from your Firebase Console. You'll find it under **Project Settings > General > Your apps > Firebase SDK snippet > Config**.

The JSON looks like this:

```json
{
  "apiKey": "AIza...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc123"
}
```

## Dashboard at a Glance

When you first open the dashboard, you'll see a greeting that tells you how many sessions you have across all your projects — a quick sanity check that the connection is working.

Below the greeting, two rows of stat cards summarize your entire coding history:

**Top row:**
- **Sessions** — Total session count across all projects
- **Messages** — Combined message count, formatted compactly (e.g., ~46k)
- **Tool Calls** — How many tool invocations Claude made
- **Coding Time** — Accumulated session duration in hours and minutes
- **Projects** — Number of distinct projects you've worked on

**Bottom row:**
- **Total Tokens** — Aggregate token usage with a breakdown of cache reads vs. input/output
- **Estimated Spend** — Approximate cost based on token counts and model pricing
- **Top Model** — The model you've used most frequently

These stats update in real-time. As the CLI syncs new sessions to Firestore, the dashboard picks them up through `onSnapshot` listeners — no page reload needed.

![Dashboard overview showing stats cards and activity chart](/images/dashboard-overview.png)

## Activity Chart

Below the stats, a dual-line area chart shows your coding cadence over time.

- The **blue line** tracks sessions per day — how often you sat down to work with Claude
- The **green line** tracks tool calls per day — a proxy for session intensity and complexity

Three range toggles let you zoom in or out: **30d** (default), **90d**, and **All**. The 30-day view is useful for spotting recent patterns — a burst of activity around a deadline, a quiet week during a refactor, or a steady daily rhythm. The All view reveals longer arcs: how your usage has evolved since you started.

:::note
The chart aggregates by calendar day in your local timezone. Days with no sessions show as zero, keeping the timeline continuous.
:::

## Recent Activity

At the bottom of the dashboard, a feed shows your latest activity. Rather than listing raw sessions, this section highlights **insights** — the analysis artifacts generated when you run LLM analysis on a session.

Each insight appears with a type badge (Summary, Decision, Learning, Technique, or Prompt Quality), the project it belongs to, and a brief preview. This gives you a running log of what you've been learning and deciding across projects.

If you have unanalyzed sessions, a prompt appears with an **"Analyze N Sessions"** button that kicks off bulk analysis. Below that, **Today** and **This Week** summary cards give you a snapshot of your recent output.

:::tip
The Recent Activity feed is a good starting point after a day of coding. Analyze your new sessions, then scan the feed to see what the LLM surfaced.
:::

## Navigating the App

The sidebar (on desktop) and bottom tab bar (on mobile) give you access to every section of the dashboard.

### Main Navigation

- **Dashboard** — The home view described above: stats, activity chart, and recent activity feed
- **Sessions** — Browse, search, and filter all your sessions. Each session card shows its auto-generated title, project name, duration, message count, and session character badge. Click into a session to read the full transcript with syntax-highlighted code blocks and tool call details
- **Insights** — A dedicated view for browsing all generated insights across projects. Filter by type (Summary, Decision, Learning, Technique, Prompt Quality) or by project
- **Analytics** — Usage patterns and trends: sessions over time, message distributions, tool usage breakdowns, and project comparisons
- **Journal** — A reflective view that organizes your learnings and decisions chronologically
- **Export** — Download sessions and insights as Markdown in three formats: Plain (standard), Obsidian (with callout blocks and `[[wiki-style]]` backlinks), or Notion (with HTML toggle blocks)

### Top-Right Actions

- **Dark mode toggle** — Switch between light and dark themes (dark is the default)
- **Docs** — Link to this documentation site
- **Settings** — Firebase config, LLM provider and API key configuration
- **Account** — Your signed-in identity and sign-out option

### Mobile Layout

On smaller screens, the sidebar collapses into a bottom tab bar. The primary destinations (Dashboard, Sessions, Insights) are always visible. A **More** tab opens an overflow menu for Analytics, Journal, Export, and Settings.

## Ollama CORS

If you're using Ollama and seeing CORS errors, the macOS Ollama app doesn't read shell environment variables. The most reliable fix:

```bash
# Quit the Ollama menu bar app first, then:
OLLAMA_ORIGINS="https://code-insights.app" ollama serve
```

Keep the terminal open while using the dashboard. See the [project README](https://github.com/melagiri/code-insights#ollama-cors-errors-on-the-dashboard) for alternative approaches.

:::caution
If you launch Ollama from the menu bar app after setting the environment variable in your shell profile, the app will ignore it. You must run `ollama serve` directly from the terminal with the variable set inline, or use a `launchd` plist to set it system-wide.
:::
