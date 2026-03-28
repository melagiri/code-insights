import { describe, it, expect } from 'vitest';
import { levenshtein, normalizeCategory, kebabToTitleCase } from '../normalize-utils.js';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('returns correct distance for single edit', () => {
    expect(levenshtein('kitten', 'sitten')).toBe(1);
  });

  it('returns correct distance for multiple edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
  });
});

describe('normalizeCategory', () => {
  const config: Parameters<typeof normalizeCategory>[1] = {
    canonicalCategories: ['wrong-approach', 'knowledge-gap', 'stale-assumptions'],
    aliases: { 'type-error': 'knowledge-gap', 'agent-issue': 'agent-failure' },
  };

  it('returns canonical for exact match (case-insensitive)', () => {
    expect(normalizeCategory('knowledge-gap', config)).toBe('knowledge-gap');
    expect(normalizeCategory('Knowledge-Gap', config)).toBe('knowledge-gap');
  });

  it('resolves aliases to their target', () => {
    expect(normalizeCategory('type-error', config)).toBe('knowledge-gap');
  });

  it('resolves aliases to non-canonical cluster targets', () => {
    expect(normalizeCategory('agent-issue', config)).toBe('agent-failure');
  });

  it('normalizes via Levenshtein distance <= 2', () => {
    expect(normalizeCategory('knowlede-gap', config)).toBe('knowledge-gap'); // dist 1
  });

  it('normalizes via substring match', () => {
    expect(normalizeCategory('stale-assumptions-here', config)).toBe('stale-assumptions');
  });

  it('returns original for no match', () => {
    expect(normalizeCategory('completely-unrelated', config)).toBe('completely-unrelated');
  });
});

describe('kebabToTitleCase', () => {
  it('converts kebab-case to Title Case', () => {
    expect(kebabToTitleCase('structured-planning')).toBe('Structured Planning');
    expect(kebabToTitleCase('self-correction')).toBe('Self Correction');
  });

  it('handles single word', () => {
    expect(kebabToTitleCase('planning')).toBe('Planning');
  });

  it('handles empty string', () => {
    expect(kebabToTitleCase('')).toBe('');
  });
});
