// LLM abstraction types for the server-side LLM engine.
// Provider metadata (PROVIDERS constant) lives in cli/src/constants/llm-providers.ts.
// LLMProvider, LLMProviderConfig, ProviderInfo are imported from CLI types (single source of truth).

export type { LLMProvider, LLMProviderConfig, ProviderInfo, ProviderModelOption } from '@code-insights/cli/types';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
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
