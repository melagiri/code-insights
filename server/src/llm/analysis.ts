// Core analysis engine — server-side.
// Ported from web repo (src/lib/llm/analysis.ts) with SQLite persistence replacing Firestore.
// Key differences from web repo:
//   - Uses SQLiteMessageRow instead of web Message type
//   - Writes insights directly to SQLite via getDb() (not Firestore)
//   - Abort handling uses error.name === 'AbortError' (not DOMException)
//   - Uses session's existing project_id from SQLite (not re-derived hash)

import { randomUUID } from 'crypto';
import { getDb } from '@code-insights/cli/db/client';
import { createLLMClient, isLLMConfigured } from './client.js';
import {
  SESSION_ANALYSIS_SYSTEM_PROMPT,
  generateSessionAnalysisPrompt,
  formatMessagesForAnalysis,
  parseAnalysisResponse,
  PROMPT_QUALITY_SYSTEM_PROMPT,
  generatePromptQualityPrompt,
  parsePromptQualityResponse,
  type SQLiteMessageRow,
  type AnalysisResponse,
  type PromptQualityResponse,
} from './prompts.js';

// Re-export SQLiteMessageRow so routes can import it from analysis.ts directly
export type { SQLiteMessageRow };

// Maximum tokens to send to LLM (leaving room for response)
const MAX_INPUT_TOKENS = 80000;
const ANALYSIS_VERSION = '2.0.0';

export interface AnalysisProgress {
  phase: 'loading_messages' | 'analyzing' | 'saving';
  currentChunk?: number;
  totalChunks?: number;
}

export interface AnalysisOptions {
  onProgress?: (progress: AnalysisProgress) => void;
  signal?: AbortSignal;
}

export interface AnalysisResult {
  success: boolean;
  insights: InsightRow[];
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Shape of a saved insight row (matches the SQLite schema)
export interface InsightRow {
  id: string;
  session_id: string;
  project_id: string;
  project_name: string;
  type: string;
  title: string;
  content: string;
  summary: string;
  bullets: string;           // JSON-encoded string[]
  confidence: number;
  source: 'llm';
  metadata: string | null;   // JSON-encoded object
  timestamp: string;         // ISO 8601
  created_at: string;        // ISO 8601
  scope: string;
  analysis_version: string;
}

// Minimal session data needed for analysis (from SQLite sessions row)
export interface SessionData {
  id: string;
  project_id: string;
  project_name: string;
  project_path: string;
  summary: string | null;
  ended_at: string;          // ISO 8601
}

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
          chunkFormatted
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
        if (parsed) chunkResponses.push(parsed);
      }

      analysisResponse = mergeAnalysisResponses(chunkResponses);
    } else {
      options?.onProgress?.({ phase: 'analyzing', currentChunk: 1, totalChunks: 1 });
      const prompt = generateSessionAnalysisPrompt(
        session.project_name,
        session.summary,
        formattedMessages
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
      if (!parsed) {
        return {
          success: false,
          insights: [],
          error: 'Failed to parse LLM response. Please try again.',
        };
      }

      analysisResponse = parsed;
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

    return {
      success: true,
      insights,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, insights: [], error: 'Analysis cancelled' };
    }
    return {
      success: false,
      insights: [],
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
}

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

  const userMessages = messages.filter(m => m.type === 'user');
  if (userMessages.length < 2) {
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

    const prompt = generatePromptQualityPrompt(
      session.project_name,
      analysisInput,
      messages.length
    );

    options?.onProgress?.({ phase: 'analyzing' });
    const response = await client.chat([
      { role: 'system', content: PROMPT_QUALITY_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ], { signal: options?.signal });

    const parsed = parsePromptQualityResponse(response.content);
    if (!parsed) {
      return {
        success: false,
        insights: [],
        error: 'Failed to parse prompt quality analysis. Please try again.',
      };
    }

    options?.onProgress?.({ phase: 'saving' });
    const insight = convertPromptQualityToInsightRow(parsed, session);

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
      } : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, insights: [], error: 'Analysis cancelled' };
    }
    return {
      success: false,
      insights: [],
      error: error instanceof Error ? error.message : 'Prompt quality analysis failed',
    };
  }
}

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
      ...toolResults.map(r => (r.output || '').slice(0, 200)),
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

