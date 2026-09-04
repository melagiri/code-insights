import Database from 'better-sqlite3';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '@code-insights/cli/db/schema';
import {
  normalizeProjectPath,
  buildLogicalProjects,
  computeLifecycle,
  buildWeeklySeries,
} from './analytics.js';

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

function seedProject(id: string, name: string, path: string) {
  testDb.prepare(`
    INSERT INTO projects (id, name, path, last_activity, session_count)
    VALUES (?, ?, ?, datetime('now'), 1)
  `).run(id, name, path);
}

let sessionCounter = 0;
function seedSession(projectId: string, startedAt: string) {
  const id = `s-${++sessionCounter}`;
  testDb.prepare(`
    INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count)
    VALUES (?, ?, 'p', '/p', ?, ?, 1)
  `).run(id, projectId, startedAt, startedAt);
  return id;
}

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('normalizeProjectPath', () => {
  it('normalizes URL-encoded and Windows-style paths for the same folder identically', () => {
    const encoded = normalizeProjectPath('/c%3A/Users/dev/Repos/har-cleaner');
    const windows = normalizeProjectPath('C:\\Users\\dev\\Repos\\har-cleaner');
    expect(encoded).toBe(windows);
  });

  it('strips a trailing worktree segment so it points at the parent repo path', () => {
    const stripped = normalizeProjectPath('C:\\Users\\dev\\Repos\\ubt-maven\\.claude\\worktrees\\keen-davinci-c306f0');
    const parent = normalizeProjectPath('C:\\Users\\dev\\Repos\\ubt-maven');
    expect(stripped).toBe(parent);
  });

  it('leaves an already-normalized POSIX path unchanged', () => {
    expect(normalizeProjectPath('/home/dev/repos/zoom-scheduler')).toBe('/home/dev/repos/zoom-scheduler');
  });

  it('trims a trailing slash', () => {
    expect(normalizeProjectPath('/home/dev/repos/zoom-scheduler/')).toBe('/home/dev/repos/zoom-scheduler');
  });
});

