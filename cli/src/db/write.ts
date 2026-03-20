import { getDb } from './client.js';
import { sessionExists } from './read.js';
import { generateStableProjectId, getDeviceInfo } from '../utils/device.js';
import type { ParsedSession, ParsedMessage } from '../types.js';
import type BetterSqlite3 from 'better-sqlite3';

const CONTENT_MAX = 10000;
const THINKING_MAX = 5000;
const TOOL_RESULT_MAX = 2000;
const TOOL_INPUT_MAX = 1000;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 20) + '\n... [truncated]';
}

// SQLite error codes surfaced by better-sqlite3
const SQLITE_BUSY = 'SQLITE_BUSY';
const SQLITE_LOCKED = 'SQLITE_LOCKED';
const SQLITE_CONSTRAINT = 'SQLITE_CONSTRAINT';

/**
 * Run a SQLite transaction with one retry on BUSY/LOCKED errors (500ms wait).
 * Constraint violations are logged and treated as non-fatal skips.
 */
function runWithRetry(fn: () => void, context: string): void {
  const attempt = () => {
    try {
      fn();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === SQLITE_BUSY || code === SQLITE_LOCKED) {
        // One retry after a short synchronous wait
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
        try {
          fn();
        } catch (retryErr: unknown) {
          console.error(`[write] ${context}: DB still locked after retry —`, retryErr);
        }
      } else if (code?.startsWith(SQLITE_CONSTRAINT) ?? false) {
        console.warn(`[write] ${context}: constraint violation, skipping —`, (err as Error).message);
      } else {
        throw err;
      }
    }
  };
  attempt();
}

// ──────────────────────────────────────────────────────
// Module-level lazy-initialized prepared statements.
//
// We can't prepare at module load time because the DB isn't open yet.
// Instead, we lazy-init on first use — a statement is compiled once and
// reused on every subsequent call, avoiding repeated parse overhead during
// batch syncs that write hundreds of sessions.
// ──────────────────────────────────────────────────────

let _lastDb: BetterSqlite3.Database | null = null;

// All cached statements below — reset when DB instance changes (e.g., test teardown)
let _stmtUpsertProjectBase: BetterSqlite3.Statement | null = null;
let _stmtUpdateProjectWithUsage: BetterSqlite3.Statement | null = null;
let _stmtUpdateProjectCountOnly: BetterSqlite3.Statement | null = null;
let _stmtUpsertSession: BetterSqlite3.Statement | null = null;
let _stmtInsertMessage: BetterSqlite3.Statement | null = null;
let _stmtUpsertUsageStatsIncrement: BetterSqlite3.Statement | null = null;

