// Core analysis engine for session insights

import { createLLMClient, isLLMConfigured } from './client';
import {
  SESSION_ANALYSIS_SYSTEM_PROMPT,
  generateSessionAnalysisPrompt,
  formatMessagesForAnalysis,
  parseAnalysisResponse,
  type AnalysisResponse,
} from './prompts';
import type { Session, Message, Insight, InsightType } from '../types';
import { saveInsights, deleteSessionInsights } from '../firestore/insights';

// Maximum tokens to send to LLM (leaving room for response)
const MAX_INPUT_TOKENS = 80000;
// Analysis version for tracking re-analysis
const ANALYSIS_VERSION = '1.0.0';

export interface AnalysisResult {
  success: boolean;
  insights: Insight[];
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Analyze a session and generate insights
 */
export async function analyzeSession(
  session: Session,
  messages: Message[]
): Promise<AnalysisResult> {
  // Check if LLM is configured
  if (!isLLMConfigured()) {
    return {
      success: false,
      insights: [],
      error: 'LLM not configured. Go to Settings to configure an AI provider.',
    };
  }

  if (messages.length === 0) {
    return {
      success: false,
      insights: [],
      error: 'No messages found for this session. Run `claudeinsight sync` to upload messages.',
    };
  }

  try {
    const client = createLLMClient();

    // Format messages for analysis
    const formattedMessages = formatMessagesForAnalysis(messages);

    // Check token count and chunk if needed
    const estimatedTokens = client.estimateTokens(formattedMessages);

    let analysisResponse: AnalysisResponse;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    if (estimatedTokens > MAX_INPUT_TOKENS) {
      // Chunk the messages and analyze separately
      const chunks = chunkMessages(messages, client.estimateTokens.bind(client));
      const chunkResponses: AnalysisResponse[] = [];

      for (const chunk of chunks) {
        const chunkFormatted = formatMessagesForAnalysis(chunk);
        const prompt = generateSessionAnalysisPrompt(
          session.projectName,
          session.summary,
          chunkFormatted
        );

        const response = await client.chat([
          { role: 'system', content: SESSION_ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ]);

        if (response.usage) {
          totalInputTokens += response.usage.inputTokens;
          totalOutputTokens += response.usage.outputTokens;
        }

        const parsed = parseAnalysisResponse(response.content);
        if (parsed) {
          chunkResponses.push(parsed);
        }
      }

      // Merge chunk responses
      analysisResponse = mergeAnalysisResponses(chunkResponses);
    } else {
      // Single analysis call
      const prompt = generateSessionAnalysisPrompt(
        session.projectName,
        session.summary,
        formattedMessages
      );

      const response = await client.chat([
        { role: 'system', content: SESSION_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ]);

      if (response.usage) {
        totalInputTokens = response.usage.inputTokens;
        totalOutputTokens = response.usage.outputTokens;
      }

      const parsed = parseAnalysisResponse(response.content);
      if (!parsed) {
        return {
          success: false,
          insights: [],
          error: 'Failed to parse LLM response. Please try again.',
        };
      }

      analysisResponse = parsed;
    }

    // Convert analysis response to Insight objects
    const insights = convertToInsights(analysisResponse, session);

    // Delete existing insights for this session
    await deleteSessionInsights(session.id);

    // Save new insights
    await saveInsights(insights);

    return {
      success: true,
      insights,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
    };
  } catch (error) {
    return {
      success: false,
      insights: [],
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
}

/**
 * Chunk messages to fit within token limits
 */
function chunkMessages(
  messages: Message[],
  estimateTokens: (text: string) => number
): Message[][] {
  const chunks: Message[][] = [];
  let currentChunk: Message[] = [];
  let currentTokens = 0;
  const chunkLimit = MAX_INPUT_TOKENS * 0.8; // Leave some buffer

  for (const message of messages) {
    const messageTokens = estimateTokens(message.content);

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

/**
 * Merge multiple analysis responses into one
 */
function mergeAnalysisResponses(responses: AnalysisResponse[]): AnalysisResponse {
  if (responses.length === 0) {
    return {
      summary: { title: 'Analysis failed', content: '', bullets: [] },
      decisions: [],
      learnings: [],
      techniques: [],
    };
  }

  if (responses.length === 1) {
    return responses[0];
  }

  // Use the first summary (or merge if needed)
  const merged: AnalysisResponse = {
    summary: responses[0].summary,
    decisions: [],
    learnings: [],
    techniques: [],
  };

  // Merge all decisions, learnings, and techniques
  for (const response of responses) {
    merged.decisions.push(...response.decisions);
    merged.learnings.push(...response.learnings);
    merged.techniques.push(...response.techniques);
  }

  // Deduplicate by title
  merged.decisions = deduplicateByTitle(merged.decisions);
  merged.learnings = deduplicateByTitle(merged.learnings);
  merged.techniques = deduplicateByTitle(merged.techniques);

  return merged;
}

/**
 * Deduplicate items by title
 */
function deduplicateByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.title.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Convert analysis response to Insight objects
 */
function convertToInsights(response: AnalysisResponse, session: Session): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();

  // Generate project ID (same logic as CLI)
  const projectId = generateProjectId(session.projectPath);

  // Summary insight
  insights.push({
    id: generateInsightId(),
    sessionId: session.id,
    projectId,
    projectName: session.projectName,
    type: 'summary' as InsightType,
    title: response.summary.title,
    content: response.summary.content,
    summary: response.summary.content,
    bullets: response.summary.bullets,
    confidence: 0.9,
    source: 'llm',
    metadata: {},
    timestamp: session.endedAt,
    createdAt: now,
    scope: 'session',
    analysisVersion: ANALYSIS_VERSION,
  });

  // Decision insights
  for (const decision of response.decisions) {
    insights.push({
      id: generateInsightId(),
      sessionId: session.id,
      projectId,
      projectName: session.projectName,
      type: 'decision' as InsightType,
      title: decision.title,
      content: decision.content,
      summary: decision.content.slice(0, 200),
      bullets: decision.alternatives || [],
      confidence: 0.85,
      source: 'llm',
      metadata: {
        reasoning: decision.reasoning,
        alternatives: decision.alternatives,
      },
      timestamp: session.endedAt,
      createdAt: now,
      scope: 'session',
      analysisVersion: ANALYSIS_VERSION,
    });
  }

  // Learning insights
  for (const learning of response.learnings) {
    insights.push({
      id: generateInsightId(),
      sessionId: session.id,
      projectId,
      projectName: session.projectName,
      type: 'learning' as InsightType,
      title: learning.title,
      content: learning.content,
      summary: learning.content.slice(0, 200),
      bullets: [],
      confidence: 0.8,
      source: 'llm',
      metadata: {
        context: learning.context,
      },
      timestamp: session.endedAt,
      createdAt: now,
      scope: 'session',
      analysisVersion: ANALYSIS_VERSION,
    });
  }

  // Technique insights
  for (const technique of response.techniques) {
    insights.push({
      id: generateInsightId(),
      sessionId: session.id,
      projectId,
      projectName: session.projectName,
      type: 'technique' as InsightType,
      title: technique.title,
      content: technique.content,
      summary: technique.content.slice(0, 200),
      bullets: [],
      confidence: 0.8,
      source: 'llm',
      metadata: {
        applicability: technique.applicability,
      },
      timestamp: session.endedAt,
      createdAt: now,
      scope: 'session',
      analysisVersion: ANALYSIS_VERSION,
    });
  }

  return insights;
}

/**
 * Generate a stable project ID from path
 */
function generateProjectId(projectPath: string): string {
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    const char = projectPath.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `proj_${Math.abs(hash).toString(16)}`;
}

/**
 * Generate a unique insight ID
 */
function generateInsightId(): string {
  return `insight_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
