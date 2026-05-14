import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '@code-insights/cli/db/schema';

// ──────────────────────────────────────────────────────
// Module-scoped mutable DB reference
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

const mockIsLLMConfigured = vi.fn(() => true);
const mockCreateLLMClient = vi.fn();

vi.mock('../llm/client.js', () => ({
  isLLMConfigured: () => mockIsLLMConfigured(),
  createLLMClient: (...args: unknown[]) => mockCreateLLMClient(...args),
  loadLLMConfig: () => ({ provider: 'openai', model: 'gpt-4o' }),
}));

const { createApp } = await import('../index.js');

// ──────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────

const VALID_LINKEDIN_OUTPUT = `---
title: "What SQLite Taught Me in Production"
---

**WAL mode is not optional** if you have concurrent readers and writers.

I spent three weeks debugging a production issue that only appeared under real load. The culprit was SQLite in default journal mode blocking all reads during a write.

Switching to WAL mode resolved it immediately. Reads and writes operate on separate file segments — no locking.

Three other things I learned the hard way working on this system.

#sqlite #backend #engineering`;

const VALID_MARKDOWN = `---
title: "What SQLite Taught Me About Production Systems"
tags: [sqlite, backend, lessons-learned]
tldr: "Three weeks of debugging, one WAL mode revelation."
---

## WAL Mode Is Not Optional

SQLite in WAL mode allows concurrent readers while a writer is active.
Without it, every write blocks all reads — a problem you won't notice
in development but will notice at 3am.

## The Migration Trap

ORM-generated migrations can silently drop data when renaming columns.
Always review the generated SQL before running in production.

## Incremental Builds Save Sanity

Building incrementally with cached intermediates cut our CI time by 60%.
The trick is understanding what actually needs to rebuild.
`;

function makeMockLLMClient(response: string) {
  return {
    chat: vi.fn().mockResolvedValue({
      content: response,
      usage: { inputTokens: 500, outputTokens: 800 },
    }),
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
    provider: 'openai',
    model: 'gpt-4o',
  };
}

function initTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seedPrerequisites() {
  testDb
    .prepare(`INSERT OR IGNORE INTO projects (id, name, path, last_activity, session_count) VALUES ('proj-1', 'test', '/test', datetime('now'), 1)`)
    .run();
  testDb
    .prepare(
      `INSERT OR IGNORE INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count, source_tool)
       VALUES ('sess-1', 'proj-1', 'test', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 10, 'claude-code')`,
    )
    .run();
}

function seedInsight(
  id: string,
  type: string,
  summary: string,
  content: string,
  bullets: string | null = null,
) {
  testDb
    .prepare(
      `INSERT INTO insights (id, session_id, project_id, project_name, type, title, content, summary, confidence, timestamp, bullets)
       VALUES (?, 'sess-1', 'proj-1', 'test', ?, ?, ?, ?, 0.9, datetime('now'), ?)`,
    )
    .run(id, type, summary, content, summary, bullets);
}

