import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import type { SessionProvider } from './types.js';
import type { ParsedSession, ParsedMessage, ToolCall } from '../types.js';
import { generateTitle, detectSessionCharacter } from '../parser/titles.js';

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
          return url.pathname;
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

    // Extract messages from composer data
    const messages = extractMessages(composerData, composerId);
    if (messages.length === 0) return null;

    // Resolve project path from workspace directory
    const wsDir = path.dirname(dbPath); // e.g., workspaceStorage/<hash>/
    const projectPath = resolveWorkspacePath(wsDir) || 'cursor://global';
    const projectName = path.basename(projectPath);

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

/**
 * Extract parsed messages from Cursor composer data.
 */
function extractMessages(composerData: Record<string, unknown>, sessionId: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  // Try conversation array (modern format from cursorDiskKV)
  const conversation = (composerData.conversation || composerData.messages || []) as Array<Record<string, unknown>>;

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

    // Extract content — prefer richText (markdown), fall back to text
    const content = ((bubble.richText || bubble.text || bubble.content || '') as string).toString();
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

    // Extract tool calls from codeBlocks if they look like file edits
    // (Cursor stores applied code edits as codeBlocks)
    if (bubble.codeBlocks && Array.isArray(bubble.codeBlocks)) {
      for (const block of bubble.codeBlocks as Array<Record<string, unknown>>) {
        if (block.uri || block.filePath) {
          toolCalls.push({
            id: `codeblock-${i}-${toolCalls.length}`,
            name: 'Edit',
            input: {
              file_path: (block.uri || block.filePath || '') as string,
              code: ((block.code || '') as string).slice(0, 1000),
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
