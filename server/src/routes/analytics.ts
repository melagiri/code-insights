import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { mondayOfIsoWeek } from './shared-aggregation.js';

const app = new Hono();

const VALID_RANGES = ['7d', '30d', '90d', 'all'] as const;
type Range = typeof VALID_RANGES[number];

// Dashboard overview stats for a given time range (e.g. ?range=7d|30d|90d|all)
app.get('/dashboard', (c) => {
  const db = getDb();
  const { range = '7d' } = c.req.query();

  if (!VALID_RANGES.includes(range as Range)) {
    return c.json({ error: `Invalid range. Must be one of: ${VALID_RANGES.join(', ')}` }, 400);
  }

  let periodStart: string | null = null;
  const now = new Date();
  if (range === '7d') {
    periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (range === '30d') {
    periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (range === '90d') {
    periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }

  const where = periodStart
    ? 'WHERE started_at >= ? AND deleted_at IS NULL'
    : 'WHERE deleted_at IS NULL';
  const params = periodStart ? [periodStart] : [];

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS session_count,
      COUNT(DISTINCT project_id) AS active_projects,
      SUM(message_count) AS total_messages,
      SUM(tool_call_count) AS total_tool_calls,
      CAST(COALESCE(SUM(
        CASE WHEN ended_at IS NOT NULL AND started_at IS NOT NULL
          THEN (julianday(ended_at) - julianday(started_at)) * 1440
          ELSE 0
        END
      ), 0) AS INTEGER) AS total_duration_min,
      SUM(total_input_tokens) AS total_input_tokens,
      SUM(total_output_tokens) AS total_output_tokens,
      SUM(cache_creation_tokens) AS cache_creation_tokens,
      SUM(cache_read_tokens) AS cache_read_tokens,
      SUM(estimated_cost_usd) AS estimated_cost_usd
    FROM sessions ${where}
  `).get(...params);

  return c.json({ range, stats });
});

// Cognitive-load model: a human turn keeps its session "warm" for ATTENTION_MIN
// minutes. While warm, the session contributes to concurrent multitasking. Load
// at any minute = (concurrent warm sessions) × (concurrent warm projects)² — the
// projects term is squared so juggling across multiple projects compounds far
// faster than stacking sessions within one project. Daily load integrates that
// over the day's active minutes (1-minute resolution). Truly idle sessions emit
// no human turns, so they go cold and add nothing — matching the intuition that
// a long unattended session is cheap, but rapid switching is expensive.
const ATTENTION_MIN = 15;
const MS_PER_MIN = 60_000;

interface CognitiveDay {
  cognitive_load: number; // Σ (sessions × projects²) over active minutes
  peak_sessions: number;  // max concurrent warm sessions in any minute
  peak_projects: number;  // max concurrent warm projects in any minute
}

function computeCognitiveLoad(db: ReturnType<typeof getDb>): Map<string, CognitiveDay> {
  // Genuine human turns only: type='user' AND non-empty content. (type='user'
  // with empty content is an automated tool-result message, not a human pulse.)
  const pulses = db.prepare(`
    SELECT m.timestamp AS t, m.session_id AS sid, s.project_id AS pid
    FROM messages m
    JOIN sessions s ON s.id = m.session_id
    WHERE m.type = 'user' AND m.content <> '' AND s.deleted_at IS NULL
    ORDER BY m.timestamp
  `).all() as Array<{ t: string; sid: string; pid: string }>;

  // Spread each pulse across the warm window into 1-minute buckets, tracking the
  // distinct sessions and projects live in each minute.
  const buckets = new Map<number, { sessions: Set<string>; projects: Set<string> }>();
  for (const p of pulses) {
    const startMin = Math.floor(new Date(p.t).getTime() / MS_PER_MIN);
    for (let k = 0; k < ATTENTION_MIN; k++) {
      const mi = startMin + k;
      let b = buckets.get(mi);
      if (!b) { b = { sessions: new Set(), projects: new Set() }; buckets.set(mi, b); }
      b.sessions.add(p.sid);
      b.projects.add(p.pid);
    }
  }

  const byDate = new Map<string, CognitiveDay>();
  for (const [mi, b] of buckets) {
    const date = new Date(mi * MS_PER_MIN).toISOString().slice(0, 10);
    const s = b.sessions.size;
    const pr = b.projects.size;
    const d = byDate.get(date) ?? { cognitive_load: 0, peak_sessions: 0, peak_projects: 0 };
    d.cognitive_load += s * pr * pr;
    if (s > d.peak_sessions) d.peak_sessions = s;
    if (pr > d.peak_projects) d.peak_projects = pr;
    byDate.set(date, d);
  }
  return byDate;
}

// Per-day activity series (all-time, gap-filled) for the Activity chart.
// One row per calendar day from the first recorded session to the last, with
// zero-filled gaps so the timeline has no holes. Metric definitions match the
// CLI dashboard: tokens = input+output+cache_creation+cache_read.
app.get('/activity', (c) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT substr(started_at, 1, 10) AS date,
           COUNT(*) AS sessions,
           COUNT(DISTINCT project_id) AS projects,
           COALESCE(SUM(message_count), 0) AS messages,
           COALESCE(SUM(tool_call_count), 0) AS tool_calls,
           COALESCE(SUM(
             COALESCE(total_input_tokens, 0) + COALESCE(total_output_tokens, 0)
             + COALESCE(cache_creation_tokens, 0) + COALESCE(cache_read_tokens, 0)
           ), 0) AS tokens,
           COALESCE(SUM(estimated_cost_usd), 0) AS cost
    FROM sessions
    WHERE deleted_at IS NULL AND started_at IS NOT NULL AND started_at <> ''
    GROUP BY date
    ORDER BY date
  `).all() as Array<{
    date: string;
    sessions: number;
    projects: number;
    messages: number;
    tool_calls: number;
    tokens: number;
    cost: number;
  }>;

  if (rows.length === 0) return c.json({ days: [] });

  const cognitive = computeCognitiveLoad(db);
  const zeroCog: CognitiveDay = { cognitive_load: 0, peak_sessions: 0, peak_projects: 0 };

  // Gap-fill every calendar day between the first and last recorded day.
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const days = [];
  const oneDay = 86_400_000;
  const start = new Date(`${rows[0].date}T00:00:00Z`).getTime();
  const end = new Date(`${rows[rows.length - 1].date}T00:00:00Z`).getTime();
  for (let t = start; t <= end; t += oneDay) {
    const date = new Date(t).toISOString().slice(0, 10);
    const r = byDate.get(date);
    const cog = cognitive.get(date) ?? zeroCog;
    days.push(
      r
        ? { ...r, tokens: Math.round(r.tokens), cost: Math.round(r.cost * 100) / 100, ...cog }
        : { date, sessions: 0, projects: 0, messages: 0, tool_calls: 0, tokens: 0, cost: 0, ...cog }
    );
  }

  return c.json({ days });
});

// ============================================================
// Projects lifecycle
// ============================================================
// A logical project can be recorded as several `projects` rows: the same
// folder gets re-hashed under path-hash vs git-remote id sources, and Git
// worktrees (a `.claude/worktrees/<name>` path segment) get their own row.
// We collapse those into one "logical project" before computing lifecycle.

const INACTIVITY_DAYS = 60;
const INACTIVITY_MS = INACTIVITY_DAYS * 86_400_000;
const WEEK_MS = 7 * 86_400_000;

type LifecycleStatus = 'active' | 'reactivated' | 'dropped';
type LifecycleEventType = 'started' | 'reactivated' | 'dropped';

interface RawProjectRow {
  id: string;
  name: string;
  path: string;
}

/**
 * Normalize a project path for identity matching: URL-decode, backslashes to
 * forward slashes, lowercase a leading drive letter (and drop any leading
 * slash in front of it, since URL-encoded Windows paths often carry one —
 * e.g. "/c%3A/Users/..." vs "C:\Users\..." must normalize identically), and
 * fold a trailing worktree segment back onto its parent repo path.
 */
export function normalizeProjectPath(rawPath: string): string {
  let p = rawPath;
  try {
    p = decodeURIComponent(p);
  } catch {
    // Not valid percent-encoding — use the raw path as-is.
  }
  p = p.replace(/\\/g, '/');
  const driveMatch = p.match(/^\/?([A-Za-z]):(.*)$/);
  if (driveMatch) {
    p = `${driveMatch[1].toLowerCase()}:${driveMatch[2]}`;
  }
  p = p.replace(/\/\.claude\/worktrees\/[^/]+\/?$/, '');
  p = p.replace(/\/+$/, '');
  return p;
}

interface LogicalProject {
  key: string;
  name: string;
  path: string; // representative raw path (from the most-active, non-worktree grouped row)
  sessionTimestamps: number[]; // ms epoch, ascending
}

const WORKTREE_SEGMENT_RE = /\/\.claude\/worktrees\/[^/]+\/?$/;

/** True if `rawPath` points inside a `.claude/worktrees/<name>` folder. */
function isWorktreePath(rawPath: string): boolean {
  return WORKTREE_SEGMENT_RE.test(rawPath.replace(/\\/g, '/'));
}

/**
 * Group raw `projects` rows into logical projects by normalized path alone —
 * NOT name, since a Git worktree's raw row carries the worktree's own
 * auto-generated folder name (e.g. "keen-davinci-c306f0"), not its parent
 * repo's name, even after its path is folded back onto the parent's path.
 * Unions session timestamps across the group and drops any logical project
 * with fewer than 2 total sessions (never counts as a "start").
 */
export function buildLogicalProjects(
  projects: RawProjectRow[],
  sessionTimestampsByProjectId: Map<string, number[]>
): LogicalProject[] {
  const groups = new Map<string, string[]>(); // normalized path -> raw ids
  for (const p of projects) {
    const key = normalizeProjectPath(p.path);
    let ids = groups.get(key);
    if (!ids) {
      ids = [];
      groups.set(key, ids);
    }
    ids.push(p.id);
  }

  const rawById = new Map(projects.map((p) => [p.id, p]));
  const sessionCount = (id: string) => sessionTimestampsByProjectId.get(id)?.length ?? 0;

  const logical: LogicalProject[] = [];
  for (const [key, rawIds] of groups) {
    const timestamps: number[] = [];
    for (const rawId of rawIds) {
      timestamps.push(...(sessionTimestampsByProjectId.get(rawId) ?? []));
    }
    if (timestamps.length < 2) continue;
    timestamps.sort((a, b) => a - b);

    // Display name/path: prefer the most-active row whose original path is
    // NOT a worktree path (the parent repo's own row, if one was ever
    // synced); only fall back to a worktree row if every row in the group
    // is one (e.g. the user has only ever worked from worktrees of this repo).
    const rows = rawIds.map((id) => rawById.get(id)).filter((r): r is RawProjectRow => r !== undefined);
    const nonWorktreeRows = rows.filter((r) => !isWorktreePath(r.path));
    const pool = nonWorktreeRows.length > 0 ? nonWorktreeRows : rows;
    const repRaw = pool.reduce((best, r) => (sessionCount(r.id) > sessionCount(best.id) ? r : best));

    logical.push({ key, name: repRaw.name, path: repRaw.path, sessionTimestamps: timestamps });
  }
  return logical;
}

interface LifecycleEvent {
  week: number; // ms epoch of the Monday this event fires on
  type: LifecycleEventType;
}

interface ProjectLifecycle {
  events: LifecycleEvent[];
  status: LifecycleStatus;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Walk a project's sorted session timestamps, splitting into segments
 * wherever consecutive sessions are more than INACTIVITY_DAYS apart. The
 * first segment starts "active"; every later segment follows a >60d gap, so
 * it starts "reactivated". A segment ends in a "dropped" event 60 days after
 * its last session if that gap is followed by another segment (always true,
 * by construction) or — for the final segment — if `now` is past it.
 */
export function computeLifecycle(timestamps: number[], nowMs: number): ProjectLifecycle {
  const segments: Array<{ start: number; end: number }> = [];
  let segStart = timestamps[0];
  let segEnd = timestamps[0];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap > INACTIVITY_MS) {
      segments.push({ start: segStart, end: segEnd });
      segStart = timestamps[i];
    }
    segEnd = timestamps[i];
  }
  segments.push({ start: segStart, end: segEnd });

  const events: LifecycleEvent[] = [];
  let status: LifecycleStatus = 'active';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const startType: LifecycleEventType = i === 0 ? 'started' : 'reactivated';
    events.push({ week: mondayOfIsoWeek(new Date(seg.start)).getTime(), type: startType });

    const gapAfter = isLast ? nowMs - seg.end : segments[i + 1].start - seg.end;
    if (gapAfter > INACTIVITY_MS) {
      const dropDate = seg.end + INACTIVITY_MS;
      events.push({ week: mondayOfIsoWeek(new Date(dropDate)).getTime(), type: 'dropped' });
      if (isLast) status = 'dropped';
    } else if (isLast) {
      status = i === 0 ? 'active' : 'reactivated';
    }
  }

  return { events, status, firstSeen: timestamps[0], lastSeen: timestamps[timestamps.length - 1] };
}

