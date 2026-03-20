import { describe, it, expect } from 'vitest';
import {
  classifyStoredUserMessage,
  formatMessagesForAnalysis,
  formatSessionMetaLine,
} from './message-format.js';
import {
  parseAnalysisResponse,
  parsePromptQualityResponse,
} from './response-parsers.js';
import {
  generateSessionAnalysisPrompt,
  generatePromptQualityPrompt,
  SESSION_ANALYSIS_SYSTEM_PROMPT,
  PROMPT_QUALITY_SYSTEM_PROMPT,
} from './prompts.js';
import type { SQLiteMessageRow } from './prompt-types.js';

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function makeMessage(overrides: Partial<SQLiteMessageRow> = {}): SQLiteMessageRow {
  return {
    id: 'msg-1',
    session_id: 'sess-1',
    type: 'user',
    content: 'Hello world',
    thinking: null,
    tool_calls: '',
    tool_results: '',
    usage: null,
    timestamp: '2025-06-15T10:00:00Z',
    parent_id: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────
// classifyStoredUserMessage
// ──────────────────────────────────────────────────────

describe('classifyStoredUserMessage', () => {
  it('classifies JSON array with tool_result as tool-result', () => {
    const content = '[{"type":"tool_result","tool_use_id":"toolu_abc","content":"File written successfully"}]';
    expect(classifyStoredUserMessage(content)).toBe('tool-result');
  });

  it('classifies JSON array with multiple items including tool_result as tool-result', () => {
    const content = '[{"type":"tool_result","tool_use_id":"toolu_xyz","content":"ok"},{"type":"tool_result","tool_use_id":"toolu_123","content":"done"}]';
    expect(classifyStoredUserMessage(content)).toBe('tool-result');
  });

  it('does NOT classify a JSON array without tool_result keyword as tool-result', () => {
    // A human might paste a JSON array in a message
    const content = '[{"name":"Alice"},{"name":"Bob"}]';
    expect(classifyStoredUserMessage(content)).toBe('human');
  });

  it('classifies "Here is a summary of our conversation" prefix as system-artifact', () => {
    const content = 'Here is a summary of our conversation so far:\n\nWe discussed auth middleware...';
    expect(classifyStoredUserMessage(content)).toBe('system-artifact');
  });

  it('classifies "This session is being continued" prefix as system-artifact', () => {
    const content = 'This session is being continued from a previous conversation that ran out of context...';
    expect(classifyStoredUserMessage(content)).toBe('system-artifact');
  });

  it('classifies single-line slash command as system-artifact', () => {
    expect(classifyStoredUserMessage('/compact')).toBe('system-artifact');
    expect(classifyStoredUserMessage('/review')).toBe('system-artifact');
    expect(classifyStoredUserMessage('/test --coverage')).toBe('system-artifact');
  });

  it('classifies two-line slash command as system-artifact', () => {
    const content = '/compact\nsome brief instruction';
    expect(classifyStoredUserMessage(content)).toBe('system-artifact');
  });

  it('does NOT classify long slash content (>2 lines) as system-artifact — avoids false positives', () => {
    // A human message starting with /usr/bin/... path in a longer paragraph
    const content = '/usr/bin/node is the runtime I am using.\nPlease update the shebang in the file.\nAlso fix the permissions.';
    expect(classifyStoredUserMessage(content)).toBe('human');
  });

  it('does NOT classify /UPPERCASE as system-artifact — only /[a-z] pattern', () => {
    const content = '/NotACommand';
    expect(classifyStoredUserMessage(content)).toBe('human');
  });

  it('classifies normal human text as human', () => {
    expect(classifyStoredUserMessage('Fix the auth middleware to use Hono patterns')).toBe('human');
    expect(classifyStoredUserMessage('Can you help me debug this?')).toBe('human');
    expect(classifyStoredUserMessage('')).toBe('human');
  });

  it('classifies human message starting with [ but no tool_result as human', () => {
    const content = '[Step 1] First do X\n[Step 2] Then do Y';
    expect(classifyStoredUserMessage(content)).toBe('human');
  });
});

// ──────────────────────────────────────────────────────
// formatSessionMetaLine
// ──────────────────────────────────────────────────────

describe('formatSessionMetaLine', () => {
  it('returns empty string when meta is undefined', () => {
    expect(formatSessionMetaLine(undefined)).toBe('');
  });

  it('returns empty string when all meta fields are zero/empty', () => {
    expect(formatSessionMetaLine({ compactCount: 0, autoCompactCount: 0, slashCommands: [] })).toBe('');
  });

  it('formats auto-compact only', () => {
    const result = formatSessionMetaLine({ autoCompactCount: 2 });
    expect(result).toContain('2 context compaction');
    expect(result).toContain('2 auto');
    expect(result).toContain('session exceeded context window');
    expect(result.endsWith('\n')).toBe(true);
  });

  it('formats manual compact only', () => {
    const result = formatSessionMetaLine({ compactCount: 1 });
    expect(result).toContain('1 context compaction');
    expect(result).toContain('1 manual');
    expect(result).not.toContain('auto');
  });

  it('formats both auto and manual compacts', () => {
    const result = formatSessionMetaLine({ compactCount: 1, autoCompactCount: 2 });
    expect(result).toContain('3 context compaction');
    expect(result).toContain('2 auto');
    expect(result).toContain('1 manual');
  });

  it('uses singular "compaction" for count of 1', () => {
    const result = formatSessionMetaLine({ autoCompactCount: 1 });
    expect(result).toContain('1 context compaction');
    expect(result).not.toContain('compactions');
  });

  it('uses plural "compactions" for count > 1', () => {
    const result = formatSessionMetaLine({ autoCompactCount: 3 });
    expect(result).toContain('3 context compactions');
  });

  it('formats slash commands only', () => {
    const result = formatSessionMetaLine({ slashCommands: ['/review', '/test'] });
    expect(result).toContain('slash commands used: /review, /test');
    expect(result).not.toContain('compaction');
  });

  it('formats compacts and slash commands together', () => {
    const result = formatSessionMetaLine({
      autoCompactCount: 1,
      slashCommands: ['/compact', '/review'],
    });
    expect(result).toContain('Context signals:');
    expect(result).toContain('context compaction');
    expect(result).toContain('slash commands used:');
  });
});

// ──────────────────────────────────────────────────────
// formatMessagesForAnalysis
// ──────────────────────────────────────────────────────

describe('formatMessagesForAnalysis', () => {
  it('produces readable text with role labels', () => {
    const messages = [
      makeMessage({ type: 'user', content: 'Fix the bug' }),
      makeMessage({ id: 'msg-2', type: 'assistant', content: 'Done!' }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('### User#0:');
    expect(result).toContain('Fix the bug');
    expect(result).toContain('### Assistant#0:');
    expect(result).toContain('Done!');
  });

  it('increments user and assistant indices independently', () => {
    const messages = [
      makeMessage({ type: 'user', content: 'msg 1' }),
      makeMessage({ id: 'msg-2', type: 'assistant', content: 'msg 2' }),
      makeMessage({ id: 'msg-3', type: 'user', content: 'msg 3' }),
      makeMessage({ id: 'msg-4', type: 'assistant', content: 'msg 4' }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('User#0');
    expect(result).toContain('Assistant#0');
    expect(result).toContain('User#1');
    expect(result).toContain('Assistant#1');
  });

  it('includes tool call names when present', () => {
    const messages = [
      makeMessage({
        type: 'assistant',
        content: 'Let me read the file',
        tool_calls: JSON.stringify([{ name: 'Read' }, { name: 'Write' }]),
      }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('[Tools used: Read, Write]');
  });

  it('includes thinking content when present', () => {
    const messages = [
      makeMessage({
        type: 'assistant',
        content: 'The answer is 42',
        thinking: 'I need to calculate this carefully',
      }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('[Thinking: I need to calculate this carefully]');
  });

  it('includes tool results when present', () => {
    const messages = [
      makeMessage({
        type: 'assistant',
        content: 'Read the file',
        tool_results: JSON.stringify([{ output: 'file contents here' }]),
      }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('[Tool results: file contents here]');
  });

  it('handles empty messages array', () => {
    const result = formatMessagesForAnalysis([]);
    expect(result).toBe('');
  });

  it('handles malformed JSON in tool_calls gracefully', () => {
    const messages = [
      makeMessage({
        type: 'assistant',
        content: 'oops',
        tool_calls: 'not valid json',
      }),
    ];
    // Should not throw
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('oops');
    // No [Tools used:] since parse failed
    expect(result).not.toContain('[Tools used:');
  });

  it('labels tool-result user messages as [tool-result] and does NOT increment User#N', () => {
    const toolResultContent = '[{"type":"tool_result","tool_use_id":"toolu_abc","content":"ok"}]';
    const messages = [
      makeMessage({ id: 'msg-1', type: 'user', content: 'First human message' }),
      makeMessage({ id: 'msg-2', type: 'user', content: toolResultContent }),
      makeMessage({ id: 'msg-3', type: 'user', content: 'Second human message' }),
    ];
    const result = formatMessagesForAnalysis(messages);
    // First and second human messages get indices 0 and 1 (tool-result in between skipped)
    expect(result).toContain('### User#0:');
    expect(result).toContain('### User#1:');
    // No User#2 should appear (only 2 human messages)
    expect(result).not.toContain('User#2');
    // Tool-result gets [tool-result] label
    expect(result).toContain('### [tool-result]:');
  });

  it('labels auto-compact user messages as [auto-compact] and does NOT increment User#N', () => {
    const autoCompactContent = 'Here is a summary of our conversation so far:\n\nWe implemented auth...';
    const messages = [
      makeMessage({ id: 'msg-1', type: 'user', content: 'Start work' }),
      makeMessage({ id: 'msg-2', type: 'user', content: autoCompactContent }),
      makeMessage({ id: 'msg-3', type: 'user', content: 'Continue work' }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('### User#0:');
    expect(result).toContain('### [auto-compact]:');
    expect(result).toContain('### User#1:');
    expect(result).not.toContain('User#2');
  });

  it('labels slash command user messages as [system] (not [auto-compact]) and does NOT increment User#N', () => {
    // Slash commands are system artifacts but NOT compaction events — they get [system] label.
    const messages = [
      makeMessage({ id: 'msg-1', type: 'user', content: 'Start work' }),
      makeMessage({ id: 'msg-2', type: 'user', content: '/compact' }),
      makeMessage({ id: 'msg-3', type: 'user', content: 'Continue work' }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('### User#0:');
    expect(result).toContain('### [system]:');
    expect(result).not.toContain('[auto-compact]');
    expect(result).toContain('### User#1:');
    expect(result).not.toContain('User#2');
  });

  it('distinguishes [auto-compact] from [system] when both appear in same session', () => {
    const autoCompactContent = 'This session is being continued from a previous conversation...';
    const messages = [
      makeMessage({ id: '1', type: 'user', content: 'Do something' }),
      makeMessage({ id: '2', type: 'user', content: '/review' }),
      makeMessage({ id: '3', type: 'user', content: autoCompactContent }),
      makeMessage({ id: '4', type: 'user', content: 'Continue' }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('### [system]:');
    expect(result).toContain('### [auto-compact]:');
    // User index should still count only genuine human messages (2 of them: 'Do something' + 'Continue')
    expect(result).toContain('### User#0:');
    expect(result).toContain('### User#1:');
    expect(result).not.toContain('User#2');
  });

  it('preserves User#N counter continuity across mixed message types', () => {
    const toolResult = '[{"type":"tool_result","tool_use_id":"toolu_1","content":"done"}]';
    const messages = [
      makeMessage({ id: '1', type: 'user', content: 'Human 0' }),
      makeMessage({ id: '2', type: 'user', content: toolResult }),
      makeMessage({ id: '3', type: 'user', content: toolResult }),
      makeMessage({ id: '4', type: 'user', content: 'Human 1' }),
      makeMessage({ id: '5', type: 'assistant', content: 'Reply' }),
      makeMessage({ id: '6', type: 'user', content: 'Human 2' }),
    ];
    const result = formatMessagesForAnalysis(messages);
    expect(result).toContain('User#0');
    expect(result).toContain('User#1');
    expect(result).toContain('User#2');
    expect(result).not.toContain('User#3');
    // Two [tool-result] blocks appear
    const toolResultCount = (result.match(/\[tool-result\]/g) ?? []).length;
    expect(toolResultCount).toBe(2);
  });
});

// ──────────────────────────────────────────────────────
// generateSessionAnalysisPrompt
// ──────────────────────────────────────────────────────

describe('generateSessionAnalysisPrompt', () => {
  it('includes project name in the prompt', () => {
    const result = generateSessionAnalysisPrompt('my-app', null, 'conversation text');
    expect(result).toContain('Project: my-app');
  });

  it('includes session summary when provided', () => {
    const result = generateSessionAnalysisPrompt('my-app', 'Fixed a critical bug', 'conversation text');
    expect(result).toContain('Session Summary: Fixed a critical bug');
  });

  it('omits session summary line when null', () => {
    const result = generateSessionAnalysisPrompt('my-app', null, 'conversation text');
    expect(result).not.toContain('Session Summary:');
  });

  it('includes the formatted messages', () => {
    const result = generateSessionAnalysisPrompt('my-app', null, '### User#0:\nHello');
    expect(result).toContain('### User#0:\nHello');
  });
});

// ──────────────────────────────────────────────────────
// generatePromptQualityPrompt
// ──────────────────────────────────────────────────────

describe('generatePromptQualityPrompt', () => {
  const sessionMeta = {
    humanMessageCount: 8,
    assistantMessageCount: 12,
    toolExchangeCount: 31,
  };

  it('includes project name in the prompt', () => {
    const result = generatePromptQualityPrompt('my-app', 'conversation', sessionMeta);
    expect(result).toContain('Project: my-app');
  });

  it('formats session shape header with structured counts', () => {
    const result = generatePromptQualityPrompt('my-app', 'conversation', sessionMeta);
    expect(result).toContain('Session shape: 8 user messages, 12 assistant messages, 31 tool exchanges');
  });

  it('does NOT include "Total messages:" in output', () => {
    const result = generatePromptQualityPrompt('my-app', 'conversation', sessionMeta);
    expect(result).not.toContain('Total messages:');
  });

  it('includes the formatted conversation', () => {
    const result = generatePromptQualityPrompt('my-app', '### User#0:\nHello', sessionMeta);
    expect(result).toContain('### User#0:\nHello');
  });

  it('handles zero tool exchanges', () => {
    const result = generatePromptQualityPrompt('proj', 'conversation', {
      humanMessageCount: 2,
      assistantMessageCount: 2,
      toolExchangeCount: 0,
    });
    expect(result).toContain('2 user messages, 2 assistant messages, 0 tool exchanges');
  });

  it('omits Context signals line when meta is not provided', () => {
    const result = generatePromptQualityPrompt('proj', 'conversation', sessionMeta);
    expect(result).not.toContain('Context signals:');
  });

  it('includes Context signals line when meta with compactions is provided', () => {
    const result = generatePromptQualityPrompt('proj', 'conversation', sessionMeta, {
      compactCount: 1,
      autoCompactCount: 2,
    });
    expect(result).toContain('Context signals:');
    expect(result).toContain('context compaction');
  });

  it('includes slash commands in Context signals when meta has slash commands', () => {
    const result = generatePromptQualityPrompt('proj', 'conversation', sessionMeta, {
      slashCommands: ['/review', '/test'],
    });
    expect(result).toContain('slash commands used: /review, /test');
  });
});

// ──────────────────────────────────────────────────────
// parseAnalysisResponse
// ──────────────────────────────────────────────────────

describe('parseAnalysisResponse', () => {
  it('parses valid JSON in <json> tags', () => {
    const response = `<json>
{
  "summary": {
    "title": "Implemented auth",
    "content": "Added login and logout",
    "bullets": ["Login flow", "Logout flow"]
  },
  "decisions": [],
  "learnings": []
}
</json>`;
    const result = parseAnalysisResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.summary.title).toBe('Implemented auth');
    expect(result.data.summary.bullets).toHaveLength(2);
    expect(result.data.decisions).toEqual([]);
    expect(result.data.learnings).toEqual([]);
  });

  it('parses raw JSON without tags', () => {
    const response = `{
  "summary": { "title": "Test", "content": "Content", "bullets": [] },
  "decisions": [],
  "learnings": []
}`;
    const result = parseAnalysisResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.summary.title).toBe('Test');
  });

  it('returns error for completely malformed response', () => {
    const result = parseAnalysisResponse('This is not JSON at all');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.error_type).toBe('no_json_found');
  });

  it('returns error for JSON missing required summary.title', () => {
    const response = '<json>{ "summary": { "content": "no title" }, "decisions": [], "learnings": [] }</json>';
    const result = parseAnalysisResponse(response);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.error_type).toBe('invalid_structure');
  });

  it('defaults decisions and learnings to empty arrays when missing', () => {
    const response = '<json>{ "summary": { "title": "Test", "content": "c", "bullets": [] } }</json>';
    const result = parseAnalysisResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.decisions).toEqual([]);
    expect(result.data.learnings).toEqual([]);
  });

  // Fix 2: LLM response structure validation — array guard tests
  it('coerces decisions to [] when LLM returns a non-array string value', () => {
    // LLM returned "decisions": "none" — string is truthy so || [] would NOT catch this
    const response = '<json>{ "summary": { "title": "Test", "content": "c", "bullets": [] }, "decisions": "none", "learnings": [] }</json>';
    const result = parseAnalysisResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Must be an array — not the string "none"
    expect(Array.isArray(result.data.decisions)).toBe(true);
    expect(result.data.decisions).toEqual([]);
  });

  it('coerces learnings to [] when LLM returns a non-array value', () => {
    const response = '<json>{ "summary": { "title": "Test", "content": "c", "bullets": [] }, "decisions": [], "learnings": {} }</json>';
    const result = parseAnalysisResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(Array.isArray(result.data.learnings)).toBe(true);
    expect(result.data.learnings).toEqual([]);
  });

  it('coerces facet arrays to [] when LLM returns non-array facets', () => {
    // LLM returned friction_points as a string instead of an array
    const response = '<json>{ "summary": { "title": "Test", "content": "c", "bullets": [] }, "decisions": [], "learnings": [], "facets": { "friction_points": "none", "effective_patterns": null } }</json>';
    const result = parseAnalysisResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Both must be arrays — .some() calls on monitors must not throw
    expect(Array.isArray(result.data.facets?.friction_points)).toBe(true);
    expect(Array.isArray(result.data.facets?.effective_patterns)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────
// parsePromptQualityResponse
// ──────────────────────────────────────────────────────

describe('parsePromptQualityResponse', () => {
  it('parses valid response with findings and takeaways', () => {
    const response = `<json>{
      "efficiency_score": 85,
      "message_overhead": 2,
      "assessment": "Good prompting style overall",
      "takeaways": [
        {
          "type": "improve",
          "category": "vague-request",
          "label": "Add file path to requests",
          "message_ref": "User#3",
          "original": "fix the bug",
          "better_prompt": "Fix the null pointer in cli/src/commands/sync.ts line 42",
          "why": "The original lacked enough detail to act on without guessing"
        }
      ],
      "findings": [
        {
          "category": "vague-request",
          "type": "deficit",
          "description": "User#3 asked to fix a bug without specifying file, function, or error message",
          "message_ref": "User#3",
          "impact": "medium",
          "confidence": 80
        }
      ],
      "dimension_scores": {
        "context_provision": 70,
        "request_specificity": 65,
        "scope_management": 90,
        "information_timing": 80,
        "correction_quality": 75
      }
    }</json>`;
    const result = parsePromptQualityResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.efficiency_score).toBe(85);
    expect(result.data.takeaways).toHaveLength(1);
    expect(result.data.findings).toHaveLength(1);
    expect(result.data.findings[0].category).toBe('vague-request');
    expect(result.data.dimension_scores.scope_management).toBe(90);
  });

  it('clamps efficiency_score to 0-100 range', () => {
    const response = '<json>{ "efficiency_score": 150, "message_overhead": 0, "assessment": "ok", "takeaways": [], "findings": [], "dimension_scores": { "context_provision": 50, "request_specificity": 50, "scope_management": 50, "information_timing": 50, "correction_quality": 50 } }</json>';
    const result = parsePromptQualityResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.efficiency_score).toBe(100);
  });

  it('defaults missing dimension_scores to 50s', () => {
    const response = '<json>{ "efficiency_score": 75, "message_overhead": 0, "assessment": "ok", "takeaways": [], "findings": [] }</json>';
    const result = parsePromptQualityResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dimension_scores.context_provision).toBe(50);
    expect(result.data.dimension_scores.correction_quality).toBe(50);
  });

  it('accepts empty arrays (well-prompted session)', () => {
    const response = '<json>{ "efficiency_score": 95, "message_overhead": 0, "assessment": "Excellent session", "takeaways": [], "findings": [], "dimension_scores": { "context_provision": 95, "request_specificity": 90, "scope_management": 95, "information_timing": 95, "correction_quality": 75 } }</json>';
    const result = parsePromptQualityResponse(response);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.takeaways).toHaveLength(0);
    expect(result.data.findings).toHaveLength(0);
  });

  it('returns error for missing efficiency_score', () => {
    const response = '<json>{ "assessment": "no score" }</json>';
    const result = parsePromptQualityResponse(response);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.error_type).toBe('invalid_structure');
  });

  it('returns error for completely invalid response', () => {
    const result = parsePromptQualityResponse('not json');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.error_type).toBe('no_json_found');
  });
});

// ──────────────────────────────────────────────────────
// System prompt constants
// ──────────────────────────────────────────────────────

describe('System prompt constants', () => {
  it('SESSION_ANALYSIS_SYSTEM_PROMPT is a non-empty string', () => {
    expect(typeof SESSION_ANALYSIS_SYSTEM_PROMPT).toBe('string');
    expect(SESSION_ANALYSIS_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('PROMPT_QUALITY_SYSTEM_PROMPT is a non-empty string', () => {
    expect(typeof PROMPT_QUALITY_SYSTEM_PROMPT).toBe('string');
    expect(PROMPT_QUALITY_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});
