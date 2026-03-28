import { describe, it, expect } from 'vitest';
import { normalizePatternCategory, getPatternCategoryLabel } from '../pattern-normalize.js';

// ──────────────────────────────────────────────────────
// normalizePatternCategory
// ──────────────────────────────────────────────────────

describe('normalizePatternCategory', () => {
  // ────────────────────────────────────────────────────
  // Rule 1: Exact match (case-insensitive)
  // ────────────────────────────────────────────────────

  it('returns canonical for exact match — all 8 categories', () => {
    expect(normalizePatternCategory('structured-planning')).toBe('structured-planning');
    expect(normalizePatternCategory('incremental-implementation')).toBe('incremental-implementation');
    expect(normalizePatternCategory('verification-workflow')).toBe('verification-workflow');
    expect(normalizePatternCategory('systematic-debugging')).toBe('systematic-debugging');
    expect(normalizePatternCategory('self-correction')).toBe('self-correction');
    expect(normalizePatternCategory('context-gathering')).toBe('context-gathering');
    expect(normalizePatternCategory('domain-expertise')).toBe('domain-expertise');
    expect(normalizePatternCategory('effective-tooling')).toBe('effective-tooling');
  });

  it('matches case-insensitively', () => {
    expect(normalizePatternCategory('Structured-Planning')).toBe('structured-planning');
    expect(normalizePatternCategory('INCREMENTAL-IMPLEMENTATION')).toBe('incremental-implementation');
    expect(normalizePatternCategory('Self-Correction')).toBe('self-correction');
    expect(normalizePatternCategory('Domain-Expertise')).toBe('domain-expertise');
  });

  // ────────────────────────────────────────────────────
  // Rule 1.5: Explicit alias match
  // ────────────────────────────────────────────────────

  it('resolves all structured-planning aliases', () => {
    expect(normalizePatternCategory('task-decomposition')).toBe('structured-planning');
    expect(normalizePatternCategory('plan-first')).toBe('structured-planning');
    expect(normalizePatternCategory('upfront-planning')).toBe('structured-planning');
    expect(normalizePatternCategory('phased-approach')).toBe('structured-planning');
    expect(normalizePatternCategory('task-breakdown')).toBe('structured-planning');
    expect(normalizePatternCategory('planning-before-implementation')).toBe('structured-planning');
  });

  it('resolves all effective-tooling aliases', () => {
    expect(normalizePatternCategory('agent-delegation')).toBe('effective-tooling');
    expect(normalizePatternCategory('agent-orchestration')).toBe('effective-tooling');
    expect(normalizePatternCategory('specialized-agents')).toBe('effective-tooling');
    expect(normalizePatternCategory('multi-agent')).toBe('effective-tooling');
    expect(normalizePatternCategory('tool-leverage')).toBe('effective-tooling');
  });

  it('resolves all verification-workflow aliases', () => {
    expect(normalizePatternCategory('build-test-verify')).toBe('verification-workflow');
    expect(normalizePatternCategory('test-driven-development')).toBe('verification-workflow');
    expect(normalizePatternCategory('tdd')).toBe('verification-workflow');
    expect(normalizePatternCategory('test-first')).toBe('verification-workflow');
    expect(normalizePatternCategory('pre-commit-checks')).toBe('verification-workflow');
  });

  it('resolves all systematic-debugging aliases', () => {
    expect(normalizePatternCategory('binary-search-debugging')).toBe('systematic-debugging');
    expect(normalizePatternCategory('methodical-debugging')).toBe('systematic-debugging');
    expect(normalizePatternCategory('log-based-debugging')).toBe('systematic-debugging');
    expect(normalizePatternCategory('debugging-methodology')).toBe('systematic-debugging');
  });

  it('resolves all self-correction aliases', () => {
    expect(normalizePatternCategory('course-correction')).toBe('self-correction');
    expect(normalizePatternCategory('pivot-on-failure')).toBe('self-correction');
    expect(normalizePatternCategory('backtracking')).toBe('self-correction');
  });

  it('resolves all context-gathering aliases', () => {
    expect(normalizePatternCategory('code-reading-first')).toBe('context-gathering');
    expect(normalizePatternCategory('codebase-exploration')).toBe('context-gathering');
    expect(normalizePatternCategory('understanding-before-changing')).toBe('context-gathering');
  });

  it('resolves all domain-expertise aliases', () => {
    expect(normalizePatternCategory('framework-knowledge')).toBe('domain-expertise');
    expect(normalizePatternCategory('types-first')).toBe('domain-expertise');
    expect(normalizePatternCategory('type-driven-development')).toBe('domain-expertise');
    expect(normalizePatternCategory('schema-first')).toBe('domain-expertise');
  });

  it('resolves all incremental-implementation aliases', () => {
    expect(normalizePatternCategory('small-steps')).toBe('incremental-implementation');
    expect(normalizePatternCategory('iterative-building')).toBe('incremental-implementation');
    expect(normalizePatternCategory('iterative-development')).toBe('incremental-implementation');
  });

  it('resolves aliases case-insensitively', () => {
    expect(normalizePatternCategory('Task-Decomposition')).toBe('structured-planning');
    expect(normalizePatternCategory('AGENT-DELEGATION')).toBe('effective-tooling');
    expect(normalizePatternCategory('TDD')).toBe('verification-workflow');
    expect(normalizePatternCategory('Course-Correction')).toBe('self-correction');
  });

  // ────────────────────────────────────────────────────
  // Rule 2: Levenshtein distance <= 2
  // ────────────────────────────────────────────────────

  it('normalizes typos within Levenshtein distance 2', () => {
    expect(normalizePatternCategory('self-corection')).toBe('self-correction');   // distance 1
    expect(normalizePatternCategory('domain-expertse')).toBe('domain-expertise'); // distance 1
    expect(normalizePatternCategory('context-gthering')).toBe('context-gathering'); // distance 1
  });

  it('does not match when Levenshtein distance > 2', () => {
    const result = normalizePatternCategory('completely-unrelated');
    expect(result).toBe('completely-unrelated');
  });

  // ────────────────────────────────────────────────────
  // Rule 3: Substring match (significant portion)
  // ────────────────────────────────────────────────────

  it('matches when category is a significant extension of a canonical', () => {
    // "self-correction-behavior" contains "self-correction" (15 chars, 15/24 = 0.625 > 0.5)
    expect(normalizePatternCategory('self-correction-behavior')).toBe('self-correction');
  });

  it('does not match short substrings (< 5 chars)', () => {
    const result = normalizePatternCategory('abc');
    expect(result).toBe('abc');
  });

  // ────────────────────────────────────────────────────
  // Rule 4: Novel category (no match)
  // ────────────────────────────────────────────────────

  it('returns original for novel categories', () => {
    expect(normalizePatternCategory('pair-programming')).toBe('pair-programming');
    expect(normalizePatternCategory('mob-programming')).toBe('mob-programming');
    expect(normalizePatternCategory('rubber-duck-debugging')).toBe('rubber-duck-debugging');
  });

  it('preserves original casing for novel categories', () => {
    expect(normalizePatternCategory('Custom-Pattern')).toBe('Custom-Pattern');
    expect(normalizePatternCategory('My-Novel-Category')).toBe('My-Novel-Category');
  });

  // ────────────────────────────────────────────────────
  // All canonical categories are recognized
  // ────────────────────────────────────────────────────

  it('recognizes all 8 canonical categories', () => {
    const canonicals = [
      'structured-planning',
      'incremental-implementation',
      'verification-workflow',
      'systematic-debugging',
      'self-correction',
      'context-gathering',
      'domain-expertise',
      'effective-tooling',
    ];
    for (const cat of canonicals) {
      expect(normalizePatternCategory(cat)).toBe(cat);
    }
  });
});

