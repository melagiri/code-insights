import { describe, expect, it } from 'vitest';
import { extractOpenCodeResult } from '../local-agent-runners.js';
import { normalizeRunner } from '../runner-factory.js';

describe('extractOpenCodeResult', () => {
  it('joins text events and ignores lifecycle events', () => {
    const output = [
      JSON.stringify({ type: 'step_start' }),
      JSON.stringify({ type: 'text', part: { text: '{"status":' } }),
      JSON.stringify({ type: 'text', part: { text: '"ok"}' } }),
      JSON.stringify({ type: 'step_finish' }),
    ].join('\n');
    expect(extractOpenCodeResult(output)).toBe('{"status":"ok"}');
  });

  it('throws for an error event', () => {
    expect(() => extractOpenCodeResult(JSON.stringify({ type: 'error', error: { message: 'denied' } })))
      .toThrow('denied');
  });

  it('throws when no assistant text is present', () => {
    expect(() => extractOpenCodeResult('{"type":"step_finish"}')).toThrow(/no text event/);
  });
});

describe('normalizeRunner', () => {
  it('keeps --native as a backwards-compatible Claude alias', () => {
    expect(normalizeRunner(undefined, true)).toBe('claude');
    expect(normalizeRunner('native')).toBe('claude');
  });

  it('defaults to the configured API provider', () => {
    expect(normalizeRunner()).toBe('api');
  });

  it('accepts supported local agents and rejects unknown runners', () => {
    expect(normalizeRunner('codex')).toBe('codex');
    expect(normalizeRunner('opencode')).toBe('opencode');
    expect(() => normalizeRunner('cursor')).toThrow(/Unknown analysis runner/);
  });
});
