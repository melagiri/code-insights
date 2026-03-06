import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@code-insights/cli/db/schema';

// ──────────────────────────────────────────────────────
// Module-scoped mutable DB reference for mocking.
// ──────────────────────────────────────────────────────

let testDb: Database.Database;

vi.mock('@code-insights/cli/db/client', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Import AFTER mocks are declared
const { buildPeriodFilter, buildWhereClause, getAggregatedData } = await import('./shared-aggregation.js');

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function initTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seedSessionWithFacets(
  db: Database.Database,
  id: string,
  overrides: Partial<{
    projectId: string;
    projectName: string;
    startedAt: string;
    sourceTool: string;
    sessionCharacter: string;
    outcomeSatisfaction: string;
    workflowPattern: string | null;
    frictionPoints: unknown[];
    effectivePatterns: unknown[];
  }> = {},
) {
  const defaults = {
    projectId: 'proj-test',
    projectName: 'test-project',
    startedAt: '2025-06-15T10:00:00Z',
    sourceTool: 'claude-code',
    sessionCharacter: 'feature_build',
    outcomeSatisfaction: 'high',
    workflowPattern: 'plan-then-implement',
    frictionPoints: [],
    effectivePatterns: [],
  };
  const d = { ...defaults, ...overrides };

  // Ensure project exists
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, path, last_activity, session_count)
    VALUES (?, ?, ?, datetime('now'), 1)
  `).run(d.projectId, d.projectName, `/projects/${d.projectName}`);

  // Insert session
  db.prepare(`
    INSERT OR IGNORE INTO sessions (
      id, project_id, project_name, project_path, started_at, ended_at,
      message_count, user_message_count, assistant_message_count, tool_call_count,
      source_tool, session_character
    ) VALUES (?, ?, ?, ?, ?, ?, 10, 5, 5, 2, ?, ?)
  `).run(
    id, d.projectId, d.projectName, `/projects/${d.projectName}`,
    d.startedAt, '2025-06-15T11:00:00Z', d.sourceTool, d.sessionCharacter,
  );

  // Insert facets
  db.prepare(`
    INSERT OR IGNORE INTO session_facets (
      session_id, outcome_satisfaction, workflow_pattern,
      had_course_correction, iteration_count,
      friction_points, effective_patterns
    ) VALUES (?, ?, ?, 0, 0, ?, ?)
  `).run(
    id, d.outcomeSatisfaction, d.workflowPattern,
    JSON.stringify(d.frictionPoints), JSON.stringify(d.effectivePatterns),
  );
}

// ──────────────────────────────────────────────────────
// buildPeriodFilter
// ──────────────────────────────────────────────────────

describe('buildPeriodFilter', () => {
  it('returns null for "all" period', () => {
    expect(buildPeriodFilter('all')).toBeNull();
  });

  it('returns an ISO date string for "7d"', () => {
    const result = buildPeriodFilter('7d');
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getTime()).toBeLessThan(Date.now());
    // Should be roughly 7 days ago (within 1 second tolerance)
    const diff = Date.now() - date.getTime();
    expect(diff).toBeGreaterThan(6.99 * 86400000);
    expect(diff).toBeLessThan(7.01 * 86400000);
  });

  it('returns an ISO date string for "30d"', () => {
    const result = buildPeriodFilter('30d');
    expect(result).not.toBeNull();
    const diff = Date.now() - new Date(result!).getTime();
    expect(diff).toBeGreaterThan(29.99 * 86400000);
    expect(diff).toBeLessThan(30.01 * 86400000);
  });

  it('returns an ISO date string for "90d"', () => {
    const result = buildPeriodFilter('90d');
    expect(result).not.toBeNull();
    const diff = Date.now() - new Date(result!).getTime();
    expect(diff).toBeGreaterThan(89.99 * 86400000);
    expect(diff).toBeLessThan(90.01 * 86400000);
  });

  it('returns null for unknown period values', () => {
    expect(buildPeriodFilter('unknown')).toBeNull();
    expect(buildPeriodFilter('')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────
// buildWhereClause
// ──────────────────────────────────────────────────────

describe('buildWhereClause', () => {
  it('returns empty where and params for "all" with no filters', () => {
    const { where, params } = buildWhereClause('all');
    expect(where).toBe('');
    expect(params).toEqual([]);
  });

  it('adds period filter for non-all periods', () => {
    const { where, params } = buildWhereClause('30d');
    expect(where).toMatch(/^WHERE s\.started_at >= \?$/);
    expect(params).toHaveLength(1);
    expect(typeof params[0]).toBe('string');
  });

  it('adds project filter when project is provided', () => {
    const { where, params } = buildWhereClause('all', 'proj-123');
    expect(where).toBe('WHERE s.project_id = ?');
    expect(params).toEqual(['proj-123']);
  });

  it('adds source filter when source is provided', () => {
    const { where, params } = buildWhereClause('all', undefined, 'cursor');
    expect(where).toBe('WHERE s.source_tool = ?');
    expect(params).toEqual(['cursor']);
  });

  it('combines all filters with AND', () => {
    const { where, params } = buildWhereClause('7d', 'proj-abc', 'claude-code');
    expect(where).toMatch(/^WHERE s\.started_at >= \? AND s\.project_id = \? AND s\.source_tool = \?$/);
    expect(params).toHaveLength(3);
    expect(params[1]).toBe('proj-abc');
    expect(params[2]).toBe('claude-code');
  });

  it('combines period + project without source', () => {
    const { where, params } = buildWhereClause('30d', 'proj-x');
    expect(where).toMatch(/^WHERE s\.started_at >= \? AND s\.project_id = \?$/);
    expect(params).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────
// getAggregatedData
// ──────────────────────────────────────────────────────

describe('getAggregatedData', () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('returns zero counts when no data exists', () => {
    const result = getAggregatedData(testDb, '', []);
    expect(result.totalSessions).toBe(0);
    expect(result.totalAllSessions).toBe(0);
    expect(result.frictionTotal).toBe(0);
    expect(result.frictionCategories).toEqual([]);
    expect(result.effectivePatterns).toEqual([]);
  });

  it('counts totalSessions (with facets) and totalAllSessions separately', () => {
    // Session with facets
    seedSessionWithFacets(testDb, 'sess-1');
    // Session without facets (just a session row, no facet row)
    testDb.prepare(`
      INSERT INTO sessions (
        id, project_id, project_name, project_path, started_at, ended_at,
        message_count, user_message_count, assistant_message_count, tool_call_count,
        source_tool, session_character
      ) VALUES ('sess-no-facets', 'proj-test', 'test-project', '/projects/test',
        '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 5, 3, 2, 1, 'claude-code', 'quick_task')
    `).run();

    const result = getAggregatedData(testDb, '', []);
    expect(result.totalSessions).toBe(1);     // only the one with facets
    expect(result.totalAllSessions).toBe(2);   // both sessions
  });

  it('aggregates friction categories with counts and severity', () => {
    seedSessionWithFacets(testDb, 'sess-1', {
      frictionPoints: [
        { category: 'type-error', description: 'TS strict issue', severity: 'high', resolution: 'resolved' },
        { category: 'missing-dependency', description: 'forgot to install', severity: 'medium', resolution: 'resolved' },
      ],
    });
    seedSessionWithFacets(testDb, 'sess-2', {
      frictionPoints: [
        { category: 'type-error', description: 'Generic constraint', severity: 'medium', resolution: 'resolved' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);
    expect(result.frictionCategories.length).toBeGreaterThanOrEqual(2);
    expect(result.frictionTotal).toBe(3);

    // type-error should appear with count 2 (from both sessions)
    const typeError = result.frictionCategories.find(fc => fc.category === 'type-error');
    expect(typeError).toBeDefined();
    expect(typeError!.count).toBe(2);
    expect(typeError!.examples).toHaveLength(2);
  });

  it('aggregates effective patterns with frequency', () => {
    seedSessionWithFacets(testDb, 'sess-1', {
      effectivePatterns: [
        { description: 'Read file before editing', confidence: 90 },
      ],
    });
    seedSessionWithFacets(testDb, 'sess-2', {
      effectivePatterns: [
        { description: 'Read file before editing', confidence: 85 },
        { description: 'Run tests after changes', confidence: 95 },
      ],
    });

    const result = getAggregatedData(testDb, '', []);
    const readFile = result.effectivePatterns.find(ep => ep.description === 'Read file before editing');
    expect(readFile).toBeDefined();
    expect(readFile!.frequency).toBe(2);

    const runTests = result.effectivePatterns.find(ep => ep.description === 'Run tests after changes');
    expect(runTests).toBeDefined();
    expect(runTests!.frequency).toBe(1);
  });

  it('aggregates outcome distribution', () => {
    seedSessionWithFacets(testDb, 'sess-1', { outcomeSatisfaction: 'high' });
    seedSessionWithFacets(testDb, 'sess-2', { outcomeSatisfaction: 'high' });
    seedSessionWithFacets(testDb, 'sess-3', { outcomeSatisfaction: 'medium' });

    const result = getAggregatedData(testDb, '', []);
    expect(result.outcomeDistribution).toEqual({ high: 2, medium: 1 });
  });

  it('aggregates workflow distribution', () => {
    seedSessionWithFacets(testDb, 'sess-1', { workflowPattern: 'plan-then-implement' });
    seedSessionWithFacets(testDb, 'sess-2', { workflowPattern: 'debug-fix-verify' });
    seedSessionWithFacets(testDb, 'sess-3', { workflowPattern: 'plan-then-implement' });

    const result = getAggregatedData(testDb, '', []);
    expect(result.workflowDistribution).toEqual({
      'plan-then-implement': 2,
      'debug-fix-verify': 1,
    });
  });

  it('aggregates character distribution from sessions table', () => {
    seedSessionWithFacets(testDb, 'sess-1', { sessionCharacter: 'feature_build' });
    seedSessionWithFacets(testDb, 'sess-2', { sessionCharacter: 'bug_hunt' });
    seedSessionWithFacets(testDb, 'sess-3', { sessionCharacter: 'feature_build' });

    const result = getAggregatedData(testDb, '', []);
    expect(result.characterDistribution['feature_build']).toBe(2);
    expect(result.characterDistribution['bug_hunt']).toBe(1);
  });

  it('respects WHERE clause filtering', () => {
    seedSessionWithFacets(testDb, 'sess-a', { projectId: 'proj-alpha', projectName: 'alpha' });
    seedSessionWithFacets(testDb, 'sess-b', { projectId: 'proj-beta', projectName: 'beta' });

    const { where, params } = buildWhereClause('all', 'proj-alpha');
    const result = getAggregatedData(testDb, where, params);

    expect(result.totalSessions).toBe(1);
    expect(result.totalAllSessions).toBe(1);
  });

  it('normalizes similar friction categories via Levenshtein', () => {
    // "type-eror" (typo) should normalize to "type-error"
    seedSessionWithFacets(testDb, 'sess-1', {
      frictionPoints: [
        { category: 'type-eror', description: 'typo in category', severity: 'low', resolution: 'resolved' },
      ],
    });
    seedSessionWithFacets(testDb, 'sess-2', {
      frictionPoints: [
        { category: 'type-error', description: 'real type error', severity: 'medium', resolution: 'resolved' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);
    // Both should be merged under "type-error"
    const typeError = result.frictionCategories.find(fc => fc.category === 'type-error');
    expect(typeError).toBeDefined();
    expect(typeError!.count).toBe(2);
  });
});
