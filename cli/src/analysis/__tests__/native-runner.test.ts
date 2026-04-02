import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process and fs before importing the module under test.
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { ClaudeNativeRunner } from '../native-runner.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockUnlinkSync = vi.mocked(unlinkSync);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the JSON envelope that `claude -p --output-format json` actually returns.
 * The LLM text lives in the result event's `result` field.
 */
function makeEnvelope(llmText: string, isError = false): string {
  return JSON.stringify([
    { type: 'system', subtype: 'init', session_id: 'test-session' },
    { type: 'assistant', message: { content: [{ type: 'text', text: llmText }] } },
    {
      type: 'result',
      subtype: isError ? 'error_during_execution' : 'success',
      result: llmText,
      is_error: isError,
    },
  ]);
}

// ── validate() ────────────────────────────────────────────────────────────────

describe('ClaudeNativeRunner.validate()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not throw when claude is in PATH', () => {
    mockExecFileSync.mockReturnValueOnce(Buffer.from('claude 1.0.0'));
    expect(() => ClaudeNativeRunner.validate()).not.toThrow();
    expect(mockExecFileSync).toHaveBeenCalledWith('claude', ['--version'], { stdio: 'pipe' });
  });

  it('throws a helpful message when claude is not found', () => {
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    expect(() => ClaudeNativeRunner.validate()).toThrow(/claude CLI not found in PATH/);
  });
});

// ── runAnalysis() ─────────────────────────────────────────────────────────────

