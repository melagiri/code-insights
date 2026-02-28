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
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable', inputCostPer1M: 2.5, outputCostPer1M: 10 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast & cheap', inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '128k context', inputCostPer1M: 10, outputCostPer1M: 30 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    requiresApiKey: true,
    apiKeyLink: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Best balance', inputCostPer1M: 3, outputCostPer1M: 15 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast & cheap', inputCostPer1M: 0.25, outputCostPer1M: 1.25 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most capable', inputCostPer1M: 15, outputCostPer1M: 75 },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    requiresApiKey: true,
    apiKeyLink: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast & capable', inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '2M context', inputCostPer1M: 1.25, outputCostPer1M: 5 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast', inputCostPer1M: 0.075, outputCostPer1M: 0.3 },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    requiresApiKey: false,
    models: [
      { id: 'llama3.2', name: 'Llama 3.2', description: 'Local, free' },
      { id: 'mistral', name: 'Mistral', description: 'Local, free' },
      { id: 'codellama', name: 'Code Llama', description: 'Code-focused, free' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', description: 'Code-focused, free' },
    ],
  },
];

export function getProviderInfo(providerId: string): ProviderInfo | undefined {
  return PROVIDERS.find(p => p.id === providerId);
}

export function getDefaultModel(providerId: string): string | undefined {
  return getProviderInfo(providerId)?.models[0]?.id;
}
