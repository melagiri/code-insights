// Friction category normalization using Levenshtein distance.
// Clusters similar free-form friction categories to canonical ones during aggregation.

import { CANONICAL_FRICTION_CATEGORIES } from './prompts.js';

// Explicit alias map for clustering emergent category variants.
// Targets don't need to be in CANONICAL_FRICTION_CATEGORIES —
// this clusters semantically-equivalent novel categories together.
// Insert alias lookup runs AFTER exact canonical match but BEFORE Levenshtein,
// so well-known emergent variants are clustered deterministically.
const FRICTION_ALIASES: Record<string, string> = {
  // legacy canonical → new canonical (15→9 taxonomy revision)
  'missing-dependency': 'stale-assumptions',
  'config-drift': 'stale-assumptions',
  'stale-cache': 'stale-assumptions',
  'version-mismatch': 'stale-assumptions',
  'permission-issue': 'stale-assumptions',
  'environment-mismatch': 'stale-assumptions',
  'race-condition': 'wrong-approach',
  'circular-dependency': 'wrong-approach',
  'test-failure': 'wrong-approach',
  'type-error': 'knowledge-gap',
  'api-misunderstanding': 'knowledge-gap',
  // agent orchestration variants → cluster under one emergent name
  'agent-lifecycle-issue': 'agent-orchestration-failure',
  'agent-communication-failure': 'agent-orchestration-failure',
  'agent-communication-breakdown': 'agent-orchestration-failure',
  'agent-lifecycle-management': 'agent-orchestration-failure',
  'agent-shutdown-failure': 'agent-orchestration-failure',
  // rate limit variants → cluster under one emergent name
  'api-rate-limit': 'rate-limit-hit',
  'rate-limiting': 'rate-limit-hit',
  'rate-limited': 'rate-limit-hit',
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
 * Normalize a friction category to the closest canonical category.
 * Returns the original category if no close match is found.
 *
 * Matching rules (in order):
 * 1. Exact match against canonical list → return as-is
 * 1.5. Explicit alias match → return alias target (may be non-canonical)
 * 2. Levenshtein distance <= 2 → return canonical match
 * 3. Substring match (category contains canonical or vice versa) → return canonical
 * 4. No match → return original (novel category)
 *
 * Note: alias targets in FRICTION_ALIASES bypass the canonical check intentionally.
 * e.g., "agent-orchestration-failure" is not canonical but is a valid cluster target.
 */
export function normalizeFrictionCategory(category: string): string {
  const lower = category.toLowerCase();

  // 1. Exact match
  for (const canonical of CANONICAL_FRICTION_CATEGORIES) {
    if (lower === canonical) return canonical;
  }

  // 1.5. Explicit alias match — clusters emergent category variants deterministically.
  // Alias targets bypass further normalization; they are returned as-is even if
  // they are not in CANONICAL_FRICTION_CATEGORIES.
  if (FRICTION_ALIASES[lower]) return FRICTION_ALIASES[lower];

  // 2. Levenshtein distance <= 2
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  for (const canonical of CANONICAL_FRICTION_CATEGORIES) {
    const dist = levenshtein(lower, canonical);
    if (dist <= 2 && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = canonical;
    }
  }
  if (bestMatch) return bestMatch;

  // 3. Substring match — only if the shorter string is a significant portion of the longer
  // to avoid false positives like "type" matching "type-error"
  for (const canonical of CANONICAL_FRICTION_CATEGORIES) {
    const shorter = lower.length < canonical.length ? lower : canonical;
    const longer = lower.length < canonical.length ? canonical : lower;
    if (shorter.length >= 5 && shorter.length / longer.length >= 0.5 && longer.includes(shorter)) {
      return canonical;
    }
  }

  // 4. No match — novel category
  return category;
}
