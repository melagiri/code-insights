// Prompt quality analysis — isolated from the main session analysis pipeline.
// Extracted from analysis.ts to keep each analysis type in its own focused module.

import { createLLMClient, isLLMConfigured } from './client.js';
import type { SQLiteMessageRow } from './prompt-types.js';
import { formatMessagesForAnalysis, classifyStoredUserMessage } from './message-format.js';
import { parsePromptQualityResponse } from './response-parsers.js';
import { SHARED_ANALYST_SYSTEM_PROMPT, buildCacheableConversationBlock, buildPromptQualityInstructions } from './prompts.js';
import {
  convertPromptQualityToInsightRow,
  saveInsightsToDb,
  deleteSessionInsights,
  type SessionData,
} from './analysis-db.js';
import { MAX_INPUT_TOKENS, buildSessionMeta, type AnalysisOptions, type AnalysisResult } from './analysis-internal.js';

/**
 * Analyze prompt quality for a session.
 */
export async function analyzePromptQuality(
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

  // Change 2: Filter to genuine human messages only (not tool-results or system artifacts).
  // Pre-change: a session with 1 human + 50 tool-result rows passed the gate incorrectly.
  // This prevented wasted LLM calls on sessions where there is nothing to evaluate.
  const humanMessages = messages.filter(m =>
    m.type === 'user' && classifyStoredUserMessage(m.content) === 'human'
  );
  if (humanMessages.length < 2) {
    return {
      success: false,
      insights: [],
      error: 'Not enough user messages to analyze prompt quality (need at least 2).',
    };
  }

  try {
    const client = createLLMClient();
    const formattedMessages = formatMessagesForAnalysis(messages);

    let analysisInput = formattedMessages;
    const estimatedTokens = client.estimateTokens(formattedMessages);
    if (estimatedTokens > MAX_INPUT_TOKENS) {
      const targetLength = Math.floor((MAX_INPUT_TOKENS / estimatedTokens) * formattedMessages.length * 0.8);
      analysisInput = formattedMessages.slice(0, targetLength) + '\n\n[... conversation truncated for analysis ...]';
    }

    // Change 3: Pass structured session shape instead of raw message count.
    // "Total messages: 51" misled the LLM when 43 of those were tool-result rows.
    const assistantMessages = messages.filter(m => m.type === 'assistant');
    const toolExchangeCount = messages.length - humanMessages.length - assistantMessages.length;

    const sessionMeta = buildSessionMeta(session);
    const sessionShape = {
      humanMessageCount: humanMessages.length,
      assistantMessageCount: assistantMessages.length,
      toolExchangeCount,
    };

    options?.onProgress?.({ phase: 'analyzing' });
    const response = await client.chat([
      { role: 'system', content: SHARED_ANALYST_SYSTEM_PROMPT },
      { role: 'user', content: [
        buildCacheableConversationBlock(analysisInput),
        { type: 'text' as const, text: buildPromptQualityInstructions(session.project_name, sessionShape, sessionMeta) },
      ] },
    ], { signal: options?.signal });

    const parsed = parsePromptQualityResponse(response.content);
    if (!parsed.success) {
      return {
        success: false,
        insights: [],
        error: 'Failed to parse prompt quality analysis. Please try again.',
        error_type: parsed.error.error_type,
        response_length: parsed.error.response_length,
        response_preview: parsed.error.response_preview,
      };
    }

    options?.onProgress?.({ phase: 'saving' });
    const insight = convertPromptQualityToInsightRow(parsed.data, session);

    // Save new insight, then delete old prompt_quality insights
    saveInsightsToDb([insight]);
    deleteSessionInsights(session.id, {
      includeOnlyTypes: ['prompt_quality'],
      excludeIds: [insight.id],
    });

    return {
      success: true,
      insights: [insight],
      usage: response.usage ? {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        ...(response.usage.cacheCreationTokens !== undefined && { cacheCreationTokens: response.usage.cacheCreationTokens }),
        ...(response.usage.cacheReadTokens !== undefined && { cacheReadTokens: response.usage.cacheReadTokens }),
      } : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, insights: [], error: 'Analysis cancelled', error_type: 'abort' };
    }
    return {
      success: false,
      insights: [],
      error: error instanceof Error ? error.message : 'Prompt quality analysis failed',
      error_type: 'api_error',
    };
  }
}
