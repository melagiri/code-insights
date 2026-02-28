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
      started_at, ended_at, message_count, source_tool,
      generated_title, estimated_cost_usd)
    VALUES (?, ?, 'test', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z',
      5, 'claude-code', 'Test Session', 0.25)
  `).run(sessionId, projectId);
}

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('Export routes', () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe('POST /api/export/markdown', () => {
    it('exports markdown for given session IDs', async () => {
      seedProjectAndSession('proj-1', 'sess-1');

      const app = createApp();
      const res = await app.request('/api/export/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: ['sess-1'] }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/markdown');
      const text = await res.text();
      expect(text).toContain('# Code Insights Export');
      expect(text).toContain('Test Session');
    });

    it('returns 400 when neither sessionIds nor projectId provided', async () => {
      const app = createApp();
      const res = await app.request('/api/export/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('sessionIds or projectId required');
    });

    it('returns 400 when sessionIds is not an array', async () => {
      const app = createApp();
      const res = await app.request('/api/export/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: 'not-an-array' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('sessionIds must be an array');
    });

    it('exports by projectId when no sessionIds provided', async () => {
      seedProjectAndSession('proj-1', 'sess-1');

      const app = createApp();
      const res = await app.request('/api/export/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('# Code Insights Export');
      expect(text).toContain('Test Session');
    });

    it('returns header-only markdown when no sessions match', async () => {
      const app = createApp();
      const res = await app.request('/api/export/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: ['nonexistent'] }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('# Code Insights Export');
      // No session sections — just the header
      expect(text).not.toContain('## ');
    });
  });
});
