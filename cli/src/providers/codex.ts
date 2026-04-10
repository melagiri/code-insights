import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionProvider } from './types.js';
import type { ParsedSession, ParsedMessage, ToolCall, ToolResult, SessionUsage, MessageUsage } from '../types.js';
import { generateTitle, detectSessionCharacter } from '../parser/titles.js';

/**
 * OpenAI Codex CLI session provider.
 * Discovers and parses rollout files from ~/.codex/sessions/
 *
 * Supports two formats:
 *   Format A: JSONL (v0.104.0+, 2026) — envelope/payload structure with response_item/event_msg
 *   Format B: Single JSON object (pre-2025) — bare items array with no envelope
 */
export class CodexProvider implements SessionProvider {
  getProviderName(): string {
    return 'codex-cli';
  }

  async discover(options?: { projectFilter?: string }): Promise<string[]> {
    const codexHome = getCodexHome();
    if (!codexHome) return [];

    const files: string[] = [];

    // Walk sessions/ and archived_sessions/ directories
    for (const subdir of ['sessions', 'archived_sessions']) {
      const sessionsDir = path.join(codexHome, subdir);
      if (!fs.existsSync(sessionsDir)) continue;
      collectRolloutFiles(sessionsDir, files);
    }

    // Apply project filter if specified (filter by cwd from session_meta)
    if (options?.projectFilter) {
      return filterByProject(files, options.projectFilter);
    }

    return files;
  }

  async parse(filePath: string): Promise<ParsedSession | null> {
    return parseCodexSession(filePath);
  }
}

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------

function getCodexHome(): string | null {
  const envHome = process.env.CODEX_HOME;
  if (envHome && fs.existsSync(envHome)) return envHome;

  const home = os.homedir();
  const defaultDir = path.join(home, '.codex');
  return fs.existsSync(defaultDir) ? defaultDir : null;
}

/**
 * Recursively collect rollout-*.jsonl and rollout-*.json files from date-organized directories.
 * Format A lives at: sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl
 * Format B lives at: sessions/rollout-<date>-<uuid>.json (flat)
 */
function collectRolloutFiles(dir: string, files: string[], depth = 0): void {
  if (depth > 10) return; // Guard against symlink loops
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRolloutFiles(fullPath, files, depth + 1);
    } else if (
      (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) ||
      (entry.name.startsWith('rollout-') && entry.name.endsWith('.json'))
    ) {
      files.push(fullPath);
    }
  }
}

/**
 * Quick-filter by project: read only the first line (session_meta) to get cwd.
 */
function filterByProject(files: string[], projectFilter: string): string[] {
  const filtered: string[] = [];
  const lowerFilter = projectFilter.toLowerCase();

  for (const filePath of files) {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(2048);
      const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
      fs.closeSync(fd);

      const firstLine = buf.toString('utf-8', 0, bytesRead).split('\n')[0];
      const meta = JSON.parse(firstLine);

      // session_meta has cwd field (Format A); Format B has session.cwd
      const cwd = meta.cwd || meta.payload?.cwd || meta.session?.cwd || '';
      if (cwd.toLowerCase().includes(lowerFilter)) {
        filtered.push(filePath);
      }
    } catch {
      // Include files we can't quick-check
      filtered.push(filePath);
    }
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Codex event types
// ---------------------------------------------------------------------------

interface CodexSessionMeta {
  type?: 'session_meta';
  id: string;
  timestamp: string;
  cwd?: string;
  originator?: string;
  source?: string;
  cli_version?: string;
  model?: string;
}

// Format A: each line is a RolloutLine envelope
interface CodexRolloutLine {
  type: string;
  timestamp?: string; // ISO 8601 — present on every line in Format A
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning?: number;
}

// Format B: top-level JSON structure
interface FormatBSession {
  session: {
    timestamp: string;
    id: string;
    cwd?: string;
    instructions?: string;
    model?: string;
  };
  items: FormatBItem[];
}

interface FormatBItem {
  role?: string;
  type: string;
  id?: string;
  content?: Array<{ type: string; text: string }>;
  // function_call fields
  name?: string;
  arguments?: string;
  call_id?: string;
  status?: string;
  // function_call_output fields
  output?: string;
  // reasoning fields
  summary?: Array<{ type: string; text: string }>;
  duration_ms?: number;
}

// ---------------------------------------------------------------------------
// Parser entry point
// ---------------------------------------------------------------------------

function parseCodexSession(filePath: string): ParsedSession | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) return null;

    // Detect format by file extension — content-sniffing is unreliable because
    // JSONL files also start with '{' on line 1 (the session_meta object).
    if (filePath.endsWith('.json')) {
      return parseFormatB(content);
    }

    return parseFormatA(content);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Format A parser (v0.104.0+ JSONL with envelope/payload structure)
