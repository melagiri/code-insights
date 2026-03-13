import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, makeParsedSession, makeParsedMessage } from '../__fixtures__/db/seed.js';

// ──────────────────────────────────────────────────────
// Module-scoped mutable DB reference.
//
// vi.mock() is hoisted above imports, so the mock factory runs
// at module-evaluation time. We use a module-scoped variable
// that beforeEach updates, and the mocked getDb() reads via
// closure at call time (not capture time).
// ──────────────────────────────────────────────────────

let testDb: Database.Database;

vi.mock('./client.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

vi.mock('../utils/device.js', () => ({
  getDeviceId: () => 'test-device-id',
  getDeviceInfo: () => ({
    deviceId: 'test-device',
    hostname: 'test-host',
    platform: 'darwin',
    username: 'testuser',
  }),
  generateStableProjectId: (path: string) => ({
    projectId: 'proj-' + path.split('/').pop(),
    source: 'path-hash' as const,
    gitRemoteUrl: null,
  }),
  getGitRemoteUrl: () => null,
}));

// Dynamic imports AFTER mocks are declared — vitest hoists vi.mock()
// above these imports, so the modules receive the mocked dependencies.
const { sessionExists, getSessions, getProjects, getLastSession, getSessionCount, getProjectList, getDeletedSessionCount } = await import('./read.js');
const { insertSessionWithProject, insertMessages } = await import('./write.js');

// ──────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────

describe('Database read/write operations', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  // ────────────────────────────────────────────────────
  // insertSessionWithProject + sessionExists
  // ────────────────────────────────────────────────────

  describe('insertSessionWithProject', () => {
    it('inserts a session that can be verified with sessionExists', () => {
      const session = makeParsedSession();
      insertSessionWithProject(session);

      expect(sessionExists(session.id)).toBe(true);
    });

    it('returns false from sessionExists for unknown session IDs', () => {
      expect(sessionExists('nonexistent-id')).toBe(false);
    });

    it('upserts without error when inserting the same session twice', () => {
      const session = makeParsedSession();
      insertSessionWithProject(session);
      expect(() => insertSessionWithProject(session)).not.toThrow();

      // Still exactly one session row
      const sessions = getSessions();
      expect(sessions).toHaveLength(1);
    });

    it('inserts the project record alongside the session', () => {
      const session = makeParsedSession({ projectName: 'alpha-project' });
      insertSessionWithProject(session);

      const projects = getProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('alpha-project');
      expect(projects[0].session_count).toBe(1);
    });

    it('increments project session_count for new sessions', () => {
      const s1 = makeParsedSession({ id: 'session-001' });
      const s2 = makeParsedSession({ id: 'session-002' });

      insertSessionWithProject(s1);
      insertSessionWithProject(s2);

      const projects = getProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].session_count).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────
  // getSessions
  // ────────────────────────────────────────────────────

  describe('getSessions', () => {
    it('returns inserted sessions with correct field mapping', () => {
      const session = makeParsedSession({
        id: 'sess-abc',
        projectName: 'test-proj',
        messageCount: 10,
        userMessageCount: 5,
        assistantMessageCount: 5,
        toolCallCount: 3,
        sourceTool: 'claude-code',
        generatedTitle: 'My Title',
        sessionCharacter: 'bug_hunt',
      });

      insertSessionWithProject(session);

      const rows = getSessions();
      expect(rows).toHaveLength(1);

      const row = rows[0];
      expect(row.id).toBe('sess-abc');
      expect(row.projectName).toBe('test-proj');
      expect(row.messageCount).toBe(10);
      expect(row.userMessageCount).toBe(5);
      expect(row.assistantMessageCount).toBe(5);
      expect(row.toolCallCount).toBe(3);
      expect(row.sourceTool).toBe('claude-code');
      expect(row.generatedTitle).toBe('My Title');
      expect(row.sessionCharacter).toBe('bug_hunt');
    });

    it('returns sessions ordered by started_at descending', () => {
      const earlier = makeParsedSession({
        id: 'session-earlier',
        startedAt: new Date('2025-06-14T09:00:00Z'),
        endedAt: new Date('2025-06-14T10:00:00Z'),
      });
      const later = makeParsedSession({
        id: 'session-later',
        startedAt: new Date('2025-06-15T09:00:00Z'),
        endedAt: new Date('2025-06-15T10:00:00Z'),
      });

      insertSessionWithProject(earlier);
      insertSessionWithProject(later);

      const rows = getSessions();
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('session-later');
      expect(rows[1].id).toBe('session-earlier');
    });

    it('filters sessions by sourceTool', () => {
      const claude = makeParsedSession({ id: 'sess-claude', sourceTool: 'claude-code' });
      const cursor = makeParsedSession({ id: 'sess-cursor', sourceTool: 'cursor' });

      insertSessionWithProject(claude);
      insertSessionWithProject(cursor);

      const claudeOnly = getSessions({ sourceTool: 'claude-code' });
      expect(claudeOnly).toHaveLength(1);
      expect(claudeOnly[0].id).toBe('sess-claude');

      const cursorOnly = getSessions({ sourceTool: 'cursor' });
      expect(cursorOnly).toHaveLength(1);
      expect(cursorOnly[0].id).toBe('sess-cursor');
    });

    it('filters sessions by periodStart', () => {
      const old = makeParsedSession({
        id: 'sess-old',
        startedAt: new Date('2025-01-01T00:00:00Z'),
        endedAt: new Date('2025-01-01T01:00:00Z'),
      });
      const recent = makeParsedSession({
        id: 'sess-recent',
        startedAt: new Date('2025-06-15T00:00:00Z'),
        endedAt: new Date('2025-06-15T01:00:00Z'),
      });

      insertSessionWithProject(old);
      insertSessionWithProject(recent);

      const filtered = getSessions({ periodStart: new Date('2025-06-01T00:00:00Z') });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('sess-recent');
    });

    it('returns empty array when no sessions exist', () => {
      const rows = getSessions();
      expect(rows).toEqual([]);
    });

    it('maps usage fields correctly when present', () => {
      const session = makeParsedSession({
        id: 'sess-usage',
        usage: {
          totalInputTokens: 1000,
          totalOutputTokens: 2000,
          cacheCreationTokens: 300,
          cacheReadTokens: 400,
          estimatedCostUsd: 0.05,
          modelsUsed: ['claude-3-opus', 'claude-3-sonnet'],
          primaryModel: 'claude-3-opus',
          usageSource: 'jsonl',
        },
      });

      insertSessionWithProject(session);

      const rows = getSessions();
      expect(rows).toHaveLength(1);

      const row = rows[0];
      expect(row.totalInputTokens).toBe(1000);
      expect(row.totalOutputTokens).toBe(2000);
      expect(row.cacheCreationTokens).toBe(300);
      expect(row.cacheReadTokens).toBe(400);
      expect(row.estimatedCostUsd).toBe(0.05);
      expect(row.primaryModel).toBe('claude-3-opus');
      expect(row.modelsUsed).toEqual(['claude-3-opus', 'claude-3-sonnet']);
      expect(row.usageSource).toBe('jsonl');
    });

    it('returns undefined for optional usage fields when not present', () => {
      const session = makeParsedSession({ id: 'sess-no-usage' });
      // no usage set
      insertSessionWithProject(session);

      const rows = getSessions();
      const row = rows[0];

      expect(row.totalInputTokens).toBeUndefined();
      expect(row.totalOutputTokens).toBeUndefined();
      expect(row.estimatedCostUsd).toBeUndefined();
      expect(row.primaryModel).toBeUndefined();
      expect(row.modelsUsed).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────
  // getProjects
  // ────────────────────────────────────────────────────

  describe('getProjects', () => {
    it('returns inserted projects with correct fields', () => {
      insertSessionWithProject(makeParsedSession({ projectName: 'my-app' }));

      const projects = getProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toEqual(
        expect.objectContaining({
          name: 'my-app',
          session_count: 1,
        }),
      );
      expect(projects[0].id).toBeDefined();
      expect(projects[0].path).toBeDefined();
      expect(projects[0].last_activity).toBeDefined();
    });

    it('returns empty array when no projects exist', () => {
      expect(getProjects()).toEqual([]);
    });

    it('returns projects ordered by last_activity descending', () => {
      const older = makeParsedSession({
        id: 'sess-a',
        projectPath: '/projects/alpha',
        projectName: 'alpha',
        endedAt: new Date('2025-06-10T00:00:00Z'),
      });
      const newer = makeParsedSession({
        id: 'sess-b',
        projectPath: '/projects/beta',
        projectName: 'beta',
        endedAt: new Date('2025-06-15T00:00:00Z'),
      });

      insertSessionWithProject(older);
      insertSessionWithProject(newer);

      const projects = getProjects();
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('beta');
      expect(projects[1].name).toBe('alpha');
    });
  });

  // ────────────────────────────────────────────────────
  // insertMessages
  // ────────────────────────────────────────────────────

  describe('insertMessages', () => {
    it('inserts messages for a session', () => {
      const session = makeParsedSession({
        id: 'sess-msg',
        messages: [
          makeParsedMessage({ id: 'msg-1', sessionId: 'sess-msg', type: 'user', content: 'Hello' }),
          makeParsedMessage({ id: 'msg-2', sessionId: 'sess-msg', type: 'assistant', content: 'Hi there' }),
        ],
      });

      insertSessionWithProject(session);
      insertMessages(session);

      const rows = testDb
        .prepare('SELECT id, session_id, type, content FROM messages WHERE session_id = ? ORDER BY timestamp')
        .all('sess-msg') as Array<{ id: string; session_id: string; type: string; content: string }>;

      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('msg-1');
      expect(rows[0].type).toBe('user');
      expect(rows[0].content).toBe('Hello');
      expect(rows[1].id).toBe('msg-2');
      expect(rows[1].type).toBe('assistant');
      expect(rows[1].content).toBe('Hi there');
    });

    it('is a no-op when session has no messages', () => {
      const session = makeParsedSession({ id: 'sess-empty', messages: [] });
      insertSessionWithProject(session);
      expect(() => insertMessages(session)).not.toThrow();

      const rows = testDb.prepare('SELECT COUNT(*) AS cnt FROM messages').get() as { cnt: number };
      expect(rows.cnt).toBe(0);
    });

    it('ignores duplicate message IDs (INSERT OR IGNORE)', () => {
      const msg = makeParsedMessage({ id: 'msg-dup', sessionId: 'sess-dup' });
      const session = makeParsedSession({ id: 'sess-dup', messages: [msg] });

      insertSessionWithProject(session);
      insertMessages(session);
      // Insert again — should not throw or duplicate
      expect(() => insertMessages(session)).not.toThrow();

      const rows = testDb
        .prepare('SELECT COUNT(*) AS cnt FROM messages WHERE id = ?')
        .get('msg-dup') as { cnt: number };
      expect(rows.cnt).toBe(1);
    });

    it('stores tool_calls as JSON when present', () => {
      const msg = makeParsedMessage({
        id: 'msg-tools',
        sessionId: 'sess-tools',
        type: 'assistant',
        toolCalls: [{ id: 'tc-1', name: 'Read', input: { file_path: '/test.ts' } }],
      });
      const session = makeParsedSession({ id: 'sess-tools', messages: [msg] });

      insertSessionWithProject(session);
      insertMessages(session);

      const row = testDb
        .prepare('SELECT tool_calls FROM messages WHERE id = ?')
        .get('msg-tools') as { tool_calls: string | null };

      expect(row.tool_calls).not.toBeNull();
      const parsed = JSON.parse(row.tool_calls!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('Read');
    });

    it('stores thinking content when present', () => {
      const msg = makeParsedMessage({
        id: 'msg-think',
        sessionId: 'sess-think',
        type: 'assistant',
        thinking: 'Let me consider the options...',
      });
      const session = makeParsedSession({ id: 'sess-think', messages: [msg] });

      insertSessionWithProject(session);
      insertMessages(session);

      const row = testDb
        .prepare('SELECT thinking FROM messages WHERE id = ?')
        .get('msg-think') as { thinking: string | null };

      expect(row.thinking).toBe('Let me consider the options...');
    });
  });

  // ────────────────────────────────────────────────────
  // getLastSession
  // ────────────────────────────────────────────────────

  describe('getLastSession', () => {
    it('returns null when no sessions exist', () => {
      expect(getLastSession()).toBeNull();
    });

    it('returns the most recent session', () => {
      const older = makeParsedSession({
        id: 'sess-older',
        startedAt: new Date('2025-06-10T09:00:00Z'),
        endedAt: new Date('2025-06-10T10:00:00Z'),
      });
      const newer = makeParsedSession({
        id: 'sess-newer',
        startedAt: new Date('2025-06-15T09:00:00Z'),
        endedAt: new Date('2025-06-15T10:00:00Z'),
      });

      insertSessionWithProject(older);
      insertSessionWithProject(newer);

      const result = getLastSession();
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-newer');
    });

    it('filters by sourceTool', () => {
      const claude = makeParsedSession({
        id: 'sess-last-claude',
        sourceTool: 'claude-code',
        startedAt: new Date('2025-06-15T09:00:00Z'),
        endedAt: new Date('2025-06-15T10:00:00Z'),
      });
      const cursor = makeParsedSession({
        id: 'sess-last-cursor',
        sourceTool: 'cursor',
        startedAt: new Date('2025-06-16T09:00:00Z'),
        endedAt: new Date('2025-06-16T10:00:00Z'),
      });

      insertSessionWithProject(claude);
      insertSessionWithProject(cursor);

      const claudeResult = getLastSession({ sourceTool: 'claude-code' });
      expect(claudeResult).not.toBeNull();
      expect(claudeResult!.id).toBe('sess-last-claude');
      expect(claudeResult!.sourceTool).toBe('claude-code');

      const cursorResult = getLastSession({ sourceTool: 'cursor' });
      expect(cursorResult).not.toBeNull();
      expect(cursorResult!.id).toBe('sess-last-cursor');
    });

    it('filters by projectId', () => {
      // The mock generateStableProjectId returns 'proj-' + last path segment,
      // so different projectPath tail segments produce different projectIds.
      const sessionA = makeParsedSession({
        id: 'sess-proj-a',
        projectPath: '/projects/alpha',
        projectName: 'alpha',
        startedAt: new Date('2025-06-15T09:00:00Z'),
        endedAt: new Date('2025-06-15T10:00:00Z'),
      });
      const sessionB = makeParsedSession({
        id: 'sess-proj-b',
        projectPath: '/projects/beta',
        projectName: 'beta',
        startedAt: new Date('2025-06-16T09:00:00Z'),
        endedAt: new Date('2025-06-16T10:00:00Z'),
      });

      insertSessionWithProject(sessionA);
      insertSessionWithProject(sessionB);

      const result = getLastSession({ projectId: 'proj-alpha' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-proj-a');
      expect(result!.projectName).toBe('alpha');
    });

    it('returns correct field mapping for a known session', () => {
      const session = makeParsedSession({
        id: 'sess-fields',
        projectName: 'my-project',
        startedAt: new Date('2025-06-15T09:00:00Z'),
        endedAt: new Date('2025-06-15T10:00:00Z'),
        sourceTool: 'claude-code',
        generatedTitle: 'The Title',
        sessionCharacter: 'feature_build',
      });

      insertSessionWithProject(session);

      const result = getLastSession();
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-fields');
      expect(result!.projectName).toBe('my-project');
      expect(result!.startedAt).toBeInstanceOf(Date);
      expect(result!.sourceTool).toBe('claude-code');
      expect(result!.generatedTitle).toBe('The Title');
      expect(result!.sessionCharacter).toBe('feature_build');
    });
  });

  // ────────────────────────────────────────────────────
  // getSessionCount
  // ────────────────────────────────────────────────────

  describe('getSessionCount', () => {
    it('returns 0 when no sessions exist', () => {
      expect(getSessionCount()).toBe(0);
    });

    it('returns correct count for all sessions', () => {
      insertSessionWithProject(makeParsedSession({ id: 'cnt-sess-1' }));
      insertSessionWithProject(makeParsedSession({ id: 'cnt-sess-2' }));
      insertSessionWithProject(makeParsedSession({ id: 'cnt-sess-3' }));

      expect(getSessionCount()).toBe(3);
    });

    it('filters by periodStart', () => {
      const old = makeParsedSession({
        id: 'cnt-old',
        startedAt: new Date('2025-01-01T00:00:00Z'),
        endedAt: new Date('2025-01-01T01:00:00Z'),
      });
      const recent = makeParsedSession({
        id: 'cnt-recent',
        startedAt: new Date('2025-06-15T00:00:00Z'),
        endedAt: new Date('2025-06-15T01:00:00Z'),
      });

      insertSessionWithProject(old);
      insertSessionWithProject(recent);

      const count = getSessionCount({ periodStart: new Date('2025-06-01T00:00:00Z') });
      expect(count).toBe(1);
    });

    it('filters by sourceTool', () => {
      insertSessionWithProject(makeParsedSession({ id: 'cnt-claude-1', sourceTool: 'claude-code' }));
      insertSessionWithProject(makeParsedSession({ id: 'cnt-claude-2', sourceTool: 'claude-code' }));
      insertSessionWithProject(makeParsedSession({ id: 'cnt-cursor-1', sourceTool: 'cursor' }));

      expect(getSessionCount({ sourceTool: 'claude-code' })).toBe(2);
      expect(getSessionCount({ sourceTool: 'cursor' })).toBe(1);
    });

    it('filters by projectId', () => {
      // Different projectPath tails -> different projectIds via the mock
      const sessAlpha1 = makeParsedSession({
        id: 'cnt-alpha-1',
        projectPath: '/projects/cnt-alpha',
        projectName: 'cnt-alpha',
      });
      const sessAlpha2 = makeParsedSession({
        id: 'cnt-alpha-2',
        projectPath: '/projects/cnt-alpha',
        projectName: 'cnt-alpha',
      });
      const sessBeta = makeParsedSession({
        id: 'cnt-beta-1',
        projectPath: '/projects/cnt-beta',
        projectName: 'cnt-beta',
      });

      insertSessionWithProject(sessAlpha1);
      insertSessionWithProject(sessAlpha2);
      insertSessionWithProject(sessBeta);

      expect(getSessionCount({ projectId: 'proj-cnt-alpha' })).toBe(2);
      expect(getSessionCount({ projectId: 'proj-cnt-beta' })).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────
  // reflect_snapshots CRUD (direct SQL — no abstraction layer)
  // ────────────────────────────────────────────────────

  describe('reflect_snapshots', () => {
    const insertSnapshot = (overrides: Partial<{
      period: string;
      projectId: string;
      resultsJson: string;
      generatedAt: string;
      windowStart: string | null;
      windowEnd: string;
      sessionCount: number;
      facetCount: number;
    }> = {}) => {
      const defaults = {
        period: '30d',
        projectId: '__all__',
        resultsJson: JSON.stringify({ 'friction-wins': { narrative: 'test' } }),
        generatedAt: '2025-06-15T10:00:00Z',
        windowStart: '2025-05-16T10:00:00Z',
        windowEnd: '2025-06-15T10:00:00Z',
        sessionCount: 25,
        facetCount: 100,
      };
      const d = { ...defaults, ...overrides };
      testDb.prepare(`
        INSERT INTO reflect_snapshots (period, project_id, results_json, generated_at, window_start, window_end, session_count, facet_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(d.period, d.projectId, d.resultsJson, d.generatedAt, d.windowStart, d.windowEnd, d.sessionCount, d.facetCount);
    };

    it('inserts and reads a snapshot', () => {
      insertSnapshot();

      const row = testDb.prepare(
        'SELECT * FROM reflect_snapshots WHERE period = ? AND project_id = ?'
      ).get('30d', '__all__') as Record<string, unknown>;

      expect(row).toBeDefined();
      expect(row.period).toBe('30d');
      expect(row.project_id).toBe('__all__');
      expect(row.session_count).toBe(25);
      expect(row.facet_count).toBe(100);

      const parsed = JSON.parse(row.results_json as string);
      expect(parsed['friction-wins'].narrative).toBe('test');
    });

    it('returns undefined for non-existent snapshot', () => {
      const row = testDb.prepare(
        'SELECT * FROM reflect_snapshots WHERE period = ? AND project_id = ?'
      ).get('7d', '__all__');

      expect(row).toBeUndefined();
    });

    it('upsert overwrites existing snapshot for same key', () => {
      insertSnapshot({ sessionCount: 20 });
      // Upsert with new data
      testDb.prepare(`
        INSERT INTO reflect_snapshots (period, project_id, results_json, generated_at, window_start, window_end, session_count, facet_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(period, project_id) DO UPDATE SET
          results_json = excluded.results_json,
          generated_at = excluded.generated_at,
          window_start = excluded.window_start,
          window_end = excluded.window_end,
          session_count = excluded.session_count,
          facet_count = excluded.facet_count
      `).run('30d', '__all__', '{"updated":true}', '2025-06-16T10:00:00Z', '2025-05-17T10:00:00Z', '2025-06-16T10:00:00Z', 35, 150);

      const rows = testDb.prepare('SELECT * FROM reflect_snapshots').all();
      expect(rows).toHaveLength(1);

      const row = rows[0] as Record<string, unknown>;
      expect(row.session_count).toBe(35);
      expect(row.results_json).toBe('{"updated":true}');
    });

    it('stores separate snapshots per period+project combo', () => {
      insertSnapshot({ period: '30d', projectId: '__all__' });
      insertSnapshot({ period: '7d', projectId: '__all__' });
      insertSnapshot({ period: '30d', projectId: 'proj-123' });

      const rows = testDb.prepare('SELECT * FROM reflect_snapshots').all();
      expect(rows).toHaveLength(3);
    });

    it('is cleared by DELETE FROM reflect_snapshots (reset flow)', () => {
      insertSnapshot({ period: '30d' });
      insertSnapshot({ period: '7d' });

      testDb.prepare('DELETE FROM reflect_snapshots').run();

      const rows = testDb.prepare('SELECT * FROM reflect_snapshots').all();
      expect(rows).toEqual([]);
    });

    it('stores null window_start for all-time period', () => {
      insertSnapshot({ period: 'all', windowStart: null });

      const row = testDb.prepare(
        'SELECT window_start FROM reflect_snapshots WHERE period = ?'
      ).get('all') as { window_start: string | null };

      expect(row.window_start).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────
  // getProjectList
  // ────────────────────────────────────────────────────

  describe('getProjectList', () => {
    it('returns empty array when no sessions exist', () => {
      expect(getProjectList()).toEqual([]);
    });

    it('returns distinct project names from sessions', () => {
      // Two sessions for the same project path -> same projectId, should appear once
      insertSessionWithProject(makeParsedSession({
        id: 'pl-sess-1',
        projectPath: '/projects/my-project',
        projectName: 'my-project',
      }));
      insertSessionWithProject(makeParsedSession({
        id: 'pl-sess-2',
        projectPath: '/projects/my-project',
        projectName: 'my-project',
      }));
      // A second distinct project
      insertSessionWithProject(makeParsedSession({
        id: 'pl-sess-3',
        projectPath: '/projects/other-project',
        projectName: 'other-project',
      }));

      const list = getProjectList();
      expect(list).toHaveLength(2);
    });

    it('returns sorted by project_name', () => {
      insertSessionWithProject(makeParsedSession({
        id: 'pl-sort-zebra',
        projectPath: '/projects/zebra',
        projectName: 'zebra',
      }));
      insertSessionWithProject(makeParsedSession({
        id: 'pl-sort-apple',
        projectPath: '/projects/apple',
        projectName: 'apple',
      }));
      insertSessionWithProject(makeParsedSession({
        id: 'pl-sort-mango',
        projectPath: '/projects/mango',
        projectName: 'mango',
      }));

      const list = getProjectList();
      expect(list).toHaveLength(3);
      expect(list[0].name).toBe('apple');
      expect(list[1].name).toBe('mango');
      expect(list[2].name).toBe('zebra');
    });

    it('returns id and name fields for each entry', () => {
      insertSessionWithProject(makeParsedSession({
        id: 'pl-fields-sess',
        projectPath: '/projects/pl-fields',
        projectName: 'pl-fields',
      }));

      const list = getProjectList();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('proj-pl-fields');
      expect(list[0].name).toBe('pl-fields');
    });
  });

  // ──────────────────────────────────────────────────────
  // Soft-delete behavior
  // ──────────────────────────────────────────────────────

  describe('soft delete', () => {
    it('getSessions excludes soft-deleted sessions', () => {
      insertSessionWithProject(makeParsedSession({ id: 'sd-active', projectPath: '/p/sd', projectName: 'sd' }));
      insertSessionWithProject(makeParsedSession({ id: 'sd-hidden', projectPath: '/p/sd', projectName: 'sd' }));

      // Soft-delete one
      testDb.prepare("UPDATE sessions SET deleted_at = datetime('now') WHERE id = ?").run('sd-hidden');

      const sessions = getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('sd-active');
    });

    it('sessionExists still sees soft-deleted sessions (for sync dedup)', () => {
      insertSessionWithProject(makeParsedSession({ id: 'sd-dedup', projectPath: '/p/sd', projectName: 'sd' }));
      testDb.prepare("UPDATE sessions SET deleted_at = datetime('now') WHERE id = ?").run('sd-dedup');

      expect(sessionExists('sd-dedup')).toBe(true);
    });

    it('getDeletedSessionCount returns 0 when no sessions are deleted', () => {
      insertSessionWithProject(makeParsedSession({ id: 'sd-count-1', projectPath: '/p/sd', projectName: 'sd' }));
      expect(getDeletedSessionCount()).toBe(0);
    });

    it('getDeletedSessionCount counts soft-deleted sessions', () => {
      insertSessionWithProject(makeParsedSession({ id: 'sd-cnt-a', projectPath: '/p/sd', projectName: 'sd' }));
      insertSessionWithProject(makeParsedSession({ id: 'sd-cnt-b', projectPath: '/p/sd', projectName: 'sd' }));
      insertSessionWithProject(makeParsedSession({ id: 'sd-cnt-c', projectPath: '/p/sd', projectName: 'sd' }));

      testDb.prepare("UPDATE sessions SET deleted_at = datetime('now') WHERE id IN ('sd-cnt-a', 'sd-cnt-b')").run();

      expect(getDeletedSessionCount()).toBe(2);
    });

    it('getDeletedSessionCount filters by projectId', () => {
      insertSessionWithProject(makeParsedSession({ id: 'sd-fp-1', projectPath: '/p/alpha', projectName: 'alpha' }));
      insertSessionWithProject(makeParsedSession({ id: 'sd-fp-2', projectPath: '/p/beta', projectName: 'beta' }));

      testDb.prepare("UPDATE sessions SET deleted_at = datetime('now')").run();

      const alphaProjectId = (testDb.prepare('SELECT project_id FROM sessions WHERE id = ?').get('sd-fp-1') as { project_id: string }).project_id;
      const betaProjectId = (testDb.prepare('SELECT project_id FROM sessions WHERE id = ?').get('sd-fp-2') as { project_id: string }).project_id;

      expect(getDeletedSessionCount(alphaProjectId)).toBe(1);
      expect(getDeletedSessionCount(betaProjectId)).toBe(1);
    });

    it('getSessionCount excludes soft-deleted sessions', () => {
      insertSessionWithProject(makeParsedSession({ id: 'sd-sc-1', projectPath: '/p/sd', projectName: 'sd' }));
      insertSessionWithProject(makeParsedSession({ id: 'sd-sc-2', projectPath: '/p/sd', projectName: 'sd' }));

      testDb.prepare("UPDATE sessions SET deleted_at = datetime('now') WHERE id = ?").run('sd-sc-2');

      expect(getSessionCount()).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────
  // V6 fields: compact_count, auto_compact_count, slash_commands
  // ────────────────────────────────────────────────────

  describe('V6 compact and slash command fields', () => {
    it('writes and reads compact_count correctly', () => {
      const session = makeParsedSession({
        id: 'sess-v6-compact',
        compactCount: 3,
        autoCompactCount: 1,
        slashCommands: ['/compact', '/compact', '/compact', '/plan'],
      });
      insertSessionWithProject(session);

      const row = testDb
        .prepare('SELECT compact_count, auto_compact_count, slash_commands FROM sessions WHERE id = ?')
        .get('sess-v6-compact') as { compact_count: number; auto_compact_count: number; slash_commands: string };

      expect(row.compact_count).toBe(3);
      expect(row.auto_compact_count).toBe(1);
      const cmds = JSON.parse(row.slash_commands) as string[];
      expect(cmds).toEqual(['/compact', '/compact', '/compact', '/plan']);
    });

    it('upserts slash_commands on conflict', () => {
      const session = makeParsedSession({
        id: 'sess-v6-upsert',
        compactCount: 0,
        slashCommands: [],
      });
      insertSessionWithProject(session);

      const updated = makeParsedSession({
        id: 'sess-v6-upsert',
        compactCount: 2,
        slashCommands: ['/compact', '/compact'],
      });
      insertSessionWithProject(updated);

      const row = testDb
        .prepare('SELECT compact_count, slash_commands FROM sessions WHERE id = ?')
        .get('sess-v6-upsert') as { compact_count: number; slash_commands: string };

      expect(row.compact_count).toBe(2);
      expect(JSON.parse(row.slash_commands)).toEqual(['/compact', '/compact']);
    });

    it('defaults to 0 / [] when new fields are not set', () => {
      const session = makeParsedSession({
        id: 'sess-v6-defaults',
        compactCount: 0,
        autoCompactCount: 0,
        slashCommands: [],
      });
      insertSessionWithProject(session);

      const row = testDb
        .prepare('SELECT compact_count, auto_compact_count, slash_commands FROM sessions WHERE id = ?')
        .get('sess-v6-defaults') as { compact_count: number; auto_compact_count: number; slash_commands: string };

      expect(row.compact_count).toBe(0);
      expect(row.auto_compact_count).toBe(0);
      expect(JSON.parse(row.slash_commands)).toEqual([]);
    });
  });
});