describe('ClaudeNativeRunner.runAnalysis()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls execFileSync with correct args (no schema)', async () => {
    const llmJson = '{"summary": {"title": "test", "content": "c", "bullets": []}}';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await runner.runAnalysis({
      systemPrompt: 'You are an analyst.',
      userPrompt: 'Analyze this session.',
    });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['-p', '--model', 'sonnet', '--output-format', 'json', '--append-system-prompt-file', expect.stringContaining('ci-prompt-')]),
      expect.objectContaining({
        input: 'Analyze this session.',
        encoding: 'utf-8',
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      })
    );

    // --json-schema flag must NOT appear when jsonSchema is not provided
    const callArgs = mockExecFileSync.mock.calls[0][1] as string[];
    expect(callArgs).not.toContain('--json-schema');
  });

  it('passes custom model to claude -p args', async () => {
    const llmJson = '{"summary": {"title": "t", "content": "c", "bullets": []}}';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);
    const runner = new ClaudeNativeRunner({ model: 'opus' });

    await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    const callArgs = mockExecFileSync.mock.calls[0][1] as string[];
    const modelIndex = callArgs.indexOf('--model');
    expect(modelIndex).toBeGreaterThan(-1);
    expect(callArgs[modelIndex + 1]).toBe('opus');
  });

  it('uses sonnet as default model when no model option provided', async () => {
    const llmJson = '{"summary": {"title": "t", "content": "c", "bullets": []}}';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    const result = await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    const callArgs = mockExecFileSync.mock.calls[0][1] as string[];
    const modelIndex = callArgs.indexOf('--model');
    expect(callArgs[modelIndex + 1]).toBe('sonnet');
    expect(result.model).toBe('sonnet');
  });

  it('includes --json-schema arg when jsonSchema is provided', async () => {
    const llmJson = '{"summary": {"title": "t", "content": "c", "bullets": []}}';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await runner.runAnalysis({
      systemPrompt: 'system',
      userPrompt: 'user',
      jsonSchema: { type: 'object', properties: {} },
    });

    const callArgs = mockExecFileSync.mock.calls[0][1] as string[];
    expect(callArgs).toContain('--json-schema');

    const schemaIndex = callArgs.indexOf('--json-schema');
    expect(callArgs[schemaIndex + 1]).toContain('ci-schema-');
  });

  it('extracts rawJson from the result event (not the full envelope)', async () => {
    const llmJson = '{"summary": {"title": "T", "content": "C", "bullets": []}}';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    const result = await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    // Must be the extracted LLM text, not the raw event array
    expect(result.rawJson).toBe(llmJson);
    expect(result.rawJson).not.toContain('"type":"result"');
  });

  it('returns correct result shape with zero tokens', async () => {
    const llmJson = '{"summary": {"title": "T", "content": "C", "bullets": []}}';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    const result = await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    expect(result.rawJson).toBe(llmJson);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.model).toBe('sonnet'); // DEFAULT_NATIVE_MODEL
    expect(result.provider).toBe('claude-code-native');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws when is_error is true on the result event', async () => {
    const errorMsg = 'Context window exceeded';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(errorMsg, true) as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow(/claude -p reported an error/);
  });

  it('throws when output is not a JSON array', async () => {
    mockExecFileSync.mockReturnValueOnce('not json at all' as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow(/non-JSON output/);
  });

  it('throws when output is JSON but not an array', async () => {
    mockExecFileSync.mockReturnValueOnce('{"type":"result"}' as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow(/not an array/);
  });

  it('throws when event array is empty', async () => {
    mockExecFileSync.mockReturnValueOnce('[]' as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow(/no result event/);
  });

  it('throws when JSON array has no result event', async () => {
    const noResultEnvelope = JSON.stringify([
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: {} },
    ]);
    mockExecFileSync.mockReturnValueOnce(noResultEnvelope as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow(/no result event/);
  });

  it('throws on error_max_turns subtype', async () => {
    const envelope = JSON.stringify([
      { type: 'system', subtype: 'init' },
      { type: 'result', subtype: 'error_max_turns', result: 'Max turns reached', is_error: true },
    ]);
    mockExecFileSync.mockReturnValueOnce(envelope as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' }))
      .rejects.toThrow(/claude -p reported an error.*Max turns/);
  });

  it('writes system prompt to a temp file', async () => {
    const llmJson = '{"summary": {"title": "T", "content": "C", "bullets": []}}';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await runner.runAnalysis({ systemPrompt: 'SYSTEM_CONTENT', userPrompt: 'u' });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('ci-prompt-'),
      'SYSTEM_CONTENT',
      'utf-8'
    );
  });

  it('temp file names include a random suffix to prevent collisions', async () => {
    // Run twice and verify the file IDs differ
    const llmJson = '{}';
    mockExecFileSync
      .mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer)
      .mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);

    const runner = new ClaudeNativeRunner();
    await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });
    await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    const promptFiles = (mockWriteFileSync.mock.calls as unknown as [string, string, string][])
      .filter(([path]) => path.includes('ci-prompt-'))
      .map(([path]) => path);

    expect(promptFiles).toHaveLength(2);
    // The two file paths must differ (random suffix)
    expect(promptFiles[0]).not.toBe(promptFiles[1]);
  });

  it('cleans up temp files when execFileSync succeeds', async () => {
    const llmJson = '{"summary": {"title": "T", "content": "C", "bullets": []}}';
    mockExecFileSync.mockReturnValueOnce(makeEnvelope(llmJson) as unknown as Buffer);
    const runner = new ClaudeNativeRunner();

    await runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' });

    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('ci-prompt-'));
  });

  it('cleans up temp files even when execFileSync throws', async () => {
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('timeout'); });
    const runner = new ClaudeNativeRunner();

    await expect(runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u' })).rejects.toThrow('timeout');

    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('ci-prompt-'));
  });

  it('cleans up both temp files when schema is provided and execFileSync throws', async () => {
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('fail'); });
    const runner = new ClaudeNativeRunner();

    await expect(
      runner.runAnalysis({ systemPrompt: 's', userPrompt: 'u', jsonSchema: { type: 'object' } })
    ).rejects.toThrow('fail');

    const unlinkCalls = mockUnlinkSync.mock.calls.map(c => c[0] as string);
    expect(unlinkCalls.some(p => p.includes('ci-prompt-'))).toBe(true);
    expect(unlinkCalls.some(p => p.includes('ci-schema-'))).toBe(true);
  });

  it('has the correct runner name', () => {
    const runner = new ClaudeNativeRunner();
    expect(runner.name).toBe('claude-code-native');
  });
});
