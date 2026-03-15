// Unified cost calculator for LLM analysis calls made by Code Insights.
// Computes the USD cost of a single analysis call from token usage + provider/model metadata.
//
// Pricing sources:
//   1. PROVIDERS from cli/src/constants/llm-providers.ts (inputCostPer1M, outputCostPer1M)
//      — used for OpenAI and Gemini (no cache pricing for these providers)
//   2. getModelPricing from cli/src/utils/pricing.ts
//      — used for Anthropic (detailed per-model pricing + cache multipliers)
//   3. Ollama or unknown provider → $0.00 (local, free)

import { PROVIDERS } from '@code-insights/cli/constants/llm-providers';
import { getModelPricing } from '@code-insights/cli/utils/pricing';

/**
 * Date when pricing data was last verified against provider pricing pages.
 * Update this constant whenever PROVIDERS or MODEL_PRICING tables are refreshed.
 */
export const PRICING_LAST_UPDATED = '2026-03-15';

export interface AnalysisCostUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Calculate the USD cost of an LLM analysis call.
 *
 * Cache multipliers per provider:
 *   Anthropic: cache creation = 1.25x input, cache read = 0.10x input
 *   OpenAI:    cached input (cacheReadTokens) = 0.5x input
 *   Gemini:    no cache pricing
 *   Ollama:    free ($0.00)
 *
 * Returns cost in USD, rounded to 6 decimal places.
 * (4 decimal places rounds $0.00032 to $0.0003 — 6 keeps more precision for tiny analysis costs.)
 */
export function calculateAnalysisCost(
  provider: string,
  model: string,
  usage: AnalysisCostUsage,
): number {
  if (provider === 'ollama') {
    return 0;
  }

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheCreationTokens = usage.cacheCreationTokens ?? 0;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;

  if (provider === 'anthropic') {
    // Use getModelPricing for Anthropic — it has accurate per-model prices including the
    // claude-sonnet-4-20250514 and claude-3-5-haiku-20241022 models used for analysis.
    const pricing = getModelPricing(model);
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    // Cache creation: 25% surcharge over base input price
    const cacheCreationCost = (cacheCreationTokens / 1_000_000) * pricing.input * 1.25;
    // Cache read: 90% discount (costs 10% of base input price)
    const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.input * 0.10;
    const total = inputCost + outputCost + cacheCreationCost + cacheReadCost;
    return Math.round(total * 1_000_000) / 1_000_000;
  }

  // OpenAI and Gemini: use PROVIDERS table for pricing
  const providerInfo = PROVIDERS.find(p => p.id === provider);
  if (!providerInfo) {
    // Unknown provider — cannot compute cost
    return 0;
  }

  const modelInfo = providerInfo.models.find(m => m.id === model);
  if (!modelInfo || modelInfo.inputCostPer1M == null || modelInfo.outputCostPer1M == null) {
    // Model has no pricing data (e.g. Ollama models)
    return 0;
  }

  const inputCostPer1M = modelInfo.inputCostPer1M;
  const outputCostPer1M = modelInfo.outputCostPer1M;

  const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;

  let cacheReadCost = 0;
  if (provider === 'openai') {
    // OpenAI: cached input tokens cost 50% of normal input price
    cacheReadCost = (cacheReadTokens / 1_000_000) * inputCostPer1M * 0.5;
  }
  // Gemini: no cache pricing — cacheReadCost stays 0

  const total = inputCost + outputCost + cacheReadCost;
  return Math.round(total * 1_000_000) / 1_000_000;
}
