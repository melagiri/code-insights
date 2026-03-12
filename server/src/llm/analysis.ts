// Core analysis engine — server-side.
// Ported from web repo (src/lib/llm/analysis.ts) with SQLite persistence replacing Firestore.
// Key differences from web repo:
//   - Uses SQLiteMessageRow instead of web Message type
//   - Writes insights directly to SQLite via getDb() (not Firestore)
//   - Abort handling uses error.name === 'AbortError' (not DOMException)
//   - Uses session's existing project_id from SQLite (not re-derived hash)

import { randomUUID } from 'crypto';
import { jsonrepair } from 'jsonrepair';
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
  FACET_ONLY_SYSTEM_PROMPT,
  generateFacetOnlyPrompt,
  extractJsonPayload,
  type SQLiteMessageRow,
  type AnalysisResponse,
  type PromptQualityResponse,
  type ParseError,
} from './prompts.js';
import { normalizePatternCategory } from './pattern-normalize.js';
import { normalizePromptQualityCategory } from './prompt-quality-normalize.js';

// Re-export SQLiteMessageRow so routes can import it from analysis.ts directly
export type { SQLiteMessageRow };

// Maximum tokens to send to LLM (leaving room for response)
const MAX_INPUT_TOKENS = 80000;
const ANALYSIS_VERSION = '3.0.0';

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
  error_type?: string;
  response_length?: number;
  response_preview?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Re-export ParseError so routes can import it from analysis.ts
export type { ParseError };

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
            facetMessages
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

    // Update session character if LLM classified it
    if (analysisResponse.session_character) {
      const db = getDb();
      db.prepare('UPDATE sessions SET session_character = ? WHERE id = ?')
        .run(analysisResponse.session_character, session.id);
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
    session_character: responses.find(r => r.session_character)?.session_character,
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
    metadata: response.summary.outcome
      ? JSON.stringify({ outcome: response.summary.outcome })
      : null,
    timestamp: session.ended_at,
    created_at: now,
    scope: 'session',
    analysis_version: ANALYSIS_VERSION,
  });

  for (const decision of response.decisions) {
    const confidence = decision.confidence ?? 85;
    if (confidence < 70) continue;

    const content = decision.situation && decision.choice
      ? `${decision.situation} → ${decision.choice}`
      : decision.choice || decision.situation || decision.title;

    const altBullets = (decision.alternatives || [])
      .filter(a => a && typeof a === 'object' && a.option)
      .map(a => `${a.option}: ${a.rejected_because || 'no reason given'}`);

    insights.push({
      id: randomUUID(),
      session_id: session.id,
      project_id: session.project_id,
      project_name: session.project_name,
      type: 'decision',
      title: decision.title,
      content,
      summary: (decision.choice || content).slice(0, 200),
      bullets: JSON.stringify(altBullets),
      confidence: confidence / 100,
      source: 'llm',
      metadata: JSON.stringify({
        situation: decision.situation,
        choice: decision.choice,
        reasoning: decision.reasoning,
        alternatives: decision.alternatives,
        trade_offs: decision.trade_offs,
        revisit_when: decision.revisit_when,
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

    const content = learning.takeaway || learning.title;

    insights.push({
      id: randomUUID(),
      session_id: session.id,
      project_id: session.project_id,
      project_name: session.project_name,
      type: 'learning',
      title: learning.title,
      content,
      summary: content.slice(0, 200),
      bullets: JSON.stringify([]),
      confidence: confidence / 100,
      source: 'llm',
      metadata: JSON.stringify({
        symptom: learning.symptom,
        root_cause: learning.root_cause,
        takeaway: learning.takeaway,
        applies_when: learning.applies_when,
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

  // Normalize categories at write time (mirrors saveFacetsToDb pattern)
  const normalizedFindings = response.findings.map(f => ({
    ...f,
    category: f.category ? normalizePromptQualityCategory(f.category) : 'uncategorized',
  }));

  const normalizedTakeaways = response.takeaways.map(t => ({
    ...t,
    category: t.category ? normalizePromptQualityCategory(t.category) : 'uncategorized',
  }));

  return {
    id: randomUUID(),
    session_id: session.id,
    project_id: session.project_id,
    project_name: session.project_name,
    type: 'prompt_quality',
    title: `Prompt Efficiency: ${response.efficiency_score}/100`,
    content: response.assessment,
    summary: response.assessment,
    bullets: JSON.stringify([]),  // takeaways live in metadata.takeaways; bullets expects string[] for other insight types
    confidence: 0.85,
    source: 'llm',
    metadata: JSON.stringify({
      efficiency_score: response.efficiency_score,
      message_overhead: response.message_overhead,
      takeaways: normalizedTakeaways,
      findings: normalizedFindings,
      dimension_scores: response.dimension_scores,
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

/**
 * Save extracted facets to the session_facets table.
 */
function saveFacetsToDb(
  sessionId: string,
  facets: NonNullable<AnalysisResponse['facets']>,
  analysisVersion: string
): void {
  const db = getDb();

  // Normalize pattern categories at write time so stored data is always clean.
  // This handles LLM variants (e.g., "task-decomposition" → "structured-planning")
  // before they hit the database, keeping aggregation queries simple.
  const normalizedPatterns = Array.isArray(facets.effective_patterns)
    ? facets.effective_patterns.map(ep => {
        if (!ep.category) {
          // Should not happen with updated prompts — indicates model ignored category instruction.
          // Fall back to 'uncategorized' so these sessions don't trigger the outdated banner.
          console.warn('[pattern-monitor] saveFacetsToDb: effective_pattern missing category field, defaulting to uncategorized');
        }
        return {
          ...ep,
          category: ep.category ? normalizePatternCategory(ep.category) : 'uncategorized',
        };
      })
    : [];

  db.prepare(`
    INSERT OR REPLACE INTO session_facets
    (session_id, outcome_satisfaction, workflow_pattern, had_course_correction,
     course_correction_reason, iteration_count, friction_points, effective_patterns,
     analysis_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    facets.outcome_satisfaction,
    facets.workflow_pattern,
    facets.had_course_correction ? 1 : 0,
    facets.course_correction_reason,
    facets.iteration_count,
    JSON.stringify(Array.isArray(facets.friction_points) ? facets.friction_points : []),
    JSON.stringify(normalizedPatterns),
    analysisVersion
  );
}

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

    const prompt = generateFacetOnlyPrompt(
      session.project_name,
      session.summary,
      formattedMessages
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
