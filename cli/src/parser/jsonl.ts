import * as fs from 'fs';
import * as path from 'path';
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

// ──────────────────────────────────────────────────────
// Message classification — distinguishes genuine human input from
// the many non-conversational entry types that appear as type:'user' in JSONL.
// Tool results make up ~80% of 'user' entries in typical sessions.
// ──────────────────────────────────────────────────────

export type UserMessageClass =
  | 'human'            // Genuine human input — counts toward user_message_count
  | 'tool-result'      // API protocol: tool call response
  | 'task-notification' // System: agent task callbacks
  | 'skill-load'       // System: skill/command injection
  | 'auto-compact'     // Context window overflow: tool-initiated compaction summary
  | 'user-compact'     // User-initiated /compact command
  | 'slash-command'    // Any other slash command (caveat/stdout frames are 'command-frame')
  | 'command-frame'    // Slash command wrapper: <local-command-caveat> or <local-command-stdout>
  | 'exit-command';    // /exit or /quit — session end signal, excluded from everything

/**
 * Tier 1 workflow commands: deliberate workflow decisions.
 * These count as user messages AND are stored in slash_commands[].
 * All other commands (Tier 2) are stored but NOT counted.
 * /exit is excluded from both (Tier 3).
 */
export const WORKFLOW_COMMANDS = new Set([
  '/compact', '/clear', '/reset', '/new', '/diff', '/review',
  '/security-review', '/pr-comments', '/fork', '/resume', '/continue',
  '/rewind', '/checkpoint', '/export', '/plan', '/model', '/btw',
  '/add-dir', '/memory', '/init', '/fast', '/context', '/cost',
  '/rename', '/simplify', '/batch', '/debug', '/loop', '/claude-api',
]);

/**
 * Extract the command name from a <command-name>/foo</command-name> XML fragment.
 * Returns the command string (e.g., "/compact") or null if not found.
 */
export function extractSlashCommandName(text: string): string | null {
  const match = text.match(/<command-name>(\/[^<]+)<\/command-name>/);
  return match ? match[1].trim().split(' ')[0] : null;  // split to handle "/compact instructions" → "/compact"
}

/**
 * Classify a type:'user' JSONL entry to determine if it represents genuine
 * human input or a system/protocol artifact. Order matters — most specific first.
 */
export function classifyUserMessage(msg: ClaudeMessage): UserMessageClass {
  const content = msg.message.content;

  // 1. Array content with any tool_result block → API protocol, not human input
  if (Array.isArray(content)) {
    if (content.some(part => part.type === 'tool_result')) {
      return 'tool-result';
    }
  }

  // For remaining checks, work with text content
  const text = typeof content === 'string'
    ? content
    : content.filter(p => p.type === 'text' && p.text).map(p => p.text).join('');

  // 2. Task/agent notifications
  if (text.startsWith('<task-notification>')) {
    return 'task-notification';
  }

  // 3. Skill loads (injected by Claude Code skill system)
  if (text.startsWith('Base directory for this skill:')) {
    return 'skill-load';
  }

  // 4. Auto-compact summary (context window overflow — tool-initiated)
  if (text.startsWith('This session is being continued')) {
    return 'auto-compact';
  }

  // 5. User /compact command (Tier 1 workflow command, tracked separately)
  // Use extractSlashCommandName to handle "/compact focus on auth" → "/compact"
  if (extractSlashCommandName(text) === '/compact') {
    return 'user-compact';
  }

  // 6. Exit/quit commands — excluded from all counts and slash_commands[]
  const cmdName = extractSlashCommandName(text);
  if (cmdName === '/exit' || cmdName === '/quit') {
    return 'exit-command';
  }

  // 7. Any other slash command (Tier 1 or Tier 2 — differentiated at count time)
  if (cmdName !== null) {
    return 'slash-command';
  }

  // 8. Command frame wrappers (caveat/stdout) — always excluded
  if (
    text.startsWith('<local-command-caveat>') ||
    text.startsWith('<local-command-stdout>')
  ) {
    return 'command-frame';
  }

  // 9. Everything else is genuine human input
  return 'human';
}

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
  let compactCount = 0;
  let autoCompactCount = 0;
  const slashCommands: string[] = [];

  for (const msg of messages) {
    // Skip meta messages
    if (msg.isMeta) continue;

    const parsed = parseMessage(msg, sessionId);
    if (parsed) {
      parsedMessages.push(parsed);
      toolCallCount += parsed.toolCalls.length;

      if (msg.type === 'user') {
        const msgClass = classifyUserMessage(msg);

        if (msgClass === 'human') {
          userMessageCount++;
        } else if (msgClass === 'user-compact') {
          // /compact is Tier 1: counts as user message + tracked separately
          userMessageCount++;
          compactCount++;
          slashCommands.push('/compact');
        } else if (msgClass === 'slash-command') {
          // Extract command name and apply tier logic
          const cmdName = extractSlashCommandName(
            typeof msg.message.content === 'string'
              ? msg.message.content
              : msg.message.content.filter(p => p.type === 'text' && p.text).map(p => p.text).join('')
          );
          if (cmdName) {
            // Store all non-exit slash commands regardless of tier
            slashCommands.push(cmdName);
            // Only Tier 1 counts as user message
            if (WORKFLOW_COMMANDS.has(cmdName)) {
              userMessageCount++;
            }
          }
        } else if (msgClass === 'auto-compact') {
          autoCompactCount++;
        }
        // tool-result, task-notification, skill-load, command-frame, exit-command: excluded from all
      }

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
  // messageCount = conversational turns (user + assistant), not raw JSONL entry count
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
    messageCount: userMessageCount + assistantMessageCount,
    userMessageCount,
    assistantMessageCount,
    toolCallCount,
    compactCount,
    autoCompactCount,
    slashCommands,
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
  const filename = path.basename(filePath);
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
  // On Windows: ~\.claude\projects\-Users-name-path-to-project\session.jsonl
  const parts = filePath.split(path.sep);
  const projectDirIndex = parts.findIndex((p) => p === 'projects');
  if (projectDirIndex >= 0 && projectDirIndex < parts.length - 1) {
    const encodedPath = parts[projectDirIndex + 1];
    // Convert -Users-name-path to /Users/name/path
    // This always decodes to a forward-slash path (original project path encoding)
    return encodedPath.replace(/^-/, '/').replace(/-/g, '/');
  }
  return filePath;
}

/**
 * Extract project name from project path
 */
function extractProjectName(projectPath: string): string {
  // projectPath comes from Claude's encoded format (always forward slashes)
  // path.basename handles both separators cross-platform
  return path.basename(projectPath) || 'unknown';
}
