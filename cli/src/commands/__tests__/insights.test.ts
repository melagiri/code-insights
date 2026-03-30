import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate.js';

// ── Shared mocks ──────────────────────────────────────────────────────────────

let mockDb: Database.Database;

vi.mock('../../db/client.js', () => ({
  getDb: () => mockDb,
}));

vi.mock('../../utils/telemetry.js', () => ({
  trackEvent: vi.fn(),
  captureError: vi.fn(),
  classifyError: vi.fn(() => ({ error_type: 'unknown', error_message: 'unknown' })),
}));

vi.mock('../../utils/config.js', () => ({
  loadSyncState: () => ({ lastSync: '', files: {} }),
  saveSyncState: vi.fn(),
  getConfigDir: () => '/tmp',
  loadConfig: vi.fn(() => null),
}));

const mockInsertSession = vi.fn(() => true);
const mockInsertMessages = vi.fn();
vi.mock('../../db/write.js', () => ({
  insertSessionWithProjectAndReturnIsNew: mockInsertSession,
  insertMessages: mockInsertMessages,
  recalculateUsageStats: vi.fn(() => ({ sessionsWithUsage: 0 })),
}));

const mockValidate = vi.fn();
const mockRunAnalysis = vi.fn();
vi.mock('../../analysis/native-runner.js', () => {
  // Must use a real class (not vi.fn()) so `new ClaudeNativeRunner()` works
  class MockNativeRunner {
    readonly name = 'claude-code-native';
    runAnalysis = mockRunAnalysis;
    static validate = mockValidate;
  }
  return { ClaudeNativeRunner: MockNativeRunner };
});

const mockFromConfig = vi.fn();
const mockProviderRunAnalysis = vi.fn();
vi.mock('../../analysis/provider-runner.js', () => ({
  ProviderRunner: {
    fromConfig: () => {
      mockFromConfig();
      return { name: 'anthropic', runAnalysis: mockProviderRunAnalysis };
    },
  },
}));

const mockProvider = {
  parse: vi.fn(),
  getProviderName: vi.fn(() => 'claude-code'),
};
vi.mock('../../providers/registry.js', () => ({
  getProvider: vi.fn(() => mockProvider),
  getAllProviders: vi.fn(() => [mockProvider]),
}));

// ── Seed helpers ──────────────────────────────────────────────────────────────

function seedSession(db: Database.Database, id = 'sess1', messageCount = 10): void {
  db.exec(`
    INSERT OR IGNORE INTO projects (id, name, path, last_activity)
      VALUES ('p1', 'test-project', '/test', datetime('now'));
    INSERT OR IGNORE INTO sessions
      (id, project_id, project_name, project_path, started_at, ended_at, message_count)
      VALUES ('${id}', 'p1', 'test-project', '/test', datetime('now'), datetime('now'), ${messageCount});
  `);
}

function makeAnalysisResponse(): string {
  return JSON.stringify({
    summary: { title: 'Test session', content: 'Did things', bullets: [] },
    decisions: [],
    learnings: [],
    facets: {
      outcome_satisfaction: 'high',
      workflow_pattern: 'direct-execution',
      had_course_correction: false,
      course_correction_reason: null,
      iteration_count: 0,
      friction_points: [],
      effective_patterns: [],
    },
  });
}

function makePQResponse(): string {
  return JSON.stringify({
    efficiency_score: 75,
    assessment: 'Good prompting overall.',
    message_overhead: 0,
    takeaways: [],
    findings: [],
    dimension_scores: {
      context_provision: 80,
      request_specificity: 70,
      scope_management: 75,
      information_timing: 80,
      correction_quality: 75,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('V8 migration — session_message_count column', () => {
  it('adds session_message_count column to analysis_usage', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    db.exec(`
      INSERT INTO projects (id, name, path, last_activity)
        VALUES ('p1', 'test', '/test', datetime('now'));
      INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at)
        VALUES ('s1', 'p1', 'test', '/test', datetime('now'), datetime('now'));
    `);
    db.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model, session_message_count)
        VALUES ('s1', 'session', 'claude-code-native', 'claude-native', 10)
    `).run();

    const row = db.prepare(
      'SELECT session_message_count FROM analysis_usage WHERE session_id = ?'
    ).get('s1') as { session_message_count: number };

    expect(row.session_message_count).toBe(10);
    db.close();
  });

  it('double-apply leaves exactly one schema_version row per version (now up to 8)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    runMigrations(db);

    const rows = db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as Array<{ version: number }>;

    expect(rows.map(r => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    db.close();
  });

  it('session_message_count defaults to NULL when not provided', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    db.exec(`
      INSERT INTO projects (id, name, path, last_activity)
        VALUES ('p2', 'test', '/test', datetime('now'));
      INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at)
        VALUES ('s2', 'p2', 'test', '/test', datetime('now'), datetime('now'));
    `);
    db.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model)
        VALUES ('s2', 'session', 'anthropic', 'claude-sonnet-4-5')
    `).run();

    const row = db.prepare(
      'SELECT session_message_count FROM analysis_usage WHERE session_id = ?'
    ).get('s2') as { session_message_count: number | null };

    expect(row.session_message_count).toBeNull();
    db.close();
  });
});

