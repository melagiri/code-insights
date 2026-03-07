import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '@code-insights/cli/db/schema';

// ──────────────────────────────────────────────────────
// Module-scoped mutable DB reference for mocking.
// ──────────────────────────────────────────────────────

let testDb: Database.Database;

vi.mock('@code-insights/cli/db/client', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('@code-insights/cli/utils/telemetry', () => ({
  trackEvent: vi.fn(),
}));

const { createApp } = await import('../index.js');

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function initTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seedProject(id: string, name: string) {
  testDb.prepare(`
    INSERT INTO projects (id, name, path, last_activity, session_count)
    VALUES (?, ?, ?, datetime('now'), 1)
  `).run(id, name, `/projects/${name}`);
}

function seedSession(
  id: string,
  projectId: string,
  overrides: Record<string, unknown> = {},
) {
  const defaults = {
    project_name: 'test-project',
    project_path: '/test',
    started_at: '2025-06-15T10:00:00Z',
    ended_at: '2025-06-15T11:00:00Z',
    message_count: 5,
    source_tool: 'claude-code',
  };
  const row = { ...defaults, ...overrides };
  testDb.prepare(`
    INSERT INTO sessions (id, project_id, project_name, project_path,
      started_at, ended_at, message_count, source_tool)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, projectId, row.project_name, row.project_path,
    row.started_at, row.ended_at, row.message_count, row.source_tool,
  );
}

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('Sessions routes', () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe('GET /api/sessions', () => {
    it('returns empty array when no sessions exist', async () => {
      const app = createApp();
      const res = await app.request('/api/sessions');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessions).toEqual([]);
    });

    it('returns seeded sessions', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedSession('sess-2', 'proj-1');

      const app = createApp();
      const res = await app.request('/api/sessions');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessions).toHaveLength(2);
    });

    it('filters by projectId', async () => {
      seedProject('proj-1', 'alpha');
      seedProject('proj-2', 'beta');
      seedSession('sess-1', 'proj-1');
      seedSession('sess-2', 'proj-2');

      const app = createApp();
      const res = await app.request('/api/sessions?projectId=proj-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].id).toBe('sess-1');
    });

    it('filters by sourceTool', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-cc', 'proj-1', { source_tool: 'claude-code' });
      seedSession('sess-cur', 'proj-1', { source_tool: 'cursor' });

      const app = createApp();
      const res = await app.request('/api/sessions?sourceTool=cursor');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].id).toBe('sess-cur');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('returns a session by ID', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-abc', 'proj-1');

      const app = createApp();
      const res = await app.request('/api/sessions/sess-abc');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.id).toBe('sess-abc');
    });

    it('returns 404 for unknown session ID', async () => {
      const app = createApp();
      const res = await app.request('/api/sessions/nonexistent');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not found');
    });
  });

  describe('PATCH /api/sessions/:id', () => {
    it('renames a session with customTitle', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-rename', 'proj-1');

      const app = createApp();
      const res = await app.request('/api/sessions/sess-rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customTitle: 'My New Title' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Verify DB was updated
      const row = testDb.prepare(
        'SELECT custom_title FROM sessions WHERE id = ?',
      ).get('sess-rename') as { custom_title: string | null };
      expect(row.custom_title).toBe('My New Title');
    });

    it('returns 400 when customTitle is missing from body', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');

      const app = createApp();
      const res = await app.request('/api/sessions/sess-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ someOtherField: 'value' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('customTitle is required');
    });

    it('returns 404 when session does not exist', async () => {
      const app = createApp();
      const res = await app.request('/api/sessions/nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customTitle: 'title' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/sessions/:id (soft delete)', () => {
    it('soft-deletes a session by setting deleted_at', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-del', 'proj-1');

      const app = createApp();
      const res = await app.request('/api/sessions/sess-del', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Verify deleted_at is set in DB
      const row = testDb.prepare(
        'SELECT deleted_at FROM sessions WHERE id = ?',
      ).get('sess-del') as { deleted_at: string | null };
      expect(row.deleted_at).not.toBeNull();
    });

    it('returns 404 for non-existent session', async () => {
      const app = createApp();
      const res = await app.request('/api/sessions/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('excludes soft-deleted sessions from GET /api/sessions', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-active', 'proj-1');
      seedSession('sess-hidden', 'proj-1');

      // Soft-delete one session
      testDb.prepare(
        "UPDATE sessions SET deleted_at = datetime('now') WHERE id = ?",
      ).run('sess-hidden');

      const app = createApp();
      const res = await app.request('/api/sessions');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].id).toBe('sess-active');
    });

    it('returns 404 for soft-deleted session on GET /api/sessions/:id', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-gone', 'proj-1');
      testDb.prepare(
        "UPDATE sessions SET deleted_at = datetime('now') WHERE id = ?",
      ).run('sess-gone');

      const app = createApp();
      const res = await app.request('/api/sessions/sess-gone');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sessions/deleted/count', () => {
    it('returns 0 when no sessions are deleted', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');

      const app = createApp();
      const res = await app.request('/api/sessions/deleted/count');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBe(0);
    });

    it('returns count of soft-deleted sessions', async () => {
      seedProject('proj-1', 'alpha');
      seedSession('sess-1', 'proj-1');
      seedSession('sess-2', 'proj-1');
      seedSession('sess-3', 'proj-1');

      testDb.prepare(
        "UPDATE sessions SET deleted_at = datetime('now') WHERE id IN ('sess-1', 'sess-2')",
      ).run();

      const app = createApp();
      const res = await app.request('/api/sessions/deleted/count');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBe(2);
    });

    it('filters by project_id', async () => {
      seedProject('proj-1', 'alpha');
      seedProject('proj-2', 'beta');
      seedSession('sess-1', 'proj-1');
      seedSession('sess-2', 'proj-2');

      testDb.prepare(
        "UPDATE sessions SET deleted_at = datetime('now') WHERE id = 'sess-1'",
      ).run();
      testDb.prepare(
        "UPDATE sessions SET deleted_at = datetime('now') WHERE id = 'sess-2'",
      ).run();

      const app = createApp();
      const res = await app.request('/api/sessions/deleted/count?projectId=proj-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBe(1);
    });
  });
});
