// Friction category normalization.
// Clusters similar free-form friction categories to canonical ones during aggregation.

import { CANONICAL_FRICTION_CATEGORIES } from './prompt-constants.js';
import { normalizeCategory } from './normalize-utils.js';

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
  return normalizeCategory(category, {
    canonicalCategories: CANONICAL_FRICTION_CATEGORIES,
    aliases: FRICTION_ALIASES,
  });
}
