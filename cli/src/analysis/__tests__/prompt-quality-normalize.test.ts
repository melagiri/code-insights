import { describe, it, expect } from 'vitest';
import { normalizePromptQualityCategory, getPQCategoryLabel, getPQCategoryType } from '../prompt-quality-normalize.js';

describe('normalizePromptQualityCategory', () => {
  // Rule 1: Exact match
  it('returns canonical for exact match', () => {
    expect(normalizePromptQualityCategory('vague-request')).toBe('vague-request');
    expect(normalizePromptQualityCategory('missing-context')).toBe('missing-context');
    expect(normalizePromptQualityCategory('late-constraint')).toBe('late-constraint');
    expect(normalizePromptQualityCategory('precise-request')).toBe('precise-request');
    expect(normalizePromptQualityCategory('effective-context')).toBe('effective-context');
    expect(normalizePromptQualityCategory('productive-correction')).toBe('productive-correction');
  });

  it('matches case-insensitively', () => {
    expect(normalizePromptQualityCategory('Vague-Request')).toBe('vague-request');
    expect(normalizePromptQualityCategory('MISSING-CONTEXT')).toBe('missing-context');
  });

  // Rule 1.5: Aliases
  it('remaps common LLM variants to canonical categories', () => {
    expect(normalizePromptQualityCategory('vague-instructions')).toBe('vague-request');
    expect(normalizePromptQualityCategory('unclear-request')).toBe('vague-request');
    expect(normalizePromptQualityCategory('imprecise-prompting')).toBe('vague-request');
    expect(normalizePromptQualityCategory('missing-information')).toBe('missing-context');
    expect(normalizePromptQualityCategory('insufficient-context')).toBe('missing-context');
    expect(normalizePromptQualityCategory('late-context')).toBe('late-constraint');
    expect(normalizePromptQualityCategory('late-requirements')).toBe('late-constraint');
    expect(normalizePromptQualityCategory('piecemeal-requirements')).toBe('late-constraint');
    expect(normalizePromptQualityCategory('drip-fed-requirements')).toBe('late-constraint');
    expect(normalizePromptQualityCategory('unclear-feedback')).toBe('unclear-correction');
    expect(normalizePromptQualityCategory('vague-correction')).toBe('unclear-correction');
    expect(normalizePromptQualityCategory('context-drift')).toBe('scope-drift');
    expect(normalizePromptQualityCategory('objective-bloat')).toBe('scope-drift');
    expect(normalizePromptQualityCategory('session-bloat')).toBe('scope-drift');
    expect(normalizePromptQualityCategory('no-acceptance-criteria')).toBe('missing-acceptance-criteria');
    expect(normalizePromptQualityCategory('undefined-done')).toBe('missing-acceptance-criteria');
    expect(normalizePromptQualityCategory('hidden-assumption')).toBe('assumption-not-surfaced');
    expect(normalizePromptQualityCategory('unstated-assumption')).toBe('assumption-not-surfaced');
    expect(normalizePromptQualityCategory('clear-request')).toBe('precise-request');
    expect(normalizePromptQualityCategory('specific-request')).toBe('precise-request');
    expect(normalizePromptQualityCategory('good-context')).toBe('effective-context');
    expect(normalizePromptQualityCategory('upfront-context')).toBe('effective-context');
    expect(normalizePromptQualityCategory('clear-correction')).toBe('productive-correction');
    expect(normalizePromptQualityCategory('effective-feedback')).toBe('productive-correction');
  });

  // Rule 2: Levenshtein
  it('normalizes typos within Levenshtein distance 2', () => {
    expect(normalizePromptQualityCategory('vague-requst')).toBe('vague-request');
    expect(normalizePromptQualityCategory('scope-drft')).toBe('scope-drift');
  });

  // Rule 4: Novel category
  it('returns original for novel categories', () => {
    expect(normalizePromptQualityCategory('over-delegation')).toBe('over-delegation');
    expect(normalizePromptQualityCategory('micro-management')).toBe('micro-management');
  });

  it('recognizes all 10 canonical categories', () => {
    const all = [
      'vague-request', 'missing-context', 'late-constraint',
      'unclear-correction', 'scope-drift', 'missing-acceptance-criteria',
      'assumption-not-surfaced', 'precise-request', 'effective-context',
      'productive-correction',
    ];
    for (const cat of all) {
      expect(normalizePromptQualityCategory(cat)).toBe(cat);
    }
  });
});

describe('getPQCategoryLabel', () => {
  it('returns human label for canonical categories', () => {
    expect(getPQCategoryLabel('vague-request')).toBe('Vague Request');
    expect(getPQCategoryLabel('late-constraint')).toBe('Late Constraint');
    expect(getPQCategoryLabel('precise-request')).toBe('Precise Request');
  });

  it('converts novel categories to title case', () => {
    expect(getPQCategoryLabel('over-delegation')).toBe('Over Delegation');
  });
});

describe('getPQCategoryType', () => {
  it('returns deficit for deficit categories', () => {
    expect(getPQCategoryType('vague-request')).toBe('deficit');
    expect(getPQCategoryType('late-constraint')).toBe('deficit');
  });

  it('returns strength for strength categories', () => {
    expect(getPQCategoryType('precise-request')).toBe('strength');
    expect(getPQCategoryType('effective-context')).toBe('strength');
  });

  it('returns deficit for unknown categories', () => {
    expect(getPQCategoryType('over-delegation')).toBe('deficit');
  });
});
