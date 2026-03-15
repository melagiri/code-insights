// Client-side cost estimation and formatting utilities for LLM analysis costs.
//
// VALIDATION REMINDER: The 3% heuristic below (estimatedInputTokens = session.total_input_tokens * 0.03)
// should be validated against actual costs from the first 50+ sessions with recorded usage.
// If estimates are consistently 3x off, swap in a server-side estimation endpoint.
// Last validated: never (tracking started 2026-03-15)

/** Maximum input tokens sent to the LLM (matches server-side MAX_INPUT_TOKENS constant). */
export const MAX_ANALYSIS_INPUT_TOKENS = 80_000;

/**
 * Fixed output token estimates per analysis type.
 * These are intentionally conservative — analysis outputs are typically shorter than the max.
 */
export const ESTIMATED_OUTPUT_TOKENS = {
  session: 2000,
  prompt_quality: 2500,
  facet: 500,
} as const;

// Inline pricing data — keep in sync with cli/src/constants/llm-providers.ts.
// Only cloud providers are listed; Ollama models have no cost (return 0).
const PROVIDER_PRICING: Record<string, Record<string, { input: number; output: number }>> = {
  openai: {
    'gpt-4o':         { input: 2.5,  output: 10 },
    'gpt-4o-mini':    { input: 0.15, output: 0.6 },
    'gpt-4-turbo':    { input: 10,   output: 30 },
  },
  anthropic: {
    'claude-sonnet-4-20250514':   { input: 3,    output: 15 },
    'claude-3-5-haiku-20241022':  { input: 0.25, output: 1.25 },
    'claude-opus-4-20250514':     { input: 15,   output: 75 },
  },
  gemini: {
    'gemini-2.0-flash':  { input: 0.1,  output: 0.4 },
    'gemini-1.5-pro':    { input: 1.25, output: 5 },
    'gemini-1.5-flash':  { input: 0.075, output: 0.3 },
  },
};

/**
 * Look up input/output pricing for a provider+model combination.
 * Returns null for Ollama or unknown providers/models.
 */
function lookupPricing(provider: string, model: string): { input: number; output: number } | null {
  if (provider === 'ollama') return null;
  const providerPricing = PROVIDER_PRICING[provider];
  if (!providerPricing) return null;

  // Exact match first
  if (providerPricing[model]) return providerPricing[model];

  // Prefix match for models with date suffixes (e.g. 'claude-sonnet-4-20250514' matches prefix)
  for (const [key, pricing] of Object.entries(providerPricing)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return pricing;
    }
  }

  // Fallback: use first model pricing for the provider (better than nothing for estimates)
  const fallback = Object.values(providerPricing)[0];
  return fallback ?? null;
}

/**
 * Estimate analysis cost client-side using session metadata.
 *
 * Uses a 3% compression heuristic: the formatted analysis input (conversation transcript
 * with tool results stripped) is approximately 3% of the session's raw token count.
 * Falls back to 500 tokens/message if no token data is available.
 *
 * Returns 0 for Ollama (free) and for unknown providers/models.
 */
export function estimateAnalysisCost(
  session: { total_input_tokens: number | null; message_count: number },
  provider: string,
  model: string,
  analysisType: keyof typeof ESTIMATED_OUTPUT_TOKENS,
): number {
  if (provider === 'ollama') return 0;

  const pricing = lookupPricing(provider, model);
  if (!pricing) return 0;

  // Estimate input tokens: 3% of session tokens, capped at MAX_ANALYSIS_INPUT_TOKENS
  let estimatedInputTokens = Math.min(
    (session.total_input_tokens ?? 0) * 0.03,
    MAX_ANALYSIS_INPUT_TOKENS,
  );

  // Fallback: ~500 tokens per message if no token data
  if (estimatedInputTokens === 0 && session.message_count > 0) {
    estimatedInputTokens = Math.min(session.message_count * 500, MAX_ANALYSIS_INPUT_TOKENS);
  }

  const estimatedOutputTokens = ESTIMATED_OUTPUT_TOKENS[analysisType];

  const inputCost = (estimatedInputTokens / 1_000_000) * pricing.input;
  const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.output;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/**
 * Format a USD cost value with adaptive precision.
 *
 * >= $0.10 → 2 decimal places: "$0.12"
 * < $0.10  → 3 decimal places: "$0.032"  (avoids rounding $0.003 to $0.00)
 * $0.00    → "$0.00" (for Ollama or zero-cost results)
 */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd >= 0.10) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}

/**
 * Format an estimated input token count for display in the analyze dropdown.
 * Uses the same 3% heuristic as estimateAnalysisCost.
 * Returns a human-readable string like "~82K tokens".
 */
export function formatEstimatedInputTokens(session: { total_input_tokens: number | null; message_count: number }): string {
  let estimated = Math.min(
    (session.total_input_tokens ?? 0) * 0.03,
    MAX_ANALYSIS_INPUT_TOKENS,
  );

  if (estimated === 0 && session.message_count > 0) {
    estimated = Math.min(session.message_count * 500, MAX_ANALYSIS_INPUT_TOKENS);
  }

  if (estimated === 0) return '';

  if (estimated >= 1000) {
    return `~${Math.round(estimated / 1000)}K tokens`;
  }
  return `~${Math.round(estimated)} tokens`;
}
