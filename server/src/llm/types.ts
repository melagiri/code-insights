// LLM abstraction types for the server-side LLM engine.
// Provider metadata (PROVIDERS constant) lives in cli/src/constants/llm-providers.ts.
// LLMProvider, LLMProviderConfig, ProviderInfo are imported from CLI types (single source of truth).

export type { LLMProvider, LLMProviderConfig, ProviderInfo, ProviderModelOption } from '@code-insights/cli/types';

/**
 * A structured content block for LLM messages.
 * Used to enable prompt caching (Anthropic ephemeral cache) and structured multi-part messages.
 * The `cache_control` field instructs Anthropic to cache everything up to and including this block.
 */
export interface ContentBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/**
 * Flatten a ContentBlock array to a plain string by joining all block texts.
 * Used by non-Anthropic providers (OpenAI, Gemini, Ollama) that don't support content blocks natively.
 * If content is already a string, returns it unchanged.
 */
export function flattenContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content.map(b => b.text).join('');
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    /** Anthropic: tokens written to the prompt cache (incurs 25% surcharge). */
    cacheCreationTokens?: number;
    /** Anthropic: tokens read from the prompt cache (90% discount vs normal input). */
    cacheReadTokens?: number;
  };
}

export interface ChatOptions {
  signal?: AbortSignal;
}

export interface LLMClient {
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse>;
  estimateTokens(text: string): number;
  readonly provider: string;
  readonly model: string;
}
