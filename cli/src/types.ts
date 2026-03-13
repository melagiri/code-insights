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
  compactCount: number;
  autoCompactCount: number;
  slashCommands: string[];  // All non-exit slash commands used, e.g., ["/compact", "/login", "/plan"]
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
  // Summary-specific — narrative outcome from LLM summary extraction.
  // Distinct from session_facets.outcome_satisfaction ('high'|'medium'|'low'|'abandoned')
  // which is a quantitative satisfaction rating used for Patterns/Reflect aggregation.
  outcome?: 'success' | 'partial' | 'abandoned' | 'blocked';
  // Technique/learning-specific (legacy v2)
  context?: string;
  applicability?: string;
  // Prompt quality fields (new taxonomy — v3.x)
  efficiency_score?: number;
  message_overhead?: number;
  takeaways?: Array<{
    type: 'improve' | 'reinforce';
    category: string;
    label: string;
    message_ref: string;
    original?: string;
    better_prompt?: string;
    why?: string;
    what_worked?: string;
    why_effective?: string;
  }>;
  findings?: Array<{
    category: string;
    type: 'deficit' | 'strength';
    description: string;
    message_ref: string;
    impact: 'high' | 'medium' | 'low';
    confidence: number;
    suggested_improvement?: string;
  }>;
  dimension_scores?: {
    context_provision: number;
    request_specificity: number;
    scope_management: number;
    information_timing: number;
    correction_quality: number;
  };
  // Legacy prompt quality fields (pre-taxonomy — still in old insights)
  efficiencyScore?: number;
  wastedTurns?: Array<{ messageIndex: number; whatWentWrong?: string; reason?: string; originalMessage?: string; suggestedRewrite?: string; turnsWasted?: number }>;
  antiPatterns?: Array<{ name: string; description?: string; count: number; examples: string[]; fix?: string }>;
  sessionTraits?: Array<{ trait: string; severity: string; description: string; evidence?: string; suggestion?: string }>;
  potentialMessageReduction?: number;
}

// === Session Facets (cross-session analysis foundation) ===

export interface FrictionPoint {
  category: string;
  attribution?: 'user-actionable' | 'ai-capability' | 'environmental';
  description: string;
  severity: 'high' | 'medium' | 'low';
  resolution: 'resolved' | 'workaround' | 'unresolved';
}

export interface EffectivePattern {
  category: string;     // Required — no backward compat (Reflect feature not yet released)
  description: string;
  confidence: number;
  driver?: 'user-driven' | 'ai-driven' | 'collaborative';  // optional during transition — existing data without driver will not break
}

export type OutcomeSatisfaction = 'high' | 'medium' | 'low' | 'abandoned';

export interface SessionFacet {
  sessionId: string;
  outcomeSatisfaction: OutcomeSatisfaction;
  workflowPattern: string | null;
  hadCourseCorrection: boolean;
  courseCorrectionReason: string | null;
  iterationCount: number;
  frictionPoints: FrictionPoint[];
  effectivePatterns: EffectivePattern[];
  extractedAt: string;
  analysisVersion: string;
}

// === Reflect / Patterns types ===

export type ReflectSection = 'friction-wins' | 'rules-skills' | 'working-style';

export interface FrictionWinsResult {
  section: 'friction-wins';
  frictionCategories: Array<{
    category: string;
    count: number;
    avgSeverity: number;
    examples: string[];
    trend: 'increasing' | 'stable' | 'decreasing' | 'new';
  }>;
  effectivePatterns: Array<{
    category: string;
    label: string;
    frequency: number;
    avgConfidence: number;
    descriptions: string[];
  }>;
  narrative: string;
  generatedAt: string;
}

export interface RulesSkillsResult {
  section: 'rules-skills';
  claudeMdRules: Array<{
    rule: string;
    rationale: string;
    frictionSource: string;
  }>;
  /** @deprecated Removed in v3.7 — old snapshots may still contain this field */
  skillTemplates?: Array<{
    name: string;
    description: string;
    content: string;
  }>;
  hookConfigs: Array<{
    event: string;
    command: string;
    rationale: string;
  }>;
  targetTool: string;
  generatedAt: string;
}

export interface WorkingStyleResult {
  section: 'working-style';
  tagline?: string;             // 2-4 word archetype label (e.g. "The Methodical Builder")
  narrative: string;
  workflowDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  characterDistribution: Record<string, number>;
  generatedAt: string;
}

export type ReflectResult = FrictionWinsResult | RulesSkillsResult | WorkingStyleResult;

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

export type ExportTemplate = 'knowledge-base' | 'agent-rules';

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

