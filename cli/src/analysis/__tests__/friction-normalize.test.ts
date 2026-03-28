import { describe, it, expect } from 'vitest';
import { normalizeFrictionCategory } from '../friction-normalize.js';

// ──────────────────────────────────────────────────────
// normalizeFrictionCategory
// ──────────────────────────────────────────────────────

describe('normalizeFrictionCategory', () => {
  // ────────────────────────────────────────────────────
  // Rule 1: Exact match (case-insensitive)
  // ────────────────────────────────────────────────────

  it('returns canonical for exact match', () => {
    expect(normalizeFrictionCategory('knowledge-gap')).toBe('knowledge-gap');
    expect(normalizeFrictionCategory('wrong-approach')).toBe('wrong-approach');
    expect(normalizeFrictionCategory('stale-assumptions')).toBe('stale-assumptions');
    expect(normalizeFrictionCategory('context-loss')).toBe('context-loss');
    expect(normalizeFrictionCategory('scope-creep')).toBe('scope-creep');
    expect(normalizeFrictionCategory('repeated-mistakes')).toBe('repeated-mistakes');
  });

  it('matches case-insensitively', () => {
    expect(normalizeFrictionCategory('Knowledge-Gap')).toBe('knowledge-gap');
    expect(normalizeFrictionCategory('WRONG-APPROACH')).toBe('wrong-approach');
    expect(normalizeFrictionCategory('Stale-Assumptions')).toBe('stale-assumptions');
  });

  // ────────────────────────────────────────────────────
  // Rule 2: Levenshtein distance <= 2
  // ────────────────────────────────────────────────────

  it('normalizes typos within Levenshtein distance 2', () => {
    expect(normalizeFrictionCategory('knowlede-gap')).toBe('knowledge-gap');   // distance 1
    expect(normalizeFrictionCategory('wrong-aproach')).toBe('wrong-approach'); // distance 1
    expect(normalizeFrictionCategory('scope-crepp')).toBe('scope-creep');      // distance 1
  });

  it('does not match when Levenshtein distance > 2', () => {
    // "typo-error" is distance 3 from "type-error" — too far
    const result = normalizeFrictionCategory('completely-different-thing');
    expect(result).toBe('completely-different-thing');
  });

  // ────────────────────────────────────────────────────
  // Rule 3: Substring match (significant portion)
  // ────────────────────────────────────────────────────

  it('matches when canonical is a significant substring', () => {
    // "scope-creep-issue" contains "scope-creep" (11 chars, 11/17 = 0.65 > 0.5)
    expect(normalizeFrictionCategory('scope-creep-issue')).toBe('scope-creep');
  });

  it('does not match short substrings (< 5 chars)', () => {
    // Very short overlaps should not trigger substring match
    const result = normalizeFrictionCategory('abc');
    expect(result).toBe('abc');
  });

  // ────────────────────────────────────────────────────
  // Rule 1.5: Explicit alias match
  // ────────────────────────────────────────────────────

  it('remaps legacy canonical categories to new taxonomy', () => {
    // These were canonical in the old 15-category taxonomy; they now map to new categories
    expect(normalizeFrictionCategory('missing-dependency')).toBe('stale-assumptions');
    expect(normalizeFrictionCategory('config-drift')).toBe('stale-assumptions');
    expect(normalizeFrictionCategory('stale-cache')).toBe('stale-assumptions');
    expect(normalizeFrictionCategory('version-mismatch')).toBe('stale-assumptions');
    expect(normalizeFrictionCategory('permission-issue')).toBe('stale-assumptions');
    expect(normalizeFrictionCategory('environment-mismatch')).toBe('stale-assumptions');
    expect(normalizeFrictionCategory('race-condition')).toBe('wrong-approach');
    expect(normalizeFrictionCategory('circular-dependency')).toBe('wrong-approach');
    expect(normalizeFrictionCategory('test-failure')).toBe('wrong-approach');
    expect(normalizeFrictionCategory('type-error')).toBe('knowledge-gap');
    expect(normalizeFrictionCategory('api-misunderstanding')).toBe('knowledge-gap');
  });

  it('remaps legacy aliases case-insensitively', () => {
    expect(normalizeFrictionCategory('Missing-Dependency')).toBe('stale-assumptions');
    expect(normalizeFrictionCategory('TYPE-ERROR')).toBe('knowledge-gap');
  });

  it('resolves all agent-orchestration alias variants to the cluster target', () => {
    expect(normalizeFrictionCategory('agent-lifecycle-issue')).toBe('agent-orchestration-failure');
    expect(normalizeFrictionCategory('agent-communication-failure')).toBe('agent-orchestration-failure');
    expect(normalizeFrictionCategory('agent-communication-breakdown')).toBe('agent-orchestration-failure');
    expect(normalizeFrictionCategory('agent-lifecycle-management')).toBe('agent-orchestration-failure');
    expect(normalizeFrictionCategory('agent-shutdown-failure')).toBe('agent-orchestration-failure');
  });

  it('resolves all rate-limit alias variants to the cluster target', () => {
    expect(normalizeFrictionCategory('api-rate-limit')).toBe('rate-limit-hit');
    expect(normalizeFrictionCategory('rate-limiting')).toBe('rate-limit-hit');
    expect(normalizeFrictionCategory('rate-limited')).toBe('rate-limit-hit');
  });

  it('resolves aliases case-insensitively', () => {
    expect(normalizeFrictionCategory('Agent-Lifecycle-Issue')).toBe('agent-orchestration-failure');
    expect(normalizeFrictionCategory('API-RATE-LIMIT')).toBe('rate-limit-hit');
  });

  it('does not further normalize non-canonical alias targets via Levenshtein', () => {
    // "agent-orchestration-failure" is NOT in CANONICAL_FRICTION_CATEGORIES,
    // but when returned as an alias target it should be returned as-is (not mangled by Levenshtein).
    // Here we test the target itself — it should pass through as a novel category since it
    // doesn't match any canonical via Levenshtein and isn't in the alias map as a key.
    const result = normalizeFrictionCategory('agent-orchestration-failure');
    // Not canonical, not an alias key → returned as novel category (original casing)
    expect(result).toBe('agent-orchestration-failure');
  });

  it('does not further normalize "rate-limit-hit" target when passed directly', () => {
    // Same as above — "rate-limit-hit" is not canonical, so if someone passes it directly
    // it comes back as-is (novel category).
    const result = normalizeFrictionCategory('rate-limit-hit');
    expect(result).toBe('rate-limit-hit');
  });

  // ────────────────────────────────────────────────────
  // Rule 4: Novel category (no match)
  // ────────────────────────────────────────────────────

  it('returns original for novel categories', () => {
    expect(normalizeFrictionCategory('database-deadlock')).toBe('database-deadlock');
    expect(normalizeFrictionCategory('memory-leak')).toBe('memory-leak');
    expect(normalizeFrictionCategory('flaky-ci')).toBe('flaky-ci');
  });

  it('preserves original casing for novel categories', () => {
    expect(normalizeFrictionCategory('Custom-Category')).toBe('Custom-Category');
  });

  // ────────────────────────────────────────────────────
  // All canonical categories are recognized
  // ────────────────────────────────────────────────────

  it('recognizes all 9 canonical categories', () => {
    const canonicals = [
      'wrong-approach',
      'knowledge-gap',
      'stale-assumptions',
      'incomplete-requirements',
      'context-loss',
      'scope-creep',
      'repeated-mistakes',
      'documentation-gap',
      'tooling-limitation',
    ];
    for (const cat of canonicals) {
      expect(normalizeFrictionCategory(cat)).toBe(cat);
    }
  });
});
