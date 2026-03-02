import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import type { SessionProvider } from './types.js';
import type { ParsedSession, ParsedMessage, ToolCall } from '../types.js';
import { generateTitle, detectSessionCharacter } from '../parser/titles.js';
import { isVerbose } from './context.js';

/**
 * Cursor IDE session provider.
 * Discovers and parses sessions from Cursor's SQLite databases.
 *
 * Cursor stores composer conversations in state.vscdb files (SQLite).
 * One DB can contain multiple sessions (composers), so discover() returns
 * virtual paths in the format `state.vscdb#<composerId>` — one per session.
 * This keeps the SessionProvider interface unchanged (1 path = 1 session).
 */
export class CursorProvider implements SessionProvider {
  getProviderName(): string {
    return 'cursor';
  }

  /**
   * Discover Cursor composer sessions.
   * Returns virtual paths: `<dbPath>#<composerId>` — one per session.
   */
  async discover(options?: { projectFilter?: string }): Promise<string[]> {
    const cursorDataDir = getCursorDataDir();
    if (!cursorDataDir) {
      return [];
    }

    const dbPaths: string[] = [];

    // 1. Check workspace storage databases
    const workspaceStorageDir = path.join(cursorDataDir, 'workspaceStorage');
    if (fs.existsSync(workspaceStorageDir)) {
      const entries = fs.readdirSync(workspaceStorageDir);
      for (const entry of entries) {
        const wsDir = path.join(workspaceStorageDir, entry);
        if (!fs.statSync(wsDir).isDirectory()) continue;

        const dbPath = path.join(wsDir, 'state.vscdb');
        if (!fs.existsSync(dbPath)) continue;

        // Apply project filter if specified
        if (options?.projectFilter) {
          const projectPath = resolveWorkspacePath(wsDir);
          if (projectPath && !projectPath.toLowerCase().includes(options.projectFilter.toLowerCase())) {
            continue;
          }
        }

        dbPaths.push(dbPath);
      }
    }

    // 2. Check global storage database
    const globalDbPath = path.join(cursorDataDir, 'globalStorage', 'state.vscdb');
    if (fs.existsSync(globalDbPath)) {
      dbPaths.push(globalDbPath);
    }

    // Expand each DB path into virtual paths — one per composer session
    const virtualPaths: string[] = [];

    for (const dbPath of dbPaths) {
      const composerIds = getComposerIds(dbPath);
      for (const composerId of composerIds) {
        virtualPaths.push(`${dbPath}#${composerId}`);
      }
    }

    return virtualPaths;
  }

