// Core types for Code Insights

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
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

export interface MessageContent {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  // tool_use fields
  id?: string;                       // tool_use_id
  name?: string;
  input?: Record<string, unknown>;
  // tool_result fields
  tool_use_id?: string;              // references tool_use_id
  content?: string | Array<{ type: string; text: string }>;  // can be string or array
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
  customTitle?: string;
  gitBranch: string | null;
  claudeVersion: string | null;
  sourceTool?: string;
  usage?: SessionUsage;
  messages: ParsedMessage[];
}

export interface ParsedMessage {
  id: string;
  sessionId: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  thinking: string | null;           // extracted thinking content
  toolCalls: ToolCall[];
  toolResults: ToolResult[];         // extracted tool results
  usage: MessageUsage | null;        // per-message usage (assistant only)
  timestamp: Date;
  parentId: string | null;
}

export interface SessionUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  modelsUsed: string[];
  primaryModel: string;
  usageSource: 'jsonl' | 'session';
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

export interface ParsedInsightContent {
  title: string;
  summary: string;
  bullets: string[];
  rawContent: string;
}

export interface ToolCall {
  id: string;                        // tool_use_id from JSONL
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolUseId: string;                 // References ToolCall.id
  output: string;                    // Truncated tool output
}

export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  model: string;
  estimatedCostUsd: number;
}

export type InsightType = 'summary' | 'decision' | 'learning' | 'technique' | 'prompt_quality';
export type InsightScope = 'session' | 'project' | 'overall';

export interface Insight {
  id: string;
  sessionId: string;
  projectId: string;
  projectName: string;
  type: InsightType;
  title: string;
  content: string;
  summary: string;
  bullets: string[];
  confidence: number;
  source: 'llm';
  metadata: InsightMetadata;
  timestamp: Date;
  createdAt?: Date;
  scope: InsightScope;
  analysisVersion: string;
}

export interface InsightMetadata {
  // Decision-specific (v3.0.0 decomposed schema)
  situation?: string;
  choice?: string;
  reasoning?: string;
  alternatives?: Array<string | { option: string; rejected_because: string }>;
  trade_offs?: string;
  revisit_when?: string;
  evidence?: string[];
  // Learning-specific (v3.0.0 decomposed schema)
  symptom?: string;
  root_cause?: string;
  takeaway?: string;
  applies_when?: string;
  // Summary-specific
  outcome?: 'success' | 'partial' | 'abandoned' | 'blocked';
  // Technique/learning-specific (legacy v2)
  context?: string;
  applicability?: string;
  // Prompt quality-specific
  efficiencyScore?: number;
  wastedTurns?: Array<{ messageIndex: number; whatWentWrong?: string; reason?: string; originalMessage?: string; suggestedRewrite?: string; turnsWasted?: number }>;
  antiPatterns?: Array<{ name: string; description?: string; count: number; examples: string[]; fix?: string }>;
  sessionTraits?: Array<{ trait: string; severity: string; description: string; evidence?: string; suggestion?: string }>;
  potentialMessageReduction?: number;
}

export type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey?: string;       // not required for Ollama
  model: string;
  baseUrl?: string;      // for Ollama or custom endpoints
}

export interface ProviderModelOption {
  id: string;
  name: string;
  description?: string;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
}

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  models: ProviderModelOption[];
  requiresApiKey: boolean;
  apiKeyLink?: string;
}

export interface ClaudeInsightConfig {
  sync: {
    claudeDir: string;
    excludeProjects: string[];
  };
  dashboard?: {
    port?: number;
    llm?: LLMProviderConfig;
  };
  telemetry?: boolean;              // default true (opt-out)
}

export interface SyncState {
  lastSync: string;
  files: Record<string, FileSyncState>;
}

export interface FileSyncState {
  lastModified: string;
  lastSyncedLine: number;
  sessionId: string;
  syncedSessionIds?: string[];  // For providers where 1 file = N sessions (e.g., Cursor SQLite)
}

