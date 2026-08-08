import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { SessionProvider } from './types.js';
import type {
  MessageUsage,
  ParsedMessage,
  ParsedSession,
  SessionUsage,
  ToolCall,
  ToolResult,
} from '../types.js';
import { detectSessionCharacter, generateTitle } from '../parser/titles.js';

interface PiSessionHeader {
  type: 'session';
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

interface PiContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

interface PiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
}

interface PiMessage {
  role: string;
  content: string | PiContentBlock[];
  timestamp?: number;
  model?: string;
  usage?: PiUsage;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  errorMessage?: string;
}

interface PiEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  message?: PiMessage;
  summary?: string;
  name?: string;
  usage?: PiUsage;
}

/**
 * Pi Coding Agent session provider.
 * Discovers and parses JSONL sessions from ~/.pi/agent/sessions/ (or Pi's
 * documented environment-variable overrides).
 */
export class PiProvider implements SessionProvider {
  getProviderName(): string {
    return 'pi';
  }

  async discover(options?: { projectFilter?: string }): Promise<string[]> {
    const sessionsDir = getPiSessionsDir();
    if (!fs.existsSync(sessionsDir)) return [];

    const files: string[] = [];
    collectJsonlFiles(sessionsDir, files);

    if (!options?.projectFilter) return files;
    return filterByProject(files, options.projectFilter);
  }

  async parse(filePath: string): Promise<ParsedSession | null> {
    return parsePiSession(filePath);
  }
}

function getPiSessionsDir(): string {
  if (process.env.PI_CODING_AGENT_SESSION_DIR) {
    return path.resolve(expandHome(process.env.PI_CODING_AGENT_SESSION_DIR));
  }

  const agentDir = process.env.PI_CODING_AGENT_DIR
    ? path.resolve(expandHome(process.env.PI_CODING_AGENT_DIR))
    : path.join(os.homedir(), '.pi', 'agent');
  return path.join(agentDir, 'sessions');
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (/^~[\\/]/.test(value)) return path.join(os.homedir(), value.slice(2));
  return value;
}

function collectJsonlFiles(dir: string, files: string[], depth = 0): void {
  if (depth > 20) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsonlFiles(fullPath, files, depth + 1);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
}

function filterByProject(files: string[], projectFilter: string): string[] {
  const lowerFilter = projectFilter.toLowerCase();
  return files.filter((filePath) => {
    const header = readHeader(filePath);
    // Keep unreadable files so parse() can make the final decision.
    return !header || header.cwd.toLowerCase().includes(lowerFilter);
  });
}

function readHeader(filePath: string): PiSessionHeader | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(8192);
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      const firstLine = buffer.toString('utf8', 0, bytesRead).split('\n')[0];
      const parsed = JSON.parse(firstLine) as PiSessionHeader;
      return parsed.type === 'session' && parsed.id && parsed.cwd ? parsed : null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function parsePiSession(filePath: string): ParsedSession | null {
  let lines: string[];
  try {
    lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((line) => line.trim());
  } catch {
    return null;
  }
  if (lines.length === 0) return null;

  let header: PiSessionHeader;
  try {
    header = JSON.parse(lines[0]) as PiSessionHeader;
  } catch {
    return null;
  }
  if (header.type !== 'session' || !header.id || !header.cwd) return null;

  const sessionId = `pi:${header.id}`;
  const inheritedEntryIds = readInheritedEntryIds(filePath, header.parentSession);
  const messages: ParsedMessage[] = [];
  const usageEntries: Array<{ model?: string; usage: PiUsage }> = [];
  let compactCount = 0;
  let customTitle: string | undefined;

  for (let index = 1; index < lines.length; index++) {
    let entry: PiEntry;
    try {
      entry = JSON.parse(lines[index]) as PiEntry;
    } catch {
      continue;
    }

    // Forked Pi sessions can copy the parent's entries into the new JSONL file.
    // Analyze those entries only in the parent session to avoid double-counting.
    if (entry.id && inheritedEntryIds.has(entry.id)) continue;

    if (entry.type === 'compaction') {
      compactCount++;
      if (entry.usage) usageEntries.push({ usage: entry.usage });
      continue;
    }
    if (entry.type === 'branch_summary') {
      if (entry.usage) usageEntries.push({ usage: entry.usage });
      continue;
    }
    if (entry.type === 'session_info' && entry.name) {
      customTitle = entry.name;
      continue;
    }
    if (entry.type !== 'message' || !entry.message) continue;

    const message = entry.message;
    if (message.role === 'toolResult') {
      attachToolResult(messages, message);
      continue;
    }
    if (message.role !== 'user' && message.role !== 'assistant') continue;

    const parsed = parseMessage(entry, message, sessionId, index);
    if (!parsed) continue;
    messages.push(parsed);

    if (message.role === 'assistant' && message.model && message.usage) {
      usageEntries.push({ model: message.model, usage: message.usage });
    }
  }

  const userMessages = messages.filter((message) => message.type === 'user');
  const assistantMessages = messages.filter((message) => message.type === 'assistant');
  if (userMessages.length === 0 && assistantMessages.length === 0) return null;

  const timestamps = messages
    .map((message) => message.timestamp.getTime())
    .filter((timestamp) => Number.isFinite(timestamp));
  const headerDate = safeDate(header.timestamp) ?? new Date(0);
  const startedAt = timestamps.length ? new Date(Math.min(...timestamps)) : headerDate;
  const endedAt = timestamps.length ? new Date(Math.max(...timestamps)) : headerDate;
  const usage = buildSessionUsage(usageEntries);
  const toolCallCount = messages.reduce((sum, message) => sum + message.toolCalls.length, 0);

  const session: ParsedSession = {
    id: sessionId,
    projectPath: header.cwd,
    projectName: path.basename(header.cwd) || 'unknown',
    summary: null,
    generatedTitle: customTitle ?? null,
    titleSource: null,
    sessionCharacter: null,
    startedAt,
    endedAt,
    messageCount: userMessages.length + assistantMessages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    toolCallCount,
    compactCount,
    autoCompactCount: 0,
    slashCommands: [],
    gitBranch: null,
    claudeVersion: null,
    sourceTool: 'pi',
    usage,
    messages,
  };

  if (!customTitle) {
    const title = generateTitle(session);
    session.generatedTitle = title.title;
    session.titleSource = title.source;
    session.sessionCharacter = title.character;
  } else {
    session.sessionCharacter = detectSessionCharacter(session);
  }

  return session;
}

