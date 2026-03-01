import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionProvider } from './types.js';
import type { ParsedSession, ParsedMessage, ToolCall, ToolResult } from '../types.js';
import { generateTitle, detectSessionCharacter } from '../parser/titles.js';

/**
 * GitHub Copilot CLI session provider.
 * Discovers and parses events.jsonl files from ~/.copilot/session-state/
 */
export class CopilotCliProvider implements SessionProvider {
  getProviderName(): string {
    return 'copilot-cli';
  }

  async discover(options?: { projectFilter?: string }): Promise<string[]> {
    const copilotHome = getCopilotHome();
    if (!copilotHome) return [];

    const files: string[] = [];

    // Walk session-state/ and history-session-state/ directories
    for (const subdir of ['session-state', 'history-session-state']) {
      const sessionsDir = path.join(copilotHome, subdir);
      if (!fs.existsSync(sessionsDir)) continue;
      collectEventsFiles(sessionsDir, files);
    }

    // Apply project filter if specified (filter by cwd from workspace.yaml)
    if (options?.projectFilter) {
      return filterByProject(files, options.projectFilter);
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

function getCopilotHome(): string | null {
  const envHome = process.env.COPILOT_HOME;
  if (envHome && fs.existsSync(envHome)) return envHome;

  const home = os.homedir();
  const defaultDir = path.join(home, '.copilot');
  return fs.existsSync(defaultDir) ? defaultDir : null;
}

/**
 * Collect events.jsonl files from session directories.
 * Structure: session-state/{session-id}/events.jsonl
 */
function collectEventsFiles(dir: string, files: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const eventsPath = path.join(dir, entry.name, 'events.jsonl');
    if (fs.existsSync(eventsPath)) {
      files.push(eventsPath);
    }
  }
}

/**
 * Quick-filter by project: read workspace.yaml sibling for cwd.
 */
function filterByProject(files: string[], projectFilter: string): string[] {
  const filtered: string[] = [];
  const lowerFilter = projectFilter.toLowerCase();

  for (const filePath of files) {
    try {
      const sessionDir = path.dirname(filePath);
      const workspacePath = path.join(sessionDir, 'workspace.yaml');

      if (fs.existsSync(workspacePath)) {
        const yamlContent = fs.readFileSync(workspacePath, 'utf-8');
        const meta = parseWorkspaceYaml(yamlContent);
        const cwd = meta.cwd || '';
        if (cwd.toLowerCase().includes(lowerFilter)) {
          filtered.push(filePath);
          continue;
        }
      }

      // If no workspace.yaml or no cwd match, try reading first line of events.jsonl
      // for session.start event with cwd
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(2048);
      const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
      fs.closeSync(fd);

      const firstLine = buf.toString('utf-8', 0, bytesRead).split('\n')[0];
      const event = JSON.parse(firstLine);
      const data = event.data || event;
      const cwd = data.cwd || '';
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
// workspace.yaml parser (no YAML library — simple key: value)
// ---------------------------------------------------------------------------

function parseWorkspaceYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Copilot event types
// ---------------------------------------------------------------------------

interface CopilotEvent {
  type: string;
  data?: Record<string, unknown>;
  // Allow bare event format (forward compatibility)
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseCopilotSession(filePath: string): ParsedSession | null {
  try {
    const sessionDir = path.dirname(filePath);
    const sessionDirName = path.basename(sessionDir);

    // Read workspace.yaml for metadata (if present)
    const workspacePath = path.join(sessionDir, 'workspace.yaml');
    let workspaceMeta: Record<string, string> = {};
    if (fs.existsSync(workspacePath)) {
      workspaceMeta = parseWorkspaceYaml(fs.readFileSync(workspacePath, 'utf-8'));
    }

    // Read events.jsonl
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;

    const sessionId = `copilot:${sessionDirName}`;
    let model = workspaceMeta.model || '';
    let cwd = workspaceMeta.cwd || '';
    let sessionName = workspaceMeta.name || '';

    // Parse events
    const messages: ParsedMessage[] = [];
    let lastTimestamp = fs.statSync(filePath).mtime;
    let firstTimestamp: Date | null = null;

    // Accumulator for current assistant turn
    let currentAssistantText = '';
    let currentToolCalls: ToolCall[] = [];
    let currentToolResults: ToolResult[] = [];
    let toolCounter = 0;

    function flushAssistantTurn(): void {
      const text = currentAssistantText.trim();
      if (!text && currentToolCalls.length === 0) return;

      messages.push({
        id: `copilot-assistant-${messages.length}`,
        sessionId: sessionId,
        type: 'assistant',
        content: text.slice(0, 10000),
        thinking: null,
        toolCalls: [...currentToolCalls],
        toolResults: [...currentToolResults],
        usage: null,
        timestamp: lastTimestamp,
        parentId: null,
      });

      // Reset accumulators
      currentAssistantText = '';
      currentToolCalls = [];
      currentToolResults = [];
    }

    for (const line of lines) {
      let event: CopilotEvent;
      try {
        event = JSON.parse(line) as CopilotEvent;
      } catch {
        continue;
      }

      // Unwrap envelope: support both {type, data} and bare event formats
      const eventType = event.type;
      const data = (event.data || event) as Record<string, unknown>;

      // Extract timestamp if present
      const ts = parseTimestamp(data);
      if (ts) {
        lastTimestamp = ts;
        if (!firstTimestamp) firstTimestamp = ts;
      }

      switch (eventType) {
        case 'session.start': {
          // Extract session metadata
          if (!cwd && data.cwd) cwd = data.cwd as string;
          if (!model && data.model) model = data.model as string;
          if (!sessionName && data.name) sessionName = data.name as string;
          break;
        }

        case 'user.message': {
          // Flush any pending assistant turn
          flushAssistantTurn();

          const userContent = extractText(data);
          if (userContent) {
            messages.push({
              id: (data.id as string) || `copilot-user-${messages.length}`,
              sessionId: sessionId,
              type: 'user',
              content: userContent.slice(0, 10000),
              thinking: null,
              toolCalls: [],
              toolResults: [],
              usage: null,
              timestamp: lastTimestamp,
              parentId: null,
            });
          }
          break;
        }

        case 'assistant.message': {
          const text = extractText(data);
          if (text) {
            currentAssistantText += text + '\n';
          }
          break;
        }

        case 'assistant.message_delta': {
          const delta = (data.delta as string) || (data.text as string) || '';
          if (delta) {
            currentAssistantText += delta;
          }
          break;
        }

        case 'tool.execution_start': {
          toolCounter++;
          const toolName = (data.toolName as string) || (data.name as string) || 'unknown_tool';
          const toolInput = (data.parameters || data.arguments || {}) as Record<string, unknown>;
          currentToolCalls.push({
            id: (data.id as string) || `copilot-tool-${toolCounter}`,
            name: toolName,
            input: toolInput,
          });
          break;
        }

        case 'tool.execution_complete': {
          // data.result may be an object like {content: "..."} or a plain string
          const rawResult = data.result;
          let toolOutput: string;
          if (typeof rawResult === 'string') {
            toolOutput = rawResult;
          } else if (rawResult && typeof rawResult === 'object') {
            const resultObj = rawResult as Record<string, unknown>;
            toolOutput = (resultObj.content as string) || JSON.stringify(rawResult);
          } else {
            toolOutput = (data.output as string) || '';
          }
          const toolId = (data.toolCallId as string) || (data.id as string) || (currentToolCalls.length > 0
            ? currentToolCalls[currentToolCalls.length - 1].id
            : `copilot-tool-${toolCounter}`);
          if (toolOutput) {
            currentToolResults.push({
              toolUseId: toolId,
              output: toolOutput.slice(0, 1000),
            });
          }
          break;
        }

        case 'subagent.started': {
          toolCounter++;
          const agentName = (data.name as string) || (data.agentName as string) || 'subagent';
          currentToolCalls.push({
            id: (data.id as string) || `copilot-subagent-${toolCounter}`,
            name: `subagent:${agentName}`,
            input: (data.parameters || data.arguments || data.input || {}) as Record<string, unknown>,
          });
          break;
        }

        case 'subagent.completed': {
          const agentOutput = (data.output as string) || (data.result as string) || '';
          const agentId = (data.id as string) || (currentToolCalls.length > 0
            ? currentToolCalls[currentToolCalls.length - 1].id
            : `copilot-subagent-${toolCounter}`);
          if (agentOutput) {
            currentToolResults.push({
              toolUseId: agentId,
              output: agentOutput.slice(0, 1000),
            });
          }
          break;
        }

        case 'session.idle': {
          // Turn boundary — flush accumulated assistant turn
          flushAssistantTurn();
          break;
        }

        default:
          // Skip unknown event types gracefully
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
    const startedAt = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : (firstTimestamp || new Date());
    const endedAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : lastTimestamp;

    const projectPath = cwd || 'copilot://unknown';
    const projectName = sessionName || path.basename(projectPath);

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
      claudeVersion: model || null,
      sourceTool: 'copilot-cli',
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

function extractText(data: Record<string, unknown>): string | null {
  if (typeof data.text === 'string') return data.text;
  if (typeof data.content === 'string') return data.content;
  if (typeof data.message === 'string') return data.message;
  if (Array.isArray(data.content)) {
    return (data.content as Array<Record<string, string>>)
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  return null;
}

function parseTimestamp(data: Record<string, unknown>): Date | null {
  const ts = data.timestamp || data.createdAt || data.time;
  if (!ts) return null;
  const d = new Date(ts as string | number);
  return isNaN(d.getTime()) ? null : d;
}
