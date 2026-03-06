import { describe, it, expect } from 'vitest';
import { normalizeFrictionCategory } from './friction-normalize.js';

// ──────────────────────────────────────────────────────
// normalizeFrictionCategory
// ──────────────────────────────────────────────────────

describe('normalizeFrictionCategory', () => {
  // ────────────────────────────────────────────────────
  // Rule 1: Exact match (case-insensitive)
  // ────────────────────────────────────────────────────

  it('returns canonical for exact match', () => {
    expect(normalizeFrictionCategory('type-error')).toBe('type-error');
    expect(normalizeFrictionCategory('wrong-approach')).toBe('wrong-approach');
    expect(normalizeFrictionCategory('race-condition')).toBe('race-condition');
  });

  it('matches case-insensitively', () => {
    expect(normalizeFrictionCategory('Type-Error')).toBe('type-error');
    expect(normalizeFrictionCategory('WRONG-APPROACH')).toBe('wrong-approach');
    expect(normalizeFrictionCategory('Missing-Dependency')).toBe('missing-dependency');
  });

  // ────────────────────────────────────────────────────
  // Rule 2: Levenshtein distance <= 2
  // ────────────────────────────────────────────────────

  it('normalizes typos within Levenshtein distance 2', () => {
    expect(normalizeFrictionCategory('type-eror')).toBe('type-error');       // distance 1
    expect(normalizeFrictionCategory('tpye-error')).toBe('type-error');      // distance 2 (transposition)
    expect(normalizeFrictionCategory('wrong-aproach')).toBe('wrong-approach'); // distance 1
    expect(normalizeFrictionCategory('stale-cach')).toBe('stale-cache');     // distance 1
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
    // "config-drift-issue" contains "config-drift" (12 chars, 12/18 = 0.67 > 0.5)
    expect(normalizeFrictionCategory('config-drift-issue')).toBe('config-drift');
  });

  it('does not match short substrings (< 5 chars)', () => {
    // Very short overlaps should not trigger substring match
    const result = normalizeFrictionCategory('abc');
    expect(result).toBe('abc');
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

  it('recognizes all 15 canonical categories', () => {
    const canonicals = [
      'wrong-approach', 'missing-dependency', 'config-drift', 'test-failure',
      'type-error', 'api-misunderstanding', 'stale-cache', 'version-mismatch',
      'permission-issue', 'incomplete-requirements', 'circular-dependency',
      'race-condition', 'environment-mismatch', 'documentation-gap', 'tooling-limitation',
    ];
    for (const cat of canonicals) {
      expect(normalizeFrictionCategory(cat)).toBe(cat);
    }
  });
});