// ---------------------------------------------------------------------------

function parseFormatA(content: string): ParsedSession | null {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return null;

  // Parse first line — session metadata
  const meta = parseSessionMeta(lines[0]);
  if (!meta) return null;

  const sessionId = `codex:${meta.id}`;

  const messages: ParsedMessage[] = [];
  const usageEntries: CodexUsage[] = [];
  let model = meta.model || '';
  let lastTimestamp = new Date(meta.timestamp);

  // Accumulator for current assistant turn
  let currentAssistantText = '';
  let currentToolCalls: ToolCall[] = [];
  let currentToolResults: ToolResult[] = [];
  let currentThinking: string | null = null;
  let turnUsage: CodexUsage | null = null;
  let toolCounter = 0;

  function flushAssistantTurn(): void {
    const text = currentAssistantText.trim();
    if (!text && currentToolCalls.length === 0) return;

    const msgUsage: MessageUsage | null = turnUsage ? {
      inputTokens: turnUsage.input_tokens || 0,
      outputTokens: turnUsage.output_tokens || 0,
      cacheCreationTokens: 0,
      cacheReadTokens: turnUsage.cached_input_tokens || 0,
      model: model || 'unknown',
      estimatedCostUsd: 0,
    } : null;

    messages.push({
      id: `codex-assistant-${messages.length}`,
      sessionId: sessionId,
      type: 'assistant',
      content: text.slice(0, 10000),
      thinking: currentThinking,
      toolCalls: [...currentToolCalls],
      toolResults: [...currentToolResults],
      usage: msgUsage,
      timestamp: lastTimestamp,
      parentId: null,
    });

    // Reset accumulators
    currentAssistantText = '';
    currentToolCalls = [];
    currentToolResults = [];
    currentThinking = null;
    turnUsage = null;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    let event: CodexRolloutLine;
    try {
      event = JSON.parse(line) as CodexRolloutLine;
    } catch {
      continue;
    }

    // Unwrap RolloutLine envelope if present
    const eventType = event.type;
    const payload = (event.payload || event) as Record<string, unknown>;

    // innerType is the meaningful event discriminant after unwrapping the envelope
    const innerType = (payload.type as string) || eventType;

    switch (innerType) {
      case 'message': {
        // response_item envelope: payload.type = "message", payload.role = "user"|"assistant"|"developer"
        const role = payload.role as string;

        if (role === 'developer') {
          // System prompts, permissions, collaboration mode — not real user messages
          break;
        }

        if (role === 'assistant') {
          // response_item assistant message: content has output_text items
          const assistantContent = extractContent(payload);
          if (assistantContent) {
            currentAssistantText += assistantContent + '\n';
          }
          lastTimestamp = parseEnvelopeTimestamp(event) || lastTimestamp;
        }
        // Skip role === 'user' — handled by event_msg/user_message case.
        // Both response_item/message(role=user) and event_msg/user_message fire for
        // every user prompt, so only capturing from one source avoids doubling the count.
        break;
      }

      case 'user_message':
      case 'userMessage': {
        // event_msg/user_message: the real user prompt (payload.message = text string)
        flushAssistantTurn();
        // event_msg user_message stores the text directly in payload.message
        const msgText = (payload.message as string) || '';
        if (msgText && !isSystemContextMessage(msgText)) {
          messages.push({
            id: (payload.id as string) || `codex-user-${messages.length}`,
            sessionId: sessionId,
            type: 'user',
            content: msgText.slice(0, 10000),
            thinking: null,
            toolCalls: [],
            toolResults: [],
            usage: null,
            timestamp: parseEnvelopeTimestamp(event) || lastTimestamp,
            parentId: null,
          });
          lastTimestamp = messages[messages.length - 1].timestamp;
        }
        break;
      }

      case 'agent_message': {
        // event_msg/agent_message fires alongside response_item/message(role=assistant).
        // Text is already captured via that handler — only update timestamp here to
        // avoid duplicating assistant content.
        lastTimestamp = parseEnvelopeTimestamp(event) || lastTimestamp;
        break;
      }

      case 'function_call': {
        // response_item/function_call: tool invocation (exec_command, etc.)
        // payload: { type, name, arguments (JSON string), call_id, status? }
        toolCounter++;
        const callId = (payload.call_id as string) || `codex-tool-${toolCounter}`;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(payload.arguments as string) as Record<string, unknown>;
        } catch {
          // arguments not valid JSON — store raw
          args = { raw: payload.arguments };
        }
        currentToolCalls.push({
          id: callId,
          name: (payload.name as string) || 'unknown',
          input: args,
        });
        lastTimestamp = parseEnvelopeTimestamp(event) || lastTimestamp;
        break;
      }

      case 'function_call_output': {
        // response_item/function_call_output: tool result
        // payload: { type, call_id, output (string) }
        const fcoCallId = payload.call_id as string;
        const output = ((payload.output as string) || '').slice(0, 1000);
        if (fcoCallId) {
          currentToolResults.push({ toolUseId: fcoCallId, output });
        }
        break;
      }

      case 'custom_tool_call': {
        // response_item/custom_tool_call: apply_patch and similar custom tools
        // payload: { type, name, call_id, input (string), status? }
        toolCounter++;
        const ctcCallId = (payload.call_id as string) || `codex-custom-${toolCounter}`;
        currentToolCalls.push({
          id: ctcCallId,
          name: (payload.name as string) || 'custom_tool',
          input: { raw: ((payload.input as string) || '').slice(0, 2000) },
        });
        lastTimestamp = parseEnvelopeTimestamp(event) || lastTimestamp;
        break;
      }

      case 'custom_tool_call_output': {
        // response_item/custom_tool_call_output: apply_patch result (output is JSON string)
        // payload: { type, call_id, output (JSON string with nested .output field) }
        const ctcoCallId = payload.call_id as string;
        let ctcoOutput = (payload.output as string) || '';
        try {
          // output field is often {"output":"...","metadata":{...}} — unwrap it
          const parsed = JSON.parse(ctcoOutput) as Record<string, unknown>;
          if (typeof parsed.output === 'string') {
            ctcoOutput = parsed.output;
          }
        } catch {
          // not JSON — use raw
        }
        if (ctcoCallId) {
          currentToolResults.push({ toolUseId: ctcoCallId, output: ctcoOutput.slice(0, 1000) });
        }
        break;
      }

      case 'reasoning': {
        // response_item/reasoning: model's internal reasoning summary
        // payload.summary is an array of { type: "summary_text", text: "..." }
        const summary = payload.summary as Array<Record<string, string>> | undefined;
        if (Array.isArray(summary)) {
          const reasoningText = summary
            .filter(s => s.type === 'summary_text')
            .map(s => s.text)
            .join('\n');
          if (reasoningText) currentThinking = (currentThinking || '') + reasoningText + '\n';
        }
        break;
      }

      case 'agent_reasoning': {
        // event_msg/agent_reasoning: streaming thinking text
        const reasoningText = (payload.text as string) || '';
        if (reasoningText) currentThinking = (currentThinking || '') + reasoningText + '\n';
        break;
      }

      case 'task_complete': {
        // event_msg/task_complete: turn boundary — replaces the non-existent "turn.completed"
        // Capture usage if present
        const usageRaw = payload.usage as CodexUsage | undefined;
        if (usageRaw?.input_tokens) {
          turnUsage = usageRaw;
          usageEntries.push(usageRaw);
        }
        if (payload.model) {
          model = payload.model as string;
        }
        flushAssistantTurn();
        break;
      }

      case 'turn.completed': {
        // Legacy event name — handle in case some versions use it
        const usage = (payload.usage || payload) as CodexUsage;
        if (usage.input_tokens) {
          turnUsage = usage;
          usageEntries.push(usage);
        }
        if ((payload as Record<string, unknown>).model) {
          model = (payload as Record<string, unknown>).model as string;
        }
        flushAssistantTurn();
        break;
      }

      case 'turn.started':
      case 'thread.started':
      case 'session_meta':
      case 'task_started':
      case 'token_count':
      case 'turn_context':
        // Lifecycle/telemetry events — skip
        break;

      default:
        break;
    }
  }

  // Flush any remaining assistant content after all lines processed
  flushAssistantTurn();

  return buildSession(sessionId, meta.cwd || 'codex://unknown', meta.cli_version || null, meta.timestamp, messages, usageEntries, model);
}

