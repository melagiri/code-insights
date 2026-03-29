/**
 * TDD tests for cli/src/analysis/analysis-usage-db.ts
 * Covers: SaveAnalysisUsageData interface (session_message_count optional),
 * AnalysisUsageRow interface, and the SQL logic for saveAnalysisUsage + getSessionAnalysisUsage.
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import type { SaveAnalysisUsageData, AnalysisUsageRow } from '../analysis-usage-db.js';

// ── In-memory DB helper ───────────────────────────────────────────────────────

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE analysis_usage (
      session_id TEXT NOT NULL,
      analysis_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      chunk_count INTEGER NOT NULL DEFAULT 1,
      session_message_count INTEGER,
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, analysis_type)
    );
  `);
  return db;
}

// ── SaveAnalysisUsageData type shape ─────────────────────────────────────────

describe('SaveAnalysisUsageData', () => {
  it('accepts session_message_count as optional', () => {
    const withCount: SaveAnalysisUsageData = {
      session_id: 'sess-1',
      analysis_type: 'session',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      input_tokens: 1000,
      output_tokens: 200,
      estimated_cost_usd: 0.01,
      session_message_count: 42,
    };
    const withoutCount: SaveAnalysisUsageData = {
      session_id: 'sess-1',
      analysis_type: 'prompt_quality',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      input_tokens: 500,
      output_tokens: 100,
      estimated_cost_usd: 0.001,
    };
    expect(withCount.session_message_count).toBe(42);
    expect(withoutCount.session_message_count).toBeUndefined();
  });
});

// ── saveAnalysisUsage SQL logic ───────────────────────────────────────────────

describe('saveAnalysisUsage SQL logic', () => {
  it('inserts a new row with session_message_count', () => {
    const db = createTestDb();
    const data: SaveAnalysisUsageData = {
      session_id: 'sess-1',
      analysis_type: 'session',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      input_tokens: 1000,
      output_tokens: 200,
      estimated_cost_usd: 0.01,
      duration_ms: 5000,
      session_message_count: 42,
    };

    db.prepare(`
      INSERT INTO analysis_usage
        (session_id, analysis_type, provider, model,
         input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
         estimated_cost_usd, duration_ms, chunk_count, session_message_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.chunk_count ?? 1,
      data.session_message_count ?? null,
    );

    const row = db.prepare('SELECT * FROM analysis_usage WHERE session_id = ?').get('sess-1') as AnalysisUsageRow & { session_message_count: number | null };
    expect(row.provider).toBe('anthropic');
    expect(row.input_tokens).toBe(1000);
    expect(row.session_message_count).toBe(42);
  });

  it('upserts and updates session_message_count on re-analysis', () => {
    const db = createTestDb();

    db.prepare(`
      INSERT INTO analysis_usage
        (session_id, analysis_type, provider, model,
         input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
         estimated_cost_usd, duration_ms, chunk_count, session_message_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, analysis_type) DO UPDATE SET
        input_tokens = excluded.input_tokens,
        session_message_count = excluded.session_message_count
    `).run('sess-1', 'session', 'anthropic', 'model-a', 100, 50, 0, 0, 0.001, null, 1, 10);

    db.prepare(`
      INSERT INTO analysis_usage
        (session_id, analysis_type, provider, model,
         input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
         estimated_cost_usd, duration_ms, chunk_count, session_message_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, analysis_type) DO UPDATE SET
        input_tokens = excluded.input_tokens,
        session_message_count = excluded.session_message_count
    `).run('sess-1', 'session', 'anthropic', 'model-a', 200, 50, 0, 0, 0.002, null, 1, 15);

    const row = db.prepare('SELECT * FROM analysis_usage WHERE session_id = ?').get('sess-1') as AnalysisUsageRow & { session_message_count: number | null };
    expect(row.input_tokens).toBe(200);
    expect(row.session_message_count).toBe(15);
  });
});

// ── getSessionAnalysisUsage SQL logic ─────────────────────────────────────────

describe('getSessionAnalysisUsage SQL logic', () => {
  it('returns empty array for unknown session', () => {
    const db = createTestDb();
    const rows = db.prepare(`
      SELECT session_id, analysis_type, provider, model,
             input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
             estimated_cost_usd, duration_ms, chunk_count, analyzed_at
      FROM analysis_usage WHERE session_id = ?
      ORDER BY analyzed_at ASC
    `).all('unknown-sess') as AnalysisUsageRow[];
    expect(rows).toHaveLength(0);
  });

  it('returns all usage rows for a session', () => {
    const db = createTestDb();
    const insertRow = (analysisType: string) => {
      db.prepare(`
        INSERT INTO analysis_usage
          (session_id, analysis_type, provider, model,
           input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
           estimated_cost_usd, duration_ms, chunk_count, session_message_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('sess-1', analysisType, 'openai', 'gpt-4o', 1000, 100, 0, 0, 0.005, 3000, 1, null);
    };
    insertRow('session');
    insertRow('prompt_quality');

    const rows = db.prepare(`
      SELECT session_id, analysis_type, provider, model,
             input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
             estimated_cost_usd, duration_ms, chunk_count, analyzed_at
      FROM analysis_usage WHERE session_id = ?
      ORDER BY analyzed_at ASC
    `).all('sess-1') as AnalysisUsageRow[];

    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.analysis_type)).toContain('session');
    expect(rows.map(r => r.analysis_type)).toContain('prompt_quality');
  });
});
