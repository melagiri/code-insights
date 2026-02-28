// Ollama provider implementation (local models, no API key required)

import type { LLMClient, LLMMessage, LLMResponse, ChatOptions } from '../types.js';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export function createOllamaClient(model: string, baseUrl?: string): LLMClient {
  const url = baseUrl || DEFAULT_OLLAMA_URL;

  return {
    provider: 'ollama',
    model,

    async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
      const response = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: options?.signal,
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: false,
          options: { temperature: 0.7 },
        }),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => '');
        throw new Error(`Ollama API error: ${response.status}${error ? ` - ${error}` : ''}`);
      }

      const data = await response.json() as {
        message?: { content: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      return {
        content: data.message?.content || '',
        usage: {
          inputTokens: data.prompt_eval_count || 0,
          outputTokens: data.eval_count || 0,
        },
      };
    },

    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },
  };
}

/**
 * Discover installed Ollama models by querying the local API.
 * Returns empty array if Ollama is not running or unreachable.
 */
export async function discoverOllamaModels(
  baseUrl?: string
): Promise<Array<{ name: string; size: number; modifiedAt: string }>> {
  const url = baseUrl || DEFAULT_OLLAMA_URL;
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { models?: Array<{ name: string; size: number; modified_at: string }> };
    return (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));
  } catch {
    return [];
  }
}
