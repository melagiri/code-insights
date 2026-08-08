import * as path from 'path';
import type {
  ParsedSession,
  ParsedMessage,
  SessionCharacter,
  TitleCandidate,
  GeneratedTitle,
  ToolCall,
} from '../types.js';

// ---------------------------------------------------------------------------
// Tool name sets — provider-agnostic classification
// Each provider uses different tool names for the same semantic operation.
//
// NOTE: Bash/shell execution tools (Bash, run_in_terminal, copilot_runInTerminal,
// exec_command, etc.) are intentionally excluded from both sets. Shell commands
// can be either reads or writes and cannot be reliably classified without
// parsing the command string, so we leave them unclassified.
// ---------------------------------------------------------------------------

// Tools that modify or create file content
const EDIT_TOOLS = new Set([
  'Edit', 'Write',                                    // Claude Code
  'replace_string_in_file', 'copilot_replaceString',  // Copilot VS Code
  'create_file', 'copilot_createFile',                // Copilot VS Code
  'apply_patch',                                      // Codex CLI (primary edit tool)
  'edit', 'write', 'write_file', 'patch',             // Pi + generic fallbacks
]);

// Tools that read, search, or browse file content
const READ_TOOLS = new Set([
  'Read', 'Grep', 'Glob',                             // Claude Code
  'read_file', 'copilot_readFile',                    // Copilot VS Code
  'grep_search', 'copilot_findTextInFiles',           // Copilot VS Code
  'copilot_searchCodebase', 'semantic_search',        // Copilot VS Code
  'file_search', 'copilot_findFiles',                 // Copilot VS Code
  'list_dir', 'copilot_listDirectory',                // Copilot VS Code
  'read', 'grep', 'view',                             // Pi / Copilot CLI / Codex
]);

function isEditTool(name: string): boolean {
  return EDIT_TOOLS.has(name);
}

function isReadTool(name: string): boolean {
  return READ_TOOLS.has(name);
}

/**
 * Extract a file path from a tool call, handling different provider input shapes.
 * Claude Code uses `file_path`, Copilot uses `filePath`, `path`, or `file`.
 */
function extractToolFilePath(tc: ToolCall): string | undefined {
  return (
    (tc.input?.file_path as string | undefined) ||
    (tc.input?.filePath as string | undefined) ||
    (tc.input?.path as string | undefined) ||
    (tc.input?.file as string | undefined)
  );
}

