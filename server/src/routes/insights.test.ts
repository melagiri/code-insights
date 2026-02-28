import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SCHEMA_SQL } from '@code-insights/cli/db/schema';

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
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

function seedProjectAndSession(projectId: string, sessionId: string) {
  testDb.prepare(`
    INSERT INTO projects (id, name, path, last_activity, session_count)
    VALUES (?, 'test', '/test', datetime('now'), 1)
  `).run(projectId);

  testDb.prepare(`
    INSERT INTO sessions (id, project_id, project_name, project_path,
      started_at, ended_at, message_count, source_tool)
    VALUES (?, ?, 'test', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 5, 'claude-code')
  `).run(sessionId, projectId);
}

function seedInsight(
  id: string,
  sessionId: string,
  projectId: string,
  type: string,
) {
  testDb.prepare(`
    INSERT INTO insights (id, session_id, project_id, project_name, type, title, content,
      summary, confidence, source, timestamp, created_at)
    VALUES (?, ?, ?, 'test', ?, 'Test Title', 'Test content', 'Test summary', 80, 'llm',
      datetime('now'), datetime('now'))
  `).run(id, sessionId, projectId, type);
}

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('Insights routes', () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe('GET /api/insights', () => {
    it('returns empty array when no insights exist', async () => {
      const app = createApp();
      const res = await app.request('/api/insights');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.insights).toEqual([]);
    });

    it('returns insights filtered by type', async () => {
      seedProjectAndSession('proj-1', 'sess-1');
      seedInsight('ins-1', 'sess-1', 'proj-1', 'summary');
      seedInsight('ins-2', 'sess-1', 'proj-1', 'decision');
      seedInsight('ins-3', 'sess-1', 'proj-1', 'learning');

      const app = createApp();
      const res = await app.request('/api/insights?type=decision');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.insights).toHaveLength(1);
      expect(body.insights[0].type).toBe('decision');
    });
  });

  describe('POST /api/insights', () => {
    it('creates an insight and returns 201', async () => {
      seedProjectAndSession('proj-1', 'sess-1');

      const app = createApp();
      const res = await app.request('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'sess-1',
          projectId: 'proj-1',
          type: 'summary',
          title: 'Test insight',
          content: 'This is a test insight',
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(typeof body.id).toBe('string');

      // Verify it was persisted
      const row = testDb
        .prepare('SELECT * FROM insights WHERE id = ?')
        .get(body.id);
      expect(row).toBeDefined();
    });

    it('returns 400 for missing required fields', async () => {
      const app = createApp();
      const res = await app.request('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'sess-1',
          // missing projectId, type, title, content
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Missing or invalid field');
    });

    it('returns 400 for invalid type', async () => {
      seedProjectAndSession('proj-1', 'sess-1');

      const app = createApp();
      const res = await app.request('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'sess-1',
          projectId: 'proj-1',
          type: 'invalid_type',
          title: 'Test',
          content: 'Test content',
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('type must be one of');
    });
  });

  describe('DELETE /api/insights/:id', () => {
    it('deletes an existing insight', async () => {
      seedProjectAndSession('proj-1', 'sess-1');
      seedInsight('ins-del', 'sess-1', 'proj-1', 'summary');

      const app = createApp();
      const res = await app.request('/api/insights/ins-del', {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Verify deleted
      const row = testDb
        .prepare('SELECT * FROM insights WHERE id = ?')
        .get('ins-del');
      expect(row).toBeUndefined();
    });

    it('returns 404 for missing insight ID', async () => {
      const app = createApp();
      const res = await app.request('/api/insights/nonexistent', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not found');
    });
  });
});
