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

vi.mock('@code-insights/cli/utils/config', () => ({
  loadConfig: () => null,
  saveConfig: vi.fn(),
}));

vi.mock('../llm/client.js', () => ({
  loadLLMConfig: () => null,
  isLLMConfigured: () => false,
  testLLMConfig: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../llm/providers/ollama.js', () => ({
  discoverOllamaModels: vi.fn().mockResolvedValue([]),
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

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('Config routes', () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe('GET /api/config/llm', () => {
    it('returns config shape when no config exists', async () => {
      const app = createApp();
      const res = await app.request('/api/config/llm');
      expect(res.status).toBe(200);
      const body = await res.json();
      // loadConfig returns null, so llm is undefined
      expect(body.dashboardPort).toBe(7890);
      expect(body.provider).toBeUndefined();
      expect(body.model).toBeUndefined();
    });
  });
});
