// Core analysis engine — server-side. Handles LLM orchestration, chunking, and response merging.
// SQLite persistence (saveInsightsToDb, saveFacetsToDb, etc.) lives in analysis-db.ts.
// Ported from web repo (src/lib/llm/analysis.ts) with SQLite persistence replacing Firestore.
// Key differences from web repo:
//   - Uses SQLiteMessageRow instead of web Message type
//   - Writes insights directly to SQLite via analysis-db.ts (not Firestore)
//   - Abort handling uses error.name === 'AbortError' (not DOMException)
//   - Uses session's existing project_id from SQLite (not re-derived hash)
//
// analyzePromptQuality → prompt-quality-analysis.ts
// findRecurringInsights → recurring-insights.ts
// extractFacetsOnly → facet-extraction.ts
// Shared types/helpers → analysis-internal.ts

import { jsonrepair } from 'jsonrepair';
import { createLLMClient, isLLMConfigured } from './client.js';
import type { SQLiteMessageRow, AnalysisResponse } from './prompt-types.js';
import { formatMessagesForAnalysis } from './message-format.js';
import { extractJsonPayload, parseAnalysisResponse } from './response-parsers.js';
import {
  SESSION_ANALYSIS_SYSTEM_PROMPT,
  generateSessionAnalysisPrompt,
  FACET_ONLY_SYSTEM_PROMPT,
  generateFacetOnlyPrompt,
} from './prompts.js';
import {
  ANALYSIS_VERSION,
  convertToInsightRows,
  saveInsightsToDb,
  deleteSessionInsights,
  saveFacetsToDb,
  type InsightRow,
  type SessionData,
} from './analysis-db.js';
import {
  MAX_INPUT_TOKENS,
  buildSessionMeta,
  type AnalysisProgress,
  type AnalysisOptions,
  type AnalysisResult,
} from './analysis-internal.js';

// Re-export from sub-modules so existing imports of these from analysis.ts keep working.
export { analyzePromptQuality } from './prompt-quality-analysis.js';
export { findRecurringInsights } from './recurring-insights.js';
export type { RecurringInsightGroup, RecurringInsightResult } from './recurring-insights.js';
export { extractFacetsOnly } from './facet-extraction.js';

// Re-export shared types (routes and route-helpers import these from analysis.ts)
export type { AnalysisProgress, AnalysisOptions, AnalysisResult };
export type { InsightRow, SessionData };

/**
 * Analyze a session and generate insights, saving them to SQLite.
 */
