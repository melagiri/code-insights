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

const mockChat = vi.fn();
const mockIsConfigured = vi.fn(() => true);

vi.mock('./client.js', () => ({
  isLLMConfigured: (...args: unknown[]) => mockIsConfigured(...args),
  createLLMClient: () => ({
    provider: 'test',
    model: 'test-model',
    chat: mockChat,
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
  }),
}));

const { analyzeSession, analyzePromptQuality, findRecurringInsights, extractFacetsOnly } =
  await import('./analysis.js');

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function initTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

interface SessionOverrides {
  id?: string;
  project_id?: string;
  project_name?: string;
  project_path?: string;
  summary?: string | null;
  ended_at?: string;
}

function makeSession(overrides: SessionOverrides = {}) {
  return {
    id: 'sess-test',
    project_id: 'proj-test',
    project_name: 'test-project',
    project_path: '/test',
    summary: 'Test session',
    ended_at: '2025-06-15T11:00:00Z',
    ...overrides,
  };
}

interface MessageOverrides {
  id?: string;
  session_id?: string;
  type?: 'user' | 'assistant' | 'system';
  content?: string;
  thinking?: string | null;
  tool_calls?: string | null;
  tool_results?: string | null;
  usage?: string | null;
  timestamp?: string;
  parent_id?: string | null;
}

function makeMessage(overrides: MessageOverrides = {}) {
  return {
    id: 'msg-1',
    session_id: 'sess-test',
    type: 'user' as const,
    content: 'Hello, please help me with testing.',
    thinking: null,
    tool_calls: '[]',
    tool_results: '[]',
    usage: null,
    timestamp: '2025-06-15T10:00:00Z',
    parent_id: null,
    ...overrides,
  };
}

function seedTestSession(db: Database.Database) {
  db.prepare(
    `INSERT INTO projects (id, name, path, last_activity, session_count) VALUES ('proj-test', 'test-project', '/test', datetime('now'), 1)`,
  ).run();
  db.prepare(
    `INSERT INTO sessions (id, project_id, project_name, project_path, started_at, ended_at, message_count, source_tool) VALUES ('sess-test', 'proj-test', 'test-project', '/test', '2025-06-15T10:00:00Z', '2025-06-15T11:00:00Z', 5, 'claude-code')`,
  ).run();
}

// Canonical valid analysis JSON for happy-path tests
const VALID_ANALYSIS_RESPONSE = {
  summary: { title: 'Test Summary', content: 'A summary.', bullets: ['point 1'] },
  decisions: [
    {
      title: 'Use Vitest',
      situation: 'Need testing',
      choice: 'Vitest',
      reasoning: 'Fast',
      confidence: 85,
    },
  ],
  learnings: [
    { title: 'Testing helps', takeaway: 'Write tests early', confidence: 80 },
  ],
  facets: {
    outcome_satisfaction: 'high',
    workflow_pattern: 'plan-then-implement',
    had_course_correction: false,
    iteration_count: 2,
    friction_points: [],
    effective_patterns: [
      {
        category: 'verification-workflow',
        description: 'TDD',
        confidence: 85,
        driver: 'user-driven',
      },
    ],
  },
};

const VALID_PQ_RESPONSE = {
  efficiency_score: 75,
  assessment: 'Good prompting.',
  message_overhead: 'low',
  takeaways: [{ before: 'vague', after: 'specific', category: 'vague-request' }],
  findings: [
    { category: 'precise-request', type: 'strength', description: 'Clear goals' },
  ],
  dimension_scores: {
    context_provision: 80,
    request_specificity: 70,
    scope_management: 85,
    information_timing: 75,
    correction_quality: 75,
  },
};

// ──────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────

beforeEach(() => {
  testDb = initTestDb();
  seedTestSession(testDb);
  mockChat.mockReset();
  mockIsConfigured.mockReturnValue(true);
});

afterEach(() => {
  testDb.close();
});

// ──────────────────────────────────────────────────────
// analyzeSession
// ──────────────────────────────────────────────────────

