import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionProvider } from './types.js';
import type { ParsedSession, ParsedMessage, ToolCall, ToolResult, SessionUsage, MessageUsage } from '../types.js';
import { generateTitle, detectSessionCharacter } from '../parser/titles.js';

/**
 * OpenAI Codex CLI session provider.
 * Discovers and parses rollout JSONL files from ~/.codex/sessions/
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
 * Recursively collect rollout-*.jsonl files from date-organized directories.
 * Structure: sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl
 */
function collectRolloutFiles(dir: string, files: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRolloutFiles(fullPath, files);
    } else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
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

      // session_meta has cwd field
      const cwd = meta.cwd || meta.payload?.cwd || '';
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

interface CodexRolloutLine {
  type: string;
  payload?: Record<string, unknown>;
  // Legacy format: bare events without payload wrapper
  [key: string]: unknown;
}

interface CodexItem {
  id?: string;
  type: string;
  text?: string;
  content?: unknown;
  command?: string;
  cwd?: string;
  status?: string;
  exitCode?: number;
  durationMs?: number;
  aggregatedOutput?: string;
  changes?: Array<{ path: string; kind: string; diff?: string }>;
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  result?: string;
  error?: string;
  summary?: string;
  query?: string;
  action?: string;
  path?: string;
}

interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning?: number;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseCodexSession(filePath: string): ParsedSession | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;

    // Parse first line — session metadata
    const meta = parseSessionMeta(lines[0]);
    if (!meta) return null;

    const sessionId = `codex:${meta.id}`;

    // Parse remaining lines — events
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

      // Handle different event types
      const innerType = (payload.type as string) || eventType;

      switch (innerType) {
        case 'user_message':
        case 'userMessage': {
          // Flush any pending assistant turn
          flushAssistantTurn();

          const userContent = extractUserContent(payload);
          if (userContent) {
            messages.push({
              id: (payload.id as string) || `codex-user-${messages.length}`,
              sessionId: sessionId,
              type: 'user',
              content: userContent.slice(0, 10000),
              thinking: null,
              toolCalls: [],
              toolResults: [],
              usage: null,
              timestamp: parseTimestamp(payload) || lastTimestamp,
              parentId: null,
            });
            lastTimestamp = messages[messages.length - 1].timestamp;
          }
          break;
        }

        case 'agent_message':
        case 'agentMessage':
        case 'item.completed': {
          const item = (payload.item || payload) as CodexItem;
          const itemType = item.type || innerType;

          if (itemType === 'agent_message' || itemType === 'agentMessage') {
            currentAssistantText += (item.text || (payload.text as string) || '') + '\n';
          } else if (itemType === 'command_execution' || itemType === 'commandExecution') {
            toolCounter++;
            currentToolCalls.push({
              id: item.id || `codex-tool-${toolCounter}`,
              name: 'shell',
              input: { command: item.command || '', cwd: item.cwd || '' },
            });
            if (item.aggregatedOutput) {
              currentToolResults.push({
                toolUseId: item.id || `codex-tool-${toolCounter}`,
                output: (item.aggregatedOutput || '').slice(0, 1000),
              });
            }
          } else if (itemType === 'file_change' || itemType === 'fileChange') {
            if (item.changes) {
              for (const change of item.changes) {
                toolCounter++;
                currentToolCalls.push({
                  id: `codex-file-${toolCounter}`,
                  name: 'apply_patch',
                  input: { path: change.path, kind: change.kind },
                });
                if (change.diff) {
                  currentToolResults.push({
                    toolUseId: `codex-file-${toolCounter}`,
                    output: change.diff.slice(0, 1000),
                  });
                }
              }
            }
          } else if (itemType === 'mcp_tool_call' || itemType === 'mcpToolCall') {
            toolCounter++;
            currentToolCalls.push({
              id: item.id || `codex-mcp-${toolCounter}`,
              name: item.tool || 'mcp_tool',
              input: item.arguments || {},
            });
            if (item.result) {
              currentToolResults.push({
                toolUseId: item.id || `codex-mcp-${toolCounter}`,
                output: (item.result || '').slice(0, 1000),
              });
            }
          } else if (itemType === 'reasoning') {
            currentThinking = item.summary || (item.text as unknown as string) || null;
          }
          break;
        }

        case 'turn.completed': {
          const usage = (payload.usage || payload) as CodexUsage;
          if (usage.input_tokens) {
            turnUsage = usage;
            usageEntries.push(usage);
          }
          if ((payload as Record<string, unknown>).model) {
            model = (payload as Record<string, unknown>).model as string;
          }

          // Flush assistant turn at turn boundary
          flushAssistantTurn();
          break;
        }

        case 'turn.started':
        case 'thread.started':
        case 'session_meta':
          // Lifecycle events — skip
          break;
      }
    }

    // Flush any remaining assistant content
    flushAssistantTurn();

    if (messages.length === 0) return null;

    // Build session
    const userMessages = messages.filter(m => m.type === 'user');
    const assistantMessages = messages.filter(m => m.type === 'assistant');
    const toolCallCount = messages.reduce((sum, m) => sum + m.toolCalls.length, 0);

    const timestamps = messages.map(m => m.timestamp.getTime()).filter(t => t > 0);
    const startedAt = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date(meta.timestamp);
    const endedAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : lastTimestamp;

    // Build session usage from accumulated turn usage
    const totalInput = usageEntries.reduce((s, u) => s + (u.input_tokens || 0), 0);
    const totalOutput = usageEntries.reduce((s, u) => s + (u.output_tokens || 0), 0);
    const totalCached = usageEntries.reduce((s, u) => s + (u.cached_input_tokens || 0), 0);

    const usage: SessionUsage | undefined = totalInput > 0 ? {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      cacheCreationTokens: 0,
      cacheReadTokens: totalCached,
      estimatedCostUsd: 0, // TODO: Codex pricing not public
      modelsUsed: model ? [model] : [],
      primaryModel: model || 'unknown',
      usageSource: 'jsonl',
    } : undefined;

    const projectPath = meta.cwd || 'codex://unknown';
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
      messageCount: messages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      toolCallCount,
      gitBranch: null,
      claudeVersion: meta.cli_version || null,
      sourceTool: 'codex-cli',
      usage,
      messages,
    };

    // Generate title and character
    const titleResult = generateTitle(session);
    session.generatedTitle = titleResult.title;
    session.titleSource = titleResult.source;
    session.sessionCharacter = titleResult.character || detectSessionCharacter(session);

    return session;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseSessionMeta(line: string): CodexSessionMeta | null {
  try {
    const parsed = JSON.parse(line);
    // Handle RolloutLine envelope
    if (parsed.payload && parsed.type === 'session_meta') {
      return parsed.payload as CodexSessionMeta;
    }
    // Handle bare session_meta (legacy or direct)
    if (parsed.type === 'session_meta' || parsed.id) {
      return parsed as CodexSessionMeta;
    }
    return null;
  } catch {
    return null;
  }
}

function extractUserContent(payload: Record<string, unknown>): string | null {
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.content === 'string') return payload.content;
  if (Array.isArray(payload.content)) {
    return (payload.content as Array<Record<string, string>>)
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  // Nested in item
  const item = payload.item as Record<string, unknown> | undefined;
  if (item) return extractUserContent(item);
  return null;
}

function parseTimestamp(payload: Record<string, unknown>): Date | null {
  const ts = payload.timestamp || payload.createdAt;
  if (!ts) return null;
  const d = new Date(ts as string | number);
  return isNaN(d.getTime()) ? null : d;
}
