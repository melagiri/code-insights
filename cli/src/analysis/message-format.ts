// SQLite message formatting utilities for LLM prompt construction.
// Extracted from prompts.ts — used by prompt generator functions in prompts.ts.

import type { SQLiteMessageRow, SessionMetadata } from './prompt-types.js';

// Safely parse a JSON-encoded string field from SQLite.
// Returns defaultValue if the field is null, empty, or invalid JSON.
// Mirrors server/src/utils.ts safeParseJson — keep in sync.
function safeParseJson<T>(value: string | null | undefined, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

// Internal types — only used within formatMessagesForAnalysis
interface ParsedToolCall {
  name?: string;
}

interface ParsedToolResult {
  output?: string;
}

/**
 * Detect the class of a stored user message from its content string.
 * Operates on the DB content field (stringified), not raw JSONL.
 *
 * This mirrors classifyUserMessage() in cli/src/parser/jsonl.ts but works on
 * stored content strings instead of parsed JSONL message objects. The DB stores
 * message content as a plain string — tool-results are JSON arrays stringified,
 * human text is stored as-is.
 *
 * Order matters — most specific checks first.
 */
export function classifyStoredUserMessage(content: string): 'human' | 'tool-result' | 'system-artifact' {
  // Tool-result: content is a JSON array containing tool_result blocks.
  // The DB stores these as stringified JSON arrays starting with '['.
  if (content.startsWith('[') && content.includes('"tool_result"')) return 'tool-result';

  // Auto-compact summary: Claude Code uses two known prefixes for LLM-initiated
  // context compaction summaries. Both must be checked.
  if (content.startsWith('Here is a summary of our conversation')) return 'system-artifact';
  if (content.startsWith('This session is being continued')) return 'system-artifact';

  // Slash command or skill load: single-line starting with / followed by a lowercase letter.
  // Requires content.trim() to be short (≤2 lines) to avoid false-positives on messages
  // containing file paths like "/usr/bin/..." as part of a longer instruction.
  const trimmed = content.trim();
  if (/^\/[a-z]/.test(trimmed) && trimmed.split('\n').length <= 2) return 'system-artifact';

  return 'human';
}

/**
 * Format SQLite message rows for LLM consumption.
 * Handles snake_case fields and JSON-encoded tool_calls/tool_results.
 *
 * User#N indices only increment for genuine human messages. Tool-results and
 * system artifacts (auto-compacts, slash commands) receive bracketed labels
 * instead. This ensures User#N references in PQ takeaways and evidence fields
 * align with actual human turns, not inflated by tool-result rows.
 */
export function formatMessagesForAnalysis(messages: SQLiteMessageRow[]): string {
  let userIndex = 0;
  let assistantIndex = 0;

  return messages
    .map((m) => {
      let roleLabel: string;

      if (m.type === 'user') {
        const msgClass = classifyStoredUserMessage(m.content);
        if (msgClass === 'tool-result') {
          roleLabel = '[tool-result]';
        } else if (msgClass === 'system-artifact') {
          // Auto-compact summaries use two known prefixes — everything else (slash commands,
          // skill loads) is a generic system artifact, not a compaction event.
          const isAutoCompact = m.content.startsWith('Here is a summary of our conversation')
            || m.content.startsWith('This session is being continued');
          roleLabel = isAutoCompact ? '[auto-compact]' : '[system]';
        } else {
          // Genuine human message — increment counter
          roleLabel = `User#${userIndex++}`;
        }
      } else if (m.type === 'assistant') {
        roleLabel = `Assistant#${assistantIndex++}`;
      } else {
        roleLabel = 'System';
      }

      // Parse JSON-encoded tool_calls and tool_results via safeParseJson
      const toolCalls = safeParseJson<ParsedToolCall[]>(m.tool_calls, []);
      const toolResults = safeParseJson<ParsedToolResult[]>(m.tool_results, []);

      const toolInfo = toolCalls.length > 0
        ? `\n[Tools used: ${toolCalls.map(t => t.name || 'unknown').join(', ')}]`
        : '';

      // Include thinking content — capped at 1000 chars to stay within token budget
      const thinkingInfo = m.thinking
        ? `\n[Thinking: ${m.thinking.slice(0, 1000)}]`
        : '';

      // Include tool results for context — 500 chars per result (error messages need ~300-400 chars)
      const resultInfo = toolResults.length > 0
        ? `\n[Tool results: ${toolResults.map(r => (r.output || '').slice(0, 500)).join(' | ')}]`
        : '';

      return `### ${roleLabel}:\n${m.content}${thinkingInfo}${toolInfo}${resultInfo}`;
    })
    .join('\n\n');
}

/**
 * Format a one-line context signals header from V6 session metadata.
 * Returns empty string when no signals are present (pre-V6 sessions with NULL columns).
 *
 * Example output:
 *   "Context signals: 3 context compactions (2 auto, 1 manual) — session exceeded context window; slash commands used: /review, /test\n"
 */
export function formatSessionMetaLine(meta?: SessionMetadata): string {
  if (!meta) return '';
  const parts: string[] = [];

  const totalCompacts = (meta.compactCount ?? 0) + (meta.autoCompactCount ?? 0);
  if (totalCompacts > 0) {
    const breakdown: string[] = [];
    if (meta.autoCompactCount) breakdown.push(`${meta.autoCompactCount} auto`);
    if (meta.compactCount) breakdown.push(`${meta.compactCount} manual`);
    parts.push(`${totalCompacts} context compaction${totalCompacts > 1 ? 's' : ''} (${breakdown.join(', ')}) — session exceeded context window`);
  }

  if (meta.slashCommands?.length) {
    parts.push(`slash commands used: ${meta.slashCommands.join(', ')}`);
  }

  if (parts.length === 0) return '';
  return `Context signals: ${parts.join('; ')}\n`;
}
