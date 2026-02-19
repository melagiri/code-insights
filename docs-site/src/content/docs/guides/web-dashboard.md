---
title: Web Dashboard
description: Browse sessions, generate insights, and export data from the dashboard.
---

The web dashboard at [code-insights.app](https://code-insights.app) connects to your Firebase and provides a visual interface for browsing and analyzing your Claude Code sessions.

## Connecting

After syncing your sessions, run:

```bash
code-insights connect
```

This generates a URL with your Firebase web config encoded as a query parameter. Open it in your browser and sign in with Google or GitHub.

The dashboard saves your Firebase config in localStorage, so you only need to use the connect URL once.

## Features

### Session Browser

Search, filter, and view full session transcripts. Sessions show their auto-generated title, project name, duration, message count, and session character type.

### LLM Analysis

Generate insights from any session using your own API key. The dashboard supports:

| Provider | Example Models |
|----------|---------------|
| OpenAI | gpt-4o, gpt-4o-mini |
| Anthropic | claude-sonnet-4, claude-opus-4 |
| Gemini | gemini-2.0-flash, gemini-1.5-pro |
| Ollama | Any locally-running model |

Configure your API key in the dashboard settings. Analysis runs client-side — your session data goes directly to the LLM provider, not through any intermediary.

### Insight Types

| Type | What it captures |
|------|-----------------|
| **Summary** | High-level narrative of what was accomplished |
| **Decision** | Architecture choices, trade-offs, reasoning, and alternatives considered |
| **Learning** | Technical discoveries and transferable knowledge |
| **Technique** | Problem-solving approaches and debugging strategies |

### Analytics

Usage patterns, activity charts, and trends across your sessions and projects.

### Export

Download sessions and insights as Markdown in three formats:

- **Plain** — Standard Markdown
- **Obsidian** — With callout blocks and `[[wiki-style]]` backlinks
- **Notion** — With HTML toggle blocks

## Ollama CORS

If you're using Ollama and seeing CORS errors, the macOS Ollama app doesn't read shell environment variables. The most reliable fix:

```bash
# Quit the Ollama menu bar app first, then:
OLLAMA_ORIGINS="https://code-insights.app" ollama serve
```

Keep the terminal open while using the dashboard. See the [project README](https://github.com/melagiri/code-insights#ollama-cors-errors-on-the-dashboard) for alternative approaches.
