// Effective pattern category normalization using Levenshtein distance.
// Clusters similar free-form pattern categories to canonical ones during aggregation.
// Mirrors friction-normalize.ts — same algorithm, same matching rules.

import { CANONICAL_PATTERN_CATEGORIES } from './prompts.js';

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

/** Standard Levenshtein distance between two strings */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

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
  const lower = category.toLowerCase();

  // 1. Exact match
  for (const canonical of CANONICAL_PATTERN_CATEGORIES) {
    if (lower === canonical) return canonical;
  }

  // 1.5. Explicit alias match — clusters emergent category variants deterministically.
  if (PATTERN_ALIASES[lower]) return PATTERN_ALIASES[lower];

  // 2. Levenshtein distance <= 2
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  for (const canonical of CANONICAL_PATTERN_CATEGORIES) {
    const dist = levenshtein(lower, canonical);
    if (dist <= 2 && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = canonical;
    }
  }
  if (bestMatch) return bestMatch;

  // 3. Substring match — only if the shorter string is a significant portion of the longer
  // to avoid false positives like "plan" matching "structured-planning"
  for (const canonical of CANONICAL_PATTERN_CATEGORIES) {
    const shorter = lower.length < canonical.length ? lower : canonical;
    const longer = lower.length < canonical.length ? canonical : lower;
    if (shorter.length >= 5 && shorter.length / longer.length >= 0.5 && longer.includes(shorter)) {
      return canonical;
    }
  }

  // 4. No match — novel category
  return category;
}

/**
 * Get a human-readable label for a pattern category.
 * Falls back to Title Case conversion for novel categories.
 */
export function getPatternCategoryLabel(category: string): string {
  if (PATTERN_CATEGORY_LABELS[category]) return PATTERN_CATEGORY_LABELS[category];
  // Convert kebab-case to Title Case for novel categories
  return category
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