function getStmts() {
  const db = getDb();
  // If the DB instance changed (test isolation, reset), rebuild all statements
  if (db !== _lastDb) {
    _lastDb = db;
    _stmtUpsertProjectBase = null;
    _stmtUpdateProjectWithUsage = null;
    _stmtUpdateProjectCountOnly = null;
    _stmtUpsertSession = null;
    _stmtInsertMessage = null;
    _stmtUpsertUsageStatsIncrement = null;
  }

  if (!_stmtUpsertProjectBase) {
    _stmtUpsertProjectBase = db.prepare(`
      INSERT INTO projects (id, name, path, git_remote_url, project_id_source, last_activity)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        git_remote_url = excluded.git_remote_url,
        last_activity = MAX(last_activity, excluded.last_activity),
        updated_at = datetime('now')
    `);
  }

  if (!_stmtUpdateProjectWithUsage) {
    _stmtUpdateProjectWithUsage = db.prepare(`
      UPDATE projects SET
        session_count         = session_count + 1,
        total_input_tokens    = total_input_tokens + ?,
        total_output_tokens   = total_output_tokens + ?,
        cache_creation_tokens = cache_creation_tokens + ?,
        cache_read_tokens     = cache_read_tokens + ?,
        estimated_cost_usd    = estimated_cost_usd + ?,
        updated_at            = datetime('now')
      WHERE id = ?
    `);
  }

  if (!_stmtUpdateProjectCountOnly) {
    _stmtUpdateProjectCountOnly = db.prepare(`
      UPDATE projects SET session_count = session_count + 1, updated_at = datetime('now')
      WHERE id = ?
    `);
  }

  if (!_stmtUpsertSession) {
    _stmtUpsertSession = db.prepare(`
      INSERT INTO sessions (
        id, project_id, project_name, project_path, git_remote_url,
        summary, generated_title, title_source, session_character,
        started_at, ended_at,
        message_count, user_message_count, assistant_message_count, tool_call_count,
        compact_count, auto_compact_count, slash_commands,
        git_branch, claude_version, source_tool,
        device_id, device_hostname, device_platform,
        total_input_tokens, total_output_tokens, cache_creation_tokens, cache_read_tokens,
        estimated_cost_usd, models_used, primary_model, usage_source
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        generated_title         = excluded.generated_title,
        title_source            = excluded.title_source,
        session_character       = excluded.session_character,
        ended_at                = excluded.ended_at,
        summary                 = excluded.summary,
        message_count           = excluded.message_count,
        user_message_count      = excluded.user_message_count,
        assistant_message_count = excluded.assistant_message_count,
        tool_call_count         = excluded.tool_call_count,
        compact_count           = excluded.compact_count,
        auto_compact_count      = excluded.auto_compact_count,
        slash_commands          = excluded.slash_commands,
        total_input_tokens      = excluded.total_input_tokens,
        total_output_tokens     = excluded.total_output_tokens,
        cache_creation_tokens   = excluded.cache_creation_tokens,
        cache_read_tokens       = excluded.cache_read_tokens,
        estimated_cost_usd      = excluded.estimated_cost_usd,
        models_used             = excluded.models_used,
        primary_model           = excluded.primary_model,
        usage_source            = excluded.usage_source,
        synced_at               = datetime('now')
    `);
  }

  if (!_stmtInsertMessage) {
    _stmtInsertMessage = db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, session_id, type, content, thinking,
        tool_calls, tool_results, usage, timestamp, parent_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  if (!_stmtUpsertUsageStatsIncrement) {
    _stmtUpsertUsageStatsIncrement = db.prepare(`
      INSERT INTO usage_stats (id, total_input_tokens, total_output_tokens, cache_creation_tokens, cache_read_tokens, estimated_cost_usd, sessions_with_usage, last_updated_at)
      VALUES (1, ?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        total_input_tokens    = total_input_tokens + excluded.total_input_tokens,
        total_output_tokens   = total_output_tokens + excluded.total_output_tokens,
        cache_creation_tokens = cache_creation_tokens + excluded.cache_creation_tokens,
        cache_read_tokens     = cache_read_tokens + excluded.cache_read_tokens,
        estimated_cost_usd    = estimated_cost_usd + excluded.estimated_cost_usd,
        sessions_with_usage   = sessions_with_usage + 1,
        last_updated_at       = datetime('now')
    `);
  }

  return {
    upsertProjectBase: _stmtUpsertProjectBase,
    updateProjectWithUsage: _stmtUpdateProjectWithUsage,
    updateProjectCountOnly: _stmtUpdateProjectCountOnly,
    upsertSession: _stmtUpsertSession,
    insertMessage: _stmtInsertMessage,
    upsertUsageStatsIncrement: _stmtUpsertUsageStatsIncrement,
  };
}

/**
 * Upsert project record and insert session + messages.
 * Replaces firebase/client.ts uploadSession() + uploadMessages().
 *
 * isForce: when true (--force sync), usage stats on the project are NOT
 * incrementally added — they'll be recalculated via recalculateUsageStats().
 */
export function insertSessionWithProject(session: ParsedSession, isForce = false): void {
  insertSessionWithProjectInternal(session, isForce);
}

/**
 * Insert a session and return whether it was new to the DB.
 * Lets callers avoid a duplicate sessionExists() query.
 */
export function insertSessionWithProjectAndReturnIsNew(session: ParsedSession, isForce = false): boolean {
  return insertSessionWithProjectInternal(session, isForce);
}

function insertSessionWithProjectInternal(session: ParsedSession, isForce: boolean): boolean {
  const db = getDb();
  const { projectId, source: projectIdSource, gitRemoteUrl } = generateStableProjectId(session.projectPath);
  const deviceInfo = getDeviceInfo();

  const isNew = !sessionExists(session.id);

  const tx = db.transaction(() => {
    upsertProject(projectId, session, projectIdSource, gitRemoteUrl, isNew, isForce);
    upsertSession(session, projectId, gitRemoteUrl, deviceInfo);
    if (isNew) {
      updateGlobalUsageStats(session, isForce);
    }
  });

  runWithRetry(() => tx(), `insertSession(${session.id})`);
  return isNew;
}


function upsertProject(
  projectId: string,
  session: ParsedSession,
  projectIdSource: string,
  gitRemoteUrl: string | null,
  isNewSession: boolean,
  isForce: boolean,
): void {
  const stmts = getStmts();

  // Insert project if it doesn't exist
  stmts.upsertProjectBase.run(
    projectId,
    session.projectName,
    session.projectPath,
    gitRemoteUrl,
    projectIdSource,
    session.endedAt.toISOString(),
  );

  // Increment session count and usage only for genuinely new sessions
  if (isNewSession && !isForce && session.usage) {
    stmts.updateProjectWithUsage.run(
      session.usage.totalInputTokens,
      session.usage.totalOutputTokens,
      session.usage.cacheCreationTokens,
      session.usage.cacheReadTokens,
      session.usage.estimatedCostUsd,
      projectId,
    );
  } else if (isNewSession) {
    stmts.updateProjectCountOnly.run(projectId);
  }
}

function upsertSession(
  session: ParsedSession,
  projectId: string,
  gitRemoteUrl: string | null,
  deviceInfo: { deviceId: string; hostname: string; platform: string },
): void {
  const stmts = getStmts();
  stmts.upsertSession.run(
    session.id,
    projectId,
    session.projectName,
    session.projectPath,
    gitRemoteUrl,
    session.summary,
    session.generatedTitle,
    session.titleSource,
    session.sessionCharacter,
    session.startedAt.toISOString(),
    session.endedAt.toISOString(),
    session.messageCount,
    session.userMessageCount,
    session.assistantMessageCount,
    session.toolCallCount,
    session.compactCount,
    session.autoCompactCount,
    JSON.stringify(session.slashCommands),
    session.gitBranch,
    session.claudeVersion,
    session.sourceTool ?? 'claude-code',
    deviceInfo.deviceId,
    deviceInfo.hostname,
    deviceInfo.platform,
    session.usage?.totalInputTokens ?? null,
    session.usage?.totalOutputTokens ?? null,
    session.usage?.cacheCreationTokens ?? null,
    session.usage?.cacheReadTokens ?? null,
    session.usage?.estimatedCostUsd ?? null,
    session.usage?.modelsUsed ? JSON.stringify(session.usage.modelsUsed) : null,
    session.usage?.primaryModel ?? null,
    session.usage?.usageSource ?? null,
  );
}

/**
 * Insert messages for a session.
 * Replaces firebase/client.ts uploadMessages().
 */
export function insertMessages(session: ParsedSession): void {
  if (session.messages.length === 0) return;

  const db = getDb();
  const stmts = getStmts();

  const tx = db.transaction((messages: ParsedMessage[]) => {
    for (const msg of messages) {
      stmts.insertMessage.run(
        msg.id,
        msg.sessionId,
        msg.type,
        truncate(msg.content, CONTENT_MAX),
        msg.thinking ? truncate(msg.thinking, THINKING_MAX) : null,
        msg.toolCalls.length > 0
          ? JSON.stringify(msg.toolCalls.map(tc => ({
              id: tc.id,
              name: tc.name,
              input: JSON.stringify(tc.input).slice(0, TOOL_INPUT_MAX),
            })))
          : null,
        msg.toolResults.length > 0
          ? JSON.stringify(msg.toolResults.map(tr => ({
              toolUseId: tr.toolUseId,
              output: truncate(tr.output, TOOL_RESULT_MAX),
            })))
          : null,
        msg.usage ? JSON.stringify(msg.usage) : null,
        msg.timestamp.toISOString(),
        msg.parentId,
      );
    }
  });

  runWithRetry(() => tx(session.messages), `insertMessages(${session.id})`);
}

/**
 * After a --force sync, recalculate usage_stats singleton from all sessions.
 * Also recalculates per-project usage totals.
 */
export function recalculateUsageStats(): { sessionsWithUsage: number; totalTokens: number; estimatedCostUsd: number } {
  const db = getDb();

  const tx = db.transaction(() => {
    // Aggregate global stats from all sessions that have usage data
    const global = db.prepare(`
      SELECT
        COUNT(*)                       AS sessions_with_usage,
        SUM(total_input_tokens)        AS total_input,
        SUM(total_output_tokens)       AS total_output,
        SUM(cache_creation_tokens)     AS cache_creation,
        SUM(cache_read_tokens)         AS cache_read,
        SUM(estimated_cost_usd)        AS total_cost
      FROM sessions
      WHERE usage_source IS NOT NULL AND deleted_at IS NULL
    `).get() as {
      sessions_with_usage: number;
      total_input: number | null;
      total_output: number | null;
      cache_creation: number | null;
      cache_read: number | null;
      total_cost: number | null;
    };

    // Upsert the singleton usage_stats row
    db.prepare(`
      INSERT INTO usage_stats (id, total_input_tokens, total_output_tokens, cache_creation_tokens, cache_read_tokens, estimated_cost_usd, sessions_with_usage, last_updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        total_input_tokens    = excluded.total_input_tokens,
        total_output_tokens   = excluded.total_output_tokens,
        cache_creation_tokens = excluded.cache_creation_tokens,
        cache_read_tokens     = excluded.cache_read_tokens,
        estimated_cost_usd    = excluded.estimated_cost_usd,
        sessions_with_usage   = excluded.sessions_with_usage,
        last_updated_at       = excluded.last_updated_at
    `).run(
      global.total_input ?? 0,
      global.total_output ?? 0,
      global.cache_creation ?? 0,
      global.cache_read ?? 0,
      global.total_cost ?? 0,
      global.sessions_with_usage ?? 0,
    );

    // Recalculate per-project usage totals
    const perProject = db.prepare(`
      SELECT
        project_id,
        COUNT(*)                   AS session_count,
        SUM(total_input_tokens)    AS total_input,
        SUM(total_output_tokens)   AS total_output,
        SUM(cache_creation_tokens) AS cache_creation,
        SUM(cache_read_tokens)     AS cache_read,
        SUM(estimated_cost_usd)    AS total_cost,
        MAX(ended_at)              AS last_activity
      FROM sessions
      WHERE deleted_at IS NULL
      GROUP BY project_id
    `).all() as Array<{
      project_id: string;
      session_count: number;
      total_input: number | null;
      total_output: number | null;
      cache_creation: number | null;
      cache_read: number | null;
      total_cost: number | null;
      last_activity: string;
    }>;

    const updateProject = db.prepare(`
      UPDATE projects SET
        session_count         = ?,
        total_input_tokens    = ?,
        total_output_tokens   = ?,
        cache_creation_tokens = ?,
        cache_read_tokens     = ?,
        estimated_cost_usd    = ?,
        last_activity         = ?,
        updated_at            = datetime('now')
      WHERE id = ?
    `);

    for (const row of perProject) {
      updateProject.run(
        row.session_count,
        row.total_input ?? 0,
        row.total_output ?? 0,
        row.cache_creation ?? 0,
        row.cache_read ?? 0,
        row.total_cost ?? 0,
        row.last_activity,
        row.project_id,
      );
    }

    return global;
  });

  const result = tx() as {
    sessions_with_usage: number;
    total_input: number | null;
    total_output: number | null;
    cache_creation: number | null;
    cache_read: number | null;
    total_cost: number | null;
  };

  const totalTokens = (result.total_input ?? 0) + (result.total_output ?? 0)
    + (result.cache_creation ?? 0) + (result.cache_read ?? 0);

  return {
    sessionsWithUsage: result.sessions_with_usage ?? 0,
    totalTokens,
    estimatedCostUsd: result.total_cost ?? 0,
  };
}

function updateGlobalUsageStats(session: ParsedSession, isForce: boolean): void {
  if (isForce || !session.usage) return;

  const stmts = getStmts();
  stmts.upsertUsageStatsIncrement.run(
    session.usage.totalInputTokens,
    session.usage.totalOutputTokens,
    session.usage.cacheCreationTokens,
    session.usage.cacheReadTokens,
    session.usage.estimatedCostUsd,
  );
}
