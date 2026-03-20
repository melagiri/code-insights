import { Hono } from 'hono';
import { getDb } from '@code-insights/cli/db/client';
import { parseIntParam } from '../utils.js';

const app = new Hono();

/**
 * GET /api/search?q=<query>&limit=20
 *
 * Full-text search across sessions and insights using SQLite LIKE queries.
 * No schema changes required — searches existing columns.
 *
 * Response: { sessions: SearchSession[], insights: SearchInsight[] }
 */
app.get('/', (c) => {
  const db = getDb();
  const { q, limit } = c.req.query();

  if (!q || q.trim().length === 0) {
    return c.json({ sessions: [], insights: [] });
  }

  const searchTerm = q.trim();
  const likeParam = `%${searchTerm}%`;
  const maxResults = parseIntParam(limit, 20);

  // Search sessions across: custom_title, generated_title, summary, project_name, git_branch
  const sessions = db.prepare(`
    SELECT
      id,
      project_name,
      session_character,
      started_at,
      custom_title,
      generated_title,
      title_source,
      summary,
      git_branch,
      CASE
        WHEN custom_title LIKE ? THEN 'title'
        WHEN generated_title LIKE ? THEN 'title'
        WHEN summary LIKE ? THEN 'summary'
        ELSE 'title'
      END AS match_field
    FROM sessions
    WHERE deleted_at IS NULL
      AND (
        custom_title LIKE ?
        OR generated_title LIKE ?
        OR summary LIKE ?
        OR project_name LIKE ?
        OR git_branch LIKE ?
      )
    ORDER BY started_at DESC
    LIMIT ?
  `).all(
    likeParam, likeParam, likeParam,  // CASE args
    likeParam, likeParam, likeParam, likeParam, likeParam,  // WHERE args
    maxResults
  ) as Array<{
    id: string;
    project_name: string;
    session_character: string | null;
    started_at: string;
    custom_title: string | null;
    generated_title: string | null;
    title_source: string | null;
    summary: string | null;
    git_branch: string | null;
    match_field: string;
  }>;

  // Search insights across: title, content, summary
  const insights = db.prepare(`
    SELECT
      i.id,
      i.type,
      i.title,
      i.project_name,
      i.session_id,
      i.created_at,
      i.content,
      i.summary AS insight_summary
    FROM insights i
    JOIN sessions s ON i.session_id = s.id
    WHERE s.deleted_at IS NULL
      AND (
        i.title LIKE ?
        OR i.content LIKE ?
        OR i.summary LIKE ?
      )
    ORDER BY i.created_at DESC
    LIMIT ?
  `).all(likeParam, likeParam, likeParam, maxResults) as Array<{
    id: string;
    type: string;
    title: string;
    project_name: string;
    session_id: string;
    created_at: string;
    content: string;
    insight_summary: string;
  }>;

  // Build session title from title_source priority: custom_title > generated_title > fallback
  const sessionResults = sessions.map((s) => {
    const title = s.custom_title || s.generated_title || 'Untitled session';
    const sourceText = s.match_field === 'summary' && s.summary
      ? s.summary
      : title;
    const snippet = buildSnippet(sourceText, searchTerm, 120);
    return {
      id: s.id,
      title,
      project_name: s.project_name,
      session_character: s.session_character,
      started_at: s.started_at,
      match_field: s.match_field as 'title' | 'summary',
      snippet,
    };
  });

  const insightResults = insights.map((i) => {
    const sourceText = i.title.toLowerCase().includes(searchTerm.toLowerCase())
      ? i.title
      : i.content || i.insight_summary;
    const snippet = buildSnippet(sourceText, searchTerm, 120);
    return {
      id: i.id,
      title: i.title,
      type: i.type,
      project_name: i.project_name,
      session_id: i.session_id,
      created_at: i.created_at,
      snippet,
    };
  });

  return c.json({ sessions: sessionResults, insights: insightResults });
});

/**
 * Extract a ~maxLength character snippet centered around the first match of term.
 * Falls back to the start of the text if no match found.
 */
function buildSnippet(text: string, term: string, maxLength: number): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const termLower = term.toLowerCase();
  const idx = lower.indexOf(termLower);

  if (idx === -1) {
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  }

  const half = Math.floor(maxLength / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(text.length, start + maxLength);
  const snippet = text.slice(start, end);

  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return prefix + snippet + suffix;
}

export default app;
