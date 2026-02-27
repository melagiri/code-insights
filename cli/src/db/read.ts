import { getDb } from './client.js';
import type { SessionRow } from '../commands/stats/data/types.js';

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

/**
 * Safely parse the models_used JSON column.
 * Returns undefined on any parse failure rather than throwing — a corrupt
 * value in one row should not break the entire query.
 */
function parseModelsUsed(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return undefined;
  }
}

// ──────────────────────────────────────────────────────
// Session existence check (used by sync)
// ──────────────────────────────────────────────────────

export function sessionExists(sessionId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId) as { 1: number } | undefined;
  return row !== undefined;
}

// ──────────────────────────────────────────────────────
// Project reads (used by status command)
// ──────────────────────────────────────────────────────

export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  session_count: number;
  last_activity: string;
}

export function getProjects(): ProjectRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, name, path, session_count, last_activity
    FROM projects
    ORDER BY last_activity DESC
  `).all() as ProjectRow[];
}

// ──────────────────────────────────────────────────────
// Session reads (used by stats LocalDataSource)
// ──────────────────────────────────────────────────────

export interface SessionQueryOptions {
  periodStart?: Date;
  projectId?: string;
  sourceTool?: string;
}

/**
 * Query sessions from SQLite, mapping snake_case columns to SessionRow shape.
 */
export function getSessions(opts: SessionQueryOptions = {}): SessionRow[] {
  const db = getDb();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.periodStart) {
    conditions.push('started_at >= ?');
    params.push(opts.periodStart.toISOString());
  }
  if (opts.projectId) {
    conditions.push('project_id = ?');
    params.push(opts.projectId);
  }
  if (opts.sourceTool) {
    conditions.push('source_tool = ?');
    params.push(opts.sourceTool);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT
      id, project_id, project_name,
      started_at, ended_at,
      message_count, user_message_count, assistant_message_count, tool_call_count,
      estimated_cost_usd, total_input_tokens, total_output_tokens,
      cache_creation_tokens, cache_read_tokens,
      primary_model, models_used,
      generated_title, custom_title, summary, session_character,
      source_tool, usage_source
    FROM sessions
    ${where}
    ORDER BY started_at DESC
  `;

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string;
    project_id: string;
    project_name: string;
    started_at: string;
    ended_at: string;
    message_count: number;
    user_message_count: number;
    assistant_message_count: number;
    tool_call_count: number;
    estimated_cost_usd: number | null;
    total_input_tokens: number | null;
    total_output_tokens: number | null;
    cache_creation_tokens: number | null;
    cache_read_tokens: number | null;
    primary_model: string | null;
    models_used: string | null;
    generated_title: string | null;
    custom_title: string | null;
    summary: string | null;
    session_character: string | null;
    source_tool: string; // NOT NULL in schema, DEFAULT 'claude-code'
    usage_source: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    startedAt: new Date(r.started_at),
    endedAt: new Date(r.ended_at),
    messageCount: r.message_count,
    userMessageCount: r.user_message_count,
    assistantMessageCount: r.assistant_message_count,
    toolCallCount: r.tool_call_count,
    estimatedCostUsd: r.estimated_cost_usd ?? undefined,
    totalInputTokens: r.total_input_tokens ?? undefined,
    totalOutputTokens: r.total_output_tokens ?? undefined,
    cacheCreationTokens: r.cache_creation_tokens ?? undefined,
    cacheReadTokens: r.cache_read_tokens ?? undefined,
    primaryModel: r.primary_model ?? undefined,
    modelsUsed: parseModelsUsed(r.models_used),
    generatedTitle: r.generated_title ?? undefined,
    customTitle: r.custom_title ?? undefined,
    summary: r.summary ?? undefined,
    sessionCharacter: r.session_character ?? undefined,
    sourceTool: r.source_tool,
    usageSource: r.usage_source ?? undefined,
  }));
}

/**
 * Get the most recent session matching optional filters.
 * Uses LIMIT 1 to avoid scanning all rows.
 */
export function getLastSession(opts?: { sourceTool?: string; projectId?: string }): SessionRow | null {
  const db = getDb();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.sourceTool) {
    conditions.push('source_tool = ?');
    params.push(opts.sourceTool);
  }
  if (opts?.projectId) {
    conditions.push('project_id = ?');
    params.push(opts.projectId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT
      id, project_id, project_name,
      started_at, ended_at,
      message_count, user_message_count, assistant_message_count, tool_call_count,
      estimated_cost_usd, total_input_tokens, total_output_tokens,
      cache_creation_tokens, cache_read_tokens,
      primary_model, models_used,
      generated_title, custom_title, summary, session_character,
      source_tool, usage_source
    FROM sessions
    ${where}
    ORDER BY started_at DESC
    LIMIT 1
  `;

  const row = db.prepare(sql).get(...params) as {
    id: string;
    project_id: string;
    project_name: string;
    started_at: string;
    ended_at: string;
    message_count: number;
    user_message_count: number;
    assistant_message_count: number;
    tool_call_count: number;
    estimated_cost_usd: number | null;
    total_input_tokens: number | null;
    total_output_tokens: number | null;
    cache_creation_tokens: number | null;
    cache_read_tokens: number | null;
    primary_model: string | null;
    models_used: string | null;
    generated_title: string | null;
    custom_title: string | null;
    summary: string | null;
    session_character: string | null;
    source_tool: string;
    usage_source: string | null;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    startedAt: new Date(row.started_at),
    endedAt: new Date(row.ended_at),
    messageCount: row.message_count,
    userMessageCount: row.user_message_count,
    assistantMessageCount: row.assistant_message_count,
    toolCallCount: row.tool_call_count,
    estimatedCostUsd: row.estimated_cost_usd ?? undefined,
    totalInputTokens: row.total_input_tokens ?? undefined,
    totalOutputTokens: row.total_output_tokens ?? undefined,
    cacheCreationTokens: row.cache_creation_tokens ?? undefined,
    cacheReadTokens: row.cache_read_tokens ?? undefined,
    primaryModel: row.primary_model ?? undefined,
    modelsUsed: parseModelsUsed(row.models_used),
    generatedTitle: row.generated_title ?? undefined,
    customTitle: row.custom_title ?? undefined,
    summary: row.summary ?? undefined,
    sessionCharacter: row.session_character ?? undefined,
    sourceTool: row.source_tool,
    usageSource: row.usage_source ?? undefined,
  };
}

/**
 * Count sessions matching optional filters without loading row data.
 * Use this instead of getSessions({}).length to avoid full-table scans
 * when only a count is needed.
 */
export function getSessionCount(opts: SessionQueryOptions = {}): number {
  const db = getDb();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.periodStart) {
    conditions.push('started_at >= ?');
    params.push(opts.periodStart.toISOString());
  }
  if (opts.projectId) {
    conditions.push('project_id = ?');
    params.push(opts.projectId);
  }
  if (opts.sourceTool) {
    conditions.push('source_tool = ?');
    params.push(opts.sourceTool);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT COUNT(*) AS cnt FROM sessions ${where}`;

  const row = db.prepare(sql).get(...params) as { cnt: number };
  return row.cnt;
}

/**
 * Get distinct project names and IDs from sessions table.
 * Used for project resolution in stats commands.
 */
export function getProjectList(): Array<{ id: string; name: string }> {
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT project_id AS id, project_name AS name
    FROM sessions
    ORDER BY project_name
  `).all() as Array<{ id: string; name: string }>;
}
