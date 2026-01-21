// LLM Client factory and configuration management

import type { LLMClient, LLMConfig, LLMProvider } from './types';
import { createOpenAIClient } from './providers/openai';
import { createAnthropicClient } from './providers/anthropic';
import { createGeminiClient } from './providers/gemini';
import { createOllamaClient } from './providers/ollama';

const CONFIG_KEY = 'claudeinsight_llm_config';

/**
 * Load LLM config from localStorage
 */
export function loadLLMConfig(): LLMConfig | null {
  if (typeof window === 'undefined') return null;

  const saved = localStorage.getItem(CONFIG_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved) as LLMConfig;
  } catch {
    return null;
  }
}

/**
 * Save LLM config to localStorage
 */
export function saveLLMConfig(config: LLMConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/**
 * Clear LLM config from localStorage
 */
export function clearLLMConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CONFIG_KEY);
}

/**
 * Check if LLM is configured
 */
export function isLLMConfigured(): boolean {
  const config = loadLLMConfig();
  if (!config) return false;

  // Ollama doesn't require API key
  if (config.provider === 'ollama') {
    return !!config.model;
  }

  return !!config.apiKey && !!config.model;
}

/**
 * Create an LLM client based on the saved config
 */
export function createLLMClient(): LLMClient {
  const config = loadLLMConfig();

  if (!config) {
    throw new Error('LLM not configured. Go to Settings to configure an LLM provider.');
  }

  return createClientFromConfig(config);
}

/**
 * Create an LLM client from a specific config
 */
export function createClientFromConfig(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case 'openai':
      return createOpenAIClient(config.apiKey, config.model);
    case 'anthropic':
      return createAnthropicClient(config.apiKey, config.model);
    case 'gemini':
      return createGeminiClient(config.apiKey, config.model);
    case 'ollama':
      return createOllamaClient(config.model, config.baseUrl);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * Test if the LLM config is valid by making a simple API call
 */
export async function testLLMConfig(config: LLMConfig): Promise<{ success: boolean; error?: string }> {
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