// Skip patterns - generic responses that make poor titles
const SKIP_PATTERNS = [
  /^(yes|no|ok|okay|sure|thanks|thank you|continue|go ahead|sounds good|looks good|perfect|great|nice|cool|done|got it)\.?$/i,
  /^(y|n|k)$/i,
  /^```/,  // Code blocks
];

// Prefixes to remove from titles
const PREFIX_REMOVALS = [
  /^(help me|can you|could you|please|i want to|i need to|i'd like to|let's)\s+/i,
  /^(hi|hello|hey),?\s*/i,
];

// Action verbs that indicate good title candidates
const ACTION_VERBS = /^(fix|add|create|build|implement|update|remove|delete|refactor|move|rename|change|modify|setup|configure|install|debug|test|write|make|get|set|find|search|check|review|analyze|optimize|improve|migrate|convert|integrate)/i;

/**
 * Generate a smart title for a session
 */
export function generateTitle(session: ParsedSession): GeneratedTitle {
  // 1. If Claude Code provided a summary, use it
  if (session.summary && session.summary.trim().length > 0) {
    return {
      title: cleanTitle(session.summary),
      source: 'claude',
      character: null,
    };
  }

  // 2. Try to extract from first user message
  const userMessageCandidate = extractFromUserMessage(session.messages);
  if (userMessageCandidate && userMessageCandidate.score >= 40) {
    return {
      title: cleanTitle(userMessageCandidate.text),
      source: userMessageCandidate.source,
      character: null,
    };
  }

  // 3. Try session character-based title
  const character = detectSessionCharacter(session);
  if (character) {
    const characterTitle = generateCharacterTitle(session, character);
    return {
      title: characterTitle,
      source: 'character',
      character,
    };
  }

  // 4. Use user message even with lower score if available
  if (userMessageCandidate) {
    return {
      title: cleanTitle(userMessageCandidate.text),
      source: userMessageCandidate.source,
      character: null,
    };
  }

  // 5. Fallback
  return {
    title: `${session.projectName} session (${session.messageCount} messages)`,
    source: 'fallback',
    character: null,
  };
}

/**
 * Extract title candidate from first meaningful user message
 */
function extractFromUserMessage(messages: ParsedMessage[]): TitleCandidate | null {
  const userMessages = messages.filter(m => m.type === 'user');

  for (const msg of userMessages.slice(0, 3)) {
    const content = msg.content.trim();

    if (SKIP_PATTERNS.some(p => p.test(content))) {
      continue;
    }

    const wordCount = content.split(/\s+/).length;
    if (wordCount < 3) {
      continue;
    }

    let text = content;
    if (wordCount > 50) {
      const firstSentence = content.split(/[.!?]/)[0];
      text = firstSentence.length > 10 ? firstSentence : content.split(/\s+/).slice(0, 20).join(' ');
    }

    const score = scoreUserMessage(text);
    if (score > 0) {
      return { text, source: 'user_message', score };
    }
  }

  return null;
}

/**
 * Score a user message for title quality
 */
function scoreUserMessage(text: string): number {
  const wordCount = text.split(/\s+/).length;

  if (wordCount < 3) return 0;
  if (wordCount > 100) return 0;

  if (ACTION_VERBS.test(text)) {
    if (wordCount >= 5 && wordCount <= 15) return 80;
    if (wordCount > 15 && wordCount <= 30) return 70;
    return 60;
  }

  if (text.includes('?')) {
    if (wordCount >= 5 && wordCount <= 20) return 70;
    return 50;
  }

  if (wordCount >= 5 && wordCount <= 15) return 60;
  if (wordCount > 15 && wordCount <= 50) return 40;

  return 20;
}

/**
 * Detect the session's character based on patterns
 */
export function detectSessionCharacter(session: ParsedSession): SessionCharacter | null {
  const { messages, toolCallCount, messageCount } = session;

  const toolCounts: Record<string, number> = {};
  const filesModified = new Set<string>();
  const filesCreated = new Set<string>();

  let editCount = 0;
  let readCount = 0;

  for (const msg of messages) {
    for (const tc of msg.toolCalls) {
      toolCounts[tc.name] = (toolCounts[tc.name] || 0) + 1;

      if (isEditTool(tc.name)) {
        editCount++;
        const filePath = extractToolFilePath(tc);
        if (filePath) {
          filesModified.add(filePath);
          // Create-only tools (Write, create_file, copilot_createFile) track new files
          if (tc.name === 'Write' || tc.name === 'create_file' || tc.name === 'copilot_createFile') {
            filesCreated.add(filePath);
          }
        }
      } else if (isReadTool(tc.name)) {
        readCount++;
      }
    }
  }

  if (messageCount >= 50 && filesModified.size <= 3 && filesModified.size > 0) {
    return 'deep_focus';
  }

  const hasErrorPatterns = messages.some(m =>
    /error|bug|fix|issue|broken|fail/i.test(m.content)
  );
  const hasFix = messages.some(m =>
    /fixed|resolved|working now/i.test(m.content)
  );
  if (hasErrorPatterns && hasFix && editCount > 0) {
    return 'bug_hunt';
  }

  if (filesCreated.size >= 3) {
    return 'feature_build';
  }

  if (readCount > editCount * 3 && editCount < 5) {
    return 'exploration';
  }

  if (editCount > 10 && filesCreated.size === 0) {
    return 'refactor';
  }

  const questionCount = messages.filter(m =>
    m.type === 'user' && m.content.includes('?')
  ).length;
  if (questionCount >= 3 && toolCallCount < messageCount) {
    return 'learning';
  }

  if (messageCount < 10 && editCount > 0) {
    return 'quick_task';
  }

  return null;
}

/**
 * Generate title based on session character
 */
function generateCharacterTitle(
  session: ParsedSession,
  character: SessionCharacter
): string {
  const fileCounts: Record<string, number> = {};
  for (const msg of session.messages) {
    for (const tc of msg.toolCalls) {
      if (isEditTool(tc.name)) {
        const filePath = extractToolFilePath(tc);
        if (filePath) {
          const fileName = path.basename(filePath) || filePath;
          fileCounts[fileName] = (fileCounts[fileName] || 0) + 1;
        }
      }
    }
  }
  const primaryFile = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'files';

  const userContent = session.messages
    .filter(m => m.type === 'user')
    .map(m => m.content)
    .join(' ')
    .toLowerCase();

  const topic = extractTopic(userContent) || session.projectName;

  switch (character) {
    case 'deep_focus':
      return `Deep work: ${primaryFile}`;
    case 'bug_hunt':
      return `Fixed: ${extractBugDescription(session.messages) || primaryFile}`;
    case 'feature_build':
      return `Built: ${topic}`;
    case 'exploration':
      return `Explored: ${topic}`;
    case 'refactor':
      return `Refactored: ${primaryFile}`;
    case 'learning':
      return `Learned: ${topic}`;
    case 'quick_task':
      return `Updated: ${primaryFile}`;
    default:
      return `${session.projectName} session`;
  }
}

/**
 * Extract a topic from user content
 */
function extractTopic(content: string): string | null {
  const patterns = [
    /(?:about|for|with|using)\s+([a-z][a-z0-9\s-]{2,20})/i,
    /([a-z][a-z0-9\s-]{2,15})\s+(?:feature|component|module|function|api)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract bug description from messages
 */
function extractBugDescription(messages: ParsedMessage[]): string | null {
  for (const msg of messages) {
    if (msg.type === 'user') {
      const match = msg.content.match(/(?:fix|bug|error|issue)[:\s]+([^.!?\n]{5,40})/i);
      if (match) {
        return match[1].trim();
      }
    }
  }
  return null;
}

/**
 * Clean and format a title
 */
export function cleanTitle(raw: string): string {
  let title = raw;

  for (const pattern of PREFIX_REMOVALS) {
    title = title.replace(pattern, '');
  }

  title = title.replace(/[*_`#]/g, '');
  title = title.replace(/\s+/g, ' ').trim();

  if (title.length > 60) {
    title = title.slice(0, 57) + '...';
  }

  title = title.charAt(0).toUpperCase() + title.slice(1);

  return title;
}

/**
 * Capitalize first letter of string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
