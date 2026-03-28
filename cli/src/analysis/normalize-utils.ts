// Shared normalization infrastructure for friction, pattern, and prompt-quality categories.
// Each domain provides its own canonical list, alias map, and label map.

/** Standard Levenshtein distance between two strings */
export function levenshtein(a: string, b: string): number {
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

export interface NormalizerConfig {
  /** Canonical category strings (lowercase kebab-case) */
  canonicalCategories: readonly string[];
  /** Maps known aliases to their target (may be non-canonical cluster targets) */
  aliases: Record<string, string>;
}

/**
 * Generic category normalizer. Matching rules (in order):
 * 1. Exact match against canonical list → return as-is
 * 1.5. Explicit alias match → return alias target (may be non-canonical)
 * 2. Levenshtein distance <= 2 → return canonical match
 * 3. Substring match (shorter >= 5 chars, >= 50% of longer) → return canonical
 * 4. No match → return original (novel category)
 */
export function normalizeCategory(category: string, config: NormalizerConfig): string {
  const lower = category.toLowerCase();

  // 1. Exact match
  for (const canonical of config.canonicalCategories) {
    if (lower === canonical) return canonical;
  }

  // 1.5. Explicit alias match
  if (config.aliases[lower]) return config.aliases[lower];

  // 2. Levenshtein distance <= 2
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  for (const canonical of config.canonicalCategories) {
    const dist = levenshtein(lower, canonical);
    if (dist <= 2 && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = canonical;
    }
  }
  if (bestMatch) return bestMatch;

  // 3. Substring match — only if the shorter string is a significant portion of the longer
  // to avoid false positives like "type" matching "type-error"
  for (const canonical of config.canonicalCategories) {
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
 * Convert kebab-case to Title Case. Shared fallback for category label functions.
 */
export function kebabToTitleCase(kebab: string): string {
  return kebab
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
