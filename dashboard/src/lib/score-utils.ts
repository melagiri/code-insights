/**
 * Shared prompt quality score tier logic.
 * Single source of truth for threshold values used across:
 * - CompactSessionRow (list badge)
 * - SessionDetailPanel (tab badge)
 * - PromptQualityCard (score display)
 * - ProgressRing (SVG ring)
 */

export type ScoreTier = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Extract PQ efficiency score from insight metadata.
 * Handles both new (snake_case: efficiency_score) and legacy (camelCase: efficiencyScore) field names.
 * Returns null when neither field is present or is not a number — never coerces missing to 0.
 */
export function extractPQScore(metadata: Record<string, unknown>): number | null {
  const score = metadata?.efficiency_score ?? metadata?.efficiencyScore;
  return typeof score === 'number' ? score : null;
}

export function getScoreTier(score: number): ScoreTier {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor';
}
