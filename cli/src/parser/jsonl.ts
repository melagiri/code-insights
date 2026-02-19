import * as fs from 'fs';
import * as readline from 'readline';
import type {
  JsonlEntry,
  ClaudeMessage,
  SessionSummary,
  ParsedSession,
  ParsedMessage,
  ToolCall,
  ToolResult,
  MessageUsage,
  MessageContent,
  SessionUsage,
} from '../types.js';
import { generateTitle } from './titles.js';
import { calculateCost, type UsageEntry } from '../utils/pricing.js';

/**
 * Parse a single JSONL file and extract session data
 */
export async function parseJsonlFile(filePath: string): Promise<ParsedSession | null> {
  const entries: JsonlEntry[] = [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const entry = JSON.parse(line) as JsonlEntry;
        entries.push(entry);
      } catch {
        // Skip malformed lines
        continue;
      }
    }
  }

  if (entries.length === 0) {
    return null;
  }

  return buildSession(filePath, entries);
}

/**
 * Build a ParsedSession from JSONL entries
 */
function buildSession(filePath: string, entries: JsonlEntry[]): ParsedSession | null {
  // Extract session ID from filename
  const sessionId = extractSessionId(filePath);
  if (!sessionId) return null;

  // Find summary entries
  const summaries = entries.filter((e): e is SessionSummary => e.type === 'summary');
  const summary = summaries.length > 0 ? summaries[summaries.length - 1].summary : null;

  // Find all messages
  const messages = entries.filter(
    (e): e is ClaudeMessage =>
      e.type === 'user' || e.type === 'assistant' || e.type === 'system'
  );

  if (messages.length === 0) {
    return null;
  }

  // Extract metadata from first message
  const firstMessage = messages[0];
  const projectPath = firstMessage.cwd || extractProjectPath(filePath);
  const projectName = extractProjectName(projectPath);
  const gitBranch = firstMessage.gitBranch || null;
  const claudeVersion = firstMessage.version || null;

  // Parse all messages
  const parsedMessages: ParsedMessage[] = [];
  let toolCallCount = 0;
  let userMessageCount = 0;
  let assistantMessageCount = 0;

  for (const msg of messages) {
    // Skip meta messages
    if (msg.isMeta) continue;

    const parsed = parseMessage(msg, sessionId);
    if (parsed) {
      parsedMessages.push(parsed);
      toolCallCount += parsed.toolCalls.length;

      if (msg.type === 'user') userMessageCount++;
      if (msg.type === 'assistant') assistantMessageCount++;
    }
  }

  // Extract usage data from raw messages
  const usageEntries: UsageEntry[] = [];
  for (const msg of messages) {
    if (msg.isMeta) continue;
    if (msg.message?.model && msg.message?.usage) {
      usageEntries.push({
        model: msg.message.model,
        usage: msg.message.usage,
      });
    }
  }

  // Aggregate usage stats
  let usage: SessionUsage | undefined;
  if (usageEntries.length > 0) {
    const totalInputTokens = usageEntries.reduce((sum, e) => sum + (e.usage.input_tokens ?? 0), 0);
    const totalOutputTokens = usageEntries.reduce((sum, e) => sum + (e.usage.output_tokens ?? 0), 0);
    const cacheCreationTokens = usageEntries.reduce((sum, e) => sum + (e.usage.cache_creation_input_tokens ?? 0), 0);
    const cacheReadTokens = usageEntries.reduce((sum, e) => sum + (e.usage.cache_read_input_tokens ?? 0), 0);

    // Count turns per model to find primary model
    const modelCounts = new Map<string, number>();
    for (const e of usageEntries) {
      modelCounts.set(e.model, (modelCounts.get(e.model) ?? 0) + 1);
    }
    const modelsUsed = [...modelCounts.keys()];
    const primaryModel = [...modelsUsed].sort((a, b) =>
      (modelCounts.get(b) ?? 0) - (modelCounts.get(a) ?? 0)
    )[0] ?? 'unknown';

    usage = {
      totalInputTokens,
      totalOutputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      estimatedCostUsd: calculateCost(usageEntries),
      modelsUsed,
      primaryModel,
      usageSource: 'jsonl',
    };
  }

  if (parsedMessages.length === 0) {
    return null;
  }

  // Get timestamps
  const timestamps = parsedMessages.map((m) => m.timestamp.getTime());
  const startedAt = new Date(Math.min(...timestamps));
  const endedAt = new Date(Math.max(...timestamps));

  // Build session object
  const session: ParsedSession = {
    id: sessionId,
    projectPath,
    projectName,
    summary,
    generatedTitle: null,
    titleSource: null,
    sessionCharacter: null,
    startedAt,
    endedAt,
    messageCount: parsedMessages.length,
    userMessageCount,
    assistantMessageCount,
    toolCallCount,
    gitBranch,
    claudeVersion,
    messages: parsedMessages,
    usage,
  };

  // Generate smart title (no longer depends on insights)
  const titleResult = generateTitle(session);

  return {
    ...session,
    generatedTitle: titleResult.title,
    titleSource: titleResult.source,
    sessionCharacter: titleResult.character,
  };
}

