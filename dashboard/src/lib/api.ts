// HTTP client for the Hono API server.
// Base URL is relative in production (SPA served by the same server).
// In Vite dev mode, the proxy forwards /api -> localhost:7890.

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only set Content-Type when a body is present — setting it on GET requests
  // adds unnecessary headers and can confuse some intermediaries.
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (init?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function fetchProjects() {
  return request<{ projects: unknown[] }>('/projects');
}

export function fetchProject(id: string) {
  return request<{ project: unknown }>(`/projects/${id}`);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export function fetchSessions(params?: {
  projectId?: string;
  sourceTool?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.projectId) q.set('projectId', params.projectId);
  if (params?.sourceTool) q.set('sourceTool', params.sourceTool);
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return request<{ sessions: unknown[] }>(`/sessions${qs}`);
}

export function fetchSession(id: string) {
  return request<{ session: unknown }>(`/sessions/${id}`);
}

export function patchSession(id: string, body: { customTitle: string }) {
  return request<{ ok: boolean }>(`/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function fetchMessages(sessionId: string, params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return request<{ messages: unknown[] }>(`/messages/${sessionId}${qs}`);
}

// ── Insights ──────────────────────────────────────────────────────────────────

export function fetchInsights(params?: {
  projectId?: string;
  sessionId?: string;
  type?: string;
}) {
  const q = new URLSearchParams();
  if (params?.projectId) q.set('projectId', params.projectId);
  if (params?.sessionId) q.set('sessionId', params.sessionId);
  if (params?.type) q.set('type', params.type);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return request<{ insights: unknown[] }>(`/insights${qs}`);
}

export function deleteInsight(id: string) {
  return request<{ ok: boolean }>(`/insights/${id}`, { method: 'DELETE' });
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export function fetchDashboardStats(range: '7d' | '30d' | '90d' | 'all' = '7d') {
  return request<{ range: string; stats: unknown }>(`/analytics/dashboard?range=${range}`);
}

export function fetchUsageStats() {
  return request<{ stats: unknown }>('/analytics/usage');
}

// ── Analysis (Phase 4) ────────────────────────────────────────────────────────

export function analyzeSession(sessionId: string) {
  return request<unknown>('/analysis/session', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

// ── Config ────────────────────────────────────────────────────────────────────

export function fetchLlmConfig() {
  return request<{ dashboardPort: number }>('/config/llm');
}

export function saveLlmConfig(body: { dashboardPort?: number }) {
  return request<{ ok: boolean }>('/config/llm', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportMarkdown(body: {
  sessionIds?: string[];
  projectId?: string;
}): Promise<string> {
  const res = await fetch(`${BASE}/export/markdown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.text();
}
