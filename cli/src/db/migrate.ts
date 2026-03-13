import type Database from 'better-sqlite3';
import { SCHEMA_SQL, CURRENT_SCHEMA_VERSION } from './schema.js';

export interface MigrationResult {
  v6Applied: boolean;
}

/**
 * Apply schema migrations to the database.
 * Called once on startup before any reads or writes.
 *
 * Version 1: Initial schema (projects, sessions, messages, insights, usage_stats)
 * Version 2: Add compound index on insights(confidence DESC, timestamp DESC) for depth-ordered export queries
 * Version 3: Add session_facets table for cross-session analysis
 * Version 4: Add reflect_snapshots table for caching LLM-generated synthesis results
 * Version 5: Add deleted_at column to sessions for soft-delete (user-initiated hide)
 * Version 6: Add compact_count, auto_compact_count, slash_commands columns to sessions
 */
export function runMigrations(db: Database.Database): MigrationResult {
  // Create schema_version table first if it doesn't exist.
  // This table is created inline (not via SCHEMA_SQL) so migrations can check it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const currentVersion = getCurrentVersion(db);

  if (currentVersion < 1) {
    applyV1(db);
  }

  if (currentVersion < 2) {
    applyV2(db);
  }

  if (currentVersion < 3) {
    applyV3(db);
  }

  if (currentVersion < 4) {
    applyV4(db);
  }

  if (currentVersion < 5) {
    applyV5(db);
  }

  let v6Applied = false;
  if (currentVersion < 6) {
    applyV6(db);
    v6Applied = true;
  }

  return { v6Applied };
}

function getCurrentVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
  return row.v ?? 0;
}

function applyV1(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(1);
}

function applyV2(db: Database.Database): void {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_insights_confidence_timestamp ON insights(confidence DESC, timestamp DESC)`);
  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(2);
}

function applyV3(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_facets (
      session_id              TEXT PRIMARY KEY REFERENCES sessions(id),
      outcome_satisfaction    TEXT NOT NULL,
      workflow_pattern        TEXT,
      had_course_correction   INTEGER NOT NULL DEFAULT 0,
      course_correction_reason TEXT,
      iteration_count         INTEGER NOT NULL DEFAULT 0,
      friction_points         TEXT,
      effective_patterns      TEXT,
      extracted_at            TEXT NOT NULL DEFAULT (datetime('now')),
      analysis_version        TEXT NOT NULL DEFAULT '1.0.0'
    );

    CREATE INDEX IF NOT EXISTS idx_facets_outcome ON session_facets(outcome_satisfaction);
    CREATE INDEX IF NOT EXISTS idx_facets_workflow ON session_facets(workflow_pattern);
  `);

  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(3);
}

function applyV4(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reflect_snapshots (
      period        TEXT NOT NULL,
      project_id    TEXT NOT NULL DEFAULT '__all__',
      results_json  TEXT NOT NULL,
      generated_at  TEXT NOT NULL,
      window_start  TEXT,
      window_end    TEXT NOT NULL,
      session_count INTEGER NOT NULL,
      facet_count   INTEGER NOT NULL,
      PRIMARY KEY (period, project_id)
    );
  `);

  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(4);
}

function applyV5(db: Database.Database): void {
  db.exec(`ALTER TABLE sessions ADD COLUMN deleted_at TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at ON sessions(deleted_at)`);
  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(5);
}

function applyV6(db: Database.Database): void {
  db.exec(`ALTER TABLE sessions ADD COLUMN compact_count INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE sessions ADD COLUMN auto_compact_count INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE sessions ADD COLUMN slash_commands TEXT NOT NULL DEFAULT '[]'`);
  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(6);
}