interface WeekRow {
  week: string; // YYYY-MM-DD (Monday)
  active: number;
  reactivated: number;
  dropped: number;
  started: number;
  newly_dropped: number;
}

/**
 * Sweep every project's lifecycle events in week order, maintaining running
 * cumulative counts per bucket. Gap-filled week-by-week (like /activity
 * gap-fills days) from the first event's week through the current week.
 */
export function buildWeeklySeries(
  lifecycles: Array<{ key: string; events: LifecycleEvent[] }>,
  nowMs: number
): WeekRow[] {
  const eventsByWeek = new Map<number, Array<{ key: string; type: LifecycleEventType }>>();
  let minWeek = Infinity;
  for (const lc of lifecycles) {
    for (const e of lc.events) {
      if (e.week < minWeek) minWeek = e.week;
      let arr = eventsByWeek.get(e.week);
      if (!arr) {
        arr = [];
        eventsByWeek.set(e.week, arr);
      }
      arr.push({ key: lc.key, type: e.type });
    }
  }
  if (minWeek === Infinity) return [];

  const currentWeek = mondayOfIsoWeek(new Date(nowMs)).getTime();
  const state = new Map<string, LifecycleStatus>();
  let active = 0;
  let reactivated = 0;
  let dropped = 0;
  const rows: WeekRow[] = [];

  for (let w = minWeek; w <= currentWeek; w += WEEK_MS) {
    const weekEvents = eventsByWeek.get(w) ?? [];
    let started = 0;
    let newlyDropped = 0;
    for (const ev of weekEvents) {
      if (ev.type === 'started') {
        active++;
        state.set(ev.key, 'active');
        started++;
      } else if (ev.type === 'reactivated') {
        dropped--;
        reactivated++;
        state.set(ev.key, 'reactivated');
        started++;
      } else {
        const prev = state.get(ev.key);
        if (prev === 'active') active--;
        else if (prev === 'reactivated') reactivated--;
        dropped++;
        state.set(ev.key, 'dropped');
        newlyDropped++;
      }
    }
    rows.push({
      week: new Date(w).toISOString().slice(0, 10),
      active,
      reactivated,
      dropped,
      started,
      newly_dropped: newlyDropped,
    });
  }
  return rows;
}

