// LLM provider metadata: model lists, pricing, API key links.
// This is a runtime constant, not a type — kept here to avoid inflating types.ts.
// Types (LLMProvider, ProviderInfo, etc.) live in cli/src/types.ts.

import type { ProviderInfo } from '../types.js';

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
    apiKeyLink: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', description: 'Frontier capability', inputCostPer1M: 5, outputCostPer1M: 30 },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', description: 'Balanced intelligence and cost', inputCostPer1M: 2.5, outputCostPer1M: 15 },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', description: 'Cost-sensitive workloads', inputCostPer1M: 1, outputCostPer1M: 6 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    requiresApiKey: true,
    apiKeyLink: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-fable-5', name: 'Claude Fable 5', description: 'Highest capability', inputCostPer1M: 10, outputCostPer1M: 50 },
      { id: 'claude-opus-5', name: 'Claude Opus 5', description: 'Complex agentic coding', inputCostPer1M: 5, outputCostPer1M: 25 },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', description: 'Best speed and intelligence balance', inputCostPer1M: 3, outputCostPer1M: 15 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fastest', inputCostPer1M: 1, outputCostPer1M: 5 },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    requiresApiKey: true,
    apiKeyLink: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', description: 'Most capable' },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', description: 'Agentic and coding workflows' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', description: 'Fast and efficient' },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen / Go',
    requiresApiKey: true,
    apiKeyLink: 'https://opencode.ai/auth',
    models: [
      { id: 'big-pickle', name: 'Big Pickle', description: 'Zen free model' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', description: 'OpenCode Zen' },
      { id: 'kimi-k3', name: 'Kimi K3', description: 'OpenCode Go' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: 'Zen or Go' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    requiresApiKey: false,
    models: [
      { id: 'llama3.3', name: 'Llama 3.3', description: 'Local, free' },
      { id: 'qwen3:14b', name: 'Qwen3 14B', description: 'Code-focused, free' },
      { id: 'mistral', name: 'Mistral', description: 'Local, free' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', description: 'Code-focused, free' },
      { id: 'gemma4', name: 'Gemma 4 12B', description: 'Google Gemma 4, free' },
      { id: 'gemma4:27b', name: 'Gemma 4 27B', description: 'Google Gemma 4 large, free' },
    ],
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp (Local)',
    requiresApiKey: false,
    models: [
      { id: 'gemma-4-12b', name: 'Gemma 4 12B (Q4_K_M)', description: 'Flagship local model, free' },
      { id: 'gemma-4-27b', name: 'Gemma 4 27B (Q4_K_M)', description: 'Large local model, free' },
      { id: 'custom', name: 'Custom model', description: 'Any GGUF model loaded in llama-server' },
    ],
  },
];

export function getProviderInfo(providerId: string): ProviderInfo | undefined {
  return PROVIDERS.find(p => p.id === providerId);
}

export function getDefaultModel(providerId: string): string | undefined {
  return getProviderInfo(providerId)?.models[0]?.id;
}
