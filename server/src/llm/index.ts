// Public API for the server-side LLM engine.

export type { LLMClient, LLMMessage, LLMResponse, ChatOptions } from './types.js';
export type { LLMProvider, LLMProviderConfig } from './types.js';
export { createLLMClient, createClientFromConfig, loadLLMConfig, isLLMConfigured, testLLMConfig } from './client.js';
export { analyzeSession, analyzePromptQuality, findRecurringInsights, extractFacetsOnly } from './analysis.js';
export type { AnalysisResult, RecurringInsightResult } from './analysis.js';
export type { InsightRow, SessionData } from './analysis-db.js';
export { discoverOllamaModels } from './providers/ollama.js';
