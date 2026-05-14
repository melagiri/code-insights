import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { createLLMClient } from '../llm/client.js';
import { requireLLM } from './route-helpers.js';
import {
  buildDispatchSystemPrompt,
  buildDispatchContext,
  parseDispatchOutput,
  buildDegradedResponse,
} from '../llm/dispatch-prompts.js';
import type { DispatchTone, DispatchInsight, DispatchFormat } from '@code-insights/cli/types';

const app = new Hono();

const VALID_TONES: DispatchTone[] = ['technical', 'accessible', 'quick-tips'];
const VALID_FORMATS: DispatchFormat[] = ['blog', 'linkedin'];

interface InsightRow {
  id: string;
  type: string;
  summary: string;
  content: string;
  bullets: string | null; // JSON-encoded string[], or null for legacy rows
}

// POST /api/dispatch/generate
// Body: { insightIds: string[], context: string, tone: DispatchTone, format: DispatchFormat }
// Returns: { markdown, body, format, frontmatter, wordCount, characterCount, degraded, model, tokensUsed }
app.post('/generate', requireLLM(), async (c) => {
  const body = await c.req.json<{
    insightIds?: unknown;
    context?: unknown;
    tone?: unknown;
    format?: unknown;
  }>();

  // Validate insightIds
  if (!Array.isArray(body.insightIds)) {
    return c.json({ error: 'insightIds must be an array' }, 400);
  }
  const insightIds = body.insightIds as unknown[];
  if (insightIds.some((id) => typeof id !== 'string')) {
    return c.json({ error: 'insightIds must contain only strings' }, 400);
  }
  if (insightIds.length < 3) {
    return c.json({ error: 'Select at least 3 insights to generate a post' }, 400);
  }
  if (insightIds.length > 8) {
    return c.json({ error: 'For the best post, keep it to 8 or fewer insights' }, 400);
  }

  // Validate context
  if (typeof body.context !== 'string' || body.context.trim().length === 0) {
    return c.json({ error: 'context is required' }, 400);
  }
  if (body.context.length > 500) {
    return c.json({ error: 'context must be 500 characters or fewer' }, 400);
  }

  // Validate tone
  if (!VALID_TONES.includes(body.tone as DispatchTone)) {
    return c.json({ error: `tone must be one of: ${VALID_TONES.join(', ')}` }, 400);
  }

  // Validate format
  if (!VALID_FORMATS.includes(body.format as DispatchFormat)) {
    return c.json({ error: `format must be one of: ${VALID_FORMATS.join(', ')}` }, 400);
  }

  const tone = body.tone as DispatchTone;
  const format = body.format as DispatchFormat;
  const contextText = body.context.trim();
  const typedIds = insightIds as string[];

  // Fetch insights from DB — respects provided order
  const db = getDb();
  const placeholders = typedIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT id, type, summary, content, bullets FROM insights WHERE id IN (${placeholders})`
  ).all(...typedIds) as InsightRow[];

  if (rows.length === 0) {
    return c.json({ error: 'No insights found for the provided IDs' }, 404);
  }

  // Preserve the caller's ordering
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const orderedInsights: DispatchInsight[] = typedIds
    .map((id) => rowMap.get(id))
    .filter((r): r is InsightRow => r !== undefined)
    .map((r) => {
      let bullets: string[] = [];
      if (r.bullets) {
        try {
          const parsed = JSON.parse(r.bullets);
          if (Array.isArray(parsed)) bullets = parsed as string[];
        } catch { /* empty */ }
      }
      return { id: r.id, type: r.type, summary: r.summary, content: r.content, bullets };
    });

  if (orderedInsights.length < 3) {
    return c.json({ error: 'Select at least 3 insights to generate a post' }, 400);
  }

  const systemPrompt = buildDispatchSystemPrompt(tone, format);
  const userMessage = buildDispatchContext({ userContext: contextText, insights: orderedInsights });

  const client = createLLMClient();
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userMessage },
  ];

  const chatOptions = { temperature: 0.7, responseFormat: 'text' as const };
  let response = await client.chat(messages, chatOptions);

  let parsed = parseDispatchOutput(response.content, format);

  // Single retry on parse failure
  if (!parsed.ok) {
    response = await client.chat(messages, chatOptions);
    parsed = parseDispatchOutput(response.content, format);

    if (!parsed.ok) {
      // Degrade gracefully — return the raw content with extracted title
      parsed = buildDegradedResponse(response.content);
    }
  }

  const markdown = parsed.markdown ?? response.content;
  const bodyText = parsed.body ?? markdown;
  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const characterCount = bodyText.length;

  return c.json({
    markdown,
    body: bodyText,
    format,
    frontmatter: parsed.frontmatter ?? { title: 'Untitled', tags: [], tldr: '' },
    wordCount,
    characterCount,
    degraded: parsed.degraded ?? false,
    model: client.model,
    tokensUsed: {
      input: response.usage?.inputTokens ?? 0,
      output: response.usage?.outputTokens ?? 0,
    },
  });
});

export default app;
