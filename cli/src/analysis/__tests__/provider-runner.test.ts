import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMProviderConfig } from '../../types.js';

// Mock loadConfig so tests don't read ~/.code-insights/config.json
vi.mock('../../utils/config.js', () => ({
  loadConfig: vi.fn(),
}));

// Mock global fetch so tests don't make real HTTP calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { loadConfig } from '../../utils/config.js';
import { ProviderRunner } from '../provider-runner.js';

const mockLoadConfig = vi.mocked(loadConfig);

// Helper — build a minimal LLMProviderConfig
function makeConfig(overrides: Partial<LLMProviderConfig> = {}): LLMProviderConfig {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'sk-test',
    ...overrides,
  } as LLMProviderConfig;
}

// Helper — build a fetch Response mock
function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('ProviderRunner.fromConfig()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when LLM is not configured', () => {
    mockLoadConfig.mockReturnValue(null);
    expect(() => ProviderRunner.fromConfig()).toThrow(/LLM not configured/);
  });

  it('throws when apiKey is missing for non-ollama providers', () => {
    mockLoadConfig.mockReturnValue({
      dashboard: { llm: makeConfig({ apiKey: undefined }) },
    } as ReturnType<typeof loadConfig>);
    expect(() => ProviderRunner.fromConfig()).toThrow(/requires an API key/);
  });

  it('creates a runner from valid config', () => {
    mockLoadConfig.mockReturnValue({
      dashboard: { llm: makeConfig() },
    } as ReturnType<typeof loadConfig>);
    const runner = ProviderRunner.fromConfig();
    expect(runner).toBeInstanceOf(ProviderRunner);
    expect(runner.name).toBe('openai');
  });

  it('accepts ollama config without apiKey', () => {
    mockLoadConfig.mockReturnValue({
      dashboard: { llm: makeConfig({ provider: 'ollama', apiKey: undefined, model: 'llama3' }) },
    } as ReturnType<typeof loadConfig>);
    const runner = ProviderRunner.fromConfig();
    expect(runner.name).toBe('ollama');
  });
});

describe('ProviderRunner.runAnalysis() — OpenAI', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls OpenAI endpoint with correct payload', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      choices: [{ message: { content: '{"summary": {"title": "T", "content": "C", "bullets": []}}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }));

    const runner = new ProviderRunner(makeConfig());
    const result = await runner.runAnalysis({ systemPrompt: 'sys', userPrompt: 'user' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Authorization': 'Bearer sk-test' }),
      })
    );

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
    ]);
  });

  it('returns rawJson, token counts, model and provider', async () => {
    const rawJson = '{"summary": {"title": "T", "content": "C", "bullets": []}}';
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      choices: [{ message: { content: rawJson } }],
      usage: { prompt_tokens: 200, completion_tokens: 80 },
    }));

    const runner = new ProviderRunner(makeConfig());
    const result = await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    expect(result.rawJson).toBe(rawJson);
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(80);
    expect(result.model).toBe('gpt-4o');
    expect(result.provider).toBe('openai');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse(
      { error: { message: 'Invalid API key.' } },
      401
    ));

    const runner = new ProviderRunner(makeConfig());
    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow('Invalid API key.');
  });
});

describe('ProviderRunner.runAnalysis() — Anthropic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls Anthropic endpoint with correct headers', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      content: [{ text: '{"facets": null}' }],
      usage: { input_tokens: 300, output_tokens: 60, cache_creation_input_tokens: 50, cache_read_input_tokens: 100 },
    }));

    const runner = new ProviderRunner(makeConfig({ provider: 'anthropic', model: 'claude-opus-4-5', apiKey: 'ak-test' }));
    const result = await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'ak-test',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        }),
      })
    );

    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(60);
    expect(result.cacheCreationTokens).toBe(50);
    expect(result.cacheReadTokens).toBe(100);
  });
});

describe('ProviderRunner.runAnalysis() — OpenCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the selected Zen or Go OpenAI-compatible endpoint', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      choices: [{ message: { content: '{"status":"ok"}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    }));
    const runner = new ProviderRunner(makeConfig({
      provider: 'opencode', model: 'kimi-k3', apiKey: 'oc-test',
      baseUrl: 'https://opencode.ai/zen/go/v1/',
    }));
    const result = await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/chat/completions',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer oc-test' }) }),
    );
    expect(result.provider).toBe('opencode');
    expect(result.model).toBe('kimi-k3');
    expect(result.inputTokens).toBe(12);
  });
});

describe('ProviderRunner.runAnalysis() — Anthropic message shaping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('extracts system message from messages array for Anthropic', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      content: [{ text: '{}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }));

    const runner = new ProviderRunner(makeConfig({ provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'ak' }));
    await runner.runAnalysis({ systemPrompt: 'BE HELPFUL', userPrompt: 'analyze' });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.system).toBe('BE HELPFUL');
    expect(body.messages).toEqual([{ role: 'user', content: 'analyze' }]);
  });
});

describe('ProviderRunner.runAnalysis() — missing usage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zero tokens when usage is missing from OpenAI response', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      choices: [{ message: { content: '{}' } }],
      // no usage field
    }));

    const runner = new ProviderRunner(makeConfig());
    const result = await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});

