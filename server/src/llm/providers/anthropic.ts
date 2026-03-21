// Anthropic provider implementation (server-side, no browser dependencies)
// Note: 'anthropic-dangerous-direct-browser-access' header is intentionally omitted here —
// this runs server-side where direct API access is safe and expected.

import type { LLMClient, LLMMessage, LLMResponse, ChatOptions } from '../types.js';

export function createAnthropicClient(apiKey: string, model: string): LLMClient {
  return {
    provider: 'anthropic',
    model,

    async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
      // Extract system message if present
      const systemMessage = messages.find(m => m.role === 'system');
      const chatMessages = messages.filter(m => m.role !== 'system');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // Enable prompt caching (ephemeral cache, 5-minute TTL).
          // This header is required for cache_control blocks to take effect.
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        signal: options?.signal,
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          // System message: pass ContentBlock[] through natively, or string as-is.
          system: systemMessage?.content,
          // Chat messages: pass ContentBlock[] content arrays natively (Anthropic supports this).
          // String content passes through unchanged for backward compatibility.
          messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
        const detail = error.error?.message;
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Invalid API key. Check your Anthropic API key in \`code-insights config llm\`.${detail ? ` (${detail})` : ''}`);
        }
        if (response.status === 429) {
          throw new Error(`Rate limited or quota exceeded. Check your Anthropic account usage.${detail ? ` (${detail})` : ''}`);
        }
        if (response.status >= 500) {
          throw new Error(`Anthropic service error (HTTP ${response.status}). Try again later.${detail ? ` (${detail})` : ''}`);
        }
        throw new Error(detail || `Anthropic API error (HTTP ${response.status})`);
      }

      const data = await response.json() as {
        content: Array<{ text: string }>;
        usage?: {
          input_tokens: number;
          output_tokens: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };

      return {
        content: data.content[0]?.text || '',
        usage: data.usage ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          ...(data.usage.cache_creation_input_tokens !== undefined && {
            cacheCreationTokens: data.usage.cache_creation_input_tokens,
          }),
          ...(data.usage.cache_read_input_tokens !== undefined && {
            cacheReadTokens: data.usage.cache_read_input_tokens,
          }),
        } : undefined,
      };
    },

    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },
  };
}
