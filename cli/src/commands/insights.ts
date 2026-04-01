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

import chalk from 'chalk';
import { spawn } from 'child_process';
import { openSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/client.js';
import { getConfigDir } from '../utils/config.js';
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
import {
  saveInsightsToDb,
  deleteSessionInsights,
  saveFacetsToDb,
  convertToInsightRows,
  convertPQToInsightRow,
} from '../analysis/analysis-db.js';
import { saveAnalysisUsage } from '../analysis/analysis-usage-db.js';
import type { AnalysisRunner } from '../analysis/runner-types.js';
import type { SQLiteMessageRow } from '../analysis/prompt-types.js';

// ── DB types ──────────────────────────────────────────────────────────────────

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

// ── Session query helpers ─────────────────────────────────────────────────────

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
  /** Pre-built runner to reuse across batch calls. Skips runner construction and validate(). */
  _runner?: AnalysisRunner;
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Run analysis on a session. Called by the CLI command and tests.
 *
 * @throws if session not found or LLM is not configured / not available
 */
export async function runInsightsCommand(options: InsightsCommandOptions): Promise<void> {
  const log = options.quiet ? () => {} : console.log.bind(console);

  // 1. Build the runner (or reuse a pre-built one from batch callers)
  let runner: AnalysisRunner;
  if (options._runner) {
    runner = options._runner;
  } else if (options.native) {
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

  // SessionData is the shared type accepted by analysis-db converters.
  // SessionRow uses null for optional fields (SQLite); SessionData uses undefined.
  const sessionData = {
    ...session,
    compact_count: session.compact_count ?? undefined,
    auto_compact_count: session.auto_compact_count ?? undefined,
    slash_commands: session.slash_commands ?? undefined,
  };

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
  const sessionInsights = convertToInsightRows(parsedSession.data, sessionData);
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

  const pqInsight = convertPQToInsightRow(parsedPQ.data, sessionData);
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

/** Resolve the CLI entry point for spawning child processes. */
const CLI_ENTRY = resolve(fileURLToPath(import.meta.url), '../../index.js');

/** Log file for background hook analysis. */
const HOOK_LOG_PATH = join(getConfigDir(), 'hook-analysis.log');

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
      // Guard: prevent infinite loop.
      // The detached child runs `claude -p`, which creates a Claude Code session.
      // When that session ends, Claude Code fires SessionEnd again, re-triggering
      // this hook. The env var breaks the cycle.
      if (process.env.CODE_INSIGHTS_HOOK_ACTIVE) {
        return;
      }

      // Hook mode: two-phase execution.
      //
      // Phase 1 (foreground): Read stdin, sync the session file to SQLite.
      //   Must complete before the hook returns so data is in the DB.
      //
      // Phase 2 (detached): Spawn a background process to run analysis.
      //   Detached from Claude Code's hook process tree so it survives
      //   hook cleanup. Uses `insights <id> --native -q` (no --hook),
      //   so no stdin dependency.

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

      // Phase 1: Sync the single file before analysis
      if (parsed.transcript_path) {
        const { syncSingleFile } = await import('./sync.js');
        await syncSingleFile({ filePath: parsed.transcript_path, sourceTool: opts.source, quiet });
      }

      // Phase 2: Detach the analysis into a background process.
      // claude -p spawned inside a hook subprocess gets cancelled by
      // Claude Code's hook manager. Spawning a detached process with
      // its own process group escapes that process tree.
      const configDir = getConfigDir();
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true, mode: 0o700 });
      }
      const logFd = openSync(HOOK_LOG_PATH, 'a');

      const args = [CLI_ENTRY, 'insights', resolvedSessionId, '--native', '-q'];
      if (opts.force) args.push('--force');

      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env, CODE_INSIGHTS_HOOK_ACTIVE: '1' },
      });
      child.unref();

      // Hook returns immediately — analysis continues in background.
      return;
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

// Seconds per session estimate (15-30s each; use 22s as mid-range)
const SECONDS_PER_SESSION = 22;

export async function insightsCheckCommand(opts: {
  days?: number;
  quiet?: boolean;
  analyze?: boolean;
}): Promise<void> {
  const days = opts.days ?? 7;
  const quiet = opts.quiet ?? false;
  const analyze = opts.analyze ?? false;
  const log = quiet ? () => {} : console.log.bind(console);

  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const rows = db.prepare(`
      SELECT s.id, s.generated_title, s.custom_title, s.started_at, s.message_count
      FROM sessions s
      LEFT JOIN analysis_usage au ON au.session_id = s.id AND au.analysis_type = 'session'
      WHERE s.started_at >= ?
        AND s.deleted_at IS NULL
        AND au.session_id IS NULL
      ORDER BY s.started_at DESC
    `).all(cutoff) as Array<{ id: string; generated_title: string | null; custom_title: string | null; started_at: string; message_count: number }>;

    const count = rows.length;

    if (count === 0) {
      // Silent — all sessions analyzed
      return;
    }

    if (quiet) {
      process.stdout.write(String(count) + '\n');
      return;
    }

    // --analyze: process all found sessions with progress output
    if (analyze) {
      ClaudeNativeRunner.validate();
      const runner = new ClaudeNativeRunner();
      let successCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const label = row.custom_title ?? row.generated_title ?? row.id;
        const position = `[${i + 1}/${count}]`;
        process.stdout.write(`${position} ${label} ... `);
        const start = Date.now();
        try {
          await runInsightsCommand({ sessionId: row.id, native: true, quiet: true, _runner: runner });
          const elapsed = Math.round((Date.now() - start) / 1000);
          process.stdout.write(`done (${elapsed}s)\n`);
          successCount++;
        } catch (err) {
          process.stdout.write('failed\n');
          console.error(chalk.red(`  [Code Insights] ${err instanceof Error ? err.message : 'Analysis failed'}`));
        }
      }

      log(chalk.green(`Analyzed ${successCount} session${successCount !== 1 ? 's' : ''}.`));
      return;
    }

    // Auto-analyze silently when 1-2 unanalyzed sessions
    if (count <= 2) {
      ClaudeNativeRunner.validate();
      const runner = new ClaudeNativeRunner();
      for (const row of rows) {
        try {
          await runInsightsCommand({ sessionId: row.id, native: true, quiet: true, _runner: runner });
        } catch {
          // Silently ignore auto-analyze errors for 1-2 sessions
        }
      }
      return;
    }

    // 3-10: print count + suggestion
    if (count <= 10) {
      log(chalk.yellow(`[Code Insights] ${count} unanalyzed session${count > 1 ? 's' : ''} in the last ${days} days.`));
      log(chalk.dim(`  Run: code-insights insights check --analyze to process them`));
      return;
    }

    // 11+: print count + time estimate
    const estimateSecs = count * SECONDS_PER_SESSION;
    const estimateMins = Math.round(estimateSecs / 60);
    const timeLabel = estimateMins < 2 ? `~${estimateSecs}s` : `~${estimateMins} min`;
    log(chalk.yellow(`[Code Insights] ${count} unanalyzed session${count > 1 ? 's' : ''} in the last ${days} days.`));
    log(chalk.dim(`  Estimated time: ${timeLabel} (~${SECONDS_PER_SESSION}s each)`));
    log(chalk.dim(`  Run: code-insights insights check --analyze to process them`));
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