function convertToInsightRows(response: AnalysisResponse, session: SessionData): InsightRow[] {
  const insights: InsightRow[] = [];
  const now = new Date().toISOString();

  insights.push({
    id: randomUUID(),
    session_id: session.id,
    project_id: session.project_id,
    project_name: session.project_name,
    type: 'summary',
    title: response.summary.title,
    content: response.summary.content,
    summary: response.summary.content,
    bullets: JSON.stringify(response.summary.bullets),
    confidence: 0.9,
    source: 'llm',
    metadata: null,
    timestamp: session.ended_at,
    created_at: now,
    scope: 'session',
    analysis_version: ANALYSIS_VERSION,
  });

  for (const decision of response.decisions) {
    const confidence = decision.confidence ?? 85;
    if (confidence < 70) continue;

    insights.push({
      id: randomUUID(),
      session_id: session.id,
      project_id: session.project_id,
      project_name: session.project_name,
      type: 'decision',
      title: decision.title,
      content: decision.content,
      summary: decision.content.slice(0, 200),
      bullets: JSON.stringify(decision.alternatives || []),
      confidence: confidence / 100,
      source: 'llm',
      metadata: JSON.stringify({
        reasoning: decision.reasoning,
        alternatives: decision.alternatives,
        evidence: decision.evidence,
      }),
      timestamp: session.ended_at,
      created_at: now,
      scope: 'session',
      analysis_version: ANALYSIS_VERSION,
    });
  }

  for (const learning of response.learnings) {
    const confidence = learning.confidence ?? 80;
    if (confidence < 70) continue;

    insights.push({
      id: randomUUID(),
      session_id: session.id,
      project_id: session.project_id,
      project_name: session.project_name,
      type: 'learning',
      title: learning.title,
      content: learning.content,
      summary: learning.content.slice(0, 200),
      bullets: JSON.stringify([]),
      confidence: confidence / 100,
      source: 'llm',
      metadata: JSON.stringify({
        context: learning.context,
        evidence: learning.evidence,
      }),
      timestamp: session.ended_at,
      created_at: now,
      scope: 'session',
      analysis_version: ANALYSIS_VERSION,
    });
  }

  return insights;
}

function convertPromptQualityToInsightRow(response: PromptQualityResponse, session: SessionData): InsightRow {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    session_id: session.id,
    project_id: session.project_id,
    project_name: session.project_name,
    type: 'prompt_quality',
    title: `Prompt Efficiency: ${response.efficiencyScore}/100`,
    content: response.overallAssessment,
    summary: response.overallAssessment,
    bullets: JSON.stringify(response.tips),
    confidence: 0.85,
    source: 'llm',
    metadata: JSON.stringify({
      efficiencyScore: response.efficiencyScore,
      wastedTurns: response.wastedTurns,
      antiPatterns: response.antiPatterns,
      potentialMessageReduction: response.potentialMessageReduction,
    }),
    timestamp: session.ended_at,
    created_at: now,
    scope: 'session',
    analysis_version: ANALYSIS_VERSION,
  };
}

/**
 * Write insight rows to SQLite using prepared statements.
 */
function saveInsightsToDb(insights: InsightRow[]): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO insights (
      id, session_id, project_id, project_name, type, title, content,
      summary, bullets, confidence, source, metadata, timestamp,
      created_at, scope, analysis_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: InsightRow[]) => {
    for (const row of rows) {
      insert.run(
        row.id,
        row.session_id,
        row.project_id,
        row.project_name,
        row.type,
        row.title,
        row.content,
        row.summary,
        row.bullets,
        row.confidence,
        row.source,
        row.metadata,
        row.timestamp,
        row.created_at,
        row.scope,
        row.analysis_version,
      );
    }
  });

  insertMany(insights);
}

interface DeleteOptions {
  excludeTypes?: string[];
  includeOnlyTypes?: string[];
  excludeIds?: string[];
}

/**
 * Delete insights for a session, with optional type and ID exclusions.
 */
function deleteSessionInsights(sessionId: string, opts: DeleteOptions): void {
  const db = getDb();
  const conditions: string[] = ['session_id = ?'];
  const params: (string | number)[] = [sessionId];

  if (opts.excludeTypes && opts.excludeTypes.length > 0) {
    conditions.push(`type NOT IN (${opts.excludeTypes.map(() => '?').join(', ')})`);
    params.push(...opts.excludeTypes);
  }

  if (opts.includeOnlyTypes && opts.includeOnlyTypes.length > 0) {
    conditions.push(`type IN (${opts.includeOnlyTypes.map(() => '?').join(', ')})`);
    params.push(...opts.includeOnlyTypes);
  }

  if (opts.excludeIds && opts.excludeIds.length > 0) {
    conditions.push(`id NOT IN (${opts.excludeIds.map(() => '?').join(', ')})`);
    params.push(...opts.excludeIds);
  }

  db.prepare(`DELETE FROM insights WHERE ${conditions.join(' AND ')}`).run(...params);
}
