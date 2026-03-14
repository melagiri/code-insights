// Effective pattern category normalization.
// Clusters similar free-form pattern categories to canonical ones during aggregation.
// Delegates to normalize-utils.ts for the shared levenshtein/normalizeCategory algorithm.

import { CANONICAL_PATTERN_CATEGORIES } from './prompt-constants.js';
import { normalizeCategory, kebabToTitleCase } from './normalize-utils.js';

// Human-readable labels for each canonical category.
// Used in dashboard display (e.g., "structured-planning" → "Structured Planning").
export const PATTERN_CATEGORY_LABELS: Record<string, string> = {
  'structured-planning': 'Structured Planning',
  'incremental-implementation': 'Incremental Implementation',
  'verification-workflow': 'Verification Workflow',
  'systematic-debugging': 'Systematic Debugging',
  'self-correction': 'Self-Correction',
  'context-gathering': 'Context Gathering',
  'domain-expertise': 'Domain Expertise',
  'effective-tooling': 'Effective Tooling',
};

// Explicit alias map for clustering emergent category variants.
// Targets don't need to be in CANONICAL_PATTERN_CATEGORIES —
// this clusters semantically-equivalent novel categories together.
// Insert alias lookup runs AFTER exact canonical match but BEFORE Levenshtein,
// so well-known emergent variants are clustered deterministically.
const PATTERN_ALIASES: Record<string, string> = {
  // structured-planning variants
  'task-decomposition': 'structured-planning',
  'plan-first': 'structured-planning',
  'upfront-planning': 'structured-planning',
  'phased-approach': 'structured-planning',
  'task-breakdown': 'structured-planning',
  'planning-before-implementation': 'structured-planning',

  // effective-tooling variants
  'agent-delegation': 'effective-tooling',
  'agent-orchestration': 'effective-tooling',
  'specialized-agents': 'effective-tooling',
  'multi-agent': 'effective-tooling',
  'tool-leverage': 'effective-tooling',

  // verification-workflow variants
  'build-test-verify': 'verification-workflow',
  'test-driven-development': 'verification-workflow',
  'tdd': 'verification-workflow',
  'test-first': 'verification-workflow',
  'pre-commit-checks': 'verification-workflow',

  // systematic-debugging variants
  'binary-search-debugging': 'systematic-debugging',
  'methodical-debugging': 'systematic-debugging',
  'log-based-debugging': 'systematic-debugging',
  'debugging-methodology': 'systematic-debugging',

  // self-correction variants
  'course-correction': 'self-correction',
  'pivot-on-failure': 'self-correction',
  'backtracking': 'self-correction',

  // context-gathering variants
  'code-reading-first': 'context-gathering',
  'codebase-exploration': 'context-gathering',
  'understanding-before-changing': 'context-gathering',

  // domain-expertise variants
  'framework-knowledge': 'domain-expertise',
  'types-first': 'domain-expertise',
  'type-driven-development': 'domain-expertise',
  'schema-first': 'domain-expertise',

  // incremental-implementation variants
  'small-steps': 'incremental-implementation',
  'iterative-building': 'incremental-implementation',
  'iterative-development': 'incremental-implementation',
};

/**
 * Normalize a pattern category to the closest canonical category.
 * Returns the original category if no close match is found.
 *
 * Matching rules (in order):
 * 1. Exact match against canonical list → return as-is
 * 1.5. Explicit alias match → return alias target (may be non-canonical)
 * 2. Levenshtein distance <= 2 → return canonical match
 * 3. Substring match (category contains canonical or vice versa) → return canonical
 * 4. No match → return original (novel category)
 */
export function normalizePatternCategory(category: string): string {
  return normalizeCategory(category, {
    canonicalCategories: CANONICAL_PATTERN_CATEGORIES,
    aliases: PATTERN_ALIASES,
  });
}

/**
 * Get a human-readable label for a pattern category.
 * Falls back to Title Case conversion for novel categories.
 */
export function getPatternCategoryLabel(category: string): string {
  return PATTERN_CATEGORY_LABELS[category] ?? kebabToTitleCase(category);
}