// ---------------------------------------------------------------------------
// Format B parser (pre-2025 single JSON object: { session, items })
// ---------------------------------------------------------------------------

function parseFormatB(content: string): ParsedSession | null {
  let parsed: FormatBSession;
  try {
    parsed = JSON.parse(content) as FormatBSession;
  } catch {
    return null;
  }

  if (!parsed.session?.id || !Array.isArray(parsed.items)) return null;

  const meta = parsed.session;
  const sessionId = `codex:${meta.id}`;
  const sessionTimestamp = meta.timestamp;

  const messages: ParsedMessage[] = [];
  const usageEntries: CodexUsage[] = [];
  const model = meta.model || '';

  // Accumulators for current assistant turn
  let currentToolCalls: ToolCall[] = [];
  let currentToolResults: ToolResult[] = [];
  let currentThinking: string | null = null;
  let toolCounter = 0;

  // Format B has no per-item timestamps — use session timestamp for all
  const sessionDate = new Date(sessionTimestamp);

  function flushAssistantTurn(): void {
    if (currentToolCalls.length === 0 && !currentThinking) return;

    messages.push({
      id: `codex-assistant-${messages.length}`,
      sessionId: sessionId,
      type: 'assistant',
      content: '',
      thinking: currentThinking,
      toolCalls: [...currentToolCalls],
      toolResults: [...currentToolResults],
      usage: null,
      timestamp: sessionDate,
      parentId: null,
    });

    currentToolCalls = [];
    currentToolResults = [];
    currentThinking = null;
  }

  for (const item of parsed.items) {
    if (!item.type) continue;

    if (item.role === 'user' && item.type === 'message') {
      // Flush pending assistant turn before new user message
      flushAssistantTurn();
      const userContent = extractFormatBContent(item.content);
      if (userContent && !isSystemContextMessage(userContent)) {
        messages.push({
          id: `codex-user-${messages.length}`,
          sessionId: sessionId,
          type: 'user',
          content: userContent.slice(0, 10000),
          thinking: null,
          toolCalls: [],
          toolResults: [],
          usage: null,
          timestamp: sessionDate,
          parentId: null,
        });
      }
      continue;
    }

    switch (item.type) {
      case 'reasoning': {
        // summary is array of { type: "summary_text", text: "..." }
        // In older sessions summary may be empty []
        if (Array.isArray(item.summary)) {
          const reasoningText = item.summary
            .filter(s => s.type === 'summary_text')
            .map(s => s.text)
            .join('\n');
          if (reasoningText) currentThinking = (currentThinking || '') + reasoningText + '\n';
        }
        break;
      }

      case 'function_call': {
        // item: { type, id, name, arguments (JSON string), call_id, status }
        toolCounter++;
        const callId = item.call_id || item.id || `codex-tool-${toolCounter}`;
        let args: Record<string, unknown> = {};
        if (item.arguments) {
          try {
            args = JSON.parse(item.arguments) as Record<string, unknown>;
          } catch {
            args = { raw: item.arguments };
          }
        }
        currentToolCalls.push({
          id: callId,
          name: item.name || 'unknown',
          input: args,
        });
        break;
      }

      case 'function_call_output': {
        // item: { type, call_id, output (JSON string) }
        const fcoCallId = item.call_id;
        let fcoOutput = item.output || '';
        try {
          // output is often {"output":"...","metadata":{...}}
          const outputParsed = JSON.parse(fcoOutput) as Record<string, unknown>;
          if (typeof outputParsed.output === 'string') {
            fcoOutput = outputParsed.output;
          }
        } catch {
          // not JSON — use raw
        }
        if (fcoCallId) {
          currentToolResults.push({ toolUseId: fcoCallId, output: fcoOutput.slice(0, 1000) });
        }
        break;
      }
    }
  }

  // Flush any remaining assistant content
  flushAssistantTurn();

  const projectPath = parsed.session.cwd || 'codex://unknown';
  return buildSession(sessionId, projectPath, null, sessionTimestamp, messages, usageEntries, model);
}