// Cumulative weekly lifecycle (started/reactivated/dropped) for every logical
// project since the first-ever session, plus a current-status summary table.
app.get('/projects-lifecycle', (c) => {
  const db = getDb();

  const rawProjects = db.prepare(`SELECT id, name, path FROM projects`).all() as RawProjectRow[];
  const sessionRows = db.prepare(`
    SELECT project_id, started_at FROM sessions
    WHERE deleted_at IS NULL AND started_at IS NOT NULL AND started_at <> ''
  `).all() as Array<{ project_id: string; started_at: string }>;

  const timestampsByProjectId = new Map<string, number[]>();
  for (const r of sessionRows) {
    const ts = new Date(r.started_at).getTime();
    if (Number.isNaN(ts)) continue;
    let arr = timestampsByProjectId.get(r.project_id);
    if (!arr) {
      arr = [];
      timestampsByProjectId.set(r.project_id, arr);
    }
    arr.push(ts);
  }

  const logicalProjects = buildLogicalProjects(rawProjects, timestampsByProjectId);
  if (logicalProjects.length === 0) {
    return c.json({ weeks: [], projects: [] });
  }

  const nowMs = Date.now();
  const lifecycles = logicalProjects.map((lp) => ({
    key: lp.key,
    ...computeLifecycle(lp.sessionTimestamps, nowMs),
  }));
  const lifecycleByKey = new Map(lifecycles.map((l) => [l.key, l]));

  const weeks = buildWeeklySeries(lifecycles, nowMs);

  const projectsOut = logicalProjects
    .map((lp) => {
      const lc = lifecycleByKey.get(lp.key)!;
      return {
        name: lp.name,
        path: lp.path,
        first_seen: new Date(lc.firstSeen).toISOString().slice(0, 10),
        last_seen: new Date(lc.lastSeen).toISOString().slice(0, 10),
        session_count: lp.sessionTimestamps.length,
        status: lc.status,
      };
    })
    .sort((a, b) => b.last_seen.localeCompare(a.last_seen));

  return c.json({ weeks, projects: projectsOut });
});

// Global cumulative usage stats
app.get('/usage', (c) => {
  const db = getDb();
  const stats = db.prepare(`
    SELECT total_input_tokens, total_output_tokens, cache_creation_tokens,
           cache_read_tokens, estimated_cost_usd, sessions_with_usage, last_updated_at
    FROM usage_stats WHERE id = 1
  `).get();
  return c.json({ stats: stats ?? null });
});

export default app;
