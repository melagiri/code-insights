import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionProvider } from './types.js';
import type { ParsedSession, ParsedMessage, ToolCall } from '../types.js';
import { generateTitle, detectSessionCharacter } from '../parser/titles.js';

/**
 * VS Code Copilot Chat session provider.
 * Discovers and parses JSON session files from VS Code's workspaceStorage.
 *
 * Each chat conversation is stored as a standalone JSON file (format version 3)
 * under workspaceStorage/<hash>/chatSessions/<sessionId>.json.
 * One file = one session (no virtual paths needed).
 */
export class CopilotProvider implements SessionProvider {
  getProviderName(): string {
    return 'copilot';
  }

  async discover(options?: { projectFilter?: string }): Promise<string[]> {
    const vscodeUserDir = getVSCodeUserDir();
    if (!vscodeUserDir) return [];

    const files: string[] = [];

    // 1. Workspace-scoped sessions
    const workspaceStorageDir = path.join(vscodeUserDir, 'workspaceStorage');
    if (fs.existsSync(workspaceStorageDir)) {
      let entries: string[];
      try {
        entries = fs.readdirSync(workspaceStorageDir);
      } catch {
        entries = [];
      }

      for (const entry of entries) {
        const wsDir = path.join(workspaceStorageDir, entry);
        try {
          if (!fs.statSync(wsDir).isDirectory()) continue;
        } catch {
          continue;
        }

        // Apply project filter via workspace.json
        if (options?.projectFilter) {
          const projectPath = resolveWorkspacePath(wsDir);
          if (projectPath && !projectPath.toLowerCase().includes(options.projectFilter.toLowerCase())) {
            continue;
          }
        }

        const chatDir = path.join(wsDir, 'chatSessions');
        collectJsonFiles(chatDir, files);
      }
    }

    // 2. Global sessions (empty window — no workspace)
    const globalChatDir = path.join(vscodeUserDir, 'globalStorage', 'emptyWindowChatSessions');
    if (!options?.projectFilter) {
      collectJsonFiles(globalChatDir, files);
    }

    return files;
  }

  async parse(filePath: string): Promise<ParsedSession | null> {
    return parseCopilotSession(filePath);
  }
}

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------

function getVSCodeUserDir(): string | null {
  const platform = process.platform;
  const home = os.homedir();

  let dataDir: string;
  if (platform === 'darwin') {
    dataDir = path.join(home, 'Library', 'Application Support', 'Code', 'User');
  } else if (platform === 'linux') {
    dataDir = path.join(home, '.config', 'Code', 'User');
  } else if (platform === 'win32') {
    dataDir = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User');
  } else {
    return null;
  }

  return fs.existsSync(dataDir) ? dataDir : null;
}

/**
 * Resolve project path from a workspace hash directory.
 * Reads workspace.json which contains the folder URI.
 */