describe('ProviderRunner — constructor', () => {
  it('throws on unknown provider', () => {
    expect(() => new ProviderRunner({ provider: 'unknown' as never, model: 'x', apiKey: 'k' }))
      .toThrow(/Unknown LLM provider/);
  });
});

describe('ProviderRunner.runAnalysis() — Gemini', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls Gemini endpoint with correct URL and payload', async () => {
    const rawJson = '{"summary": {"title": "G", "content": "C", "bullets": []}}';
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      candidates: [{ content: { parts: [{ text: rawJson }] } }],
      usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 40 },
    }));

    const runner = new ProviderRunner(makeConfig({ provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'gk-test' }));
    const result = await runner.runAnalysis({ systemPrompt: 'sys', userPrompt: 'user' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gk-test');
    expect(url).toContain('gemini-1.5-flash');

    const body = JSON.parse(init.body as string);
    // System message routed to systemInstruction, not contents
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
    expect(body.contents[0].parts[0].text).toBe('user');

    expect(result.rawJson).toBe(rawJson);
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(40);
    expect(result.provider).toBe('gemini');
  });

  it('throws on Gemini API error', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse(
      { error: { message: 'API key not valid.' } },
      400
    ));

    const runner = new ProviderRunner(makeConfig({ provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'bad' }));
    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow('API key not valid.');
  });
});

describe('ProviderRunner.runAnalysis() — Ollama', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls Ollama endpoint with correct payload', async () => {
    const rawJson = '{"summary": {"title": "O", "content": "C", "bullets": []}}';
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      message: { content: rawJson },
      prompt_eval_count: 80,
      eval_count: 30,
    }));

    const runner = new ProviderRunner(makeConfig({ provider: 'ollama', model: 'llama3', apiKey: undefined }));
    const result = await runner.runAnalysis({ systemPrompt: 'sys', userPrompt: 'user' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('llama3');
    expect(body.stream).toBe(false);

    expect(result.rawJson).toBe(rawJson);
    expect(result.inputTokens).toBe(80);
    expect(result.outputTokens).toBe(30);
    expect(result.provider).toBe('ollama');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      message: { content: '{}' },
    }));

    const runner = new ProviderRunner(makeConfig({
      provider: 'ollama',
      model: 'mistral',
      apiKey: undefined,
      baseUrl: 'http://my-ollama:11434',
    }));
    await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://my-ollama:11434/api/chat');
  });
});

describe('ProviderRunner.runAnalysis() — llamacpp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls llama-server endpoint with correct payload', async () => {
    const rawJson = '{"summary": {"title": "L", "content": "C", "bullets": []}}';
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      choices: [{ message: { content: rawJson } }],
      usage: { prompt_tokens: 90, completion_tokens: 35 },
    }));

    const runner = new ProviderRunner(makeConfig({ provider: 'llamacpp', model: 'gemma-4-12b', apiKey: undefined }));
    const result = await runner.runAnalysis({ systemPrompt: 'sys', userPrompt: 'user' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/v1/chat/completions');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gemma-4-12b');
    expect(body.temperature).toBe(0.3);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
    ]);

    expect(result.rawJson).toBe(rawJson);
    expect(result.inputTokens).toBe(90);
    expect(result.outputTokens).toBe(35);
    expect(result.provider).toBe('llamacpp');
    expect(result.model).toBe('gemma-4-12b');
  });

  it('does not require an API key (fromConfig accepts llamacpp without apiKey)', () => {
    mockLoadConfig.mockReturnValue({
      dashboard: { llm: makeConfig({ provider: 'llamacpp', model: 'gemma-4-12b', apiKey: undefined }) },
    } as ReturnType<typeof loadConfig>);
    // Must not throw — llamacpp is a local provider
    const runner = ProviderRunner.fromConfig();
    expect(runner.name).toBe('llamacpp');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      choices: [{ message: { content: '{}' } }],
    }));

    const runner = new ProviderRunner(makeConfig({
      provider: 'llamacpp',
      model: 'gemma-4-27b',
      apiKey: undefined,
      baseUrl: 'http://my-llama-server:8080',
    }));
    await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://my-llama-server:8080/v1/chat/completions');
  });

  it('throws a helpful error when llama-server is not running (ECONNREFUSED)', async () => {
    const err = new TypeError('fetch failed');
    Object.assign(err, { cause: { code: 'ECONNREFUSED' } });
    mockFetch.mockRejectedValueOnce(err);

    const runner = new ProviderRunner(makeConfig({ provider: 'llamacpp', model: 'gemma-4-12b', apiKey: undefined }));
    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow(/llama-server/);
  });
});

describe('ProviderRunner — jsonSchema param', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not pass jsonSchema to the LLM API (only used by NativeRunner)', async () => {
    // ProviderRunner ignores jsonSchema — the LLM API enforces structure differently.
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      choices: [{ message: { content: '{}' } }],
    }));

    const runner = new ProviderRunner(makeConfig());
    await runner.runAnalysis({
      systemPrompt: 's',
      userPrompt: 'u',
      jsonSchema: { type: 'object', properties: {} },
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    // jsonSchema must NOT appear in the request body to the LLM provider
    expect(body).not.toHaveProperty('json_schema');
    expect(body).not.toHaveProperty('jsonSchema');
  });
});
