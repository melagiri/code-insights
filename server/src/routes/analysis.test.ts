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
  captureError: vi.fn(),
  isTelemetryEnabled: () => false,
  getStableMachineId: () => 'test-id',
}));

const mockIsLLMConfigured = vi.fn(() => false);
const mockLoadLLMConfig = vi.fn(() => ({ provider: 'openai', model: 'gpt-4o' }));

vi.mock('../llm/client.js', () => ({
  isLLMConfigured: () => mockIsLLMConfigured(),
  createLLMClient: vi.fn(),
  loadLLMConfig: () => mockLoadLLMConfig(),
}));

const mockAnalyzeSession = vi.fn();
const mockAnalyzePromptQuality = vi.fn();
const mockFindRecurringInsights = vi.fn();

vi.mock('../llm/analysis.js', () => ({
  analyzeSession: (...args: unknown[]) => mockAnalyzeSession(...args),
  analyzePromptQuality: (...args: unknown[]) => mockAnalyzePromptQuality(...args),
  findRecurringInsights: (...args: unknown[]) => mockFindRecurringInsights(...args),
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
  testDb.prepare(`INSERT INTO projects (id, name, path, last_activity, session_count) VALUES (?, ?, ?, datetime('now'), 1)`).run(id, name, `/projects/${name}`);
}

function seedSession(id: string, projectId: string) {
  testDb.prepare(`INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count, source_tool) VALUES (?, ?, 'test', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 5, 'claude-code')`).run(id, projectId);
}

function seedInsight(sessionId: string, projectId: string, type: string, title: string) {
  testDb.prepare(`INSERT INTO insights (id, session_id, project_id, project_name, type, title, content, summary, confidence, timestamp) VALUES (?, ?, ?, 'test', ?, ?, 'content', 'summary', 0.9, datetime('now'))`).run(`insight-${sessionId}-${type}`, sessionId, projectId, type, title);
}

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('Analysis routes', () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockIsLLMConfigured.mockReturnValue(false);
    mockAnalyzeSession.mockReset();
    mockAnalyzePromptQuality.mockReset();
    mockFindRecurringInsights.mockReset();
    mockLoadLLMConfig.mockReset();
    mockLoadLLMConfig.mockReturnValue({ provider: 'openai', model: 'gpt-4o' });
  });

  afterEach(() => {
    testDb.close();
  });

  describe('POST /api/analysis/session', () => {
    it('returns 400 when LLM not configured', async () => {
      mockIsLLMConfigured.mockReturnValue(false);
      const app = createApp();
      const res = await app.request('/api/analysis/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'some-session-id' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/LLM not configured/);
    });

    it('returns 400 when sessionId missing from body', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      const app = createApp();
      const res = await app.request('/api/analysis/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/sessionId/);
    });

    it('returns 400 when sessionId is not a string', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      const app = createApp();
      const res = await app.request('/api/analysis/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 42 }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/sessionId/);
    });

    it('returns 404 when session not found', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      const app = createApp();
      const res = await app.request('/api/analysis/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'nonexistent' }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/Session not found/);
    });

    it('returns 200 and sets generated_title on success', async () => {
      seedProject('proj-1', 'myproject');
      seedSession('sess-1', 'proj-1');
      mockIsLLMConfigured.mockReturnValue(true);
      mockAnalyzeSession.mockResolvedValue({
        success: true,
        insights: [{ type: 'summary', title: 'Test Title' }],
        usage: { total_tokens: 100 },
      });
      const app = createApp();
      const res = await app.request('/api/analysis/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess-1' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Verify generated_title was set on the session
      const row = testDb.prepare('SELECT generated_title FROM sessions WHERE id = ?').get('sess-1') as { generated_title: string | null };
      expect(row.generated_title).toBe('Test Title');
    });

    it('returns 422 when analysis fails', async () => {
      seedProject('proj-1', 'myproject');
      seedSession('sess-1', 'proj-1');
      mockIsLLMConfigured.mockReturnValue(true);
      mockAnalyzeSession.mockResolvedValue({
        success: false,
        error: 'parse error',
        error_type: 'json_parse_error',
      });
      const app = createApp();
      const res = await app.request('/api/analysis/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess-1' }),
      });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/analysis/session/stream', () => {
    it('returns 400 when LLM not configured', async () => {
      mockIsLLMConfigured.mockReturnValue(false);
      const app = createApp();
      const res = await app.request('/api/analysis/session/stream?sessionId=some-id');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/LLM not configured/);
    });

    it('returns 400 when sessionId query param missing', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      const app = createApp();
      const res = await app.request('/api/analysis/session/stream');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/sessionId/);
    });
  });

  describe('POST /api/analysis/prompt-quality', () => {
    it('returns 400 when LLM not configured', async () => {
      mockIsLLMConfigured.mockReturnValue(false);
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'some-session-id' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/LLM not configured/);
    });

    it('returns 400 when sessionId missing from body', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/sessionId/);
    });

    it('returns 404 when session not found', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'nonexistent' }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/Session not found/);
    });

    it('returns 200 on success', async () => {
      seedProject('proj-1', 'myproject');
      seedSession('sess-1', 'proj-1');
      mockIsLLMConfigured.mockReturnValue(true);
      mockAnalyzePromptQuality.mockResolvedValue({
        success: true,
        insights: [{ type: 'prompt_quality' }],
        usage: { total_tokens: 50 },
      });
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess-1' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 422 when analysis fails', async () => {
      seedProject('proj-1', 'myproject');
      seedSession('sess-1', 'proj-1');
      mockIsLLMConfigured.mockReturnValue(true);
      mockAnalyzePromptQuality.mockResolvedValue({
        success: false,
        error: 'LLM error',
        error_type: 'api_error',
      });
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess-1' }),
      });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/analysis/prompt-quality/stream', () => {
    it('returns 400 when LLM not configured', async () => {
      mockIsLLMConfigured.mockReturnValue(false);
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality/stream?sessionId=some-id');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/LLM not configured/);
    });

    it('returns 400 when sessionId query param missing', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      const app = createApp();
      const res = await app.request('/api/analysis/prompt-quality/stream');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/sessionId/);
    });
  });

  describe('POST /api/analysis/recurring', () => {
    it('returns 400 when LLM not configured', async () => {
      mockIsLLMConfigured.mockReturnValue(false);
      const app = createApp();
      const res = await app.request('/api/analysis/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/LLM not configured/);
    });

    it('returns 200 with groups on success', async () => {
      seedProject('proj-1', 'myproject');
      seedSession('sess-1', 'proj-1');
      seedInsight('sess-1', 'proj-1', 'bug', 'Test Bug');
      mockIsLLMConfigured.mockReturnValue(true);
      mockFindRecurringInsights.mockResolvedValue({
        success: true,
        groups: [{ theme: 'test' }],
      });
      const app = createApp();
      const res = await app.request('/api/analysis/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.groups).toEqual([{ theme: 'test' }]);
    });

    it('returns 200 with projectId filter', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      mockFindRecurringInsights.mockResolvedValue({
        success: true,
        groups: [],
      });
      const app = createApp();
      const res = await app.request('/api/analysis/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.groups).toEqual([]);
    });

    it('returns 422 when recurring analysis fails', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      mockFindRecurringInsights.mockResolvedValue({
        success: false,
        error: 'LLM error',
      });
      const app = createApp();
      const res = await app.request('/api/analysis/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });
});
