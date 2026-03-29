import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrate.js';

// ──────────────────────────────────────────────────────
// Migration tests focusing on behavior NOT already covered
// by cli/src/db/schema.test.ts.
//
// schema.test.ts covers: applies without error, version = CURRENT,
// table existence, v6Applied/v7Applied return values, V6 column
// defaults, and the "no error on double run" idempotency check.
//
// This file covers the complementary behaviors: the strict
// no-duplicate-row guarantee, analysis_usage (V7) composite PK
// semantics, and the upsert contract that callers depend on.
// ──────────────────────────────────────────────────────

function freshDb(): Database.Database {
  return new Database(':memory:');
}

describe('runMigrations — idempotency', () => {
  // schema.test.ts verifies "no error on second run".
  // This test verifies the STRONGER guarantee: the schema_version
  // table contains exactly one row per version — no duplicates.
  it('double-apply leaves exactly one schema_version row per version', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db); // second run must be a strict no-op

    const rows = db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as Array<{ version: number }>;

    // One row per version, no duplicates
    expect(rows.map(r => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    db.close();
  });
});

describe('runMigrations — V7 analysis_usage table', () => {
  // analysis_usage has a composite PRIMARY KEY (session_id, analysis_type).
  // Verify two rows with the same session_id but different analysis_type
  // both insert successfully (not rejected as PK conflict).
  it('allows multiple analysis_type rows for the same session_id', () => {
    const db = freshDb();
    runMigrations(db);

    // Seed minimal project + session rows (FK not enforced in SQLite by default,
    // but providing real rows keeps the test meaningful).
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
      db
        .prepare('SELECT analysis_type FROM analysis_usage WHERE session_id=? ORDER BY analysis_type')
        .all('s1') as Array<{ analysis_type: string }>
    ).map(r => r.analysis_type);

    expect(rows).toEqual(['prompt_quality', 'session']);
    db.close();
  });

  // Callers use ON CONFLICT upsert to re-record analysis costs on re-analysis.
  // Verify the composite PK enables this pattern without inserting duplicates.
  it('upserts on (session_id, analysis_type) conflict — updates, does not duplicate', () => {
    const db = freshDb();
    runMigrations(db);

    db.exec(`
      INSERT INTO projects (id, name, path, last_activity)
        VALUES ('p2', 'test', '/test', datetime('now'));
      INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at)
        VALUES ('s2', 'p2', 'test', '/test', datetime('now'), datetime('now'));
    `);

    const upsert = db.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model, input_tokens)
        VALUES (?, 'session', 'anthropic', 'claude-sonnet-4-5', ?)
        ON CONFLICT (session_id, analysis_type) DO UPDATE SET input_tokens = excluded.input_tokens
    `);

    upsert.run('s2', 100);
    upsert.run('s2', 200); // re-analysis: should update, not insert a second row

    const row = db
      .prepare('SELECT COUNT(*) as n, input_tokens FROM analysis_usage WHERE session_id=?')
      .get('s2') as { n: number; input_tokens: number };

    expect(row.n).toBe(1);
    expect(row.input_tokens).toBe(200);
    db.close();
  });
});