describe('runInsightsCommand — provider mode (no --native)', () => {
  beforeEach(() => {
    mockDb = new Database(':memory:');
    runMigrations(mockDb);
    mockRunAnalysis.mockReset();
    mockProviderRunAnalysis.mockReset();
    mockFromConfig.mockReset();
    mockValidate.mockReset();
    mockInsertSession.mockReset();
    mockInsertMessages.mockReset();
    mockProvider.parse.mockReset();
  });

  it('calls ProviderRunner.fromConfig() when --native is false', async () => {
    seedSession(mockDb);
    mockProviderRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 100, inputTokens: 50, outputTokens: 50, model: 'gpt-4', provider: 'openai' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 80, inputTokens: 30, outputTokens: 30, model: 'gpt-4', provider: 'openai' });

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({ sessionId: 'sess1', native: false, quiet: true });

    expect(mockFromConfig).toHaveBeenCalledTimes(1);
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('saves insights to the database', async () => {
    seedSession(mockDb);
    mockProviderRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 100, inputTokens: 50, outputTokens: 50, model: 'gpt-4', provider: 'openai' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 80, inputTokens: 30, outputTokens: 30, model: 'gpt-4', provider: 'openai' });

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({ sessionId: 'sess1', native: false, quiet: true });

    const insights = mockDb.prepare('SELECT * FROM insights WHERE session_id = ?').all('sess1');
    // summary + prompt_quality
    expect(insights.length).toBeGreaterThanOrEqual(2);
  });

  it('records analysis_usage for session and prompt_quality', async () => {
    seedSession(mockDb);
    mockProviderRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 100, inputTokens: 50, outputTokens: 50, model: 'gpt-4', provider: 'openai' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 80, inputTokens: 30, outputTokens: 30, model: 'gpt-4', provider: 'openai' });

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({ sessionId: 'sess1', native: false, quiet: true });

    const usageRows = mockDb
      .prepare('SELECT analysis_type FROM analysis_usage WHERE session_id = ? ORDER BY analysis_type')
      .all('sess1') as Array<{ analysis_type: string }>;

    expect(usageRows.map(r => r.analysis_type)).toEqual(['prompt_quality', 'session']);
  });

  it('records session_message_count in analysis_usage (V8)', async () => {
    seedSession(mockDb, 'sess1', 12);
    mockProviderRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 100, inputTokens: 50, outputTokens: 50, model: 'gpt-4', provider: 'openai' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 80, inputTokens: 30, outputTokens: 30, model: 'gpt-4', provider: 'openai' });

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({ sessionId: 'sess1', native: false, quiet: true });

    const row = mockDb.prepare(
      `SELECT session_message_count FROM analysis_usage WHERE session_id = ? AND analysis_type = 'session'`
    ).get('sess1') as { session_message_count: number };

    expect(row.session_message_count).toBe(12);
  });

  it('throws if session not found in DB', async () => {
    const { runInsightsCommand } = await import('../insights.js');
    await expect(
      runInsightsCommand({ sessionId: 'nonexistent', native: false, quiet: true })
    ).rejects.toThrow(/not found/i);
  });
});