const BASE_BODY = {
  insightIds: ['ins-1', 'ins-2', 'ins-3'],
  context: 'I spent three weeks debugging our SQLite setup.',
  tone: 'technical',
  format: 'blog',
};

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('POST /api/dispatch/generate', () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockIsLLMConfigured.mockReturnValue(true);
    mockCreateLLMClient.mockReset();
  });

  it('returns 400 when LLM is not configured', async () => {
    mockIsLLMConfigured.mockReturnValue(false);
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BASE_BODY),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/LLM not configured/);
  });

  it('returns 400 when insightIds < 3', async () => {
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, insightIds: ['ins-1', 'ins-2'] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/at least 3/);
  });

  it('returns 400 when insightIds > 8', async () => {
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, insightIds: ['1','2','3','4','5','6','7','8','9'] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/8 or fewer/);
  });

  it('returns 400 when context is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, context: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when context exceeds 500 chars', async () => {
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, context: 'x'.repeat(501) }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/500/);
  });

  it('returns 400 for invalid tone', async () => {
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, tone: 'marketing' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid format', async () => {
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, format: 'newsletter' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/format must be one of/);
  });

  it('returns 404 when no insights found in DB', async () => {
    mockCreateLLMClient.mockReturnValue(makeMockLLMClient(VALID_MARKDOWN));
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BASE_BODY),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when fewer than 3 IDs found in DB after filter', async () => {
    seedPrerequisites();
    // Seed only 2 of the 3 requested insights
    seedInsight('ins-1', 'learning', 'Summary one', 'Content one');
    seedInsight('ins-2', 'decision', 'Summary two', 'Content two');
    mockCreateLLMClient.mockReturnValue(makeMockLLMClient(VALID_MARKDOWN));
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BASE_BODY),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/at least 3/);
  });

  it('happy path: returns 200 with parsed markdown, frontmatter, wordCount', async () => {
    seedPrerequisites();
    seedInsight('ins-1', 'learning', 'WAL mode matters', 'WAL mode allows concurrent readers.');
    seedInsight('ins-2', 'decision', 'Avoid ORM migrations', 'Manual SQL is safer for column renames.');
    seedInsight('ins-3', 'technique', 'Incremental builds', 'Cache intermediates to reduce CI time.');

    const mockClient = makeMockLLMClient(VALID_MARKDOWN);
    mockCreateLLMClient.mockReturnValue(mockClient);

    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BASE_BODY),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as {
      markdown: string;
      frontmatter: { title: string; tags: string[]; tldr: string };
      wordCount: number;
      degraded: boolean;
      model: string;
    };
    expect(json.frontmatter.title).toBe('What SQLite Taught Me About Production Systems');
    expect(json.frontmatter.tags).toContain('sqlite');
    expect(json.frontmatter.tldr).toMatch(/WAL/);
    expect(json.wordCount).toBeGreaterThan(0);
    expect(json.degraded).toBe(false);
    expect(json.model).toBe('gpt-4o');
    // Verify temperature 0.7 was passed
    expect(mockClient.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ temperature: 0.7 }),
    );
    // Verify system prompt is included in messages
    const callArgs = mockClient.chat.mock.calls[0][0] as Array<{ role: string }>;
    expect(callArgs[0].role).toBe('system');
  });

  it('handles null bullets without crashing', async () => {
    seedPrerequisites();
    // null bullets is the real-world case for legacy rows where bullets column was not set
    seedInsight('ins-1', 'learning', 'Summary one', 'Content one', null);
    seedInsight('ins-2', 'decision', 'Summary two', 'Content two', null);
    seedInsight('ins-3', 'technique', 'Summary three', 'Content three', null);

    mockCreateLLMClient.mockReturnValue(makeMockLLMClient(VALID_MARKDOWN));
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BASE_BODY),
    });
    // Should not 500 — null bullets must be handled gracefully
    expect(res.status).toBe(200);
  });

  it('retries on parse failure and degrades gracefully on second failure', async () => {
    seedPrerequisites();
    seedInsight('ins-1', 'learning', 'Summary one', 'Content one');
    seedInsight('ins-2', 'decision', 'Summary two', 'Content two');
    seedInsight('ins-3', 'technique', 'Summary three', 'Content three');

    const rawContent = '# My Post\n\nSome content without frontmatter.';
    const mockClient = {
      chat: vi.fn().mockResolvedValue({
        content: rawContent,
        usage: { inputTokens: 100, outputTokens: 200 },
      }),
      estimateTokens: (text: string) => Math.ceil(text.length / 4),
      provider: 'openai',
      model: 'gpt-4o',
    };
    mockCreateLLMClient.mockReturnValue(mockClient);

    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BASE_BODY),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { degraded: boolean; frontmatter: { title: string } };
    expect(json.degraded).toBe(true);
    // Extracted H1 as title
    expect(json.frontmatter.title).toBe('My Post');
    // LLM called twice (initial + retry)
    expect(mockClient.chat).toHaveBeenCalledTimes(2);
  });

  it('Gemini regression: responseFormat text is passed to prevent JSON mode', async () => {
    seedPrerequisites();
    seedInsight('ins-1', 'learning', 'Summary one', 'Content one');
    seedInsight('ins-2', 'decision', 'Summary two', 'Content two');
    seedInsight('ins-3', 'technique', 'Summary three', 'Content three');

    const mockClient = makeMockLLMClient(VALID_MARKDOWN);
    mockCreateLLMClient.mockReturnValue(mockClient);

    const app = createApp();
    await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BASE_BODY),
    });

    expect(mockClient.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ responseFormat: 'text' }),
    );
  });

  it('linkedin happy path: returns 200 with hashtags in tags, empty tldr, body=markdown', async () => {
    seedPrerequisites();
    seedInsight('ins-1', 'learning', 'WAL mode matters', 'WAL mode allows concurrent readers.');
    seedInsight('ins-2', 'decision', 'Avoid ORM migrations', 'Manual SQL is safer for column renames.');
    seedInsight('ins-3', 'technique', 'Incremental builds', 'Cache intermediates to reduce CI time.');

    const mockClient = makeMockLLMClient(VALID_LINKEDIN_OUTPUT);
    mockCreateLLMClient.mockReturnValue(mockClient);

    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, format: 'linkedin' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as {
      format: string;
      frontmatter: { title: string; tags: string[]; tldr: string };
      body: string;
      markdown: string;
      characterCount: number;
      degraded: boolean;
    };
    expect(json.format).toBe('linkedin');
    expect(json.frontmatter.title).toBe('What SQLite Taught Me in Production');
    expect(json.frontmatter.tags).toContain('sqlite');
    expect(json.frontmatter.tags).toContain('backend');
    expect(json.frontmatter.tags).toContain('engineering');
    // Tags must not include # prefix
    expect(json.frontmatter.tags.every((t: string) => !t.startsWith('#'))).toBe(true);
    expect(json.frontmatter.tldr).toBe('');
    // For LinkedIn, markdown === body (no YAML wrapper)
    expect(json.markdown).toBe(json.body);
    expect(json.body).toContain('WAL mode is not optional');
    expect(json.characterCount).toBeGreaterThan(0);
    expect(json.degraded).toBe(false);
    // LinkedIn uses lower temperature for hook consistency
    expect(mockClient.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ temperature: 0.55 }),
    );
  });

  it('format is echoed back correctly in response', async () => {
    seedPrerequisites();
    seedInsight('ins-1', 'learning', 'Summary one', 'Content one');
    seedInsight('ins-2', 'decision', 'Summary two', 'Content two');
    seedInsight('ins-3', 'technique', 'Summary three', 'Content three');

    mockCreateLLMClient.mockReturnValue(makeMockLLMClient(VALID_MARKDOWN));
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, format: 'blog' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { format: string };
    expect(json.format).toBe('blog');
  });

  it('blog regression: blog format unchanged, includes YAML frontmatter in markdown', async () => {
    seedPrerequisites();
    seedInsight('ins-1', 'learning', 'WAL mode matters', 'WAL mode allows concurrent readers.');
    seedInsight('ins-2', 'decision', 'Avoid ORM migrations', 'Manual SQL is safer for column renames.');
    seedInsight('ins-3', 'technique', 'Incremental builds', 'Cache intermediates to reduce CI time.');

    mockCreateLLMClient.mockReturnValue(makeMockLLMClient(VALID_MARKDOWN));
    const app = createApp();
    const res = await app.request('/api/dispatch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, format: 'blog' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as {
      markdown: string;
      body: string;
      frontmatter: { title: string; tags: string[]; tldr: string };
      wordCount: number;
    };
    // Blog markdown includes YAML frontmatter
    expect(json.markdown).toContain('---');
    expect(json.markdown).toContain('title:');
    // Body is prose-only (no YAML)
    expect(json.body).not.toContain('---\ntitle:');
    expect(json.frontmatter.title).toBe('What SQLite Taught Me About Production Systems');
    expect(json.frontmatter.tldr).toMatch(/WAL/);
    expect(json.wordCount).toBeGreaterThan(0);
  });
});
