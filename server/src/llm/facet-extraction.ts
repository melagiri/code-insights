// Facet-only extraction — backfill path for sessions that already have insights.
// Extracted from analysis.ts to keep each analysis responsibility in its own module.

import { jsonrepair } from 'jsonrepair';
import { createLLMClient, isLLMConfigured } from './client.js';
import type { SQLiteMessageRow, AnalysisResponse } from './prompt-types.js';
import { formatMessagesForAnalysis } from './message-format.js';
import { extractJsonPayload } from './response-parsers.js';
import { FACET_ONLY_SYSTEM_PROMPT, generateFacetOnlyPrompt } from './prompts.js';
import {
  ANALYSIS_VERSION,
  saveFacetsToDb,
  type SessionData,
} from './analysis-db.js';
import { buildSessionMeta } from './analysis-internal.js';

// Maximum tokens to send to LLM (leaving room for response)
const MAX_INPUT_TOKENS = 80000;

/**
 * Extract facets only for a session that already has insights (backfill).
 * Uses the full conversation transcript for accurate friction attribution.
 * Falls back to truncation for sessions exceeding token limits.
 */
export async function extractFacetsOnly(
  session: SessionData,
  messages: SQLiteMessageRow[],
  options?: { signal?: AbortSignal }
): Promise<{ success: boolean; error?: string }> {
  if (!isLLMConfigured()) {
    return { success: false, error: 'LLM not configured.' };
  }

  if (messages.length === 0) {
    return { success: false, error: 'No messages found.' };
  }

  try {
    const client = createLLMClient();
    let formattedMessages = formatMessagesForAnalysis(messages);

    // Truncate if conversation exceeds token limits (same pattern as PQ analysis)
    const estimatedTokens = client.estimateTokens(formattedMessages);
    if (estimatedTokens > MAX_INPUT_TOKENS) {
      const targetLength = Math.floor((MAX_INPUT_TOKENS / estimatedTokens) * formattedMessages.length * 0.8);
      formattedMessages = formattedMessages.slice(0, targetLength) + '\n\n[... conversation truncated for analysis ...]';
    }

    const sessionMeta = buildSessionMeta(session);
    const prompt = generateFacetOnlyPrompt(
      session.project_name,
      session.summary,
      formattedMessages,
      sessionMeta
    );

    const response = await client.chat([
      { role: 'system', content: FACET_ONLY_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ], { signal: options?.signal });

    const jsonPayload = extractJsonPayload(response.content);
    if (!jsonPayload) {
      return { success: false, error: 'No JSON in facet response.' };
    }

    let facets: AnalysisResponse['facets'];
    try {
      facets = JSON.parse(jsonPayload);
    } catch {
      facets = JSON.parse(jsonrepair(jsonPayload));
    }

    if (facets) {
      saveFacetsToDb(session.id, facets, ANALYSIS_VERSION);
    }

    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Cancelled' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Facet extraction failed',
    };
  }
}