describe('runInsightsCommand — native mode (--native)', () => {
  beforeEach(() => {
    mockDb = new Database(':memory:');
    runMigrations(mockDb);
    mockRunAnalysis.mockReset();
    mockValidate.mockReset();
    mockFromConfig.mockReset();
    mockProviderRunAnalysis.mockReset();
    mockInsertSession.mockReset();
    mockInsertMessages.mockReset();
    mockProvider.parse.mockReset();
  });

  it('calls ClaudeNativeRunner.validate() and uses native runner', async () => {
    seedSession(mockDb);
    mockRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 200, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 150, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' });

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({ sessionId: 'sess1', native: true, quiet: true });

    expect(mockValidate).toHaveBeenCalledTimes(1);
    expect(mockFromConfig).not.toHaveBeenCalled();
    expect(mockRunAnalysis).toHaveBeenCalledTimes(2);
  });
});

describe('runInsightsCommand — --force flag', () => {
  beforeEach(() => {
    mockDb = new Database(':memory:');
    runMigrations(mockDb);
    mockProviderRunAnalysis.mockReset();
    mockFromConfig.mockReset();
    mockInsertSession.mockReset();
    mockInsertMessages.mockReset();
    mockProvider.parse.mockReset();
  });

  it('re-analyzes even if analysis_usage exists with matching message_count', async () => {
    seedSession(mockDb, 'sess1', 10);

    mockDb.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model, session_message_count)
        VALUES ('sess1', 'session', 'openai', 'gpt-4', 10)
    `).run();

    mockProviderRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 100, inputTokens: 50, outputTokens: 50, model: 'gpt-4', provider: 'openai' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 80, inputTokens: 30, outputTokens: 30, model: 'gpt-4', provider: 'openai' });

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({ sessionId: 'sess1', native: false, force: true, quiet: true });

    expect(mockProviderRunAnalysis).toHaveBeenCalledTimes(2);
  });
});

describe('runInsightsCommand — resume detection (hookMode)', () => {
  beforeEach(() => {
    mockDb = new Database(':memory:');
    runMigrations(mockDb);
    mockProviderRunAnalysis.mockReset();
    mockFromConfig.mockReset();
    mockInsertSession.mockReset();
    mockInsertMessages.mockReset();
    mockProvider.parse.mockReset();
  });

  it('skips analysis when message_count matches existing analysis_usage', async () => {
    seedSession(mockDb, 'sess1', 10);

    mockDb.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model, session_message_count)
        VALUES ('sess1', 'session', 'openai', 'gpt-4', 10)
    `).run();

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({
      sessionId: 'sess1',
      native: false,
      hookMode: true,
      quiet: true,
    });

    expect(mockProviderRunAnalysis).not.toHaveBeenCalled();
  });

  it('proceeds when message_count differs from analysis_usage', async () => {
    seedSession(mockDb, 'sess1', 15);

    mockDb.prepare(`
      INSERT INTO analysis_usage (session_id, analysis_type, provider, model, session_message_count)
        VALUES ('sess1', 'session', 'openai', 'gpt-4', 10)
    `).run();

    mockProviderRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 100, inputTokens: 50, outputTokens: 50, model: 'gpt-4', provider: 'openai' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 80, inputTokens: 30, outputTokens: 30, model: 'gpt-4', provider: 'openai' });

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({
      sessionId: 'sess1',
      native: false,
      hookMode: true,
      quiet: true,
    });

    expect(mockProviderRunAnalysis).toHaveBeenCalledTimes(2);
  });

  it('proceeds when no analysis_usage row exists', async () => {
    seedSession(mockDb, 'sess1', 8);

    mockProviderRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 100, inputTokens: 50, outputTokens: 50, model: 'gpt-4', provider: 'openai' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 80, inputTokens: 30, outputTokens: 30, model: 'gpt-4', provider: 'openai' });

    const { runInsightsCommand } = await import('../insights.js');
    await runInsightsCommand({
      sessionId: 'sess1',
      native: false,
      hookMode: true,
      quiet: true,
    });

    expect(mockProviderRunAnalysis).toHaveBeenCalledTimes(2);
  });
});

