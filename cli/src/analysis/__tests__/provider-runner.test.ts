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