/**
 * Parse a single message entry
 */
function parseMessage(msg: ClaudeMessage, sessionId: string): ParsedMessage | null {
  // Skip messages without proper structure
  if (!msg.message || !msg.message.content) {
    return null;
  }

  const content = extractTextContent(msg.message.content);
  const thinking = extractThinkingContent(msg.message.content);
  const toolCalls = extractToolCalls(msg.message.content);
  const toolResults = extractToolResults(msg.message.content);

  // Skip empty messages (but keep if there's thinking or tool results)
  if (!content && toolCalls.length === 0 && !thinking && toolResults.length === 0) {
    return null;
  }

  // Per-message usage (assistant messages only)
  let usage: MessageUsage | null = null;
  if (msg.type === 'assistant' && msg.message.model && msg.message.usage) {
    const u = msg.message.usage;
    const model = msg.message.model;
    const inputTokens = u.input_tokens ?? 0;
    const outputTokens = u.output_tokens ?? 0;
    const cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = u.cache_read_input_tokens ?? 0;

    const costEntries = [{ model, usage: u }];
    const estimatedCostUsd = calculateCost(costEntries);

    usage = {
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      model,
      estimatedCostUsd,
    };
  }

  return {
    id: msg.uuid,
    sessionId,
    type: msg.type,
    content,
    thinking,
    toolCalls,
    toolResults,
    usage,
    timestamp: new Date(msg.timestamp),
    parentId: msg.parentUuid || null,
  };
}

/**
 * Extract text content from message content
 */
function extractTextContent(content: string | MessageContent[]): string {
  if (typeof content === 'string') {
    return content;
  }

  const textParts: string[] = [];
  for (const part of content) {
    if (part.type === 'text' && part.text) {
      textParts.push(part.text);
    }
  }

  return textParts.join('\n');
}

/**
 * Extract tool calls from message content
 */
function extractToolCalls(content: string | MessageContent[]): ToolCall[] {
  if (typeof content === 'string') {
    return [];
  }

  const toolCalls: ToolCall[] = [];
  for (const part of content) {
    if (part.type === 'tool_use' && part.name) {
      toolCalls.push({
        id: part.id || '',           // capture tool_use_id
        name: part.name,
        input: part.input || {},
      });
    }
  }

  return toolCalls;
}

/**
 * Extract thinking content from assistant messages
 */
function extractThinkingContent(content: string | MessageContent[]): string | null {
  if (typeof content === 'string') return null;

  const thinkingParts: string[] = [];
  for (const part of content) {
    if (part.type === 'thinking' && part.thinking) {
      thinkingParts.push(part.thinking);
    }
  }

  return thinkingParts.length > 0 ? thinkingParts.join('\n') : null;
}

/**
 * Extract tool results from user messages
 */
function extractToolResults(content: string | MessageContent[]): ToolResult[] {
  if (typeof content === 'string') return [];

  const results: ToolResult[] = [];
  for (const part of content) {
    if (part.type === 'tool_result' && part.tool_use_id) {
      let output: string;
      if (typeof part.content === 'string') {
        output = part.content;
      } else if (Array.isArray(part.content)) {
        output = part.content
          .filter(sub => sub.type === 'text' && sub.text)
          .map(sub => sub.text)
          .join('\n');
      } else {
        output = '';
      }
      results.push({
        toolUseId: part.tool_use_id,
        output,
      });
    }
  }
  return results;
}

/**
 * Extract session ID from file path
 */
function extractSessionId(filePath: string): string | null {
  const filename = filePath.split('/').pop();
  if (!filename) return null;

  // Handle both UUID.jsonl and agent-*.jsonl formats
  const match = filename.match(/^([a-f0-9-]+|agent-[a-f0-9]+)\.jsonl$/);
  return match ? match[1] : null;
}

/**
 * Extract project path from file path
 */
function extractProjectPath(filePath: string): string {
  // File path format: ~/.claude/projects/-Users-name-path-to-project/session.jsonl
  const parts = filePath.split('/');
  const projectDirIndex = parts.findIndex((p) => p === 'projects');
  if (projectDirIndex >= 0 && projectDirIndex < parts.length - 1) {
    const encodedPath = parts[projectDirIndex + 1];
    // Convert -Users-name-path to /Users/name/path
    return encodedPath.replace(/^-/, '/').replace(/-/g, '/');
  }
  return filePath;
}

/**
 * Extract project name from project path
 */
function extractProjectName(projectPath: string): string {
  const parts = projectPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}