function parseMessage(
  entry: PiEntry,
  message: PiMessage,
  sessionId: string,
  index: number,
): ParsedMessage | null {
  const extractedContent = extractText(message.content);
  const content = extractedContent || (message.errorMessage ? `[error] ${message.errorMessage}` : '');
  const thinking = extractThinking(message.content);
  const toolCalls = extractToolCalls(message.content);
  if (!content && !thinking && toolCalls.length === 0) return null;

  const messageDate = typeof message.timestamp === 'number' ? new Date(message.timestamp) : null;
  const timestamp = messageDate && !Number.isNaN(messageDate.getTime())
    ? messageDate
    : safeDate(entry.timestamp) ?? new Date(0);

  let usage: MessageUsage | null = null;
  if (message.role === 'assistant' && message.model && message.usage) {
    usage = {
      inputTokens: message.usage.input ?? 0,
      outputTokens: message.usage.output ?? 0,
      cacheCreationTokens: message.usage.cacheWrite ?? 0,
      cacheReadTokens: message.usage.cacheRead ?? 0,
      model: message.model,
      estimatedCostUsd: message.usage.cost?.total ?? 0,
    };
  }

  return {
    // Pi entry IDs are short and can be copied into forked sessions. Namespace
    // them because the Code Insights messages table requires globally unique IDs.
    id: entry.id ? `${sessionId}:${entry.id}` : `${sessionId}:message-${index}`,
    sessionId,
    type: message.role as 'user' | 'assistant',
    content,
    thinking,
    toolCalls,
    toolResults: [],
    usage,
    timestamp,
    parentId: entry.parentId ? `${sessionId}:${entry.parentId}` : null,
  };
}

function extractText(content: string | PiContentBlock[]): string {
  if (typeof content === 'string') return content;
  const parts = content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text as string);
  if (parts.length === 0 && content.some((block) => block.type === 'image')) {
    return '[Image]';
  }
  return parts.join('\n');
}

function extractThinking(content: string | PiContentBlock[]): string | null {
  if (typeof content === 'string') return null;
  const parts = content
    .filter((block) => block.type === 'thinking' && block.thinking)
    .map((block) => block.thinking as string);
  return parts.length ? parts.join('\n') : null;
}

function extractToolCalls(content: string | PiContentBlock[]): ToolCall[] {
  if (typeof content === 'string') return [];
  return content
    .filter((block) => block.type === 'toolCall' && block.name)
    .map((block) => ({
      id: block.id || '',
      name: block.name as string,
      input: block.arguments || {},
    }));
}

function attachToolResult(messages: ParsedMessage[], message: PiMessage): void {
  if (!message.toolCallId) return;
  const output = extractText(message.content).slice(0, 1000);
  const result: ToolResult = {
    toolUseId: message.toolCallId,
    output: message.isError ? `[error] ${output}` : output,
  };

  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].toolCalls.some((call) => call.id === message.toolCallId)) {
      messages[index].toolResults.push(result);
      return;
    }
  }
}

function buildSessionUsage(entries: Array<{ model?: string; usage: PiUsage }>): SessionUsage | undefined {
  if (entries.length === 0) return undefined;

  const modelCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.model) {
      modelCounts.set(entry.model, (modelCounts.get(entry.model) ?? 0) + 1);
    }
  }
  const modelsUsed = [...modelCounts.keys()];
  const primaryModel = [...modelsUsed].sort(
    (a, b) => (modelCounts.get(b) ?? 0) - (modelCounts.get(a) ?? 0),
  )[0] ?? 'unknown';

  return {
    totalInputTokens: entries.reduce((sum, entry) => sum + (entry.usage.input ?? 0), 0),
    totalOutputTokens: entries.reduce((sum, entry) => sum + (entry.usage.output ?? 0), 0),
    cacheCreationTokens: entries.reduce((sum, entry) => sum + (entry.usage.cacheWrite ?? 0), 0),
    cacheReadTokens: entries.reduce((sum, entry) => sum + (entry.usage.cacheRead ?? 0), 0),
    estimatedCostUsd: entries.reduce((sum, entry) => sum + (entry.usage.cost?.total ?? 0), 0),
    modelsUsed,
    primaryModel,
    usageSource: 'jsonl',
  };
}

function readInheritedEntryIds(filePath: string, parentSession: string | undefined): Set<string> {
  const ids = new Set<string>();
  if (!parentSession) return ids;

  const parentPath = path.isAbsolute(parentSession)
    ? parentSession
    : path.resolve(path.dirname(filePath), parentSession);
  if (path.resolve(parentPath) === path.resolve(filePath)) return ids;

  try {
    for (const line of fs.readFileSync(parentPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as PiEntry;
        if (entry.id) ids.add(entry.id);
      } catch {
        // Ignore malformed parent lines; the child remains parseable.
      }
    }
  } catch {
    // The parent may have moved or been deleted. Namespaced message IDs still
    // prevent database collisions, though inherited turns cannot be deduped.
  }
  return ids;
}

function safeDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
