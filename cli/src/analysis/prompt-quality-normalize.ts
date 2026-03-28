// Prompt quality category normalization.
// Clusters similar free-form categories to canonical ones during aggregation.
// Delegates to normalize-utils.ts for the shared levenshtein/normalizeCategory algorithm.

import { CANONICAL_PQ_CATEGORIES, CANONICAL_PQ_STRENGTH_CATEGORIES } from './prompt-constants.js';
import { normalizeCategory, kebabToTitleCase } from './normalize-utils.js';

// Human-readable labels for each canonical category.
export const PQ_CATEGORY_LABELS: Record<string, string> = {
  'vague-request': 'Vague Request',
  'missing-context': 'Missing Context',
  'late-constraint': 'Late Constraint',
  'unclear-correction': 'Unclear Correction',
  'scope-drift': 'Scope Drift',
  'missing-acceptance-criteria': 'Missing Acceptance Criteria',
  'assumption-not-surfaced': 'Assumption Not Surfaced',
  'precise-request': 'Precise Request',
  'effective-context': 'Effective Context',
  'productive-correction': 'Productive Correction',
};

const STRENGTH_SET = new Set<string>(CANONICAL_PQ_STRENGTH_CATEGORIES);

// Explicit alias map for clustering emergent category variants.
// Targets don't need to be in CANONICAL_PQ_CATEGORIES —
// this clusters semantically-equivalent novel categories together.
// Alias lookup runs AFTER exact canonical match but BEFORE Levenshtein,
// so well-known emergent variants are clustered deterministically.
const PQ_ALIASES: Record<string, string> = {
  // vague-request variants
  'vague-instructions': 'vague-request',
  'unclear-request': 'vague-request',
  'imprecise-prompting': 'vague-request',
  'ambiguous-request': 'vague-request',
  'incomplete-request': 'vague-request',
  'generic-request': 'vague-request',

  // missing-context variants
  'missing-information': 'missing-context',
  'insufficient-context': 'missing-context',
  'no-context': 'missing-context',
  'lack-of-context': 'missing-context',
  'missing-background': 'missing-context',

  // late-constraint variants
  'late-context': 'late-constraint',
  'late-requirements': 'late-constraint',
  'piecemeal-requirements': 'late-constraint',
  'drip-fed-requirements': 'late-constraint',
  'incremental-requirements': 'late-constraint',
  'late-specification': 'late-constraint',

  // unclear-correction variants
  'unclear-feedback': 'unclear-correction',
  'vague-correction': 'unclear-correction',
  'unhelpful-correction': 'unclear-correction',
  'vague-feedback': 'unclear-correction',

  // scope-drift variants
  'context-drift': 'scope-drift',
  'objective-bloat': 'scope-drift',
  'session-bloat': 'scope-drift',
  'topic-switching': 'scope-drift',
  'scope-creep': 'scope-drift',

  // missing-acceptance-criteria variants
  'no-acceptance-criteria': 'missing-acceptance-criteria',
  'undefined-done': 'missing-acceptance-criteria',
  'no-definition-of-done': 'missing-acceptance-criteria',
  'unclear-success-criteria': 'missing-acceptance-criteria',

  // assumption-not-surfaced variants
  'hidden-assumption': 'assumption-not-surfaced',
  'unstated-assumption': 'assumption-not-surfaced',
  'implicit-assumption': 'assumption-not-surfaced',
  'unspoken-expectation': 'assumption-not-surfaced',

  // precise-request variants (strengths)
  'clear-request': 'precise-request',
  'specific-request': 'precise-request',
  'well-specified-request': 'precise-request',
  'detailed-request': 'precise-request',

  // effective-context variants (strengths)
  'good-context': 'effective-context',
  'upfront-context': 'effective-context',
  'proactive-context': 'effective-context',
  'rich-context': 'effective-context',

  // productive-correction variants (strengths)
  'clear-correction': 'productive-correction',
  'effective-feedback': 'productive-correction',
  'helpful-correction': 'productive-correction',
  'constructive-feedback': 'productive-correction',
};

/**
 * Normalize a prompt quality category to the closest canonical category.
 * Returns the original category if no close match is found.
 *
 * Matching rules (in order):
 * 1. Exact match against canonical list → return as-is
 * 1.5. Explicit alias match → return alias target (may be non-canonical)
 * 2. Levenshtein distance <= 2 → return canonical match
 * 3. Substring match (category contains canonical or vice versa) → return canonical
 * 4. No match → return original (novel category)
 *
 * Note: alias targets in PQ_ALIASES bypass the canonical check intentionally.
 */
export function normalizePromptQualityCategory(category: string): string {
  return normalizeCategory(category, {
    canonicalCategories: CANONICAL_PQ_CATEGORIES,
    aliases: PQ_ALIASES,
  });
}

/**
 * Get a human-readable label for a prompt quality category.
 * Falls back to Title Case conversion for novel categories.
 */
export function getPQCategoryLabel(category: string): string {
  return PQ_CATEGORY_LABELS[category] ?? kebabToTitleCase(category);
}

/**
 * Get the type (deficit or strength) for a prompt quality category.
 * Novel categories default to deficit.
 */
export function getPQCategoryType(category: string): 'deficit' | 'strength' {
  return STRENGTH_SET.has(category) ? 'strength' : 'deficit';
}