  /**
   * Parse a single Cursor session from a virtual path.
   * Virtual path format: `<dbPath>#<composerId>`
   */
  async parse(virtualPath: string): Promise<ParsedSession | null> {
    const hashIndex = virtualPath.lastIndexOf('#');
    if (hashIndex === -1) return null;

    const dbPath = virtualPath.slice(0, hashIndex);
    const composerId = virtualPath.slice(hashIndex + 1);
    if (!composerId) return null;

    return parseCursorSession(dbPath, composerId);
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Find Cursor's data directory based on the current platform.
 */
function getCursorDataDir(): string | null {
  const platform = process.platform;
  const home = os.homedir();

  let dataDir: string;
  if (platform === 'darwin') {
    dataDir = path.join(home, 'Library', 'Application Support', 'Cursor', 'User');
  } else if (platform === 'linux') {
    dataDir = path.join(home, '.config', 'Cursor', 'User');
  } else if (platform === 'win32') {
    dataDir = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Cursor', 'User');
  } else {
    return null;
  }

  return fs.existsSync(dataDir) ? dataDir : null;
}

/**
 * Resolve the project path from a workspace hash directory.
 * Reads workspace.json which contains the folder URI.
 */
function resolveWorkspacePath(wsDir: string): string | null {
  const workspaceJsonPath = path.join(wsDir, 'workspace.json');
  if (fs.existsSync(workspaceJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf-8'));
      if (data.folder) {
        // folder is a file:// URI like "file:///Users/name/projects/my-app"
        try {
          const url = new URL(data.folder);
          return decodeURIComponent(url.pathname);
        } catch {
          // Not a valid URL, try using it as-is
          return data.folder;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

/**
 * Extract the filesystem path from a VSCode URI object.
 *
 * Cursor stores code block file references as VSCode URI objects like:
 *   {"scheme":"file","path":"/abs/path.ts","_fsPath":"/abs/path.ts","fsPath":"/abs/path.ts"}
 *
 * Field presence varies across Cursor versions — prefer the most explicit field.
 */
function extractFilePath(uri: unknown): string {
  if (typeof uri === 'string') return uri;
  if (uri && typeof uri === 'object') {
    const obj = uri as Record<string, unknown>;
    // Prefer explicit fs path fields over the generic 'path' which could be URL-encoded
    if (typeof obj._fsPath === 'string' && obj._fsPath) return obj._fsPath;
    if (typeof obj.fsPath === 'string' && obj.fsPath) return obj.fsPath;
    if (typeof obj.path === 'string' && obj.path) return obj.path;
    // _formatted and external are file:// URLs — extract the path component
    for (const urlField of ['_formatted', 'external'] as const) {
      const val = obj[urlField];
      if (typeof val === 'string' && val.startsWith('file://')) {
        try {
          return decodeURIComponent(new URL(val).pathname);
        } catch {
          // Fall through to next field
        }
      }
    }
  }
  return '';
}

/**
 * Extract plain text from a Lexical editor JSON structure.
 *
 * Cursor's composer uses the Lexical editor for user input. When a user message
 * is stored as `richText`, it's a Lexical JSON tree rather than plain text:
 *   {"root":{"children":[{"children":[{"text":"actual message"}],"type":"paragraph"}]}}
 *
 * We recursively collect all "text" leaf nodes and join them with newlines.
 * Returns null if the input is not valid Lexical JSON.
 */
function extractLexicalText(input: unknown): string | null {
  // Accept both pre-parsed objects and JSON strings
  let parsed: unknown = input;
  if (typeof input === 'string') {
    // Quick guard: Lexical JSON always starts with {"root"
    if (!input.startsWith('{"root"')) return null;
    try {
      parsed = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (!obj.root || typeof obj.root !== 'object') return null;
  const root = obj.root as Record<string, unknown>;
  if (!Array.isArray(root.children)) return null;

  const text = collectLexicalText(root.children as Array<Record<string, unknown>>).trim();
  return text.length > 0 ? text : null;
}

function collectLexicalText(nodes: Array<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (typeof node.text === 'string' && node.text) {
      parts.push(node.text);
    }
    if (node.type === 'linebreak') {
      parts.push('\n');
    }
    if (Array.isArray(node.children)) {
      const childText = collectLexicalText(node.children as Array<Record<string, unknown>>);
      if (childText) {
        parts.push(childText);
        // Preserve paragraph boundaries for block-level nodes
        if (typeof node.type === 'string' && ['paragraph', 'heading', 'list-item', 'quote'].includes(node.type)) {
          parts.push('\n');
        }
      }
    }
  }
  return parts.join('');
}

/**
 * Extract a project path from composerData by inspecting file paths in code blocks
 * and matching against relative file paths in relevantFiles.
 *
 * This is the fallback for sessions in the global DB where workspace.json is unavailable.
 * We find absolute paths in codeBlock URIs, then strip the relative portion to get the root.
 *
 * Example:
 *   codeBlock uri.path = "/Users/name/projects/crm/backend/auth.ts"
 *   relevantFile = "backend/auth.ts"
 *   → project root = "/Users/name/projects/crm"
 */
function extractProjectPathFromComposerData(composerData: Record<string, unknown>): string | null {
  const conversation = composerData.conversation;
  if (!Array.isArray(conversation)) return null;
  return extractProjectPathFromBubbles(conversation as Array<Record<string, unknown>>);
}

/**
 * Extract a project path from raw bubble objects.
 *
 * Works the same way as extractProjectPathFromComposerData but operates on a
 * pre-loaded bubble array. Used for fullConversationHeadersOnly sessions where
 * codeBlocks live in individual bubbleId rows (not inline in composerData).
 */
function extractProjectPathFromBubbles(bubbles: Array<Record<string, unknown>>): string | null {
  for (const bubble of bubbles) {
    const codeBlocks = bubble.codeBlocks;
    const relevantFiles = bubble.relevantFiles;

    if (Array.isArray(codeBlocks) && Array.isArray(relevantFiles) && relevantFiles.length > 0) {
      for (const block of codeBlocks as Array<Record<string, unknown>>) {
        const absPath = extractFilePath(block.uri);
        if (!absPath || !path.isAbsolute(absPath)) continue;

        for (const rel of relevantFiles as string[]) {
          if (typeof rel !== 'string') continue;
          const normalRel = rel.replace(/\\/g, '/');
          const normalAbs = absPath.replace(/\\/g, '/');
          if (normalAbs.endsWith('/' + normalRel)) {
            return normalAbs.slice(0, normalAbs.length - normalRel.length - 1);
          }
        }
      }
    }
  }

  return null;
}

/**
 * Open the Cursor global DB regardless of which DB path was provided.
 * The global DB stores full composer conversation data in cursorDiskKV.
 * Returns null if the global DB doesn't exist or can't be opened.
 */
function openGlobalDb(anyDbPath: string): InstanceType<typeof Database> | null {
  const cursorDataDir = getCursorDataDir();
  if (!cursorDataDir) return null;

  const globalDbPath = path.join(cursorDataDir, 'globalStorage', 'state.vscdb');
  // Avoid opening the same DB that was already opened by the caller
  if (!fs.existsSync(globalDbPath) || globalDbPath === anyDbPath) return null;

  try {
    return new Database(globalDbPath, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

/**
 * Get all composer IDs from a Cursor database file.
 * Tries multiple storage strategies to find composer sessions.
 */
function getComposerIds(dbPath: string): string[] {
  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    const ids: string[] = [];

    // Strategy 1: Check cursorDiskKV table for composerData entries (global DB)
    const hasCursorDiskKV = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'"
    ).get();

    if (hasCursorDiskKV) {
      const rows = db.prepare(
        "SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%'"
      ).all() as { key: string }[];

      for (const row of rows) {
        const composerId = row.key.replace('composerData:', '');
        if (composerId) ids.push(composerId);
      }
    }

    // Strategy 2: Check ItemTable for composer.composerData (workspace DBs)
    if (ids.length === 0) {
      const hasItemTable = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'"
      ).get();

      if (hasItemTable) {
        const row = db.prepare(
          "SELECT value FROM ItemTable WHERE key = 'composer.composerData'"
        ).get() as { value: string } | undefined;

        if (row?.value) {
          try {
            const data = JSON.parse(row.value);
            const composers = data.allComposers || data.composers || [];
            for (const c of composers) {
              if (c.composerId) ids.push(c.composerId);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    return ids;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

/**
 * Parse a single Cursor composer session from a database.
 */
function parseCursorSession(dbPath: string, composerId: string): ParsedSession | null {
  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    let composerData: Record<string, unknown> | null = null;

    // Try cursorDiskKV first (global DB)
    const hasCursorDiskKV = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'"
    ).get();

    if (hasCursorDiskKV) {
      const row = db.prepare(
        "SELECT value FROM cursorDiskKV WHERE key = ?"
      ).get(`composerData:${composerId}`) as { value: string } | undefined;

      if (row?.value) {
        composerData = JSON.parse(row.value) as Record<string, unknown>;
      }
    }

    // Fallback: try ItemTable composer.composerData
    if (!composerData) {
      const hasItemTable = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'"
      ).get();

      if (hasItemTable) {
        const row = db.prepare(
          "SELECT value FROM ItemTable WHERE key = 'composer.composerData'"
        ).get() as { value: string } | undefined;

        if (row?.value) {
          const allData = JSON.parse(row.value) as Record<string, unknown>;
          const composers = (allData.allComposers || allData.composers || []) as Array<Record<string, unknown>>;
          composerData = composers.find((c) => c.composerId === composerId) || null;
        }
      }
    }

    if (!composerData) return null;

    // Extract messages from composer data.
    // Pass db handle for the fullConversationHeadersOnly format where
    // bubble content is stored in separate cursorDiskKV rows.
    // rawBubbles is retained for project path inference (extractProjectPathFromBubbles).
    let [messages, rawBubbles] = extractMessages(composerData, composerId, db);

    // Workspace DBs only store composer metadata (composerId, name, timestamps) in ItemTable.
    // Full conversation data (with bubbles) lives in the global DB's cursorDiskKV table.
    // If we got no messages from the workspace DB, look up the composer in the global DB.
    if (messages.length === 0) {
      const globalDb = openGlobalDb(dbPath);
      if (globalDb) {
        try {
          const globalRow = globalDb.prepare(
            "SELECT value FROM cursorDiskKV WHERE key = ?"
          ).get(`composerData:${composerId}`) as { value: string } | undefined;

          if (globalRow?.value) {
            const globalComposerData = JSON.parse(globalRow.value) as Record<string, unknown>;
            [messages, rawBubbles] = extractMessages(globalComposerData, composerId, globalDb);
            // Prefer composerData from global DB for richer metadata
            if (messages.length > 0) {
              composerData = globalComposerData;
            }
          }
        } finally {
          globalDb.close();
        }
      }
    }

    if (messages.length === 0) return null;

    // Resolve project path — try multiple strategies in order of reliability:
    //   1. workspace.json in the workspace hash directory (works for workspace DB sessions)
    //   2. Extract from codeBlock URIs + relevantFiles in inline composerData.conversation
    //   3. Extract from raw bubbles (covers fullConversationHeadersOnly where codeBlocks
    //      live in individual bubbleId DB rows, not inline in composerData)
    //   4. Fallback to cursor://workspace-<hash8> so sessions stay distinct per-workspace
    const wsDir = path.dirname(dbPath); // workspaceStorage/<hash>/ or globalStorage/
    const workspaceHash = path.basename(wsDir); // the hash directory name (or "globalStorage")
    const projectPath =
      resolveWorkspacePath(wsDir) ||
      extractProjectPathFromComposerData(composerData) ||
      extractProjectPathFromBubbles(rawBubbles) ||
      `cursor://workspace-${workspaceHash.slice(0, 8)}`;
    const projectName = projectPath.startsWith('cursor://')
      ? projectPath.replace('cursor://', '')
      : path.basename(projectPath);

    // Build timestamps from messages
    const timestamps = messages.map(m => m.timestamp.getTime()).filter(t => t > 0);
    let startedAt = timestamps.length > 0
      ? new Date(timestamps.reduce((a, b) => a < b ? a : b))
      : new Date();
    let endedAt = timestamps.length > 0
      ? new Date(timestamps.reduce((a, b) => a > b ? a : b))
      : new Date();

    // If timestamps are missing or invalid, try composerData timestamps
    const createdAt = composerData.createdAt as number | undefined;
    const lastUpdatedAt = (composerData.lastUpdatedAt || composerData.updatedAt) as number | undefined;

    if (createdAt && timestamps.length === 0) {
      startedAt = new Date(createdAt);
    }
    if (lastUpdatedAt && lastUpdatedAt > startedAt.getTime()) {
      endedAt = new Date(lastUpdatedAt);
    }

    const userMessages = messages.filter(m => m.type === 'user');
    const assistantMessages = messages.filter(m => m.type === 'assistant');
    const toolCallCount = messages.reduce((sum, m) => sum + m.toolCalls.length, 0);

    const session: ParsedSession = {
      id: `cursor:${composerId}`,
      projectPath,
      projectName,
      summary: (composerData.name as string) || null, // Cursor's conversation name/title
      generatedTitle: null,
      titleSource: null,
      sessionCharacter: null,
      startedAt,
      endedAt,
      messageCount: messages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      toolCallCount,
      gitBranch: null, // Not available from Cursor's DB
      claudeVersion: null,
      sourceTool: 'cursor',
      usage: undefined, // No token data in Cursor's DB
      messages,
    };

    // Generate title using existing title generator
    const titleResult = generateTitle(session);
    session.generatedTitle = titleResult.title;
    session.titleSource = titleResult.source;

    // Detect session character
    session.sessionCharacter = titleResult.character || detectSessionCharacter(session);

    return session;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

// Keys Cursor has used across versions to store the message array.
// Order matters: check the most common/modern formats first.
const CURSOR_MESSAGE_ARRAY_KEYS = [
  'conversation',    // Observed in Cursor ≤0.42 cursorDiskKV entries
  'messages',        // Earlier workspace DB format
  'bubbles',         // Observed in some Cursor 0.43+ cursorDiskKV entries
  'turns',           // Seen in experimental Cursor builds
  'history',         // Alternate key used in some Cursor forks
  'richConversation',// Rich-text variant with full markdown blocks
  'thread',          // Used in agent-mode sessions
] as const;

/**
 * Find the message array in a composerData blob, trying all known key names.
 * Returns [array, keyUsed] so callers can log which key worked.
 * Returns [[], null] when no recognised key has a non-empty array.
 */
function findMessageArray(composerData: Record<string, unknown>): [Array<Record<string, unknown>>, string | null] {
  for (const key of CURSOR_MESSAGE_ARRAY_KEYS) {
    const value = composerData[key];
    if (Array.isArray(value) && value.length > 0) {
      return [value as Array<Record<string, unknown>>, key];
    }
  }
  return [[], null];
}

/**
 * Extract parsed messages from Cursor composer data.
 *
 * Handles two storage formats:
 * 1. Inline: composerData has a `conversation` (or `messages`, etc.) array with full bubble content.
 * 2. Headers-only (Cursor v3+/v6): composerData has `fullConversationHeadersOnly` with bubble IDs
 *    and types only. Full bubble content is stored in separate `bubbleId:<composerId>:<bubbleId>`
 *    rows in the same cursorDiskKV table.
 *
 * Returns [parsedMessages, rawBubbles]. rawBubbles is the unprocessed bubble array used by
 * extractProjectPathFromBubbles() for project path inference.
 */
function extractMessages(
  composerData: Record<string, unknown>,
  sessionId: string,
  db: InstanceType<typeof Database> | null,
): [ParsedMessage[], Array<Record<string, unknown>>] {
  // Strategy 1: Try fullConversationHeadersOnly (newer Cursor format, ~72% of sessions)
  const headers = composerData.fullConversationHeadersOnly;
  if (Array.isArray(headers) && headers.length > 0 && db) {
    const rawBubbles = loadBubblesFromHeaders(
      headers as Array<{ bubbleId: string; type: number }>,
      sessionId,
      db,
    );
    if (rawBubbles.length > 0) {
      return [parseBubbles(rawBubbles, sessionId), rawBubbles];
    }
    // If all bubble lookups failed, fall through to inline check
  }

  // Strategy 2: Try inline message arrays (older Cursor format)
  const [rawBubbles, keyUsed] = findMessageArray(composerData);

  if (rawBubbles.length === 0) {
    // No messages found — log top-level keys to help diagnose future Cursor format changes.
    // Only log when the composerData has keys but none match our known formats
    // (empty objects = legitimately empty sessions, not a format issue).
    const topLevelKeys = Object.keys(composerData);
    const knownKeys = new Set<string>([...CURSOR_MESSAGE_ARRAY_KEYS, 'fullConversationHeadersOnly']);
    const hasUnknownArrayKeys = topLevelKeys.some(
      k => !knownKeys.has(k) && Array.isArray(composerData[k])
    );
    if (topLevelKeys.length > 0 && hasUnknownArrayKeys) {
      if (isVerbose()) {
        process.stderr.write(
          `[code-insights] cursor: session ${sessionId} — unrecognised composerData structure. ` +
          `Top-level keys: [${topLevelKeys.join(', ')}]\n`
        );
      }
    }
    return [[], []];
  }

  // Log which key was used when it's not the primary expected key — helps track format drift
  if (keyUsed && keyUsed !== 'conversation') {
    if (isVerbose()) {
      process.stderr.write(
        `[code-insights] cursor: session ${sessionId} — messages found under key "${keyUsed}"\n`
      );
    }
  }

  return [parseBubbles(rawBubbles, sessionId), rawBubbles];
}

/**
 * Load full bubble data from individual cursorDiskKV rows.
 * Each bubble is stored at key `bubbleId:<composerId>:<bubbleId>`.
 */
function loadBubblesFromHeaders(
  headers: Array<{ bubbleId: string; type: number }>,
  composerId: string,
  db: InstanceType<typeof Database>,
): Array<Record<string, unknown>> {
  const bubbles: Array<Record<string, unknown>> = [];
  const stmt = db.prepare("SELECT value FROM cursorDiskKV WHERE key = ?");

  for (const header of headers) {
    if (!header.bubbleId) continue;
    try {
      const row = stmt.get(`bubbleId:${composerId}:${header.bubbleId}`) as { value: string } | undefined;
      if (row?.value) {
        const bubble = JSON.parse(row.value) as Record<string, unknown>;
        bubbles.push(bubble);
      }
    } catch {
      // Individual bubble parse failure — skip it, keep loading others
    }
  }

  return bubbles;
}

/**
 * Parse an array of bubble objects into ParsedMessage[].
 * Shared by both inline and headers-only code paths.
 */
function parseBubbles(conversation: Array<Record<string, unknown>>, sessionId: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (let i = 0; i < conversation.length; i++) {
    const bubble = conversation[i];

    // Determine message type
    let type: 'user' | 'assistant' | 'system';
    if (bubble.type === 1 || bubble.role === 'user') {
      type = 'user';
    } else if (bubble.type === 2 || bubble.role === 'assistant') {
      type = 'assistant';
    } else {
      type = 'system';
    }

    // Extract content.
    //
    // Cursor stores user messages with both `text` (plain string) and `richText`
    // (a Lexical editor JSON tree). We prefer `text` when it exists since it's
    // already the plain-text equivalent. Only fall back to parsing the Lexical
    // JSON when `text` is absent or empty.
    //
    // Assistant messages typically only have `text` or `content`.
    let content: string;
    const textField = (bubble.text as string | undefined) || '';
    const contentField = (bubble.content as string | undefined) || '';

    if (textField) {
      content = textField;
    } else if (bubble.richText) {
      // richText may be a Lexical JSON object (user bubbles) or a plain string (older formats).
      // Try Lexical extraction first; fall back to coercing whatever value we have to a string.
      const lexical = extractLexicalText(bubble.richText);
      if (lexical !== null) {
        content = lexical;
      } else {
        content = typeof bubble.richText === 'string'
          ? bubble.richText
          : '';
      }
    } else {
      content = contentField;
    }

    if (!content && type !== 'system') continue; // Skip empty messages

    // Truncate to 10,000 chars (same as Claude Code parser)
    const truncatedContent = content.length > 10000 ? content.slice(0, 10000) : content;

    // Extract timestamp (milliseconds)
    let timestamp: Date;
    if (bubble.createdAt) {
      timestamp = new Date(typeof bubble.createdAt === 'number' ? bubble.createdAt : Date.parse(bubble.createdAt as string));
    } else {
      timestamp = new Date(0); // Epoch fallback — filtered out of session bounds calculation
    }

    // Extract tool calls from toolFormerData if present
    const toolCalls: ToolCall[] = [];
    if (bubble.toolFormerData) {
      try {
        const toolData = typeof bubble.toolFormerData === 'string'
          ? JSON.parse(bubble.toolFormerData) as Record<string, unknown>
          : bubble.toolFormerData as Record<string, unknown>;
        if (toolData.name || toolData.toolName) {
          toolCalls.push({
            id: (bubble.bubbleId as string) || `tool-${i}`,
            name: (toolData.name || toolData.toolName || 'unknown') as string,
            input: (toolData.input || toolData.arguments || {}) as Record<string, unknown>,
          });
        }
      } catch {
        // Ignore malformed tool data
      }
    }

    // Extract tool calls from codeBlocks if they look like file edits.
    // Cursor stores applied code edits as codeBlocks where `uri` is a VSCode URI
    // object (not a plain string). We use extractFilePath() to get the actual path.
    if (bubble.codeBlocks && Array.isArray(bubble.codeBlocks)) {
      for (const block of bubble.codeBlocks as Array<Record<string, unknown>>) {
        const filePath = extractFilePath(block.uri) || (typeof block.filePath === 'string' ? block.filePath : '');
        if (filePath) {
          toolCalls.push({
            id: `codeblock-${i}-${toolCalls.length}`,
            name: 'Edit',
            input: {
              file_path: filePath,
              code: ((block.code || block.content || '') as string).slice(0, 1000),
            },
          });
        }
      }
    }

    messages.push({
      id: (bubble.bubbleId as string) || `cursor-${sessionId}-${i}`,
      sessionId: `cursor:${sessionId}`,
      type,
      content: truncatedContent,
      thinking: null, // Cursor doesn't expose thinking
      toolCalls,
      toolResults: [], // Not available from Cursor's format
      usage: null, // No per-message usage data
      timestamp,
      parentId: null,
    });
  }

  return messages;
}
