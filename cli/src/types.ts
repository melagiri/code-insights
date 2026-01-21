// Core types for ClaudeInsight

export interface ClaudeMessage {
  type: 'user' | 'assistant' | 'system';
  parentUuid?: string | null;
  uuid: string;
  sessionId: string;
  timestamp: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  message: {
    role: string;
    content: string | MessageContent[];
  };
}

export interface MessageContent {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
}

export interface SessionSummary {
  type: 'summary';
  summary: string;
  leafUuid: string;
}

export interface FileHistorySnapshot {
  type: 'file-history-snapshot';
  messageId: string;
  snapshot: {
    messageId: string;
    trackedFileBackups: Record<string, unknown>;
    timestamp: string;
  };
  isSnapshotUpdate: boolean;
}

export type JsonlEntry = ClaudeMessage | SessionSummary | FileHistorySnapshot;

export interface ParsedSession {
  id: string;
  projectPath: string;
  projectName: string;
  summary: string | null;
  // New fields for smart titles
  generatedTitle: string | null;
  titleSource: TitleSource | null;
  sessionCharacter: SessionCharacter | null;
  startedAt: Date;
  endedAt: Date;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  gitBranch: string | null;
  claudeVersion: string | null;
  messages: ParsedMessage[];
}

export interface ParsedMessage {
  id: string;
  sessionId: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: ToolCall[];
  timestamp: Date;
  parentId: string | null;
}

export type SessionCharacter =
  | 'deep_focus'    // 50+ messages, concentrated file work
  | 'bug_hunt'      // Error patterns + fixes
  | 'feature_build' // Multiple new files created
  | 'exploration'   // Heavy Read/Grep, few edits
  | 'refactor'      // Many edits, same file count
  | 'learning'      // Questions and explanations
  | 'quick_task';   // <10 messages, completed

export type TitleSource = 'claude' | 'user_message' | 'insight' | 'character' | 'fallback';

export interface TitleCandidate {
  text: string;
  source: TitleSource;
  score: number;
}

export interface GeneratedTitle {
  title: string;
  source: TitleSource;
  character: SessionCharacter | null;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface Insight {
  id: string;
  sessionId: string;
  projectId: string;
  projectName: string;
  type: 'decision' | 'learning' | 'workitem' | 'effort';
  title: string;
  content: string;
  confidence: number;
  source: 'pattern' | 'llm';
  metadata: InsightMetadata;
  timestamp: Date;
}

export interface InsightMetadata {
  // Decision-specific
  alternatives?: string[];
  reasoning?: string;
  // Work item-specific
  files?: string[];
  workType?: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test';
  // Effort-specific
  tokens?: number;
  duration?: number;
}

export interface ClaudeInsightConfig {
  firebase: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
  gemini?: {
    apiKey: string;
  };
  sync: {
    claudeDir: string;
    excludeProjects: string[];
  };
}

export interface SyncState {
  lastSync: string;
  files: Record<string, FileSyncState>;
}

export interface FileSyncState {
  lastModified: string;
  lastSyncedLine: number;
  sessionId: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  lastActivity: Date;
  createdAt: Date;
}
