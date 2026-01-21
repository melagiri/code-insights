// Gemini provider implementation

import type { LLMClient, LLMMessage, LLMResponse, LLMProvider } from '../types';

export function createGeminiClient(apiKey: string, model: string): LLMClient {
  return {
    provider: 'gemini' as LLMProvider,
    model,

    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      // Convert messages to Gemini format
      // Gemini uses "contents" with "parts" structure
      const systemMessage = messages.find(m => m.role === 'system');
      const chatMessages = messages.filter(m => m.role !== 'system');

      const contents = chatMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      // Build request body
      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      };

      // Add system instruction if present
      if (systemMessage) {
        body.systemInstruction = {
          parts: [{ text: systemMessage.content }],
        };
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
      }

      const data = await response.json();

      // Extract text from response
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        content: text,
        usage: data.usageMetadata ? {
          inputTokens: data.usageMetadata.promptTokenCount,
          outputTokens: data.usageMetadata.candidatesTokenCount,
        } : undefined,
      };
    },

    estimateTokens(text: string): number {
      // Rough estimate: ~4 characters per token
      return Math.ceil(text.length / 4);
    },
  };
}