// ──────────────────────────────────────────────────────
// getPatternCategoryLabel
// ──────────────────────────────────────────────────────

describe('getPatternCategoryLabel', () => {
  it('returns human-readable labels for all canonical categories', () => {
    expect(getPatternCategoryLabel('structured-planning')).toBe('Structured Planning');
    expect(getPatternCategoryLabel('incremental-implementation')).toBe('Incremental Implementation');
    expect(getPatternCategoryLabel('verification-workflow')).toBe('Verification Workflow');
    expect(getPatternCategoryLabel('systematic-debugging')).toBe('Systematic Debugging');
    expect(getPatternCategoryLabel('self-correction')).toBe('Self-Correction');
    expect(getPatternCategoryLabel('context-gathering')).toBe('Context Gathering');
    expect(getPatternCategoryLabel('domain-expertise')).toBe('Domain Expertise');
    expect(getPatternCategoryLabel('effective-tooling')).toBe('Effective Tooling');
  });

  it('converts novel kebab-case categories to Title Case', () => {
    expect(getPatternCategoryLabel('pair-programming')).toBe('Pair Programming');
    expect(getPatternCategoryLabel('mob-programming')).toBe('Mob Programming');
    expect(getPatternCategoryLabel('rubber-duck-debugging')).toBe('Rubber Duck Debugging');
  });

  it('handles single-word novel categories', () => {
    expect(getPatternCategoryLabel('refactoring')).toBe('Refactoring');
  });
});
