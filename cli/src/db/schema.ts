// SQL schema for local SQLite database at ~/.code-insights/data.db
// Mirrors Firestore collections but normalized into relational tables.
// All timestamps are ISO 8601 strings (SQLite has no native datetime).
// Arrays and nested objects are stored as JSON strings.

export const SCHEMA_SQL = `
-- ============================================================
-- Projects
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  path                  TEXT NOT NULL,
  git_remote_url        TEXT,
  project_id_source     TEXT NOT NULL DEFAULT 'path-hash',
  session_count         INTEGER NOT NULL DEFAULT 0,
  last_activity         TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  total_input_tokens    INTEGER DEFAULT 0,
  total_output_tokens   INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens     INTEGER DEFAULT 0,
  estimated_cost_usd    REAL DEFAULT 0
);

-- ============================================================
-- Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL REFERENCES projects(id),
  project_name            TEXT NOT NULL,
  project_path            TEXT NOT NULL,
  git_remote_url          TEXT,
  summary                 TEXT,
  custom_title            TEXT,
  generated_title         TEXT,
  title_source            TEXT,
  session_character       TEXT,
  started_at              TEXT NOT NULL,
  ended_at                TEXT NOT NULL,
  message_count           INTEGER NOT NULL DEFAULT 0,
  user_message_count      INTEGER NOT NULL DEFAULT 0,
  assistant_message_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count         INTEGER NOT NULL DEFAULT 0,
  git_branch              TEXT,
  claude_version          TEXT,
  source_tool             TEXT NOT NULL DEFAULT 'claude-code',
  device_id               TEXT,
  device_hostname         TEXT,
  device_platform         TEXT,
  synced_at               TEXT NOT NULL DEFAULT (datetime('now')),
  total_input_tokens      INTEGER,
  total_output_tokens     INTEGER,
  cache_creation_tokens   INTEGER,
  cache_read_tokens       INTEGER,
  estimated_cost_usd      REAL,
  models_used             TEXT,
  primary_model           TEXT,
  usage_source            TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_source_tool ON sessions(source_tool);

-- ============================================================
-- Messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  type         TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  thinking     TEXT,
  tool_calls   TEXT,
  tool_results TEXT,
  usage        TEXT,
  timestamp    TEXT NOT NULL,
  parent_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(session_id, timestamp ASC);

-- ============================================================
-- Insights (written by dashboard server, not CLI)
-- ============================================================
CREATE TABLE IF NOT EXISTS insights (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id),
  project_id         TEXT NOT NULL REFERENCES projects(id),
  project_name       TEXT NOT NULL,
  type               TEXT NOT NULL,
  title              TEXT NOT NULL,
  content            TEXT NOT NULL,
  summary            TEXT NOT NULL,
  bullets            TEXT,
  confidence         REAL NOT NULL,
  source             TEXT NOT NULL DEFAULT 'llm',
  metadata           TEXT,
  timestamp          TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  scope              TEXT NOT NULL DEFAULT 'session',
  analysis_version   TEXT NOT NULL DEFAULT '1.0.0',
  linked_insight_ids TEXT
);

CREATE INDEX IF NOT EXISTS idx_insights_session_id ON insights(session_id);
CREATE INDEX IF NOT EXISTS idx_insights_project_id ON insights(project_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
CREATE INDEX IF NOT EXISTS idx_insights_timestamp ON insights(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_insights_confidence_timestamp ON insights(confidence DESC, timestamp DESC);

-- ============================================================
-- Global usage stats (singleton row, updated by CLI sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_stats (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  total_input_tokens    INTEGER DEFAULT 0,
  total_output_tokens   INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens     INTEGER DEFAULT 0,
  estimated_cost_usd    REAL DEFAULT 0,
  sessions_with_usage   INTEGER DEFAULT 0,
  last_updated_at       TEXT DEFAULT (datetime('now'))
);
`;

export const CURRENT_SCHEMA_VERSION = 5;

export { runMigrations } from './migrate.js';