// ---------------------------------------------------------------------------
// Shared session builder
// ---------------------------------------------------------------------------

function buildSession(
  sessionId: string,
  projectPath: string,
  cliVersion: string | null,
  metaTimestamp: string,
  messages: ParsedMessage[],
  usageEntries: CodexUsage[],
  model: string,
): ParsedSession | null {
  if (messages.length === 0) return null;

  const userMessages = messages.filter(m => m.type === 'user');
  const assistantMessages = messages.filter(m => m.type === 'assistant');
  const toolCallCount = messages.reduce((sum, m) => sum + m.toolCalls.length, 0);

  const timestamps = messages.map(m => m.timestamp.getTime()).filter(t => t > 0);
  const startedAt = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date(metaTimestamp);
  const endedAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date(metaTimestamp);

  const totalInput = usageEntries.reduce((s, u) => s + (u.input_tokens || 0), 0);
  const totalOutput = usageEntries.reduce((s, u) => s + (u.output_tokens || 0), 0);
  const totalCached = usageEntries.reduce((s, u) => s + (u.cached_input_tokens || 0), 0);

  const usage: SessionUsage | undefined = totalInput > 0 ? {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    cacheCreationTokens: 0,
    cacheReadTokens: totalCached,
    estimatedCostUsd: 0, // Codex pricing not public
    modelsUsed: model ? [model] : [],
    primaryModel: model || 'unknown',
    usageSource: 'jsonl',
  } : undefined;

  const projectName = path.basename(projectPath);

  const session: ParsedSession = {
    id: sessionId,
    projectPath,
    projectName,
    summary: null,
    generatedTitle: null,
    titleSource: null,
    sessionCharacter: null,
    startedAt,
    endedAt,
    messageCount: userMessages.length + assistantMessages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    toolCallCount,
    compactCount: 0,
    autoCompactCount: 0,
    slashCommands: [],
    gitBranch: null,
    claudeVersion: cliVersion,
    sourceTool: 'codex-cli',
    usage,
    messages,
  };

  const titleResult = generateTitle(session);
  session.generatedTitle = titleResult.title;
  session.titleSource = titleResult.source;
  session.sessionCharacter = titleResult.character || detectSessionCharacter(session);

  return session;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseSessionMeta(line: string): CodexSessionMeta | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    // Handle RolloutLine envelope: { type: "session_meta", payload: { id, cwd, ... } }
    if (parsed.payload && parsed.type === 'session_meta') {
      return parsed.payload as CodexSessionMeta;
    }
    // Handle bare session_meta (legacy or direct)
    if (parsed.type === 'session_meta' || parsed.id) {
      return parsed as unknown as CodexSessionMeta;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract text content from a Format A payload.
 * Handles: plain text, content arrays with input_text/output_text/text types,
 * and nested item wrappers.
 */
function extractContent(payload: Record<string, unknown>): string | null {
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.content === 'string') return payload.content;
  if (Array.isArray(payload.content)) {
    const parts = (payload.content as Array<Record<string, string>>)
      .filter(c => c.type === 'text' || c.type === 'input_text' || c.type === 'output_text')
      .map(c => c.text)
      .filter(Boolean);
    return parts.length > 0 ? parts.join('\n') : null;
  }
  // Nested in item wrapper
  const item = payload.item as Record<string, unknown> | undefined;
  if (item) return extractContent(item);
  return null;
}

/**
 * Extract text content from Format B item content array.
 */
function extractFormatBContent(content: Array<{ type: string; text: string }> | undefined): string | null {
  if (!Array.isArray(content)) return null;
  const parts = content
    .filter(c => c.type === 'text' || c.type === 'input_text' || c.type === 'output_text')
    .map(c => c.text)
    .filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Parse the envelope-level timestamp from a Format A RolloutLine.
 * Every line in Format A has a top-level `timestamp` ISO 8601 string.
 */
function parseEnvelopeTimestamp(event: CodexRolloutLine): Date | null {
  const ts = event.timestamp;
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Detect system context injection messages that should not be treated as user prompts.
 * Codex CLI injects AGENTS.md, environment context, permissions, etc. as role="user" messages
 * before the actual user prompt. We filter these out to avoid polluting the message list.
 */
function isSystemContextMessage(content: string): boolean {
  const trimmed = content.trimStart();
  return (
    trimmed.startsWith('<permissions') ||
    trimmed.startsWith('<environment_context') ||
    trimmed.startsWith('<collaboration_mode') ||
    trimmed.startsWith('# AGENTS.md') ||
    trimmed.startsWith('## Apps') ||
    trimmed.startsWith('## Tools') ||
    trimmed.startsWith('<system') ||
    trimmed.startsWith('## Shell') ||
    trimmed.startsWith('## Current working directory')
  );
}
