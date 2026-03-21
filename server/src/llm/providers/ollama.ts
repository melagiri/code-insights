// Ollama provider implementation (local models, no API key required)

import type { LLMClient, LLMMessage, LLMResponse, ChatOptions } from '../types.js';
import { flattenContent } from '../types.js';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export function createOllamaClient(model: string, baseUrl?: string): LLMClient {
  const url = baseUrl || DEFAULT_OLLAMA_URL;

  return {
    provider: 'ollama',
    model,

    async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
      let response: Response;
      try {
        response = await fetch(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: options?.signal,
          body: JSON.stringify({
            model,
            // flattenContent converts ContentBlock[] to string; strings pass through unchanged.
            messages: messages.map(m => ({ role: m.role, content: flattenContent(m.content) })),
            stream: false,
            options: { temperature: 0.7 },
          }),
        });
      } catch (err) {
        // Network-level failure — Ollama is likely not running
        const cause = (err as { cause?: { code?: string } })?.cause;
        if (cause?.code === 'ECONNREFUSED' || (err instanceof TypeError && err.message.includes('fetch'))) {
          throw new Error(`Cannot connect to Ollama at ${url} — is it running? Start it with: ollama serve`);
        }
        throw err;
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          // Ollama itself has no auth — this typically means a proxy or gateway in front of it requires credentials.
          throw new Error(`Ollama returned HTTP ${response.status} — check if your Ollama endpoint requires authentication (proxy or gateway).${detail ? ` (${detail})` : ''}`);
        }
        if (response.status === 429) {
          // Standard Ollama has no rate limits — 429 likely comes from a proxy or gateway.
          throw new Error(`Ollama returned HTTP 429 — rate limited by a proxy or gateway in front of Ollama.${detail ? ` (${detail})` : ''}`);
        }
        if (response.status >= 500) {
          throw new Error(`Ollama service error (HTTP ${response.status}). Try again later.${detail ? ` (${detail})` : ''}`);
        }
        throw new Error(`Ollama API error (HTTP ${response.status})${detail ? ` - ${detail}` : ''}`);
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
