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
const { buildPeriodFilter, buildWhereClause, getAggregatedData, parseIsoWeek, formatIsoWeek } = await import('./shared-aggregation.js');

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
  it('returns deleted_at filter for "all" with no filters', () => {
    const { where, params } = buildWhereClause('all');
    expect(where).toBe('WHERE s.deleted_at IS NULL');
    expect(params).toEqual([]);
  });

  it('adds period filter for non-all periods', () => {
    const { where, params } = buildWhereClause('30d');
    expect(where).toMatch(/^WHERE s\.deleted_at IS NULL AND s\.started_at >= \?$/);
    expect(params).toHaveLength(1);
    expect(typeof params[0]).toBe('string');
  });

  it('adds project filter when project is provided', () => {
    const { where, params } = buildWhereClause('all', 'proj-123');
    expect(where).toBe('WHERE s.deleted_at IS NULL AND s.project_id = ?');
    expect(params).toEqual(['proj-123']);
  });

  it('adds source filter when source is provided', () => {
    const { where, params } = buildWhereClause('all', undefined, 'cursor');
    expect(where).toBe('WHERE s.deleted_at IS NULL AND s.source_tool = ?');
    expect(params).toEqual(['cursor']);
  });

  it('combines all filters with AND', () => {
    const { where, params } = buildWhereClause('7d', 'proj-abc', 'claude-code');
    expect(where).toMatch(/^WHERE s\.deleted_at IS NULL AND s\.started_at >= \? AND s\.project_id = \? AND s\.source_tool = \?$/);
    expect(params).toHaveLength(3);
    expect(params[1]).toBe('proj-abc');
    expect(params[2]).toBe('claude-code');
  });

  it('combines period + project without source', () => {
    const { where, params } = buildWhereClause('30d', 'proj-x');
    expect(where).toMatch(/^WHERE s\.deleted_at IS NULL AND s\.started_at >= \? AND s\.project_id = \?$/);
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

    // type-error aliases to knowledge-gap, so both sessions merge under knowledge-gap
    const knowledgeGap = result.frictionCategories.find(fc => fc.category === 'knowledge-gap');
    expect(knowledgeGap).toBeDefined();
    expect(knowledgeGap!.count).toBe(2);
    expect(knowledgeGap!.examples).toHaveLength(2);
  });

  it('aggregates effective patterns with frequency', () => {
    seedSessionWithFacets(testDb, 'sess-1', {
      effectivePatterns: [
        { category: 'context-gathering', description: 'Read file before editing', confidence: 90 },
      ],
    });
    seedSessionWithFacets(testDb, 'sess-2', {
      effectivePatterns: [
        { category: 'context-gathering', description: 'Read file before editing', confidence: 85 },
        { category: 'verification-workflow', description: 'Run tests after changes', confidence: 95 },
      ],
    });

    const result = getAggregatedData(testDb, '', []);

    const readFile = result.effectivePatterns.find(ep => ep.category === 'context-gathering');
    expect(readFile).toBeDefined();
    expect(readFile!.frequency).toBe(2);
    expect(readFile!.label).toBe('Context Gathering');
    expect(readFile!.descriptions).toContain('Read file before editing');

    const runTests = result.effectivePatterns.find(ep => ep.category === 'verification-workflow');
    expect(runTests).toBeDefined();
    expect(runTests!.frequency).toBe(1);
    expect(runTests!.label).toBe('Verification Workflow');
    expect(runTests!.descriptions).toContain('Run tests after changes');
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

  it('normalizes similar friction categories via Levenshtein and aliases', () => {
    // "wrong-aproach" (typo, distance 1 from "wrong-approach") normalizes via Levenshtein
    // "type-error" normalizes to "knowledge-gap" via alias
    seedSessionWithFacets(testDb, 'sess-1', {
      frictionPoints: [
        { category: 'wrong-aproach', description: 'typo in category', severity: 'low', resolution: 'resolved' },
      ],
    });
    seedSessionWithFacets(testDb, 'sess-2', {
      frictionPoints: [
        { category: 'wrong-approach', description: 'real wrong approach', severity: 'medium', resolution: 'resolved' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);
    // Both should be merged under "wrong-approach"
    const wrongApproach = result.frictionCategories.find(fc => fc.category === 'wrong-approach');
    expect(wrongApproach).toBeDefined();
    expect(wrongApproach!.count).toBe(2);
  });

  // ────────────────────────────────────────────────────
  // rateLimitInfo — rate limit filtering
  // ────────────────────────────────────────────────────

  it('returns null rateLimitInfo when no rate limit friction exists', () => {
    seedSessionWithFacets(testDb, 'sess-1', {
      frictionPoints: [
        { category: 'type-error', description: 'TS issue', severity: 'medium', resolution: 'resolved' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);
    expect(result.rateLimitInfo).toBeNull();
  });

  it('partitions rate-limit-hit out of frictionCategories and into rateLimitInfo', () => {
    seedSessionWithFacets(testDb, 'sess-1', {
      frictionPoints: [
        { category: 'rate-limit-hit', description: 'Hit rate limit during review', severity: 'high', resolution: 'resolved' },
        { category: 'type-error', description: 'TS strict issue', severity: 'medium', resolution: 'resolved' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);

    // rate-limit-hit should NOT appear in frictionCategories
    const rateLimit = result.frictionCategories.find(fc => fc.category === 'rate-limit-hit');
    expect(rateLimit).toBeUndefined();

    // type-error aliases to knowledge-gap and should still be present
    const knowledgeGap = result.frictionCategories.find(fc => fc.category === 'knowledge-gap');
    expect(knowledgeGap).toBeDefined();

    // rateLimitInfo should be populated
    expect(result.rateLimitInfo).not.toBeNull();
    expect(result.rateLimitInfo!.count).toBe(1);
    expect(result.rateLimitInfo!.sessionsAffected).toBe(1);
    expect(result.rateLimitInfo!.examples).toHaveLength(1);
    expect(result.rateLimitInfo!.examples[0]).toBe('Hit rate limit during review');
  });

  it('clusters rate limit alias variants via alias map before partitioning', () => {
    // "api-rate-limit" and "rate-limiting" are aliases → both normalize to "rate-limit-hit"
    seedSessionWithFacets(testDb, 'sess-1', {
      frictionPoints: [
        { category: 'api-rate-limit', description: 'Rate limited during review cycle', severity: 'high', resolution: 'resolved' },
      ],
    });
    seedSessionWithFacets(testDb, 'sess-2', {
      frictionPoints: [
        { category: 'rate-limiting', description: 'Session paused due to rate limits', severity: 'medium', resolution: 'resolved' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);

    // Neither alias should appear in frictionCategories
    const rawRateLimit = result.frictionCategories.find(
      fc => fc.category === 'api-rate-limit' || fc.category === 'rate-limiting' || fc.category === 'rate-limit-hit'
    );
    expect(rawRateLimit).toBeUndefined();

    // rateLimitInfo should aggregate both
    expect(result.rateLimitInfo).not.toBeNull();
    expect(result.rateLimitInfo!.count).toBe(2);
    expect(result.rateLimitInfo!.sessionsAffected).toBe(2);
  });

  it('counts sessionsAffected as unique sessions (not friction point count)', () => {
    // One session with two rate limit friction points
    seedSessionWithFacets(testDb, 'sess-1', {
      frictionPoints: [
        { category: 'rate-limit-hit', description: 'First rate limit', severity: 'high', resolution: 'resolved' },
        { category: 'rate-limit-hit', description: 'Second rate limit same session', severity: 'medium', resolution: 'resolved' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);

    expect(result.rateLimitInfo).not.toBeNull();
    expect(result.rateLimitInfo!.count).toBe(2);      // 2 friction point occurrences
    expect(result.rateLimitInfo!.sessionsAffected).toBe(1); // only 1 unique session
  });

  it('catches regex-variant rate limit categories not covered by alias map or Levenshtein', () => {
    // "throttled-by-api" is a creative LLM variant that bypasses both the alias map
    // and Levenshtein clustering (it's not close enough to "rate-limit-hit").
    // The regex sweep (/rate.?limit|throttl/i) must catch it.
    seedSessionWithFacets(testDb, 'sess-1', {
      frictionPoints: [
        { category: 'throttled-by-api', description: 'API throttled mid-session', severity: 'high', resolution: 'workaround' },
        { category: 'type-error', description: 'TS type mismatch', severity: 'medium', resolution: 'resolved' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);

    // "throttled-by-api" must NOT appear in frictionCategories
    const throttled = result.frictionCategories.find(fc => fc.category === 'throttled-by-api');
    expect(throttled).toBeUndefined();

    // It must be captured in rateLimitInfo
    expect(result.rateLimitInfo).not.toBeNull();
    expect(result.rateLimitInfo!.count).toBe(1);
    expect(result.rateLimitInfo!.sessionsAffected).toBe(1);
    expect(result.rateLimitInfo!.examples[0]).toBe('API throttled mid-session');

    // type-error aliases to knowledge-gap — unrelated friction should remain
    const knowledgeGap = result.frictionCategories.find(fc => fc.category === 'knowledge-gap');
    expect(knowledgeGap).toBeDefined();
  });

  it('returns pqDeficits and pqStrengths as empty arrays when no PQ insights exist', () => {
    seedSessionWithFacets(testDb, 'sess-1');
    const result = getAggregatedData(testDb, '', []);
    expect(result.pqDeficits).toEqual([]);
    expect(result.pqStrengths).toEqual([]);
  });

  it('counts streak as 0 when no sessions exist', () => {
    const result = getAggregatedData(testDb, '', []);
    expect(result.streak).toBe(0);
  });

  it('counts sourceToolCount correctly and returns sourceTools as string[]', () => {
    seedSessionWithFacets(testDb, 'sess-cc', { sourceTool: 'claude-code' });
    seedSessionWithFacets(testDb, 'sess-cur', { sourceTool: 'cursor' });

    const result = getAggregatedData(testDb, '', []);
    expect(result.sourceToolCount).toBe(2);
    expect(Array.isArray(result.sourceTools)).toBe(true);
    expect(result.sourceTools).toHaveLength(2);
    expect(result.sourceTools).toContain('claude-code');
    expect(result.sourceTools).toContain('cursor');
  });

  it('skips effective patterns with confidence below 50', () => {
    seedSessionWithFacets(testDb, 'sess-1', {
      effectivePatterns: [
        { category: 'context-gathering', description: 'Low confidence pattern', confidence: 30, driver: 'ai-driven' },
        { category: 'verification-workflow', description: 'High confidence pattern', confidence: 75, driver: 'user-driven' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);
    const lowConf = result.effectivePatterns.find(ep => ep.descriptions.includes('Low confidence pattern'));
    expect(lowConf).toBeUndefined();

    const highConf = result.effectivePatterns.find(ep => ep.category === 'verification-workflow');
    expect(highConf).toBeDefined();
  });

  it('tracks driver breakdown per effective pattern category', () => {
    seedSessionWithFacets(testDb, 'sess-1', {
      effectivePatterns: [
        { category: 'context-gathering', description: 'AI gathered context', confidence: 80, driver: 'ai-driven' },
      ],
    });
    seedSessionWithFacets(testDb, 'sess-2', {
      effectivePatterns: [
        { category: 'context-gathering', description: 'User gathered context', confidence: 85, driver: 'user-driven' },
      ],
    });

    const result = getAggregatedData(testDb, '', []);
    const pattern = result.effectivePatterns.find(ep => ep.category === 'context-gathering');
    expect(pattern).toBeDefined();
    expect(pattern!.drivers['ai-driven']).toBe(1);
    expect(pattern!.drivers['user-driven']).toBe(1);
  });
});

// ──────────────────────────────────────────────────────
// parseIsoWeek
// ──────────────────────────────────────────────────────

describe('parseIsoWeek', () => {
  it('returns null for invalid input', () => {
    expect(parseIsoWeek('not-a-week')).toBeNull();
    expect(parseIsoWeek('')).toBeNull();
    expect(parseIsoWeek('2026-10')).toBeNull();
    expect(parseIsoWeek('W10')).toBeNull();
  });

  it('returns null for out-of-range week numbers', () => {
    expect(parseIsoWeek('2026-W00')).toBeNull();
    expect(parseIsoWeek('2026-W54')).toBeNull();
  });

  it('parses a valid ISO week and returns Monday/Sunday boundaries', () => {
    // 2026-W10: March 2 (Mon) to March 9 (Mon exclusive)
    const result = parseIsoWeek('2026-W10');
    expect(result).not.toBeNull();
    expect(result!.start.toISOString()).toBe('2026-03-02T00:00:00.000Z');
    expect(result!.end.toISOString()).toBe('2026-03-09T00:00:00.000Z');
  });

  it('parses week 1 (first week of year) correctly', () => {
    // ISO week 1 of 2026: contains January 1 (Thursday) → starts Dec 29, 2025 (Mon)
    const result = parseIsoWeek('2026-W01');
    expect(result).not.toBeNull();
    // start should be a Monday
    expect(result!.start.getUTCDay()).toBe(1);
    // end is exactly 7 days after start
    expect(result!.end.getTime() - result!.start.getTime()).toBe(7 * 86400000);
  });

  it('returns start that is a Monday (UTC)', () => {
    const result = parseIsoWeek('2025-W25');
    expect(result).not.toBeNull();
    expect(result!.start.getUTCDay()).toBe(1); // Monday
  });

  it('returns end that is exactly 7 days after start', () => {
    const result = parseIsoWeek('2025-W30');
    expect(result).not.toBeNull();
    expect(result!.end.getTime() - result!.start.getTime()).toBe(7 * 86400000);
  });
});

// ──────────────────────────────────────────────────────
// formatIsoWeek
// ──────────────────────────────────────────────────────

describe('formatIsoWeek', () => {
  it('formats a known Monday date as the correct ISO week string', () => {
    // 2026-03-02 is Monday of ISO week 10, 2026
    const monday = new Date('2026-03-02T00:00:00.000Z');
    expect(formatIsoWeek(monday)).toBe('2026-W10');
  });

  it('pads single-digit week numbers with leading zero', () => {
    // 2026-01-05 is Monday of ISO week 2, 2026
    const monday = new Date('2026-01-05T00:00:00.000Z');
    const result = formatIsoWeek(monday);
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
    expect(result).toBe('2026-W02');
  });

  it('round-trips with parseIsoWeek', () => {
    // formatIsoWeek(parseIsoWeek(week).start) === week
    const original = '2025-W33';
    const parsed = parseIsoWeek(original);
    expect(parsed).not.toBeNull();
    const reformatted = formatIsoWeek(parsed!.start);
    expect(reformatted).toBe(original);
  });

  it('handles year boundary (ISO week belonging to previous year)', () => {
    // Dec 28, 2026 (Mon) — if this week's Thursday is Jan 1, 2027, week belongs to 2027
    // Dec 29, 2025 is the Monday of 2026-W01 (its Thursday Jan 1, 2026 is in 2026)
    const monday = new Date('2025-12-29T00:00:00.000Z');
    const result = formatIsoWeek(monday);
    // This Monday's Thursday is Jan 1, 2026 → belongs to 2026-W01
    expect(result).toBe('2026-W01');
  });
});

// ──────────────────────────────────────────────────────
// buildWhereClause — ISO week period
// ──────────────────────────────────────────────────────

describe('buildWhereClause — ISO week period', () => {
  it('generates two date boundary params for ISO week period', () => {
    const { where, params } = buildWhereClause('2026-W10');
    expect(where).toMatch(/s\.started_at >= \?/);
    expect(where).toMatch(/s\.started_at < \?/);
    expect(params).toHaveLength(2);
    // params[0] is start (2026-03-02), params[1] is end (2026-03-09)
    expect(params[0]).toBe('2026-03-02T00:00:00.000Z');
    expect(params[1]).toBe('2026-03-09T00:00:00.000Z');
  });

  it('combines ISO week period with project filter', () => {
    const { where, params } = buildWhereClause('2026-W10', 'proj-abc');
    expect(params).toHaveLength(3);
    expect(params[2]).toBe('proj-abc');
    expect(where).toContain('s.project_id = ?');
  });
});