function resolveWorkspacePath(wsDir: string): string | null {
  const workspaceJsonPath = path.join(wsDir, 'workspace.json');
  if (!fs.existsSync(workspaceJsonPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf-8'));
    if (data.folder) {
      try {
        return new URL(data.folder).pathname;
      } catch {
        return data.folder;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Collect *.json files from a chatSessions directory.
 */
function collectJsonFiles(dir: string, files: string[]): void {
  if (!fs.existsSync(dir)) return;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    files.push(path.join(dir, entry));
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface CopilotSession {
  version: number;
  sessionId: string;
  creationDate: number;
  lastMessageDate: number;
  requesterUsername?: string;
  customTitle?: string;
  initialLocation?: string;
  inputState?: {
    selectedModel?: {
      identifier?: string;
      metadata?: { name?: string; family?: string; id?: string };
    };
  };
  requests: CopilotRequest[];
}

interface CopilotRequest {
  requestId: string;
  timestamp: number;
  message: { text: string; parts?: unknown[] };
  response: CopilotResponseItem[];
  result?: {
    timings?: { totalElapsed?: number };
    metadata?: {
      toolCallRounds?: Array<{
        toolCalls: Array<{ name: string; arguments: string; id: string }>;
      }>;
    };
  };
  modelId?: string;
  agent?: { id: string };
  isCanceled?: boolean;
}

interface CopilotResponseItem {
  kind?: string;
  value?: string;
  toolId?: string;
  toolCallId?: string;
  invocationMessage?: string;
  resultDetails?: Array<{ value?: string }>;
}

function parseCopilotSession(filePath: string): ParsedSession | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as CopilotSession;

    if (!data.requests || data.requests.length === 0) return null;

    // Use copilot-vscode: prefix to distinguish VS Code Copilot Chat from copilot-cli
    const sessionId = `copilot-vscode:${data.sessionId}`;
    const messages: ParsedMessage[] = [];
    let modelId: string | null = null;

    // Extract session-level model info
    if (data.inputState?.selectedModel?.metadata?.name) {
      modelId = data.inputState.selectedModel.metadata.name;
    }

    for (const request of data.requests) {
      if (request.isCanceled) continue;

      const timestamp = new Date(request.timestamp);

      // Track model per-request
      if (request.modelId && !modelId) {
        modelId = request.modelId;
      }

      // User message
      const userText = request.message?.text?.trim();
      if (userText) {
        messages.push({
          id: `${request.requestId}-user`,
          sessionId,
          type: 'user',
          content: userText.slice(0, 10000),
          thinking: null,
          toolCalls: [],
          toolResults: [],
          usage: null,
          timestamp,
          parentId: null,
        });
      }

      // Assistant response — extract text, thinking, and tool calls
      let assistantText = '';
      let thinkingText = '';
      const toolCalls: ToolCall[] = [];

      for (const item of request.response) {
        const kind = item.kind || 'text-value';

        switch (kind) {
          case 'text-value':
            // Default kind — markdown text content
            if (item.value) assistantText += item.value;
            break;

          case 'thinking':
            if (item.value) thinkingText += item.value + '\n';
            break;

          case 'toolInvocationSerialized':
            if (item.toolId) {
              toolCalls.push({
                id: item.toolCallId || `tool-${toolCalls.length}`,
                name: item.toolId,
                input: { description: item.invocationMessage || '' },
              });
            }
            break;

          // Skip non-content items
          default:
            break;
        }
      }

      // Also extract structured tool calls from result.metadata if available
      if (request.result?.metadata?.toolCallRounds) {
        for (const round of request.result.metadata.toolCallRounds) {
          for (const tc of round.toolCalls) {
            // Avoid duplicates — only add if not already tracked from response items
            if (!toolCalls.some(t => t.id === tc.id)) {
              let parsedInput: Record<string, unknown> = {};
              try {
                parsedInput = JSON.parse(tc.arguments);
              } catch {
                parsedInput = { raw: tc.arguments?.slice(0, 1000) || '' };
              }
              toolCalls.push({
                id: tc.id,
                name: tc.name,
                input: parsedInput,
              });
            }
          }
        }
      }

      const trimmedAssistant = assistantText.trim();
      if (trimmedAssistant || toolCalls.length > 0) {
        messages.push({
          id: `${request.requestId}-assistant`,
          sessionId,
          type: 'assistant',
          content: trimmedAssistant.slice(0, 10000),
          thinking: thinkingText.trim() || null,
          toolCalls,
          toolResults: [], // Results are inline in response, not structured separately
          usage: null,
          timestamp,
          parentId: null,
        });
      }
    }

    if (messages.length === 0) return null;

    // Resolve project path from workspace directory
    // filePath: .../workspaceStorage/<hash>/chatSessions/<id>.json
    const chatDir = path.dirname(filePath);
    const chatDirName = path.basename(chatDir);
    let projectPath: string;
    let projectName: string;

    if (chatDirName === 'chatSessions') {
      const wsDir = path.dirname(chatDir);
      projectPath = resolveWorkspacePath(wsDir) || 'copilot://unknown';
      projectName = path.basename(projectPath);
    } else if (chatDirName === 'emptyWindowChatSessions') {
      projectPath = 'copilot://global';
      projectName = 'global';
    } else {
      projectPath = 'copilot://unknown';
      projectName = 'unknown';
    }

    const userMessages = messages.filter(m => m.type === 'user');
    const assistantMessages = messages.filter(m => m.type === 'assistant');
    const toolCallCount = messages.reduce((sum, m) => sum + m.toolCalls.length, 0);

    const startedAt = new Date(data.creationDate);
    const endedAt = new Date(data.lastMessageDate || data.creationDate);

    const session: ParsedSession = {
      id: sessionId,
      projectPath,
      projectName,
      summary: data.customTitle || null,
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
      claudeVersion: modelId,
      sourceTool: 'copilot',
      messages,
    };

    // Generate title and detect session character
    const titleResult = generateTitle(session);
    session.generatedTitle = titleResult.title;
    session.titleSource = titleResult.source;
    session.sessionCharacter = titleResult.character || detectSessionCharacter(session);

    return session;
  } catch {
    return null;
  }
}
