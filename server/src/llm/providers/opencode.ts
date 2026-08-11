import type { LLMClient, LLMMessage, LLMResponse, ChatOptions } from '../types.js';
import { flattenContent } from '../types.js';

export async function discoverOpenCodeModels(baseUrl?: string): Promise<Array<{ id: string; object: string }>> {
  const url = (baseUrl || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
  const response = await fetch(`${url}/models`);
  if (!response.ok) throw new Error(`OpenCode model discovery failed (HTTP ${response.status})`);
  const data = await response.json() as { data?: Array<{ id: string; object: string }> };
  return data.data ?? [];
}

export function createOpenCodeClient(apiKey: string, model: string, baseUrl?: string): LLMClient {
  const url = (baseUrl || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
  return {
    provider: 'opencode',
    model,
    async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
      const flatMessages = messages.map(m => ({ role: m.role, content: flattenContent(m.content) }));
      const system = flatMessages.find(m => m.role === 'system')?.content;
      const chatMessages = flatMessages.filter(m => m.role !== 'system');
      const isResponses = model.startsWith('gpt-');
      const isAnthropic = model.startsWith('claude-') || model.startsWith('minimax-') || model.startsWith('qwen');
      const endpoint = isResponses ? `${url}/responses` : isAnthropic ? `${url}/messages` : `${url}/chat/completions`;
      const body = isResponses
        ? { model, input: flatMessages, max_output_tokens: 8192 }
        : isAnthropic
          ? { model, system, messages: chatMessages, max_tokens: 8192 }
          : { model, messages: flatMessages, temperature: options?.temperature ?? 0.7, max_tokens: 8192 };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`,
          ...(isAnthropic ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : {}),
        },
        signal: options?.signal,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(error.error?.message || `OpenCode API error (HTTP ${response.status})`);
      }
      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        content?: Array<{ text?: string }>;
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
      };
      const content = isResponses
        ? data.output_text ?? data.output?.flatMap(o => o.content ?? []).map(c => c.text ?? '').join('') ?? ''
        : isAnthropic ? data.content?.map(c => c.text ?? '').join('') ?? '' : data.choices[0]?.message?.content || '';
      return {
        content,
        usage: data.usage ? {
          inputTokens: data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? data.usage.output_tokens ?? 0,
        } : undefined,
      };
    },
    estimateTokens(text: string): number { return Math.ceil(text.length / 4); },
  };
}
