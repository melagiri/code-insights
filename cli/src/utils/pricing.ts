/**
 * Model pricing table and cost calculation utilities.
 * Prices are USD per 1M tokens, sourced from Anthropic's pricing page.
 * Last updated: 2026-02-18
 */

export interface ModelPricing {
  input: number;   // USD per 1M input tokens
  output: number;  // USD per 1M output tokens
}

export interface UsageEntry {
  model: string;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// Pricing per 1M tokens (USD)
// Cache read tokens are priced at 10% of input price (Anthropic standard)
// Cache creation tokens are priced at 25% more than input price
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude 4.x family
  'claude-opus-4-6':           { input: 15,  output: 75 },
  'claude-sonnet-4-5':         { input: 3,   output: 15 },
  'claude-haiku-4-5':          { input: 0.8, output: 4 },
  // Claude 3.5 family
  'claude-3-5-sonnet-20241022': { input: 3,   output: 15 },
  'claude-3-5-haiku-20241022':  { input: 0.8, output: 4 },
  // Claude 3 family
  'claude-3-opus-20240229':    { input: 15,  output: 75 },
  'claude-3-sonnet-20240229':  { input: 3,   output: 15 },
  'claude-3-haiku-20240307':   { input: 0.25, output: 1.25 },
};

// Default fallback pricing (sonnet-level)
const DEFAULT_PRICING: ModelPricing = { input: 3, output: 15 };

/**
 * Get pricing for a model, falling back to default if unknown.
 * Tries exact match first, then prefix match (e.g., 'claude-sonnet-4-5-20250929' matches 'claude-sonnet-4-5').
 */
export function getModelPricing(model: string): ModelPricing {
  // Exact match
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Prefix match (model IDs often have date suffixes)
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) {
      return pricing;
    }
  }

  return DEFAULT_PRICING;
}

/**
 * Calculate total estimated cost from usage entries.
 * Returns cost in USD, rounded to 4 decimal places.
 */
export function calculateCost(entries: UsageEntry[]): number {
  let totalCost = 0;

  for (const { model, usage } of entries) {
    const pricing = getModelPricing(model);
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

    totalCost += (inputTokens / 1_000_000) * pricing.input;
    totalCost += (outputTokens / 1_000_000) * pricing.output;
    totalCost += (cacheCreationTokens / 1_000_000) * pricing.input * 1.25;
    totalCost += (cacheReadTokens / 1_000_000) * pricing.input * 0.1;
  }

  return Math.round(totalCost * 10000) / 10000;
}
