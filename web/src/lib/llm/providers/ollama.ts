// Ollama provider implementation (local models)

import type { LLMClient, LLMMessage, LLMResponse, LLMProvider } from '../types';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export function createOllamaClient(model: string, baseUrl?: string): LLMClient {
  const url = baseUrl || DEFAULT_OLLAMA_URL;

  return {
    provider: 'ollama' as LLMProvider,
    model,

    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const response = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            temperature: 0.7,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => '');
        throw new Error(`Ollama API error: ${response.status}${error ? ` - ${error}` : ''}`);
      }

      const data = await response.json();

      return {
        content: data.message?.content || '',
        usage: {
          inputTokens: data.prompt_eval_count || 0,
          outputTokens: data.eval_count || 0,
        },
      };
    },

    estimateTokens(text: string): number {
      // Rough estimate: ~4 characters per token
      return Math.ceil(text.length / 4);
    },
  };
}
