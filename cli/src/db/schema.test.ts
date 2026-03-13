import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, CURRENT_SCHEMA_VERSION } from './schema.js';
import { runMigrations } from './migrate.js';

// ──────────────────────────────────────────────────────
// Schema SQL tests
// ──────────────────────────────────────────────────────

describe('SCHEMA_SQL', () => {
  it('executes without errors on a fresh database', () => {
    const db = new Database(':memory:');
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
    db.close();
  });

  it('creates all expected tables', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA_SQL);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('insights');
    expect(tableNames).toContain('usage_stats');

    db.close();
  });

  it('does NOT create migration-only tables (those live in applyVN)', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA_SQL);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);

    // These tables are created by migrations, not SCHEMA_SQL
    expect(tableNames).not.toContain('session_facets');
    expect(tableNames).not.toContain('reflect_snapshots');

    db.close();
  });

  it('is idempotent — executing twice does not error (IF NOT EXISTS)', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
    db.close();
  });
});

describe('CURRENT_SCHEMA_VERSION', () => {
  it('is a positive integer', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(CURRENT_SCHEMA_VERSION)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────
// Migration tests
// ──────────────────────────────────────────────────────

describe('runMigrations', () => {
  it('applies on a fresh database without error', () => {
    const db = new Database(':memory:');
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('creates the schema_version table', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('schema_version');

    db.close();
  });

  it('creates all data tables via migration', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('insights');
    expect(tableNames).toContain('usage_stats');
    expect(tableNames).toContain('schema_version');

    db.close();
  });

  it('sets version to CURRENT_SCHEMA_VERSION', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
    expect(row.v).toBe(CURRENT_SCHEMA_VERSION);

    db.close();
  });

  it('is idempotent — running twice does not error', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();

    db.close();
  });

  it('is idempotent — running twice does not duplicate the version row', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    runMigrations(db);

    const rows = db.prepare('SELECT * FROM schema_version').all();
    expect(rows).toHaveLength(CURRENT_SCHEMA_VERSION);

    db.close();
  });

  // ────────────────────────────────────────────────────
  // V4 migration: reflect_snapshots table
  // ────────────────────────────────────────────────────

  it('V4 creates reflect_snapshots table', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(tables.map(t => t.name)).toContain('reflect_snapshots');

    db.close();
  });

  it('V4 reflect_snapshots has correct columns', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const columns = db
      .prepare("PRAGMA table_info('reflect_snapshots')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>;

    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('period');
    expect(colNames).toContain('project_id');
    expect(colNames).toContain('results_json');
    expect(colNames).toContain('generated_at');
    expect(colNames).toContain('window_start');
    expect(colNames).toContain('window_end');
    expect(colNames).toContain('session_count');
    expect(colNames).toContain('facet_count');

    db.close();
  });

  it('V4 reflect_snapshots has composite primary key (period, project_id)', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const columns = db
      .prepare("PRAGMA table_info('reflect_snapshots')")
      .all() as Array<{ name: string; pk: number }>;

    const pkColumns = columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk);
    expect(pkColumns).toHaveLength(2);
    expect(pkColumns[0].name).toBe('period');
    expect(pkColumns[1].name).toBe('project_id');

    db.close();
  });

  it('V4 reflect_snapshots supports upsert on composite PK', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const insert = db.prepare(`
      INSERT INTO reflect_snapshots (period, project_id, results_json, generated_at, window_start, window_end, session_count, facet_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(period, project_id) DO UPDATE SET
        results_json = excluded.results_json,
        generated_at = excluded.generated_at,
        session_count = excluded.session_count,
        facet_count = excluded.facet_count
    `);

    // Insert initial snapshot
    insert.run('30d', '__all__', '{"a":1}', '2025-06-15T10:00:00Z', '2025-05-16T10:00:00Z', '2025-06-15T10:00:00Z', 25, 100);

    // Upsert with updated data
    insert.run('30d', '__all__', '{"a":2}', '2025-06-16T10:00:00Z', '2025-05-17T10:00:00Z', '2025-06-16T10:00:00Z', 30, 120);

    const rows = db.prepare('SELECT * FROM reflect_snapshots').all() as Array<{ results_json: string; session_count: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].results_json).toBe('{"a":2}');
    expect(rows[0].session_count).toBe(30);

    db.close();
  });

  it('V4 reflect_snapshots allows different period+project combos', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const insert = db.prepare(`
      INSERT INTO reflect_snapshots (period, project_id, results_json, generated_at, window_start, window_end, session_count, facet_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('30d', '__all__', '{}', '2025-06-15T10:00:00Z', null, '2025-06-15T10:00:00Z', 25, 100);
    insert.run('7d', '__all__', '{}', '2025-06-15T10:00:00Z', null, '2025-06-15T10:00:00Z', 10, 50);
    insert.run('30d', 'proj-123', '{}', '2025-06-15T10:00:00Z', null, '2025-06-15T10:00:00Z', 15, 75);

    const rows = db.prepare('SELECT * FROM reflect_snapshots').all();
    expect(rows).toHaveLength(3);

    db.close();
  });

  it('V4 reflect_snapshots window_start is nullable', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    // 'all' period has no window_start
    db.prepare(`
      INSERT INTO reflect_snapshots (period, project_id, results_json, generated_at, window_start, window_end, session_count, facet_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('all', '__all__', '{}', '2025-06-15T10:00:00Z', null, '2025-06-15T10:00:00Z', 50, 200);

    const row = db.prepare('SELECT window_start FROM reflect_snapshots WHERE period = ?').get('all') as { window_start: string | null };
    expect(row.window_start).toBeNull();

    db.close();
  });

  it('creates expected indexes on sessions table', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'sessions'")
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_sessions_project_id');
    expect(indexNames).toContain('idx_sessions_started_at');
    expect(indexNames).toContain('idx_sessions_source_tool');

    db.close();
  });

  it('V6 adds compact_count, auto_compact_count, slash_commands columns with defaults', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    // Insert a session without specifying the new columns — defaults should apply
    db.prepare(`
      INSERT INTO projects (id, name, path, last_activity, session_count)
      VALUES ('proj-v6', 'v6-proj', '/v6', datetime('now'), 0)
    `).run();
    db.prepare(`
      INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at)
      VALUES ('sess-v6', 'proj-v6', 'v6-proj', '/v6', datetime('now'), datetime('now'))
    `).run();

    const row = db.prepare(`
      SELECT compact_count, auto_compact_count, slash_commands FROM sessions WHERE id = 'sess-v6'
    `).get() as { compact_count: number; auto_compact_count: number; slash_commands: string };

    expect(row.compact_count).toBe(0);
    expect(row.auto_compact_count).toBe(0);
    expect(row.slash_commands).toBe('[]');

    db.close();
  });

  it('V6 schema version is 6 after migration', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number };
    expect(row.v).toBe(6);

    db.close();
  });

  it('runMigrations returns v6Applied=true on fresh database', () => {
    const db = new Database(':memory:');
    const result = runMigrations(db);
    expect(result.v6Applied).toBe(true);
    db.close();
  });

  it('runMigrations returns v6Applied=false when already on V6', () => {
    const db = new Database(':memory:');
    runMigrations(db);           // first run — applies all migrations
    const result = runMigrations(db);  // second run — nothing to apply
    expect(result.v6Applied).toBe(false);
    db.close();
  });
});
