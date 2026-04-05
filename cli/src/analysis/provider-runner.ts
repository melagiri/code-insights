/**
 * ProviderRunner — delegates analysis to the configured LLM provider
 * (OpenAI, Anthropic, Gemini, or Ollama).
 *
 * Design note: The CLI cannot import from @code-insights/server (server depends
 * on CLI — importing in the other direction would create a circular dependency).
 * All LLM providers use only Node.js built-in `fetch` (Node 18+), so this module
 * inlines the minimal provider dispatch that mirrors server/src/llm/client.ts.
 * If the server LLM client grows substantially (new providers, streaming, etc.),
 * that work is tracked in Issue #240.
 */

import { loadConfig } from '../utils/config.js';
import type { LLMProviderConfig } from '../types.js';
import type { AnalysisRunner, RunAnalysisParams, RunAnalysisResult } from './runner-types.js';

// ── Minimal LLM types (mirrors server/src/llm/types.ts) ──────────────────────

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  // Intentionally narrower than server/src/llm/types.ts LLMMessage (which allows ContentBlock[]).
  // ProviderRunner always sends plain strings — prompt caching via ContentBlock[] is a
  // dashboard/API concern. The insights CLI command builds simple system+user pairs.
  content: string;
}

interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
}

type LLMChatFn = (messages: LLMMessage[]) => Promise<LLMResponse>;

// ── Provider implementations ──────────────────────────────────────────────────

function makeOpenAIChat(apiKey: string, model: string): LLMChatFn {
  return async (messages) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 8192 }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err.error?.message || `OpenAI API error (HTTP ${response.status})`);
    }
    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
    };
  };
}

function makeAnthropicChat(apiKey: string, model: string): LLMChatFn {
  return async (messages) => {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: systemMsg?.content,
        messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err.error?.message || `Anthropic API error (HTTP ${response.status})`);
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
  };
}

function makeGeminiChat(apiKey: string, model: string): LLMChatFn {
  return async (messages) => {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');
    const body: Record<string, unknown> = {
      contents: chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err.error?.message || `Gemini API error (HTTP ${response.status})`);
    }
    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };
    return {
      content: data.candidates[0]?.content?.parts[0]?.text || '',
      usage: data.usageMetadata ? {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  };
}

function makeOllamaChat(model: string, baseUrl?: string): LLMChatFn {
  const url = baseUrl || 'http://localhost:11434';
  return async (messages) => {
    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.7 } }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Ollama API error (HTTP ${response.status})${detail ? ` - ${detail}` : ''}`);
    }
    const data = await response.json() as {
      message?: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return {
      content: data.message?.content || '',
      usage: { inputTokens: data.prompt_eval_count || 0, outputTokens: data.eval_count || 0 },
    };
  };
}

function makeLlamaCppChat(model: string, baseUrl?: string): LLMChatFn {
  // Use 0.3 temperature — small quantized models produce more consistent structured JSON
  // output at lower temperatures (LLM Expert requirement).
  const url = baseUrl || 'http://localhost:8080';
  return async (messages) => {
    let response: Response;
    try {
      response = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (err) {
      const cause = (err as { cause?: { code?: string } })?.cause;
      if (cause?.code === 'ECONNREFUSED' || (err instanceof TypeError && (err as TypeError).message.includes('fetch'))) {
        throw new Error(
          `Cannot connect to llama-server at ${url} — is it running? Start it with: llama-server -m <model.gguf>`
        );
      }
      throw err;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // Detect exceed_context_size_error: mirrors server/src/llm/providers/llamacpp.ts detection.
      if (response.status >= 400) {
        let errorBody: { error?: { type?: string; n_prompt_tokens?: number; n_ctx?: number } } = {};
        try { errorBody = JSON.parse(detail); } catch { /* not JSON */ }
        if (errorBody?.error?.type === 'exceed_context_size_error') {
          const nPrompt = errorBody.error.n_prompt_tokens;
          const nCtx = errorBody.error.n_ctx;
          const tokenInfo = (nPrompt !== undefined && nCtx !== undefined)
            ? ` (${nPrompt} tokens requested, server context is ${nCtx})`
            : '';
          throw new Error(
            `Session too large for llama-server context window${tokenInfo}. ` +
            `Start llama-server with a larger context: llama-server -m <model.gguf> -c 32768`
          );
        }
      }
      throw new Error(`llama-server API error (HTTP ${response.status})${detail ? ` - ${detail}` : ''}`);
    }
    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
    };
  };
}

function makeChatFn(config: LLMProviderConfig): LLMChatFn {
  switch (config.provider) {
    case 'openai':    return makeOpenAIChat(config.apiKey ?? '', config.model);
    case 'anthropic': return makeAnthropicChat(config.apiKey ?? '', config.model);
    case 'gemini':    return makeGeminiChat(config.apiKey ?? '', config.model);
    case 'ollama':    return makeOllamaChat(config.model, config.baseUrl);
    case 'llamacpp':  return makeLlamaCppChat(config.model, config.baseUrl);
    default:          throw new Error(`Unknown LLM provider: ${(config as LLMProviderConfig).provider}`);
  }
}

// ── ProviderRunner ────────────────────────────────────────────────────────────

export class ProviderRunner implements AnalysisRunner {
  readonly name: string;
  private readonly chat: LLMChatFn;
  private readonly _model: string;
  private readonly _provider: string;

  constructor(config: LLMProviderConfig) {
    this.name = config.provider;
    this._model = config.model;
    this._provider = config.provider;
    this.chat = makeChatFn(config);
  }

  /**
   * Create a ProviderRunner from the current CLI config.
   * Throws if LLM is not configured.
   */
  static fromConfig(): ProviderRunner {
    const config = loadConfig();
    const llm = config?.dashboard?.llm;
    if (!llm) {
      throw new Error('LLM not configured. Run `code-insights config llm` to configure a provider.');
    }
    // Local providers (ollama, llamacpp) do not require an API key
    if (llm.provider !== 'ollama' && llm.provider !== 'llamacpp' && !llm.apiKey) {
      throw new Error(
        `LLM provider '${llm.provider}' requires an API key. Run \`code-insights config llm\` to set it.`
      );
    }
    return new ProviderRunner(llm);
  }

  async runAnalysis(params: RunAnalysisParams): Promise<RunAnalysisResult> {
    const start = Date.now();

    const messages: LLMMessage[] = [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt },
    ];

    const response = await this.chat(messages);

    return {
      rawJson: response.content,
      durationMs: Date.now() - start,
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      ...(response.usage?.cacheCreationTokens !== undefined && {
        cacheCreationTokens: response.usage.cacheCreationTokens,
      }),
      ...(response.usage?.cacheReadTokens !== undefined && {
        cacheReadTokens: response.usage.cacheReadTokens,
      }),
      model: this._model,
      provider: this._provider,
    };
  }
}
