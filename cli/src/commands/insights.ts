/**
 * insights command — analyze a session using configured LLM or native claude -p.
 *
 * Two modes:
 *   --native   Use claude -p (user's Claude subscription, zero config)
 *   (default)  Use configured LLM provider (OpenAI, Anthropic, Gemini, Ollama)
 *
 * Hook mode (--hook):
 *   Reads { session_id, transcript_path, cwd } from stdin JSON,
 *   calls syncSingleFile() to guarantee fresh data, then analyzes.
 *
 * Resume detection (hook mode only):
 *   Skips analysis if analysis_usage.session_message_count matches current
 *   sessions.message_count — the session has not changed since last analysis.
 *   Bypassed with --force.
 */

import { randomUUID } from 'crypto';
import chalk from 'chalk';
import { getDb } from '../db/client.js';
import { ClaudeNativeRunner } from '../analysis/native-runner.js';
import { ProviderRunner } from '../analysis/provider-runner.js';
import {
  SHARED_ANALYST_SYSTEM_PROMPT,
  buildSessionAnalysisInstructions,
  buildPromptQualityInstructions,
  buildCacheableConversationBlock,
} from '../analysis/prompts.js';
import { formatMessagesForAnalysis } from '../analysis/message-format.js';
import { parseAnalysisResponse, parsePromptQualityResponse } from '../analysis/response-parsers.js';
import { normalizePatternCategory } from '../analysis/pattern-normalize.js';
import { normalizePromptQualityCategory } from '../analysis/prompt-quality-normalize.js';
import type { AnalysisRunner } from '../analysis/runner-types.js';
import type { SQLiteMessageRow, AnalysisResponse, PromptQualityResponse } from '../analysis/prompt-types.js';

const ANALYSIS_VERSION = '3.0.0';

// ── DB types (mirror server/src/llm/analysis-db.ts, no cross-package import) ──

interface SessionRow {
  id: string;
  project_id: string;
  project_name: string;
  project_path: string;
  summary: string | null;
  ended_at: string;
  message_count: number;
  compact_count: number | null;
  auto_compact_count: number | null;
  slash_commands: string | null;
}

interface InsightRow {
  id: string;
  session_id: string;
  project_id: string;
  project_name: string;
  type: string;
  title: string;
  content: string;
  summary: string;
  bullets: string;
  confidence: number;
  source: 'llm';
  metadata: string | null;
  timestamp: string;
  created_at: string;
  scope: string;
  analysis_version: string;
}

// ── Inline DB helpers (CLI cannot import from @code-insights/server) ──────────

function loadSessionForAnalysis(sessionId: string): SessionRow | null {
  const db = getDb();
  return db.prepare(`
    SELECT id, project_id, project_name, project_path, summary, ended_at,
           message_count, compact_count, auto_compact_count, slash_commands
    FROM sessions
    WHERE id = ? AND deleted_at IS NULL
  `).get(sessionId) as SessionRow | null;
}

function loadSessionMessages(sessionId: string): SQLiteMessageRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, session_id, type, content, thinking, tool_calls, tool_results, usage, timestamp, parent_id
    FROM messages
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(sessionId) as SQLiteMessageRow[];
}

function saveInsightsToDb(insights: InsightRow[]): void {
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
        row.id, row.session_id, row.project_id, row.project_name,
        row.type, row.title, row.content, row.summary, row.bullets,
        row.confidence, row.source, row.metadata, row.timestamp,
        row.created_at, row.scope, row.analysis_version,
      );
    }
  });
  insertMany(insights);
}

function deleteSessionInsights(sessionId: string, opts: {
  excludeTypes?: string[];
  excludeIds?: string[];
}): void {
  const db = getDb();
  const conditions: string[] = ['session_id = ?'];
  const params: (string | number)[] = [sessionId];

  if (opts.excludeTypes && opts.excludeTypes.length > 0) {
    conditions.push(`type NOT IN (${opts.excludeTypes.map(() => '?').join(', ')})`);
    params.push(...opts.excludeTypes);
  }
  if (opts.excludeIds && opts.excludeIds.length > 0) {
    conditions.push(`id NOT IN (${opts.excludeIds.map(() => '?').join(', ')})`);
    params.push(...opts.excludeIds);
  }

  db.prepare(`DELETE FROM insights WHERE ${conditions.join(' AND ')}`).run(...params);
}