describe('buildLogicalProjects', () => {
  it('groups raw rows by normalized path alone and unions their sessions', () => {
    const projects = [
      { id: 'p1', name: 'har-cleaner', path: '/c%3A/Users/dev/Repos/har-cleaner' },
      { id: 'p2', name: 'har-cleaner', path: 'C:\\Users\\dev\\Repos\\har-cleaner' },
    ];
    const sessions = new Map([
      ['p1', [1000, 2000]],
      ['p2', [3000]],
    ]);
    const result = buildLogicalProjects(projects, sessions);
    expect(result).toHaveLength(1);
    expect(result[0].sessionTimestamps).toEqual([1000, 2000, 3000]);
  });

  it('excludes logical projects with fewer than 2 total sessions', () => {
    const projects = [{ id: 'p1', name: 'lonely', path: '/lonely' }];
    const sessions = new Map([['p1', [1000]]]);
    expect(buildLogicalProjects(projects, sessions)).toEqual([]);
  });

  it('folds a worktree row into its parent repo, preferring the parent even when the worktree has more sessions', () => {
    const projects = [
      { id: 'p1', name: 'ubt-maven', path: 'C:\\Repos\\ubt-maven' },
      { id: 'p2', name: 'keen-davinci-c306f0', path: 'C:\\Repos\\ubt-maven\\.claude\\worktrees\\keen-davinci-c306f0' },
    ];
    const sessions = new Map([
      ['p1', [1000, 2000]],
      ['p2', [3000, 4000, 5000]],
    ]);
    const result = buildLogicalProjects(projects, sessions);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ubt-maven');
    expect(result[0].path).toBe('C:\\Repos\\ubt-maven');
    expect(result[0].sessionTimestamps).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it('folds a worktree row (name="optimistic-mclean-1ce467") into its parent repo row (name="ubt-tool-hub")', () => {
    const projects = [
      { id: 'p1', name: 'optimistic-mclean-1ce467', path: 'C:\\Repos\\ubt-tool-hub\\.claude\\worktrees\\optimistic-mclean-1ce467' },
      { id: 'p2', name: 'ubt-tool-hub', path: 'C:\\Repos\\ubt-tool-hub' },
    ];
    const sessions = new Map([
      ['p1', [1000, 2000]],
      ['p2', [3000]],
    ]);
    const result = buildLogicalProjects(projects, sessions);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ubt-tool-hub');
    expect(result[0].path).toBe('C:\\Repos\\ubt-tool-hub');
    expect(result[0].sessionTimestamps).toEqual([1000, 2000, 3000]);
  });

  it('falls back to the highest-session-count row when every row in the group is a worktree path', () => {
    const projects = [
      { id: 'p1', name: 'dazzling-jones-2f03f7', path: 'C:\\Repos\\x\\.claude\\worktrees\\dazzling-jones-2f03f7' },
      { id: 'p2', name: 'zen-pike-499d41', path: 'C:\\Repos\\x\\.claude\\worktrees\\zen-pike-499d41' },
    ];
    const sessions = new Map([
      ['p1', [1000]],
      ['p2', [2000, 3000]],
    ]);
    const result = buildLogicalProjects(projects, sessions);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('zen-pike-499d41');
  });

  it('picks the raw path from the grouped row with the most sessions as the representative', () => {
    const projects = [
      { id: 'p1', name: 'x', path: '/legacy/path/x' },
      { id: 'p2', name: 'x', path: '/legacy/path/x/' }, // normalizes to same key (trailing slash trimmed)
    ];
    const sessions = new Map([
      ['p1', [1000]],
      ['p2', [2000, 3000, 4000]],
    ]);
    const result = buildLogicalProjects(projects, sessions);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/legacy/path/x/');
  });
});

describe('computeLifecycle', () => {
  const DAY = 86_400_000;

  it('a single segment within the inactivity window stays active', () => {
    const now = 50 * DAY; // 30 days after the last session — within the 60-day window
    const timestamps = [10 * DAY, 20 * DAY];
    const lc = computeLifecycle(timestamps, now);
    expect(lc.status).toBe('active');
    expect(lc.events).toHaveLength(1);
    expect(lc.events[0].type).toBe('started');
  });

  it('a gap over 60 days followed by a recent session becomes reactivated', () => {
    const now = 200 * DAY;
    const timestamps = [10 * DAY, 20 * DAY, 190 * DAY]; // gap of 170 days
    const lc = computeLifecycle(timestamps, now);
    expect(lc.status).toBe('reactivated');
    expect(lc.events.map((e) => e.type)).toEqual(['started', 'dropped', 'reactivated']);
  });

  it('a project whose last session is over 60 days before now is dropped', () => {
    const now = 200 * DAY;
    const timestamps = [10 * DAY, 20 * DAY]; // last session 180 days before now
    const lc = computeLifecycle(timestamps, now);
    expect(lc.status).toBe('dropped');
    expect(lc.events.map((e) => e.type)).toEqual(['started', 'dropped']);
  });

  it('a project exactly at the 60-day boundary (not over) is not dropped', () => {
    const now = 20 * DAY + 60 * DAY; // exactly 60 days after last session
    const timestamps = [10 * DAY, 20 * DAY];
    const lc = computeLifecycle(timestamps, now);
    expect(lc.status).toBe('active');
    expect(lc.events).toHaveLength(1);
  });
});

describe('buildWeeklySeries', () => {
  const DAY = 86_400_000;
  const WEEK = 7 * DAY;
  // A real Monday 00:00 UTC — mondayOfIsoWeek(now) must resolve to itself for
  // these fixtures to line up with event weeks that are also Monday-aligned.
  const MONDAY = Date.UTC(2024, 0, 1);

  it('returns an empty series when there are no lifecycles', () => {
    expect(buildWeeklySeries([], Date.now())).toEqual([]);
  });

  it('accumulates active count from the started week through the current week', () => {
    const startWeek = MONDAY;
    const now = startWeek + 3 * WEEK;
    const rows = buildWeeklySeries(
      [{ key: 'a', events: [{ week: startWeek, type: 'started' }] }],
      now
    );
    expect(rows).toHaveLength(4); // weeks 0..3 inclusive
    expect(rows.every((r) => r.active === 1)).toBe(true);
    expect(rows[0].started).toBe(1);
    expect(rows.slice(1).every((r) => r.started === 0)).toBe(true);
  });

  it('moves a project from active to dropped to reactivated across the correct weeks', () => {
    const w0 = MONDAY;
    const w1 = MONDAY + 1 * WEEK;
    const w2 = MONDAY + 2 * WEEK;
    const now = w2;
    const rows = buildWeeklySeries(
      [
        {
          key: 'a',
          events: [
            { week: w0, type: 'started' },
            { week: w1, type: 'dropped' },
            { week: w2, type: 'reactivated' },
          ],
        },
      ],
      now
    );
    expect(rows.find((r) => r.week === new Date(w0).toISOString().slice(0, 10))).toMatchObject({
      active: 1,
      dropped: 0,
      reactivated: 0,
    });
    expect(rows.find((r) => r.week === new Date(w1).toISOString().slice(0, 10))).toMatchObject({
      active: 0,
      dropped: 1,
      newly_dropped: 1,
    });
    expect(rows.find((r) => r.week === new Date(w2).toISOString().slice(0, 10))).toMatchObject({
      active: 0,
      dropped: 0,
      reactivated: 1,
      started: 1,
    });
  });

  it('decrements the reactivated bucket (not active) when a previously-reactivated project drops again', () => {
    const w0 = MONDAY;
    const w1 = MONDAY + 1 * WEEK; // dropped
    const w2 = MONDAY + 2 * WEEK; // reactivated
    const w3 = MONDAY + 3 * WEEK; // dropped again
    const rows = buildWeeklySeries(
      [
        {
          key: 'a',
          events: [
            { week: w0, type: 'started' },
            { week: w1, type: 'dropped' },
            { week: w2, type: 'reactivated' },
            { week: w3, type: 'dropped' },
          ],
        },
      ],
      w3
    );
    expect(rows.find((r) => r.week === new Date(w3).toISOString().slice(0, 10))).toMatchObject({
      active: 0,
      reactivated: 0,
      dropped: 1,
      newly_dropped: 1,
    });
  });
});

describe('Analytics routes', () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe('GET /api/analytics/dashboard', () => {
    it('returns stats shape with default range', async () => {
      const app = createApp();
      const res = await app.request('/api/analytics/dashboard');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.range).toBe('7d');
      expect(body.stats).toBeDefined();
      expect(body.stats.session_count).toBe(0);
    });

    it('accepts valid range parameter', async () => {
      const app = createApp();
      const res = await app.request('/api/analytics/dashboard?range=30d');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.range).toBe('30d');
    });

    it('returns 400 for invalid range', async () => {
      const app = createApp();
      const res = await app.request('/api/analytics/dashboard?range=invalid');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Invalid range');
    });
  });

  describe('GET /api/analytics/activity', () => {
    it('returns an empty array when there are no sessions', async () => {
      const app = createApp();
      const res = await app.request('/api/analytics/activity');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.days).toEqual([]);
    });

    it('gap-fills calendar days between the first and last session and includes cognitive load', async () => {
      seedProject('p1', 'gappy', '/gappy');
      const sid = seedSession('p1', '2026-01-01T10:00:00Z');
      seedSession('p1', '2026-01-03T10:00:00Z');
      // A human message on day 1 gives computeCognitiveLoad something to bucket.
      testDb.prepare(`
        INSERT INTO messages (id, session_id, type, content, timestamp)
        VALUES ('m1', ?, 'user', 'hello', '2026-01-01T10:00:00Z')
      `).run(sid);

      const app = createApp();
      const res = await app.request('/api/analytics/activity');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.days).toHaveLength(3); // Jan 1, 2 (gap-filled), 3
      expect(body.days.map((d: { date: string }) => d.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
      expect(body.days[0].sessions).toBe(1);
      expect(body.days[1].sessions).toBe(0);
      expect(body.days[0].cognitive_load).toBeGreaterThan(0);
      expect(body.days[1].cognitive_load).toBe(0);
    });
  });

  describe('GET /api/analytics/projects-lifecycle', () => {
    it('returns empty weeks/projects for an empty DB', async () => {
      const app = createApp();
      const res = await app.request('/api/analytics/projects-lifecycle');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.weeks).toEqual([]);
      expect(body.projects).toEqual([]);
    });

    it('excludes logical projects with fewer than 2 sessions', async () => {
      seedProject('p1', 'lonely', '/lonely');
      seedSession('p1', '2026-01-05T00:00:00Z');

      const app = createApp();
      const res = await app.request('/api/analytics/projects-lifecycle');
      const body = await res.json();
      expect(body.projects).toEqual([]);
    });

    it('collapses path-hash/git-remote duplicate rows for the same folder into one logical project', async () => {
      // Same name + same folder, recorded under two different project_id_source rows —
      // one URL-encoded Windows path, one native Windows path. They normalize identically.
      seedProject('p1', 'har-cleaner', '/c%3A/Users/dev/Repos/har-cleaner');
      seedProject('p2', 'har-cleaner', 'C:\\Users\\dev\\Repos\\har-cleaner');
      seedSession('p1', '2026-01-05T00:00:00Z');
      seedSession('p2', '2026-01-06T00:00:00Z');

      const app = createApp();
      const res = await app.request('/api/analytics/projects-lifecycle');
      const body = await res.json();
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].name).toBe('har-cleaner');
      expect(body.projects[0].session_count).toBe(2);
    });

    it('folds a worktree row into its parent repo, preferring the human-chosen name', async () => {
      seedProject('p1', 'ubt-maven', 'C:\\Users\\dev\\Repos\\ubt-maven');
      seedProject('p2', 'keen-davinci-c306f0', 'C:\\Users\\dev\\Repos\\ubt-maven\\.claude\\worktrees\\keen-davinci-c306f0');
      seedSession('p1', '2026-01-01T00:00:00Z');
      seedSession('p1', '2026-01-02T00:00:00Z');
      seedSession('p2', '2026-01-03T00:00:00Z');
      seedSession('p2', '2026-01-04T00:00:00Z');

      const app = createApp();
      const res = await app.request('/api/analytics/projects-lifecycle');
      const body = await res.json();
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].name).toBe('ubt-maven');
      expect(body.projects[0].session_count).toBe(4);
    });

    it('marks a project dropped once its last session is more than 60 days old', async () => {
      seedProject('p1', 'stale', '/stale');
      const oldStart = new Date(Date.now() - 100 * 86_400_000).toISOString();
      const oldEnd = new Date(Date.now() - 90 * 86_400_000).toISOString();
      seedSession('p1', oldStart);
      seedSession('p1', oldEnd);

      const app = createApp();
      const res = await app.request('/api/analytics/projects-lifecycle');
      const body = await res.json();
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].status).toBe('dropped');

      const totalStarted = body.weeks.reduce((s: number, w: { started: number }) => s + w.started, 0);
      const totalDropped = body.weeks.reduce((s: number, w: { newly_dropped: number }) => s + w.newly_dropped, 0);
      expect(totalStarted).toBe(1);
      expect(totalDropped).toBe(1);
      expect(body.weeks[body.weeks.length - 1].dropped).toBe(1);
      expect(body.weeks[body.weeks.length - 1].active).toBe(0);
    });

    it('marks a project reactivated after a >60 day gap followed by a recent session', async () => {
      seedProject('p1', 'comeback', '/comeback');
      const first = new Date(Date.now() - 200 * 86_400_000).toISOString();
      const second = new Date(Date.now() - 190 * 86_400_000).toISOString();
      const reactivation = new Date(Date.now() - 1 * 86_400_000).toISOString();
      seedSession('p1', first);
      seedSession('p1', second);
      seedSession('p1', reactivation);

      const app = createApp();
      const res = await app.request('/api/analytics/projects-lifecycle');
      const body = await res.json();
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].status).toBe('reactivated');

      const lastWeek = body.weeks[body.weeks.length - 1];
      expect(lastWeek.reactivated).toBe(1);
      expect(lastWeek.active).toBe(0);
      expect(lastWeek.dropped).toBe(0);
    });

    it('a still-active project with all sessions within 60 days stays active, never dropped', async () => {
      seedProject('p1', 'humming', '/humming');
      seedSession('p1', new Date(Date.now() - 10 * 86_400_000).toISOString());
      seedSession('p1', new Date(Date.now() - 5 * 86_400_000).toISOString());

      const app = createApp();
      const res = await app.request('/api/analytics/projects-lifecycle');
      const body = await res.json();
      expect(body.projects[0].status).toBe('active');
      const lastWeek = body.weeks[body.weeks.length - 1];
      expect(lastWeek.active).toBe(1);
      expect(lastWeek.dropped).toBe(0);
    });
  });

  describe('GET /api/analytics/usage', () => {
    it('returns null stats when no usage data exists', async () => {
      const app = createApp();
      const res = await app.request('/api/analytics/usage');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stats).toBeNull();
    });

    it('returns usage stats when data exists', async () => {
      testDb.prepare(`
        INSERT INTO usage_stats (
          id, total_input_tokens, total_output_tokens,
          estimated_cost_usd, sessions_with_usage
        ) VALUES (1, 10000, 20000, 1.50, 5)
      `).run();

      const app = createApp();
      const res = await app.request('/api/analytics/usage');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stats).not.toBeNull();
      expect(body.stats.total_input_tokens).toBe(10000);
      expect(body.stats.total_output_tokens).toBe(20000);
      expect(body.stats.estimated_cost_usd).toBe(1.5);
    });
  });
});
