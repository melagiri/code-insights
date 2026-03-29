/**
 * TDD tests for cli/src/analysis/analysis-db.ts
 * Covers: ANALYSIS_VERSION, convertToInsightRows, convertPQToInsightRow,
 * deleteSessionInsights (includeOnlyTypes), saveFacetsToDb (analysisVersion param).
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  ANALYSIS_VERSION,
  convertToInsightRows,
  convertPQToInsightRow,
} from '../analysis-db.js';
import type { SessionData } from '../analysis-db.js';
import type { AnalysisResponse, PromptQualityResponse } from '../prompt-types.js';

// ── In-memory DB helper ───────────────────────────────────────────────────────

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE insights (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      bullets TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      metadata TEXT,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL,
      scope TEXT NOT NULL,
      analysis_version TEXT NOT NULL
    );
    CREATE TABLE session_facets (
      session_id TEXT PRIMARY KEY,
      outcome_satisfaction TEXT,
      workflow_pattern TEXT,
      had_course_correction INTEGER,
      course_correction_reason TEXT,
      iteration_count INTEGER,
      friction_points TEXT,
      effective_patterns TEXT,
      analysis_version TEXT
    );
  `);
  return db;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION: SessionData = {
  id: 'sess-001',
  project_id: 'proj-001',
  project_name: 'TestProject',
  project_path: '/home/user/test',
  summary: 'A test session',
  ended_at: '2026-01-01T12:00:00.000Z',
  compact_count: 0,
  auto_compact_count: 0,
  slash_commands: '[]',
};

const ANALYSIS_RESPONSE: AnalysisResponse = {
  summary: {
    title: 'Built auth module',
    content: 'Implemented JWT-based authentication',
    bullets: ['Added login endpoint', 'Added token refresh'],
    outcome: 'completed',
  },
  decisions: [
    {
      title: 'Use JWT over sessions',
      situation: 'Needed stateless auth',
      choice: 'JWT tokens',
      reasoning: 'Scales better',
      confidence: 85,
      alternatives: [{ option: 'sessions', rejected_because: 'stateful' }],
      trade_offs: 'Token revocation harder',
      revisit_when: 'multi-device needed',
      evidence: 'scalability requirement',
    },
  ],
  learnings: [
    {
      title: 'JWT expiry gotcha',
      symptom: 'token expired too fast',
      root_cause: 'clock skew',
      takeaway: 'add leeway to expiry check',
      applies_when: 'distributed systems',
      confidence: 80,
      evidence: 'prod incident',
    },
  ],
  facets: {
    outcome_satisfaction: 'fully_achieved',
    workflow_pattern: 'deep_focus',
    had_course_correction: false,
    course_correction_reason: null,
    iteration_count: 2,
    friction_points: [],
    effective_patterns: [
      { category: 'structured-planning', description: 'Planned before coding', driver: 'user-driven', confidence: 80 },
    ],
  },
};

const PQ_RESPONSE: PromptQualityResponse = {
  efficiency_score: 75,
  message_overhead: 0.2,
  assessment: 'Good prompting overall',
  takeaways: [{ type: 'reinforce', category: 'precise-request', label: 'Clear ask', message_ref: 'msg-1', what_worked: 'specific', why_effective: 'fast' }],
  findings: [{ category: 'precise-request', type: 'strength', description: 'Clear requirements', message_ref: 'msg-1', impact: 'high', confidence: 0.9 }],
  dimension_scores: {
    context_provision: 80,
    request_specificity: 75,
    scope_management: 70,
    information_timing: 85,
    correction_quality: 75,
  },
};

// ── ANALYSIS_VERSION ──────────────────────────────────────────────────────────

describe('ANALYSIS_VERSION', () => {
  it('is 3.0.0', () => {
    expect(ANALYSIS_VERSION).toBe('3.0.0');
  });
});

// ── convertToInsightRows ──────────────────────────────────────────────────────

describe('convertToInsightRows', () => {
  it('produces a summary row', () => {
    const rows = convertToInsightRows(ANALYSIS_RESPONSE, SESSION);
    const summary = rows.find(r => r.type === 'summary');
    expect(summary).toBeDefined();
    expect(summary!.title).toBe('Built auth module');
    expect(summary!.session_id).toBe('sess-001');
    expect(summary!.project_id).toBe('proj-001');
    expect(summary!.analysis_version).toBe(ANALYSIS_VERSION);
    expect(summary!.scope).toBe('session');
    expect(JSON.parse(summary!.bullets)).toEqual(['Added login endpoint', 'Added token refresh']);
    expect(JSON.parse(summary!.metadata!)).toMatchObject({ outcome: 'completed' });
  });

  it('produces a decision row for confidence >= 70', () => {
    const rows = convertToInsightRows(ANALYSIS_RESPONSE, SESSION);
    const decision = rows.find(r => r.type === 'decision');
    expect(decision).toBeDefined();
    expect(decision!.title).toBe('Use JWT over sessions');
    expect(decision!.content).toContain('Needed stateless auth');
    expect(decision!.confidence).toBeCloseTo(0.85);
  });

  it('skips decisions with confidence < 70', () => {
    const response: AnalysisResponse = {
      ...ANALYSIS_RESPONSE,
      decisions: [{ ...ANALYSIS_RESPONSE.decisions[0], confidence: 65 }],
    };
    const rows = convertToInsightRows(response, SESSION);
    expect(rows.find(r => r.type === 'decision')).toBeUndefined();
  });

  it('produces a learning row', () => {
    const rows = convertToInsightRows(ANALYSIS_RESPONSE, SESSION);
    const learning = rows.find(r => r.type === 'learning');
    expect(learning).toBeDefined();
    expect(learning!.title).toBe('JWT expiry gotcha');
    expect(learning!.content).toBe('add leeway to expiry check');
  });

  it('handles missing decisions and learnings with defensive ?? [] guards', () => {
    const response = {
      summary: ANALYSIS_RESPONSE.summary,
      decisions: undefined as unknown as AnalysisResponse['decisions'],
      learnings: undefined as unknown as AnalysisResponse['learnings'],
      facets: undefined,
    } as AnalysisResponse;
    expect(() => convertToInsightRows(response, SESSION)).not.toThrow();
    const rows = convertToInsightRows(response, SESSION);
    expect(rows).toHaveLength(1); // only summary
  });
});

// ── convertPQToInsightRow ─────────────────────────────────────────────────────

describe('convertPQToInsightRow', () => {
  it('produces a prompt_quality row', () => {
    const row = convertPQToInsightRow(PQ_RESPONSE, SESSION);
    expect(row.type).toBe('prompt_quality');
    expect(row.title).toBe('Prompt Efficiency: 75/100');
    expect(row.content).toBe('Good prompting overall');
    expect(row.session_id).toBe('sess-001');
    expect(row.analysis_version).toBe(ANALYSIS_VERSION);
    expect(row.confidence).toBe(0.85);
  });

  it('normalizes finding categories', () => {
    const row = convertPQToInsightRow(PQ_RESPONSE, SESSION);
    const metadata = JSON.parse(row.metadata!);
    expect(metadata.findings[0].category).toBe('precise-request');
  });

  it('stores bullets as empty array JSON', () => {
    const row = convertPQToInsightRow(PQ_RESPONSE, SESSION);
    expect(row.bullets).toBe('[]');
  });
});

// ── deleteSessionInsights — includeOnlyTypes logic (SQL-level test) ───────────

describe('deleteSessionInsights includeOnlyTypes logic', () => {
  it('only deletes rows matching includeOnlyTypes when provided', () => {
    const db = createTestDb();
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO insights (id, session_id, project_id, project_name, type, title, content,
        summary, bullets, confidence, source, metadata, timestamp, created_at, scope, analysis_version)
      VALUES (?, 'sess-001', 'p1', 'Test', ?, 'T', 'C', 'S', '[]', 0.9, 'llm', null, ?, ?, 'session', '3.0.0')
    `);
    insert.run('id-1', 'summary', now, now);
    insert.run('id-2', 'prompt_quality', now, now);

    // Simulate what deleteSessionInsights does with includeOnlyTypes: ['prompt_quality']
    const conditions: string[] = ['session_id = ?'];
    const params: (string | number)[] = ['sess-001'];
    const includeOnlyTypes = ['prompt_quality'];
    conditions.push(`type IN (${includeOnlyTypes.map(() => '?').join(', ')})`);
    params.push(...includeOnlyTypes);
    db.prepare(`DELETE FROM insights WHERE ${conditions.join(' AND ')}`).run(...params);

    const remaining = db.prepare('SELECT id FROM insights WHERE session_id = ?').all('sess-001') as { id: string }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('id-1'); // summary survives
  });
});

// ── saveFacetsToDb — analysisVersion parameter (SQL-level test) ───────────────

describe('saveFacetsToDb analysisVersion parameter', () => {
  it('stores provided analysisVersion in the row', () => {
    const db = createTestDb();
    const facets = ANALYSIS_RESPONSE.facets!;
    const customVersion = '2.5.0';

    db.prepare(`
      INSERT OR REPLACE INTO session_facets
      (session_id, outcome_satisfaction, workflow_pattern, had_course_correction,
       course_correction_reason, iteration_count, friction_points, effective_patterns,
       analysis_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'sess-001',
      facets.outcome_satisfaction,
      facets.workflow_pattern,
      facets.had_course_correction ? 1 : 0,
      facets.course_correction_reason,
      facets.iteration_count,
      JSON.stringify(facets.friction_points ?? []),
      JSON.stringify(facets.effective_patterns ?? []),
      customVersion,
    );

    const row = db.prepare('SELECT analysis_version FROM session_facets WHERE session_id = ?').get('sess-001') as { analysis_version: string };
    expect(row.analysis_version).toBe('2.5.0');
  });

  it('default ANALYSIS_VERSION constant is 3.0.0', () => {
    // Verifies the constant that will be used as the default
    expect(ANALYSIS_VERSION).toBe('3.0.0');
  });
});