function saveFacetsToDb(
  sessionId: string,
  facets: NonNullable<AnalysisResponse['facets']>,
): void {
  const db = getDb();
  const normalizedPatterns = Array.isArray(facets.effective_patterns)
    ? facets.effective_patterns.map(ep => ({
        ...ep,
        category: ep.category ? normalizePatternCategory(ep.category) : 'uncategorized',
      }))
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
    facets.course_correction_reason ?? null,
    facets.iteration_count,
    JSON.stringify(Array.isArray(facets.friction_points) ? facets.friction_points : []),
    JSON.stringify(normalizedPatterns),
    ANALYSIS_VERSION,
  );
}

function saveAnalysisUsage(data: {
  session_id: string;
  analysis_type: 'session' | 'prompt_quality';
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  estimated_cost_usd: number;
  duration_ms?: number;
  session_message_count?: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO analysis_usage
      (session_id, analysis_type, provider, model,
       input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
       estimated_cost_usd, duration_ms, chunk_count, session_message_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(session_id, analysis_type) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      cache_creation_tokens = excluded.cache_creation_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      estimated_cost_usd = excluded.estimated_cost_usd,
      duration_ms = excluded.duration_ms,
      chunk_count = excluded.chunk_count,
      session_message_count = excluded.session_message_count
  `).run(
    data.session_id,
    data.analysis_type,
    data.provider,
    data.model,
    data.input_tokens,
    data.output_tokens,
    data.cache_creation_tokens ?? 0,
    data.cache_read_tokens ?? 0,
    data.estimated_cost_usd,
    data.duration_ms ?? null,
    data.session_message_count ?? null,
  );
}

// ── Row converters ────────────────────────────────────────────────────────────

function convertToInsightRows(response: AnalysisResponse, session: SessionRow): InsightRow[] {
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

    insights.push({
      id: randomUUID(),
      session_id: session.id,
      project_id: session.project_id,
      project_name: session.project_name,
      type: 'decision',
      title: decision.title,
      content,
      summary: (decision.choice || content).slice(0, 200),
      bullets: JSON.stringify(
        (decision.alternatives || [])
          .filter((a: { option?: string }) => a?.option)
          .map((a: { option?: string; rejected_because?: string }) =>
            `${a.option}: ${a.rejected_because || 'no reason given'}`)
      ),
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

function convertPQToInsightRow(response: PromptQualityResponse, session: SessionRow): InsightRow {
  const now = new Date().toISOString();

  const normalizedFindings = (response.findings ?? []).map((f: { category?: string }) => ({
    ...f,
    category: f.category ? normalizePromptQualityCategory(f.category) : 'uncategorized',
  }));
  const normalizedTakeaways = (response.takeaways ?? []).map((t: { category?: string }) => ({
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
    bullets: JSON.stringify([]),
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

// ── Resume detection ──────────────────────────────────────────────────────────

function isAlreadyAnalyzed(sessionId: string, currentMessageCount: number): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT session_message_count FROM analysis_usage
    WHERE session_id = ? AND analysis_type = 'session'
  `).get(sessionId) as { session_message_count: number | null } | undefined;

  if (!row) return false;
  return row.session_message_count === currentMessageCount;
}

// ── Command options ───────────────────────────────────────────────────────────

export interface InsightsCommandOptions {
  sessionId: string;
  native: boolean;
  hookMode?: boolean;
  force?: boolean;
  quiet?: boolean;
  source?: string;
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Run analysis on a session. Called by the CLI command and tests.
 *
 * @throws if session not found or LLM is not configured / not available
 */
export async function runInsightsCommand(options: InsightsCommandOptions): Promise<void> {
  const log = options.quiet ? () => {} : console.log.bind(console);

  // 1. Build the runner
  let runner: AnalysisRunner;
  if (options.native) {
    ClaudeNativeRunner.validate();
    runner = new ClaudeNativeRunner();
  } else {
    runner = ProviderRunner.fromConfig();
  }

  // 2. Load session from DB
  const session = loadSessionForAnalysis(options.sessionId);
  if (!session) {
    throw new Error(`Session '${options.sessionId}' not found in local database.`);
  }

  // 3. Resume detection — hook mode only (skipped when --force)
  if (options.hookMode && !options.force) {
    if (isAlreadyAnalyzed(options.sessionId, session.message_count)) {
      return; // already analyzed at this session length
    }
  }

  // 4. Load messages
  const messages = loadSessionMessages(options.sessionId);

  // 5. Build shared conversation block (same for both passes)
  const formattedMessages = formatMessagesForAnalysis(messages);

  // Session metadata for prompt builders
  const slashCommands = (() => {
    try {
      return JSON.parse(session.slash_commands ?? '[]') as string[];
    } catch {
      return [] as string[];
    }
  })();
  const sessionMeta = {
    compactCount: session.compact_count ?? 0,
    autoCompactCount: session.auto_compact_count ?? 0,
    slashCommands,
  };
  const humanMessageCount = messages.filter(m => m.type === 'user').length;
  const assistantMessageCount = messages.filter(m => m.type === 'assistant').length;
  const toolExchangeCount = messages.filter(m => m.tool_calls).length;

  // ── Pass 1: Session analysis ──────────────────────────────────────────────

  const sessionInstructions = buildSessionAnalysisInstructions(
    session.project_name,
    session.summary,
    sessionMeta,
  );
  const sessionUserPrompt = `${buildCacheableConversationBlock(formattedMessages).text}\n${sessionInstructions}`;

  const sessionResult = await runner.runAnalysis({
    systemPrompt: SHARED_ANALYST_SYSTEM_PROMPT,
    userPrompt: sessionUserPrompt,
  });

  const parsedSession = parseAnalysisResponse(sessionResult.rawJson);
  if (!parsedSession.success) {
    throw new Error(`Session analysis failed: ${parsedSession.error.error_message}`);
  }

  // Save session insights (upsert: insert new, delete old)
  const sessionInsights = convertToInsightRows(parsedSession.data, session);
  saveInsightsToDb(sessionInsights);
  deleteSessionInsights(session.id, {
    excludeTypes: ['prompt_quality'],
    excludeIds: sessionInsights.map(i => i.id),
  });

  if (parsedSession.data.facets) {
    saveFacetsToDb(session.id, parsedSession.data.facets);
  }

  saveAnalysisUsage({
    session_id: session.id,
    analysis_type: 'session',
    provider: sessionResult.provider,
    model: sessionResult.model,
    input_tokens: sessionResult.inputTokens,
    output_tokens: sessionResult.outputTokens,
    cache_creation_tokens: sessionResult.cacheCreationTokens,
    cache_read_tokens: sessionResult.cacheReadTokens,
    estimated_cost_usd: 0,
    duration_ms: sessionResult.durationMs,
    session_message_count: session.message_count,
  });

  // ── Pass 2: Prompt quality analysis ──────────────────────────────────────

  const pqInstructions = buildPromptQualityInstructions(
    session.project_name,
    { humanMessageCount, assistantMessageCount, toolExchangeCount },
    sessionMeta,
  );
  const pqUserPrompt = `${buildCacheableConversationBlock(formattedMessages).text}\n${pqInstructions}`;

  const pqResult = await runner.runAnalysis({
    systemPrompt: SHARED_ANALYST_SYSTEM_PROMPT,
    userPrompt: pqUserPrompt,
  });

  const parsedPQ = parsePromptQualityResponse(pqResult.rawJson);
  if (!parsedPQ.success) {
    throw new Error(`Prompt quality analysis failed: ${parsedPQ.error.error_message}`);
  }

  const pqInsight = convertPQToInsightRow(parsedPQ.data, session);
  saveInsightsToDb([pqInsight]);
  deleteSessionInsights(session.id, {
    excludeTypes: ['summary', 'decision', 'learning'],
    excludeIds: [pqInsight.id],
  });

  saveAnalysisUsage({
    session_id: session.id,
    analysis_type: 'prompt_quality',
    provider: pqResult.provider,
    model: pqResult.model,
    input_tokens: pqResult.inputTokens,
    output_tokens: pqResult.outputTokens,
    cache_creation_tokens: pqResult.cacheCreationTokens,
    cache_read_tokens: pqResult.cacheReadTokens,
    estimated_cost_usd: 0,
    duration_ms: pqResult.durationMs,
    session_message_count: session.message_count,
  });

  // ── Summary line ──────────────────────────────────────────────────────────

  // Non-PQ insight count (excludes summary's own entry which is always saved)
  const insightCount = sessionInsights.length;
  const pqScore = parsedPQ.data.efficiency_score;
  log(chalk.green(`[Code Insights] Session analyzed: ${insightCount} insights, PQ ${pqScore}/100`));
}

// ── CLI command entry point ───────────────────────────────────────────────────

export async function insightsCommand(
  sessionId: string | undefined,
  opts: {
    native?: boolean;
    hook?: boolean;
    source?: string;
    force?: boolean;
    quiet?: boolean;
  }
): Promise<void> {
  const quiet = opts.quiet ?? false;
  const log = quiet ? () => {} : console.log.bind(console);

  try {
    let resolvedSessionId: string;

    if (opts.hook) {
      // Hook mode: read { session_id, transcript_path, cwd } from stdin
      const stdinData = await readStdin();
      let parsed: { session_id?: string; transcript_path?: string; cwd?: string };
      try {
        parsed = JSON.parse(stdinData);
      } catch {
        throw new Error('--hook mode requires valid JSON on stdin (got: ' + stdinData.slice(0, 100) + ')');
      }

      if (!parsed.session_id) {
        throw new Error('--hook stdin JSON missing required field: session_id');
      }

      resolvedSessionId = parsed.session_id;

      // Sync the single file before analysis
      if (parsed.transcript_path) {
        const { syncSingleFile } = await import('./sync.js');
        await syncSingleFile({ filePath: parsed.transcript_path, sourceTool: opts.source, quiet });
      }
    } else {
      if (!sessionId) {
        throw new Error('Session ID is required (or use --hook to read from stdin)');
      }
      resolvedSessionId = sessionId;
    }

    await runInsightsCommand({
      sessionId: resolvedSessionId,
      native: opts.native ?? false,
      hookMode: opts.hook ?? false,
      force: opts.force ?? false,
      quiet,
      source: opts.source,
    });
  } catch (error) {
    if (!quiet) {
      console.error(chalk.red(`[Code Insights] ${error instanceof Error ? error.message : 'Analysis failed'}`));
    }
    process.exit(1);
  }
}

// ── Subcommand: insights check ────────────────────────────────────────────────

export function insightsCheckCommand(opts: { days?: number; quiet?: boolean }): void {
  const days = opts.days ?? 7;
  const quiet = opts.quiet ?? false;
  const log = quiet ? () => {} : console.log.bind(console);

  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const rows = db.prepare(`
      SELECT s.id
      FROM sessions s
      LEFT JOIN analysis_usage au ON au.session_id = s.id AND au.analysis_type = 'session'
      WHERE s.started_at >= ?
        AND s.deleted_at IS NULL
        AND au.analysis_type IS NULL
      ORDER BY s.started_at DESC
    `).all(cutoff) as Array<{ id: string }>;

    const count = rows.length;

    if (count === 0) {
      // Silent — all sessions analyzed
      return;
    }

    if (quiet) {
      process.stdout.write(String(count) + '\n');
      return;
    }

    log(chalk.yellow(`[Code Insights] ${count} unanalyzed session${count > 1 ? 's' : ''} in the last ${days} days.`));
    log(chalk.dim(`  Run: code-insights insights --native to analyze the most recent session.`));
  } catch (error) {
    if (!quiet) {
      console.error(chalk.red(`[Code Insights] ${error instanceof Error ? error.message : 'Check failed'}`));
    }
    process.exit(1);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('{}');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}