describe('syncSingleFile', () => {
  beforeEach(() => {
    mockDb = new Database(':memory:');
    runMigrations(mockDb);
    mockInsertSession.mockReset();
    mockInsertMessages.mockReset();
    mockProvider.parse.mockReset();
  });

  it('calls provider.parse() and inserts session and messages', async () => {
    const fakeSession = {
      id: 'parsed-sess',
      project_id: 'p1',
      project_name: 'test',
      project_path: '/test',
      messages: [{ id: 'm1', type: 'user', content: 'hello', timestamp: new Date().toISOString() }],
      messageCount: 5,
    };
    mockProvider.parse.mockResolvedValueOnce(fakeSession);
    mockInsertSession.mockReturnValue(true);

    const { syncSingleFile } = await import('../sync.js');
    await syncSingleFile({ filePath: '/path/to/session.jsonl' });

    expect(mockProvider.parse).toHaveBeenCalledWith('/path/to/session.jsonl');
    expect(mockInsertSession).toHaveBeenCalledWith(fakeSession, false);
    expect(mockInsertMessages).toHaveBeenCalledWith(fakeSession);
  });

  it('does nothing if provider.parse() returns null', async () => {
    mockProvider.parse.mockResolvedValueOnce(null);

    const { syncSingleFile } = await import('../sync.js');
    await syncSingleFile({ filePath: '/path/to/empty.jsonl' });

    expect(mockInsertSession).not.toHaveBeenCalled();
    expect(mockInsertMessages).not.toHaveBeenCalled();
  });
});

// ── insightsCheckCommand tests ────────────────────────────────────────────────

describe('insightsCheckCommand — count-based behavior', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockDb = new Database(':memory:');
    runMigrations(mockDb);
    mockRunAnalysis.mockReset();
    mockValidate.mockReset();
    mockFromConfig.mockReset();
    mockProviderRunAnalysis.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  function seedSessions(db: Database.Database, count: number, analyzedCount = 0): void {
    db.exec(`INSERT OR IGNORE INTO projects (id, name, path, last_activity) VALUES ('pc1', 'proj', '/p', datetime('now'));`);
    for (let i = 0; i < count; i++) {
      const sid = `chk-sess-${i}`;
      db.exec(`INSERT OR IGNORE INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count) VALUES ('${sid}', 'pc1', 'proj', '/p', datetime('now', '-${i} minutes'), datetime('now', '-${i} minutes'), 10);`);
      if (i < analyzedCount) {
        db.exec(`INSERT OR IGNORE INTO analysis_usage (session_id, analysis_type, provider, model) VALUES ('${sid}', 'session', 'openai', 'gpt-4');`);
      }
    }
  }

  it('exits silently when 0 unanalyzed sessions', async () => {
    seedSessions(mockDb, 2, 2);
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: false });
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('--quiet outputs just the count for unanalyzed sessions', async () => {
    seedSessions(mockDb, 5, 0);
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: true });
    const written = (stdoutSpy.mock.calls as Array<[unknown]>).map(c => String(c[0])).join('');
    expect(written.trim()).toBe('5');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('--quiet exits silently when 0 unanalyzed sessions', async () => {
    seedSessions(mockDb, 3, 3);
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: true });
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('prints count and suggest --analyze for 3-10 unanalyzed sessions', async () => {
    seedSessions(mockDb, 5, 0);
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: false });
    const output = (consoleSpy.mock.calls as Array<unknown[]>).map(c => String(c[0])).join('\n');
    expect(output).toContain('5');
    expect(output).toMatch(/insights check --analyze/i);
    // No time estimate for < 11 sessions
    expect(output).not.toMatch(/~\d+ min/i);
  });

  it('prints count + time estimate for 11+ unanalyzed sessions', async () => {
    seedSessions(mockDb, 12, 0);
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: false });
    const output = (consoleSpy.mock.calls as Array<unknown[]>).map(c => String(c[0])).join('\n');
    expect(output).toContain('12');
    expect(output).toMatch(/insights check --analyze/i);
    // Should have time estimate (~X min)
    expect(output).toMatch(/~\d/);
  });

  it('respects --days lookback window', async () => {
    mockDb.exec(`INSERT OR IGNORE INTO projects (id, name, path, last_activity) VALUES ('pd1', 'proj', '/p', datetime('now'));`);
    mockDb.exec(`INSERT OR IGNORE INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count) VALUES ('old-s', 'pd1', 'proj', '/p', datetime('now', '-8 days'), datetime('now', '-8 days'), 10);`);
    mockDb.exec(`INSERT OR IGNORE INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count) VALUES ('new-s', 'pd1', 'proj', '/p', datetime('now', '-1 days'), datetime('now', '-1 days'), 10);`);
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: true });
    const written = (stdoutSpy.mock.calls as Array<[unknown]>).map(c => String(c[0])).join('');
    expect(written.trim()).toBe('1');
  });
});

