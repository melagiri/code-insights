import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrate.js';

// ──────────────────────────────────────────────────────
// Migration idempotency tests using in-memory SQLite.
//
// We test against a fresh `:memory:` DB each time so tests
// are fully isolated — no on-disk state, no cleanup needed.
// ──────────────────────────────────────────────────────

function freshDb(): Database.Database {
  return new Database(':memory:');
}

describe('runMigrations', () => {
  // ────────────────────────────────────────────────────
  // Happy path: sequential V1→V7
  // ────────────────────────────────────────────────────

  it('applies all migrations V1→V7 on a fresh database', () => {
    const db = freshDb();
    runMigrations(db);

    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number };
    expect(row.v).toBe(7);
  });

  it('creates schema_version table with one row per version', () => {
    const db = freshDb();
    runMigrations(db);

    const rows = db.prepare('SELECT version FROM schema_version ORDER BY version').all() as Array<{ version: number }>;
    expect(rows.map(r => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  // ────────────────────────────────────────────────────
  // Idempotency: running migrations twice must not duplicate rows
  // ────────────────────────────────────────────────────

  it('is idempotent — running migrations twice leaves schema_version unchanged', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db); // second run must be a no-op

    const count = (db.prepare('SELECT COUNT(*) as n FROM schema_version').get() as { n: number }).n;
    expect(count).toBe(7); // exactly one row per version, no duplicates
  });

  it('returns v6Applied=false and v7Applied=false on second run', () => {
    const db = freshDb();
    runMigrations(db);
    const second = runMigrations(db);

    expect(second.v6Applied).toBe(false);
    expect(second.v7Applied).toBe(false);
  });

  it('returns v6Applied=true and v7Applied=true on first run', () => {
    const db = freshDb();
    const first = runMigrations(db);

    expect(first.v6Applied).toBe(true);
    expect(first.v7Applied).toBe(true);
  });

  // ────────────────────────────────────────────────────
  // Table existence: verify all tables created by V1→V7
  // ────────────────────────────────────────────────────

  it('creates all expected tables after migration', () => {
    const db = freshDb();
    runMigrations(db);

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>
    ).map(r => r.name);

    expect(tables).toContain('projects');
    expect(tables).toContain('sessions');
    expect(tables).toContain('messages');
    expect(tables).toContain('insights');
    expect(tables).toContain('usage_stats');
    expect(tables).toContain('schema_version');
    expect(tables).toContain('session_facets');   // V3
    expect(tables).toContain('reflect_snapshots'); // V4
    expect(tables).toContain('analysis_usage');    // V7
  });

  // ────────────────────────────────────────────────────
  // V7 analysis_usage table structure
  // ────────────────────────────────────────────────────

  it('creates analysis_usage table with correct composite primary key', () => {
    const db = freshDb();
    runMigrations(db);

    // Insert two rows with different analysis_type values for the same session_id.
    // project_path and started_at/ended_at are required NOT NULL columns.
    db.exec(`
      INSERT INTO projects (id, name, path, last_activity)
        VALUES ('p1', 'test', '/test', datetime('now'));
      INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at)
        VALUES ('s1', 'p1', 'test', '/test', datetime('now'), datetime('now'));
    `);

    db.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model)
        VALUES (?, ?, 'anthropic', 'claude-sonnet-4-5')
    `).run('s1', 'session');

    db.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model)
        VALUES (?, ?, 'anthropic', 'claude-sonnet-4-5')
    `).run('s1', 'prompt_quality');

    const rows = (
      db.prepare('SELECT analysis_type FROM analysis_usage WHERE session_id=? ORDER BY analysis_type').all('s1') as Array<{ analysis_type: string }>
    ).map(r => r.analysis_type);

    expect(rows).toEqual(['prompt_quality', 'session']);
  });

  it('upserts analysis_usage on (session_id, analysis_type) conflict', () => {
    const db = freshDb();
    runMigrations(db);

    db.exec(`
      INSERT INTO projects (id, name, path, last_activity)
        VALUES ('p2', 'test', '/test', datetime('now'));
      INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at)
        VALUES ('s2', 'p2', 'test', '/test', datetime('now'), datetime('now'));
    `);

    const insert = db.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model, input_tokens)
        VALUES (?, 'session', 'anthropic', 'claude-sonnet-4-5', ?)
        ON CONFLICT (session_id, analysis_type) DO UPDATE SET input_tokens = excluded.input_tokens
    `);

    insert.run('s2', 100);
    insert.run('s2', 200); // upsert — should update, not insert a second row

    const row = db.prepare(
      'SELECT COUNT(*) as n, input_tokens FROM analysis_usage WHERE session_id=?'
    ).get('s2') as { n: number; input_tokens: number };

    expect(row.n).toBe(1);
    expect(row.input_tokens).toBe(200);
  });

  // ────────────────────────────────────────────────────
  // V5: deleted_at column on sessions
  // ────────────────────────────────────────────────────

  it('adds deleted_at column to sessions (V5)', () => {
    const db = freshDb();
    runMigrations(db);

    const info = db.pragma('table_info(sessions)') as Array<{ name: string }>;
    const colNames = info.map(c => c.name);
    expect(colNames).toContain('deleted_at');
  });

  // ────────────────────────────────────────────────────
  // V6: compact/auto_compact/slash_commands columns on sessions
  // ────────────────────────────────────────────────────

  it('adds V6 columns to sessions', () => {
    const db = freshDb();
    runMigrations(db);

    const info = db.pragma('table_info(sessions)') as Array<{ name: string }>;
    const colNames = info.map(c => c.name);
    expect(colNames).toContain('compact_count');
    expect(colNames).toContain('auto_compact_count');
    expect(colNames).toContain('slash_commands');
  });
});