describe('analyzeSession', () => {
  it('guard: LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM not configured');
  });

  it('guard: empty messages', async () => {
    const result = await analyzeSession(makeSession(), []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No messages');
  });

  it('parse failure — non-JSON response', async () => {
    mockChat.mockResolvedValue({ content: 'not JSON at all', usage: null });
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe('no_json_found');
  });

  it('AbortError propagation', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    mockChat.mockRejectedValue(abortErr);
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe('abort');
  });

  it('API error propagation', async () => {
    mockChat.mockRejectedValue(new Error('Rate limit'));
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe('api_error');
    expect(result.error).toBe('Rate limit');
  });

  it('happy path — valid JSON response writes insights and facets', async () => {
    mockChat.mockResolvedValue({
      content: JSON.stringify(VALID_ANALYSIS_RESPONSE),
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(true);
    // summary + 1 decision (85 >= 70) + 1 learning (80 >= 70) = 3
    expect(result.insights.length).toBe(3);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });

    // Verify insights written to DB
    const dbInsights = testDb.prepare('SELECT * FROM insights WHERE session_id = ?').all('sess-test');
    expect(dbInsights.length).toBe(3);

    // Verify facets written to DB
    const facetRow = testDb.prepare('SELECT * FROM session_facets WHERE session_id = ?').get('sess-test') as Record<string, unknown> | undefined;
    expect(facetRow).toBeTruthy();
    expect(facetRow!.outcome_satisfaction).toBe('high');
    expect(facetRow!.workflow_pattern).toBe('plan-then-implement');
    expect(facetRow!.had_course_correction).toBe(0);
    expect(facetRow!.iteration_count).toBe(2);
  });

  it('confidence filtering — low-confidence decisions and learnings dropped', async () => {
    const response = {
      ...VALID_ANALYSIS_RESPONSE,
      decisions: [
        { title: 'High confidence', situation: 'a', choice: 'b', reasoning: 'c', confidence: 85 },
        { title: 'Low confidence', situation: 'a', choice: 'b', reasoning: 'c', confidence: 50 },
      ],
      learnings: [
        { title: 'Good learning', takeaway: 'Keep at it', confidence: 80 },
        { title: 'Weak learning', takeaway: 'Maybe', confidence: 60 },
      ],
    };

    mockChat.mockResolvedValue({ content: JSON.stringify(response), usage: null });
    const result = await analyzeSession(makeSession(), [makeMessage()]);
    expect(result.success).toBe(true);

    const types = result.insights.map(i => i.type);
    // 1 summary + 1 decision (85) + 1 learning (80) = 3 (50 and 60 filtered)
    expect(types).toEqual(['summary', 'decision', 'learning']);
    expect(result.insights.length).toBe(3);
  });

  it('facet normalization — task-decomposition mapped to structured-planning', async () => {
    const response = {
      ...VALID_ANALYSIS_RESPONSE,
      facets: {
        ...VALID_ANALYSIS_RESPONSE.facets,
        effective_patterns: [
          { category: 'task-decomposition', description: 'Broke it down', confidence: 90, driver: 'user-driven' },
        ],
      },
    };

    mockChat.mockResolvedValue({ content: JSON.stringify(response), usage: null });
    await analyzeSession(makeSession(), [makeMessage()]);

    const facetRow = testDb.prepare('SELECT effective_patterns FROM session_facets WHERE session_id = ?').get('sess-test') as { effective_patterns: string } | undefined;
    expect(facetRow).toBeTruthy();
    const patterns = JSON.parse(facetRow!.effective_patterns);
    expect(patterns[0].category).toBe('structured-planning');
  });
});

// ──────────────────────────────────────────────────────
// analyzePromptQuality
// ──────────────────────────────────────────────────────