describe('insightsCheckCommand — auto-analyze (1-2 sessions)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockDb = new Database(':memory:');
    runMigrations(mockDb);
    mockRunAnalysis.mockReset();
    mockValidate.mockReset();
    mockProviderRunAnalysis.mockReset();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
  });

  function seedOne(db: Database.Database, id: string): void {
    db.exec(`INSERT OR IGNORE INTO projects (id, name, path, last_activity) VALUES ('pa1', 'proj', '/p', datetime('now'));`);
    db.exec(`INSERT OR IGNORE INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count) VALUES ('${id}', 'pa1', 'proj', '/p', datetime('now'), datetime('now'), 10);`);
  }

  it('auto-analyzes 1 unanalyzed session using native runner', async () => {
    seedOne(mockDb, 'auto-1');
    mockRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 500, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 400, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' });
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: false });
    expect(mockValidate).toHaveBeenCalledTimes(1);
    expect(mockRunAnalysis).toHaveBeenCalledTimes(2);
  });

  it('auto-analyzes 2 unanalyzed sessions using native runner', async () => {
    seedOne(mockDb, 'auto-2a');
    seedOne(mockDb, 'auto-2b');
    mockRunAnalysis
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 500, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 400, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 500, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 400, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' });
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: false });
    expect(mockValidate).toHaveBeenCalled();
    expect(mockRunAnalysis).toHaveBeenCalledTimes(4);
  });
});

describe('insightsCheckCommand — --analyze flag', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockDb = new Database(':memory:');
    runMigrations(mockDb);
    mockRunAnalysis.mockReset();
    mockValidate.mockReset();
    mockProviderRunAnalysis.mockReset();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  function seedSessions(db: Database.Database, count: number): void {
    db.exec(`INSERT OR IGNORE INTO projects (id, name, path, last_activity) VALUES ('pb1', 'proj', '/p', datetime('now'));`);
    for (let i = 0; i < count; i++) {
      db.exec(`INSERT OR IGNORE INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count) VALUES ('an-sess-${i}', 'pb1', 'proj', '/p', datetime('now', '-${i} minutes'), datetime('now', '-${i} minutes'), 10);`);
    }
  }

  it('processes all sessions with --analyze and shows [N/total] progress', async () => {
    seedSessions(mockDb, 3);
    for (let i = 0; i < 3; i++) {
      mockRunAnalysis
        .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 1000, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
        .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 800, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' });
    }
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: false, analyze: true });
    // Progress lines go to process.stdout.write
    const stdoutOutput = (stdoutSpy.mock.calls as Array<[unknown]>).map(c => String(c[0])).join('');
    expect(stdoutOutput).toMatch(/\[1\/3\]/);
    expect(stdoutOutput).toMatch(/\[2\/3\]/);
    expect(stdoutOutput).toMatch(/\[3\/3\]/);
    // Summary line goes to console.log
    const logOutput = (consoleSpy.mock.calls as Array<unknown[]>).map(c => String(c[0])).join('\n');
    expect(logOutput).toMatch(/Analyzed 3 session/i);
  });

  it('continues processing after one session fails', async () => {
    seedSessions(mockDb, 3);
    mockRunAnalysis
      .mockRejectedValueOnce(new Error('fail on session 0'))
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 1000, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 800, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
      .mockResolvedValueOnce({ rawJson: makeAnalysisResponse(), durationMs: 1000, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' })
      .mockResolvedValueOnce({ rawJson: makePQResponse(), durationMs: 800, inputTokens: 0, outputTokens: 0, model: 'claude-native', provider: 'claude-code-native' });
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: false, analyze: true });
    const stdoutOutput = (stdoutSpy.mock.calls as Array<[unknown]>).map(c => String(c[0])).join('');
    const errOutput = (consoleErrSpy.mock.calls as Array<unknown[]>).map(c => String(c[0])).join('\n');
    const logOutput = (consoleSpy.mock.calls as Array<unknown[]>).map(c => String(c[0])).join('\n');
    expect(stdoutOutput).toMatch(/\[1\/3\]/);
    expect(errOutput).toMatch(/fail on session 0/i);
    expect(logOutput).toMatch(/Analyzed 2 session/i);
  });

  it('exits silently with --analyze when 0 unanalyzed sessions', async () => {
    const { insightsCheckCommand } = await import('../insights.js');
    await insightsCheckCommand({ days: 7, quiet: false, analyze: true });
    expect(mockRunAnalysis).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
