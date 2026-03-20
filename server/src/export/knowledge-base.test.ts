import { describe, it, expect } from 'vitest';
import { formatKnowledgeBase, SessionRow, InsightRow } from './knowledge-base.js';

// ──────────────────────────────────────────────────────
// Factories
// ──────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'session-1',
    project_name: 'my-project',
    generated_title: 'Generated Title',
    custom_title: null,
    started_at: '2026-01-01T10:00:00Z',
    ended_at: '2026-01-01T11:00:00Z',
    message_count: 20,
    estimated_cost_usd: 0.05,
    session_character: 'feature_build',
    source_tool: 'claude-code',
    ...overrides,
  };
}

function makeInsight(overrides: Partial<InsightRow> = {}): InsightRow {
  return {
    id: 'insight-1',
    session_id: 'session-1',
    project_id: 'project-1',
    project_name: 'my-project',
    type: 'decision',
    title: 'Use TypeScript strict mode',
    content: 'Enable strict mode in tsconfig.json',
    summary: null,
    bullets: null,
    confidence: 90,
    source: null,
    metadata: null,
    timestamp: '2026-01-01T10:30:00Z',
    created_at: '2026-01-01T10:30:00Z',
    scope: null,
    analysis_version: null,
    linked_insight_ids: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — header and empty state
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — header', () => {
  it('returns valid markdown with header for empty sessions and insights', () => {
    const result = formatKnowledgeBase([], []);
    expect(result).toContain('# Code Insights Export');
    expect(result).toContain('0 sessions');
    expect(result).toContain('0 insights');
  });

  it('emits note when no insights are present', () => {
    const result = formatKnowledgeBase([], []);
    expect(result).toContain('No insights found');
  });

  it('includes session count in plural form', () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })];
    const result = formatKnowledgeBase(sessions, []);
    expect(result).toContain('2 sessions');
  });

  it('uses singular form for one session', () => {
    const result = formatKnowledgeBase([makeSession()], []);
    expect(result).toContain('1 session,');
    expect(result).not.toContain('1 sessions');
  });

  it('uses singular form for one insight', () => {
    const session = makeSession();
    const insight = makeInsight({ session_id: session.id });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('1 insight');
    expect(result).not.toContain('1 insights');
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — session metadata rendering
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — session metadata', () => {
  it('renders session with custom_title over generated_title', () => {
    const session = makeSession({ custom_title: 'My Custom Title', generated_title: 'Generated Title' });
    const result = formatKnowledgeBase([session], []);
    expect(result).toContain('## Session: My Custom Title');
    expect(result).not.toContain('Generated Title');
  });

  it('falls back to generated_title when no custom_title', () => {
    const session = makeSession({ custom_title: null, generated_title: 'Generated Title' });
    const result = formatKnowledgeBase([session], []);
    expect(result).toContain('## Session: Generated Title');
  });

  it('falls back to session id when no titles', () => {
    const session = makeSession({ id: 'abc123', custom_title: null, generated_title: null });
    const result = formatKnowledgeBase([session], []);
    expect(result).toContain('## Session: abc123');
  });

  it('renders project name, character, source tool, and cost', () => {
    const session = makeSession();
    const result = formatKnowledgeBase([session], []);
    expect(result).toContain('**Project:** my-project');
    expect(result).toContain('**Character:** feature_build');
    expect(result).toContain('**Source:** claude-code');
    expect(result).toContain('**Cost:** $0.05');
  });

  it('renders period and message count', () => {
    const session = makeSession({
      started_at: '2026-01-01T10:00:00Z',
      ended_at: '2026-01-01T11:00:00Z',
      message_count: 42,
    });
    const result = formatKnowledgeBase([session], []);
    expect(result).toContain('**Period:** 2026-01-01T10:00:00Z — 2026-01-01T11:00:00Z');
    expect(result).toContain('**Messages:** 42');
  });

  it('renders period with only started_at', () => {
    const session = makeSession({ ended_at: null });
    const result = formatKnowledgeBase([session], []);
    expect(result).toContain('**Period:** 2026-01-01T10:00:00Z');
  });

  it('shows no insights message for session without insights', () => {
    const result = formatKnowledgeBase([makeSession()], []);
    expect(result).toContain('*No insights for this session.*');
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — decision insights
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — decision insights', () => {
  it('renders Decisions section for decision-type insights', () => {
    const session = makeSession();
    const insight = makeInsight({ type: 'decision' });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('### Decisions');
    expect(result).toContain('#### Use TypeScript strict mode');
  });

  it('renders structured decision metadata fields', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'decision',
      metadata: JSON.stringify({
        situation: 'Setting up a new TS project',
        choice: 'strict mode enabled',
        reasoning: 'Catches more errors at compile time',
        trade_offs: 'More verbose types required',
        revisit_when: 'Migrating legacy JS code',
      }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Situation:** Setting up a new TS project');
    expect(result).toContain('**Choice:** strict mode enabled');
    expect(result).toContain('**Reasoning:** Catches more errors at compile time');
    expect(result).toContain('**Trade-offs:** More verbose types required');
    expect(result).toContain('**Revisit When:** Migrating legacy JS code');
  });

  it('renders alternatives for decisions', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'decision',
      metadata: JSON.stringify({
        choice: 'strict mode',
        alternatives: [
          { option: 'loose mode', rejected_because: 'misses type errors' },
          'no-check mode',
        ],
      }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Alternatives Considered:**');
    expect(result).toContain('- loose mode — rejected because misses type errors');
    expect(result).toContain('- no-check mode');
  });

  it('falls back to raw content when no structured metadata', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'decision',
      content: 'Plain decision content',
      metadata: null,
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('Plain decision content');
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — learning insights
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — learning insights', () => {
  it('renders Learnings section for learning-type insights', () => {
    const session = makeSession();
    const insight = makeInsight({ type: 'learning', title: 'Avoid global state' });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('### Learnings');
    expect(result).toContain('#### Avoid global state');
  });

  it('renders structured learning metadata fields', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'learning',
      metadata: JSON.stringify({
        symptom: 'Race conditions in tests',
        root_cause: 'Shared mutable state',
        takeaway: 'Use immutable data structures',
        applies_when: 'Writing concurrent code',
      }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**What Happened:** Race conditions in tests');
    expect(result).toContain('**Root Cause:** Shared mutable state');
    expect(result).toContain('**Takeaway:** Use immutable data structures');
    expect(result).toContain('**Applies When:** Writing concurrent code');
  });

  it('falls back to raw content when no structured learning metadata', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'learning',
      content: 'Plain learning content',
      metadata: null,
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('Plain learning content');
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — prompt_quality insights
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — prompt_quality insights', () => {
  it('renders Prompt Quality section for prompt_quality-type insights', () => {
    const session = makeSession();
    const insight = makeInsight({ type: 'prompt_quality' });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('### Prompt Quality');
  });

  it('renders efficiency score and overhead', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'prompt_quality',
      metadata: JSON.stringify({
        efficiency_score: 72,
        message_overhead: 4,
      }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Efficiency:** 72/100');
    expect(result).toContain('**Potential Savings:** 4 fewer messages');
  });

  it('renders legacy efficiencyScore field', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'prompt_quality',
      metadata: JSON.stringify({
        efficiencyScore: 65,
      }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Efficiency:** 65/100');
  });

  it('renders new schema findings — deficits and strengths', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'prompt_quality',
      metadata: JSON.stringify({
        findings: [
          {
            type: 'deficit',
            category: 'vague-request',
            description: 'Request was too vague',
            suggested_improvement: 'Be more specific',
          },
          {
            type: 'strength',
            category: 'effective-context',
            description: 'Good context provided',
          },
        ],
      }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Prompting Issues:**');
    expect(result).toContain('Request was too vague [vague-request] — Fix: Be more specific');
    expect(result).toContain('**Prompting Strengths:**');
    expect(result).toContain('Good context provided [effective-context]');
  });

  it('renders legacy antiPatterns schema', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'prompt_quality',
      metadata: JSON.stringify({
        antiPatterns: [
          { name: 'Vague prompts', count: 3, fix: 'Add specifics' },
        ],
      }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Anti-Patterns:**');
    expect(result).toContain('- Vague prompts (seen 3x) — Fix: Add specifics');
  });

  it('renders legacy wastedTurns schema', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'prompt_quality',
      metadata: JSON.stringify({
        wastedTurns: [
          { messageIndex: 5, reason: 'Unclear intent', suggestedRewrite: 'Clarify the goal' },
        ],
      }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Wasted Turns:**');
    expect(result).toContain('- Msg #5: Unclear intent');
    expect(result).toContain('- Better: "Clarify the goal"');
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — summary insights
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — summary insights', () => {
  it('renders Summary section for summary-type insights', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'summary',
      content: 'Session went well',
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('### Summary');
    expect(result).toContain('Session went well');
  });

  it('renders outcome from metadata', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'summary',
      metadata: JSON.stringify({ outcome: 'Feature shipped successfully' }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Outcome:** Feature shipped successfully');
  });

  it('renders bullets from the bullets column', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'summary',
      bullets: JSON.stringify(['First point', 'Second point']),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('- First point');
    expect(result).toContain('- Second point');
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — multiple sessions and insights
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — multiple sessions', () => {
  it('renders each session as a separate section', () => {
    const sessions = [
      makeSession({ id: 's1', custom_title: 'Session Alpha' }),
      makeSession({ id: 's2', custom_title: 'Session Beta' }),
    ];
    const result = formatKnowledgeBase(sessions, []);
    expect(result).toContain('## Session: Session Alpha');
    expect(result).toContain('## Session: Session Beta');
  });

  it('associates insights with their correct sessions', () => {
    const sessions = [
      makeSession({ id: 's1', custom_title: 'First Session' }),
      makeSession({ id: 's2', custom_title: 'Second Session' }),
    ];
    const insights = [
      makeInsight({ id: 'i1', session_id: 's1', type: 'decision', title: 'Decision for S1' }),
      makeInsight({ id: 'i2', session_id: 's2', type: 'decision', title: 'Decision for S2' }),
    ];
    const result = formatKnowledgeBase(sessions, insights);
    // Both sections present and the insights appear in the right positions
    const s1Pos = result.indexOf('## Session: First Session');
    const s2Pos = result.indexOf('## Session: Second Session');
    const d1Pos = result.indexOf('Decision for S1');
    const d2Pos = result.indexOf('Decision for S2');
    expect(s1Pos).toBeLessThan(d1Pos);
    expect(d1Pos).toBeLessThan(s2Pos);
    expect(s2Pos).toBeLessThan(d2Pos);
  });

  it('does not show "no insights" for sessions that have insights', () => {
    const session = makeSession();
    const insight = makeInsight({ type: 'decision' });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).not.toContain('*No insights for this session.*');
  });

  it('handles sessions without insights gracefully', () => {
    const sessions = [
      makeSession({ id: 's1', custom_title: 'Has Insights' }),
      makeSession({ id: 's2', custom_title: 'No Insights' }),
    ];
    const insights = [makeInsight({ session_id: 's1', type: 'decision' })];
    const result = formatKnowledgeBase(sessions, insights);
    expect(result).toContain('## Session: Has Insights');
    expect(result).toContain('## Session: No Insights');
    expect(result).toContain('*No insights for this session.*');
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — multiple insight types per session
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — multiple insight types per session', () => {
  it('renders all insight type sections when session has mixed insights', () => {
    const session = makeSession();
    const insights = [
      makeInsight({ id: 'i1', type: 'decision', title: 'My Decision' }),
      makeInsight({ id: 'i2', type: 'learning', title: 'My Learning' }),
      makeInsight({ id: 'i3', type: 'prompt_quality', title: 'My PQ' }),
    ];
    const result = formatKnowledgeBase([session], insights);
    expect(result).toContain('### Decisions');
    expect(result).toContain('### Learnings');
    expect(result).toContain('### Prompt Quality');
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — linked_insight_ids
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — linked_insight_ids', () => {
  it('does not crash when linked_insight_ids is set', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'decision',
      linked_insight_ids: JSON.stringify(['other-insight-id']),
    });
    expect(() => formatKnowledgeBase([session], [insight])).not.toThrow();
  });

  it('does not crash when linked_insight_ids is null', () => {
    const session = makeSession();
    const insight = makeInsight({ type: 'decision', linked_insight_ids: null });
    expect(() => formatKnowledgeBase([session], [insight])).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────
// formatKnowledgeBase — edge cases
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — edge cases', () => {
  it('handles null/missing session fields gracefully', () => {
    const session = makeSession({
      project_name: null,
      session_character: null,
      source_tool: null,
      estimated_cost_usd: null,
      started_at: null,
      ended_at: null,
      message_count: null,
    });
    expect(() => formatKnowledgeBase([session], [])).not.toThrow();
  });

  it('handles malformed metadata JSON gracefully', () => {
    const session = makeSession();
    const insight = makeInsight({ type: 'decision', metadata: '{invalid json' });
    expect(() => formatKnowledgeBase([session], [insight])).not.toThrow();
  });

  it('handles malformed bullets JSON gracefully', () => {
    const session = makeSession();
    const insight = makeInsight({ type: 'summary', bullets: '[invalid' });
    expect(() => formatKnowledgeBase([session], [insight])).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────
// Fix 6: asString() helper — metadata type narrowing
// Tests are via formatKnowledgeBase since asString is private
// ──────────────────────────────────────────────────────

describe('formatKnowledgeBase — asString metadata narrowing (Fix 6)', () => {
  it('renders string metadata fields correctly', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'summary',
      metadata: JSON.stringify({ outcome: 'Refactored the auth module' }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Outcome:** Refactored the auth module');
  });

  it('omits metadata field when value is an object (prevents [object Object])', () => {
    // LLM returned outcome as { value: "..." } instead of a plain string
    const session = makeSession();
    const insight = makeInsight({
      type: 'summary',
      metadata: JSON.stringify({ outcome: { value: 'Some outcome' } }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    // Must NOT render "[object Object]" in output
    expect(result).not.toContain('[object Object]');
    // The **Outcome:** line should be omitted entirely since asString returns undefined
    expect(result).not.toContain('**Outcome:**');
  });

  it('omits metadata field when value is an array', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'decision',
      metadata: JSON.stringify({ reasoning: ['step1', 'step2'] }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).not.toContain('[object Object]');
    expect(result).not.toContain('**Reasoning:**');
  });

  it('omits metadata field when value is a number', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'decision',
      metadata: JSON.stringify({ situation: 42 }),
    });
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).not.toContain('**Situation:** 42');
  });

  it('does not throw when metadata has mixed correct and incorrect types', () => {
    const session = makeSession();
    const insight = makeInsight({
      type: 'decision',
      metadata: JSON.stringify({
        situation: 'Valid string',
        choice: { nested: 'object' },   // should be omitted
        reasoning: 'Another valid string',
      }),
    });
    expect(() => formatKnowledgeBase([session], [insight])).not.toThrow();
    const result = formatKnowledgeBase([session], [insight]);
    expect(result).toContain('**Situation:** Valid string');
    expect(result).not.toContain('[object Object]');
    expect(result).toContain('**Reasoning:** Another valid string');
  });
});