describe('analyzePromptQuality', () => {
  const twoUserMessages = [
    makeMessage({ id: 'msg-1', type: 'user', content: 'First user message with enough content.' }),
    makeMessage({ id: 'msg-2', type: 'assistant', content: 'Response.' }),
    makeMessage({ id: 'msg-3', type: 'user', content: 'Second user message with enough content.' }),
  ];

  it('guard: LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await analyzePromptQuality(makeSession(), twoUserMessages);
    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM not configured');
  });

  it('guard: empty messages', async () => {
    const result = await analyzePromptQuality(makeSession(), []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No messages');
  });

  it('guard: fewer than 2 user messages', async () => {
    const result = await analyzePromptQuality(makeSession(), [
      makeMessage({ type: 'user' }),
      makeMessage({ id: 'msg-2', type: 'assistant' }),
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('guard: 1 human + many tool-result rows is rejected (V6 gate fix)', async () => {
    // Pre-fix: this would pass because filter was m.type === 'user' (50 rows > 2).
    // Post-fix: only genuine human messages count for the gate (1 < 2 → rejected).
    const toolResultContent = '[{"type":"tool_result","tool_use_id":"toolu_abc","content":"ok"}]';
    const messages = [
      makeMessage({ id: 'msg-1', type: 'user', content: 'The one real human message.' }),
      ...Array.from({ length: 50 }, (_, i) =>
        makeMessage({ id: `tool-${i}`, type: 'user', content: toolResultContent })
      ),
      makeMessage({ id: 'asst-1', type: 'assistant', content: 'Response.' }),
    ];
    const result = await analyzePromptQuality(makeSession(), messages);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('guard: 2 human messages among tool-results passes the gate', async () => {
    mockChat.mockResolvedValue({
      content: JSON.stringify(VALID_PQ_RESPONSE),
      usage: { inputTokens: 200, outputTokens: 80 },
    });

    const toolResultContent = '[{"type":"tool_result","tool_use_id":"toolu_abc","content":"ok"}]';
    const messages = [
      makeMessage({ id: 'msg-1', type: 'user', content: 'First real human message.' }),
      makeMessage({ id: 'tool-1', type: 'user', content: toolResultContent }),
      makeMessage({ id: 'tool-2', type: 'user', content: toolResultContent }),
      makeMessage({ id: 'msg-2', type: 'assistant', content: 'Reply.' }),
      makeMessage({ id: 'msg-3', type: 'user', content: 'Second real human message.' }),
    ];
    const result = await analyzePromptQuality(makeSession(), messages);
    expect(result.success).toBe(true);
  });

  it('happy path — valid PQ response creates prompt_quality insight', async () => {
    mockChat.mockResolvedValue({
      content: JSON.stringify(VALID_PQ_RESPONSE),
      usage: { inputTokens: 200, outputTokens: 80 },
    });

    const result = await analyzePromptQuality(makeSession(), twoUserMessages);
    expect(result.success).toBe(true);
    expect(result.insights.length).toBe(1);
    expect(result.insights[0].type).toBe('prompt_quality');
    expect(result.insights[0].title).toContain('75');

    // Verify metadata
    const meta = JSON.parse(result.insights[0].metadata!);
    expect(meta.efficiency_score).toBe(75);
    expect(meta.findings).toHaveLength(1);
    expect(meta.takeaways).toHaveLength(1);
    expect(meta.dimension_scores.context_provision).toBe(80);

    // Verify written to DB
    const dbRow = testDb.prepare(
      "SELECT * FROM insights WHERE session_id = ? AND type = 'prompt_quality'",
    ).get('sess-test');
    expect(dbRow).toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────
// findRecurringInsights
// ──────────────────────────────────────────────────────

describe('findRecurringInsights', () => {
  const makeInsight = (id: string, overrides: Record<string, string> = {}) => ({
    id,
    type: 'decision',
    title: `Insight ${id}`,
    summary: `Summary for ${id}`,
    project_name: 'test-project',
    session_id: `sess-${id}`,
    ...overrides,
  });

  it('guard: LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await findRecurringInsights([makeInsight('i1'), makeInsight('i2')]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM not configured');
  });

  it('guard: fewer than 2 non-summary insights', async () => {
    const result = await findRecurringInsights([
      makeInsight('i1', { type: 'decision' }),
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('filters summary and prompt_quality types', async () => {
    const result = await findRecurringInsights([
      makeInsight('i1', { type: 'summary' }),
      makeInsight('i2', { type: 'prompt_quality' }),
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('validates returned IDs — fake IDs filtered out', async () => {
    // Seed insights into DB so UPDATE works
    const insights = [makeInsight('i1'), makeInsight('i2'), makeInsight('i3')];

    mockChat.mockResolvedValue({
      content: JSON.stringify({
        groups: [{ insightIds: ['i1', 'i2', 'fake-id'], theme: 'Testing theme' }],
      }),
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await findRecurringInsights(insights);
    expect(result.success).toBe(true);
    expect(result.groups.length).toBe(1);
    expect(result.groups[0].insightIds).toEqual(['i1', 'i2']);
    expect(result.groups[0].insightIds).not.toContain('fake-id');
  });

  it('groups with fewer than 2 valid members are dropped', async () => {
    const insights = [makeInsight('i1'), makeInsight('i2')];

    mockChat.mockResolvedValue({
      content: JSON.stringify({
        groups: [
          { insightIds: ['i1', 'fake-only'], theme: 'Bad group' },
          { insightIds: ['i1', 'i2'], theme: 'Good group' },
        ],
      }),
      usage: null,
    });

    const result = await findRecurringInsights(insights);
    expect(result.success).toBe(true);
    // First group has only 1 valid ID after filtering → dropped
    expect(result.groups.length).toBe(1);
    expect(result.groups[0].theme).toBe('Good group');
  });
});

// ──────────────────────────────────────────────────────
// extractFacetsOnly
// ──────────────────────────────────────────────────────

describe('extractFacetsOnly', () => {
  const validFacetResponse = {
    outcome_satisfaction: 'medium',
    workflow_pattern: 'iterative',
    had_course_correction: true,
    course_correction_reason: 'Changed approach',
    iteration_count: 3,
    friction_points: [
      {
        _reasoning: 'test reasoning',
        category: 'wrong-approach',
        description: 'Tried wrong path',
        confidence: 80,
        attribution: 'user-actionable',
      },
    ],
    effective_patterns: [
      {
        _reasoning: 'test reasoning',
        category: 'verification-workflow',
        description: 'Ran tests often',
        confidence: 90,
        driver: 'user-driven',
      },
    ],
  };

  it('guard: LLM not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    const result = await extractFacetsOnly(makeSession(), [makeMessage()]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM not configured');
  });

  it('guard: empty messages', async () => {
    const result = await extractFacetsOnly(makeSession(), []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No messages');
  });

  it('happy path — valid facet JSON saved to DB', async () => {
    mockChat.mockResolvedValue({
      content: JSON.stringify(validFacetResponse),
      usage: null,
    });

    const result = await extractFacetsOnly(makeSession(), [makeMessage()]);
    expect(result.success).toBe(true);

    const facetRow = testDb.prepare('SELECT * FROM session_facets WHERE session_id = ?').get('sess-test') as Record<string, unknown> | undefined;
    expect(facetRow).toBeTruthy();
    expect(facetRow!.outcome_satisfaction).toBe('medium');
    expect(facetRow!.had_course_correction).toBe(1);
    expect(facetRow!.iteration_count).toBe(3);
  });

  it('pattern normalization — task-decomposition saved as structured-planning', async () => {
    const response = {
      ...validFacetResponse,
      effective_patterns: [
        { category: 'task-decomposition', description: 'Broke it down', confidence: 85, driver: 'collaborative' },
      ],
    };

    mockChat.mockResolvedValue({
      content: JSON.stringify(response),
      usage: null,
    });

    await extractFacetsOnly(makeSession(), [makeMessage()]);

    const facetRow = testDb.prepare('SELECT effective_patterns FROM session_facets WHERE session_id = ?').get('sess-test') as { effective_patterns: string } | undefined;
    expect(facetRow).toBeTruthy();
    const patterns = JSON.parse(facetRow!.effective_patterns);
    expect(patterns[0].category).toBe('structured-planning');
  });
});