export async function analyzeSession(
  session: SessionData,
  messages: SQLiteMessageRow[],
  options?: AnalysisOptions
): Promise<AnalysisResult> {
  if (!isLLMConfigured()) {
    return {
      success: false,
      insights: [],
      error: 'LLM not configured. Run `code-insights config llm` to configure a provider.',
    };
  }

  if (messages.length === 0) {
    return {
      success: false,
      insights: [],
      error: 'No messages found for this session.',
    };
  }

  try {
    const client = createLLMClient();
    const formattedMessages = formatMessagesForAnalysis(messages);
    const estimatedTokens = client.estimateTokens(formattedMessages);
    const sessionMeta = buildSessionMeta(session);

    let analysisResponse: AnalysisResponse;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    if (estimatedTokens > MAX_INPUT_TOKENS) {
      // Chunk the messages and analyze separately
      const chunks = chunkMessages(messages, client.estimateTokens.bind(client));
      const chunkResponses: AnalysisResponse[] = [];
      const totalChunks = chunks.length;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        options?.onProgress?.({ phase: 'analyzing', currentChunk: i + 1, totalChunks });

        const chunkFormatted = formatMessagesForAnalysis(chunk);
        const prompt = generateSessionAnalysisPrompt(
          session.project_name,
          session.summary,
          chunkFormatted,
          sessionMeta
        );

        const response = await client.chat([
          { role: 'system', content: SESSION_ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ], { signal: options?.signal });

        if (response.usage) {
          totalInputTokens += response.usage.inputTokens;
          totalOutputTokens += response.usage.outputTokens;
        }

        const parsed = parseAnalysisResponse(response.content);
        if (parsed.success) chunkResponses.push(parsed.data);
      }

      if (chunkResponses.length === 0) {
        return {
          success: false,
          insights: [],
          error: 'All chunks failed to parse LLM response',
          error_type: 'json_parse_error',
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        };
      }

      analysisResponse = mergeAnalysisResponses(chunkResponses);

      // Chunked sessions: extract facets separately using dedicated facet prompt
      // (facets are holistic — can't be merged across chunks)
      if (!analysisResponse.facets) {
        try {
          // Use full conversation for best quality; truncate here if exceeding token limits
          let facetMessages = formatMessagesForAnalysis(messages);
          const facetTokens = client.estimateTokens(facetMessages);
          if (facetTokens > MAX_INPUT_TOKENS) {
            const targetLength = Math.floor((MAX_INPUT_TOKENS / facetTokens) * facetMessages.length * 0.8);
            facetMessages = facetMessages.slice(0, targetLength) + '\n\n[... conversation truncated for analysis ...]';
          }
          const facetPrompt = generateFacetOnlyPrompt(
            session.project_name,
            session.summary,
            facetMessages,
            sessionMeta
          );

          const facetResponse = await client.chat([
            { role: 'system', content: FACET_ONLY_SYSTEM_PROMPT },
            { role: 'user', content: facetPrompt },
          ], { signal: options?.signal });

          if (facetResponse.usage) {
            totalInputTokens += facetResponse.usage.inputTokens;
            totalOutputTokens += facetResponse.usage.outputTokens;
          }

          const facetJson = extractJsonPayload(facetResponse.content);
          if (facetJson) {
            try {
              analysisResponse.facets = JSON.parse(facetJson);
            } catch {
              // jsonrepair fallback
              try {
                analysisResponse.facets = JSON.parse(jsonrepair(facetJson));
              } catch {
                // Facet extraction failed for chunked session — non-fatal
              }
            }
          }
        } catch {
          // Facet extraction failed for chunked session — non-fatal, continue
        }
      }
    } else {
      options?.onProgress?.({ phase: 'analyzing', currentChunk: 1, totalChunks: 1 });
      const prompt = generateSessionAnalysisPrompt(
        session.project_name,
        session.summary,
        formattedMessages,
        sessionMeta
      );

      const response = await client.chat([
        { role: 'system', content: SESSION_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ], { signal: options?.signal });

      if (response.usage) {
        totalInputTokens = response.usage.inputTokens;
        totalOutputTokens = response.usage.outputTokens;
      }

      const parsed = parseAnalysisResponse(response.content);
      if (!parsed.success) {
        return {
          success: false,
          insights: [],
          error: 'Failed to parse LLM response. Please try again.',
          error_type: parsed.error.error_type,
          response_length: parsed.error.response_length,
          response_preview: parsed.error.response_preview,
        };
      }

      analysisResponse = parsed.data;
    }

    options?.onProgress?.({ phase: 'saving' });
    const insights = convertToInsightRows(analysisResponse, session);

    // Save new insights first, then delete old non-prompt-quality insights
    // (safe order: if save fails, old data is preserved)
    saveInsightsToDb(insights);
    deleteSessionInsights(session.id, {
      excludeTypes: ['prompt_quality'],
      excludeIds: insights.map(i => i.id),
    });

    // Save facets if extracted
    if (analysisResponse.facets) {
      saveFacetsToDb(session.id, analysisResponse.facets, ANALYSIS_VERSION);
    }

    return {
      success: true,
      insights,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, insights: [], error: 'Analysis cancelled', error_type: 'abort' };
    }
    return {
      success: false,
      insights: [],
      error: error instanceof Error ? error.message : 'Analysis failed',
      error_type: 'api_error',
    };
  }
}

// --- Internal helpers ---

function chunkMessages(
  messages: SQLiteMessageRow[],
  estimateTokens: (text: string) => number
): SQLiteMessageRow[][] {
  const chunks: SQLiteMessageRow[][] = [];
  let currentChunk: SQLiteMessageRow[] = [];
  let currentTokens = 0;
  const chunkLimit = MAX_INPUT_TOKENS * 0.8;

  for (const message of messages) {
    let toolResults: Array<{ output?: string }> = [];
    try {
      toolResults = message.tool_results ? JSON.parse(message.tool_results) as Array<{ output?: string }> : [];
    } catch {
      toolResults = [];
    }

    const messageText = [
      message.content,
      message.thinking?.slice(0, 1000) ?? '',
      ...toolResults.map(r => (r.output || '').slice(0, 500)),
    ].join(' ');
    const messageTokens = estimateTokens(messageText);

    if (currentTokens + messageTokens > chunkLimit && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(message);
    currentTokens += messageTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function mergeAnalysisResponses(responses: AnalysisResponse[]): AnalysisResponse {
  if (responses.length === 0) {
    return {
      summary: { title: 'Analysis failed', content: '', bullets: [] },
      decisions: [],
      learnings: [],
    };
  }

  if (responses.length === 1) return responses[0];

  const merged: AnalysisResponse = {
    summary: responses[0].summary,
    decisions: [],
    learnings: [],
  };

  for (const response of responses) {
    merged.decisions.push(...response.decisions);
    merged.learnings.push(...response.learnings);
  }

  merged.decisions = deduplicateByTitle(merged.decisions).slice(0, 3);
  merged.learnings = deduplicateByTitle(merged.learnings).slice(0, 5);

  return merged;
}

function deduplicateByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.title.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
