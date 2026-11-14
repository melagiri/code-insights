import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicClient } from './anthropic.js';

afterEach(() => vi.unstubAllGlobals());

function reply(content: unknown[], stop_reason = 'end_turn') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    content, stop_reason, usage: { input_tokens: 10, output_tokens: 20 },
  }), { status: 200 })));
  return createAnthropicClient('test-key', 'test-model').chat([{ role: 'user', content: 'Export' }]);
}

describe('Anthropic text responses', () => {
  it('retains all text blocks after a non-text block', async () => {
    const result = await reply([
      { type: 'thinking', thinking: 'not export text' },
      { type: 'text', text: '# Export' },
      { type: 'text', text: 'A useful rule.' },
    ]);
    expect(result.content).toBe('# Export\nA useful rule.');
    expect(result.usage?.outputTokens).toBe(20);
  });

  it.each([
    { name: 'empty blocks', content: [] },
    { name: 'whitespace text', content: [{ type: 'text', text: ' \n\t' }] },
    { name: 'thinking only', content: [{ type: 'thinking', thinking: 'only thinking' }] },
  ])(
    'rejects a response with no usable text: $name', async ({ content }) => {
      await expect(reply(content)).rejects.toThrow(/empty|no.*text/i);
    },
  );

  it('preserves the stop reason for export validation', async () => {
    const result = await reply([{ type: 'text', text: 'Truncated document' }], 'max_tokens');
    expect(result).toHaveProperty('stopReason', 'max_tokens');
  });
});
