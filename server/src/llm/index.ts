// Public API for the server-side LLM engine.

export type { LLMClient, LLMMessage, LLMResponse, ChatOptions } from './types.js';
export type { LLMProvider, LLMProviderConfig } from './types.js';
export { createLLMClient, createClientFromConfig, loadLLMConfig, isLLMConfigured, testLLMConfig } from './client.js';
export { analyzeSession, analyzePromptQuality, findRecurringInsights } from './analysis.js';
export type { AnalysisResult, InsightRow, SessionData, RecurringInsightResult } from './analysis.js';
export { discoverOllamaModels } from './providers/ollama.js';
