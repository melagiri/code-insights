// DB persistence layer for session analysis — SQLite writes for insights and facets.
// Moved from server/src/llm/analysis-db.ts (server is now a re-export wrapper).
// Owns the InsightRow and SessionData types used by both CLI and server.

import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import type { AnalysisResponse, PromptQualityResponse } from './prompt-types.js';
import { normalizePatternCategory } from './pattern-normalize.js';
import { normalizePromptQualityCategory } from './prompt-quality-normalize.js';

export const ANALYSIS_VERSION = '3.0.0';

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

// Minimal session data needed for analysis (from SQLite sessions row).
// Kept separate from SessionRow (which includes message_count) intentionally —
// SessionData is the TA-aligned "data contract" type shared with server consumers.
export interface SessionData {
  id: string;
  project_id: string;
  project_name: string;
  project_path: string;
  summary: string | null;
  ended_at: string;          // ISO 8601
  // V6 metadata fields — NULL for pre-V6 sessions, present for sessions synced
  // after V6 schema migration. Used to provide context signals to LLM prompts.
  compact_count?: number;
  auto_compact_count?: number;
  slash_commands?: string;   // JSON-encoded string[] from SQLite
}

// --- Data conversion ---

export function convertToInsightRows(response: AnalysisResponse, session: SessionData): InsightRow[] {
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

  for (const decision of (response.decisions ?? [])) {
    const confidence = decision.confidence ?? 85;
    if (confidence < 70) continue;

    const content = decision.situation && decision.choice
      ? `${decision.situation} → ${decision.choice}`
      : decision.choice || decision.situation || decision.title;

    const altBullets = (decision.alternatives || [])
      .filter((a): a is { option: string; rejected_because: string } => Boolean(a?.option))
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

  for (const learning of (response.learnings ?? [])) {
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

export function convertPQToInsightRow(response: PromptQualityResponse, session: SessionData): InsightRow {
  const now = new Date().toISOString();

  // Normalize categories at write time (mirrors saveFacetsToDb pattern)
  const normalizedFindings = (response.findings ?? []).map(f => ({
    ...f,
    category: f.category ? normalizePromptQualityCategory(f.category) : 'uncategorized',
  }));

  const normalizedTakeaways = (response.takeaways ?? []).map(t => ({
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

// --- DB writes ---

/**
 * Write insight rows to SQLite using prepared statements.
 */
export function saveInsightsToDb(insights: InsightRow[]): void {
  if (insights.length === 0) return;
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

export interface DeleteOptions {
  excludeTypes?: string[];
  includeOnlyTypes?: string[];
  excludeIds?: string[];
}

/**
 * Delete insights for a session, with optional type and ID exclusions.
 */
export function deleteSessionInsights(sessionId: string, opts: DeleteOptions): void {
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
 * analysisVersion defaults to ANALYSIS_VERSION so callers don't need to pass it,
 * but the server backfill route can pass an explicit version when needed.
 */
export function saveFacetsToDb(
  sessionId: string,
  facets: NonNullable<AnalysisResponse['facets']>,
  analysisVersion: string = ANALYSIS_VERSION,
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
    facets.workflow_pattern ?? null,
    facets.had_course_correction ? 1 : 0,
    facets.course_correction_reason,
    facets.iteration_count,
    JSON.stringify(Array.isArray(facets.friction_points) ? facets.friction_points : []),
    JSON.stringify(normalizedPatterns),
    analysisVersion,
  );
}
