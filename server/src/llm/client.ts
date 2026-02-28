// LLM client factory — server-side.
// Config is loaded from ~/.code-insights/config.json via the CLI config system.
// No localStorage or browser APIs used here.

import { loadConfig } from '@code-insights/cli/utils/config';
import type { LLMClient } from './types.js';
import type { LLMProviderConfig } from './types.js';
import { createOpenAIClient } from './providers/openai.js';
import { createAnthropicClient } from './providers/anthropic.js';
import { createGeminiClient } from './providers/gemini.js';
import { createOllamaClient } from './providers/ollama.js';

/**
 * Load LLM config from the CLI config file.
 */
export function loadLLMConfig(): LLMProviderConfig | null {
  const config = loadConfig();
  return config?.dashboard?.llm ?? null;
}

/**
 * Check if LLM is configured.
 */
export function isLLMConfigured(): boolean {
  const llm = loadLLMConfig();
  if (!llm) return false;
  if (llm.provider === 'ollama') return !!llm.model;
  return !!llm.apiKey && !!llm.model;
}

/**
 * Create an LLM client from the current config.
 * Throws if LLM is not configured.
 */
export function createLLMClient(): LLMClient {
  const config = loadLLMConfig();
  if (!config) {
    throw new Error('LLM not configured. Run `code-insights config llm` to configure a provider.');
  }
  return createClientFromConfig(config);
}

/**
 * Create an LLM client from a specific config object (used for testing).
 */
export function createClientFromConfig(config: LLMProviderConfig): LLMClient {
  switch (config.provider) {
    case 'openai':
      return createOpenAIClient(config.apiKey ?? '', config.model);
    case 'anthropic':
      return createAnthropicClient(config.apiKey ?? '', config.model);
    case 'gemini':
      return createGeminiClient(config.apiKey ?? '', config.model);
    case 'ollama':
      return createOllamaClient(config.model, config.baseUrl);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * Test LLM connectivity with the given config.
 */
export async function testLLMConfig(config: LLMProviderConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const client = createClientFromConfig(config);
    await client.chat([{ role: 'user', content: 'Say "ok" and nothing else.' }]);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
