// Recurring insight detection — finds semantically similar insights across sessions
// and writes bidirectional links to SQLite.
// Extracted from analysis.ts to keep each analysis responsibility in its own module.

import { getDb } from '@code-insights/cli/db/client';
import { createLLMClient, isLLMConfigured } from './client.js';

export interface RecurringInsightGroup {
  insightIds: string[];
  theme: string;
}

export interface RecurringInsightResult {
  success: boolean;
  groups: RecurringInsightGroup[];
  updatedCount: number;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Find recurring patterns across multiple insights and write bidirectional links to SQLite.
 */
export async function findRecurringInsights(
  insights: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    project_name: string;
    session_id: string;
  }>
): Promise<RecurringInsightResult> {
  if (!isLLMConfigured()) {
    return { success: false, groups: [], updatedCount: 0, error: 'LLM not configured.' };
  }

  const candidates = insights
    .filter(i => i.type !== 'summary' && i.type !== 'prompt_quality')
    .slice(0, 200);

  if (candidates.length < 2) {
    return {
      success: false,
      groups: [],
      updatedCount: 0,
      error: 'Need at least 2 non-summary insights to find patterns.',
    };
  }

  try {
    const client = createLLMClient();

    const insightData = candidates.map(i => ({
      id: i.id,
      type: i.type === 'technique' ? 'learning' : i.type,
      title: i.title,
      summary: i.summary.slice(0, 150),
      projectName: i.project_name,
      sessionId: i.session_id,
    }));

    const prompt = `Analyze these insights from coding sessions and find groups of semantically similar or duplicate insights — ones that express the same learning or decision even if worded differently.

RULES:
- Only group insights that are genuinely about the same concept/topic
- Insights in a group should be from DIFFERENT sessions (same sessionId = not recurring)
- A group must have at least 2 insights
- An insight can only belong to one group
- Provide a brief "theme" describing what the group shares
- If no recurring patterns exist, return an empty groups array

INSIGHTS:
${JSON.stringify(insightData, null, 2)}

Respond with valid JSON only:
{
  "groups": [
    {
      "insightIds": ["insight_abc", "insight_def"],
      "theme": "Brief description of the shared concept"
    }
  ]
}`;

    const response = await client.chat([
      {
        role: 'system',
        content: 'You are an expert at identifying recurring patterns and themes across software development insights. You find semantically similar insights even when they are worded differently. Respond with valid JSON only.',
      },
      { role: 'user', content: prompt },
    ]);

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, groups: [], updatedCount: 0, error: 'Failed to parse recurring insights response.' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { groups: RecurringInsightGroup[] };
    const groups = parsed.groups || [];

    const validIds = new Set(candidates.map(i => i.id));
    const validGroups = groups
      .map(g => ({
        ...g,
        insightIds: g.insightIds.filter(id => validIds.has(id)),
      }))
      .filter(g => g.insightIds.length >= 2);

    if (validGroups.length === 0) {
      return {
        success: true,
        groups: [],
        updatedCount: 0,
        usage: response.usage
          ? { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }
          : undefined,
      };
    }

    // Build bidirectional links
    const linkMap = new Map<string, string[]>();
    for (const group of validGroups) {
      for (const id of group.insightIds) {
        const others = group.insightIds.filter(otherId => otherId !== id);
        const existing = linkMap.get(id) || [];
        linkMap.set(id, [...new Set([...existing, ...others])]);
      }
    }

    // Write links to SQLite
    const db = getDb();
    const updateLinks = db.prepare(
      `UPDATE insights SET linked_insight_ids = ? WHERE id = ?`
    );

    for (const [insightId, linkedIds] of linkMap.entries()) {
      updateLinks.run(JSON.stringify(linkedIds), insightId);
    }

    return {
      success: true,
      groups: validGroups,
      updatedCount: linkMap.size,
      usage: response.usage
        ? { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      groups: [],
      updatedCount: 0,
      error: error instanceof Error ? error.message : 'Failed to find recurring insights',
    };
  }
}
