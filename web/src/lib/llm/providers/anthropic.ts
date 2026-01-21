// Anthropic provider implementation

import type { LLMClient, LLMMessage, LLMResponse, LLMProvider } from '../types';

export function createAnthropicClient(apiKey: string, model: string): LLMClient {
  return {
    provider: 'anthropic' as LLMProvider,
    model,

    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      // Extract system message if present
      const systemMessage = messages.find(m => m.role === 'system');
      const chatMessages = messages.filter(m => m.role !== 'system');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemMessage?.content,
          messages: chatMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        content: data.content[0]?.text || '',
        usage: data.usage ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        } : undefined,
      };
    },

    estimateTokens(text: string): number {
      // Rough estimate: ~4 characters per token for English
      return Math.ceil(text.length / 4);
    },
  };
}
