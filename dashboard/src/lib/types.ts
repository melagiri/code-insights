// Dashboard-specific types matching the Hono API response format.
// The server returns SQLite rows as-is — snake_case keys, ISO 8601 date strings.
// Convert to Date objects only at the component boundary when needed.

export type ExportTemplate = 'knowledge-base' | 'agent-rules';

export interface Project {
  id: string;
  name: string;
  path: string;
  git_remote_url: string | null;
  session_count: number;
  last_activity: string;        // ISO 8601
  created_at: string;           // ISO 8601
  updated_at: string;           // ISO 8601
  total_input_tokens?: number;
  total_output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  estimated_cost_usd?: number;
}

export type SessionCharacter =
  | 'deep_focus'
  | 'bug_hunt'
  | 'feature_build'
  | 'exploration'
  | 'refactor'
  | 'learning'
  | 'quick_task';

export type TitleSource = 'claude' | 'user_message' | 'insight' | 'character' | 'fallback';

export interface Session {
  id: string;
  project_id: string;
  project_name: string;
  project_path: string;
  git_remote_url: string | null;
  summary: string | null;
  custom_title: string | null;
  generated_title: string | null;
  title_source: TitleSource | null;
  session_character: SessionCharacter | null;
  started_at: string;           // ISO 8601
  ended_at: string;             // ISO 8601
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  tool_call_count: number;
  git_branch: string | null;
  claude_version: string | null;
  source_tool: string | null;
  device_id: string | null;
  device_hostname: string | null;
  device_platform: string | null;
  synced_at: string;            // ISO 8601
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  estimated_cost_usd: number | null;
  models_used: string | null;   // JSON-encoded string array from SQLite
  primary_model: string | null;
  usage_source: string | null;
  compact_count: number;
  auto_compact_count: number;
  slash_commands: string;       // JSON-encoded string array from SQLite
}

export type InsightType = 'summary' | 'decision' | 'learning' | 'technique' | 'prompt_quality';
export type InsightScope = 'session' | 'project' | 'overall';

export interface Insight {
  id: string;
  session_id: string;
  project_id: string;
  project_name: string;
  type: InsightType;
  title: string;
  content: string;
  summary: string;
  bullets: string;              // JSON-encoded string array from SQLite
  confidence: number;
  source: 'llm';
  metadata: string;             // JSON-encoded object from SQLite
  timestamp: string;            // ISO 8601
  created_at: string;           // ISO 8601
  scope: InsightScope;
  analysis_version: string;
  linked_insight_ids: string | null;
}

export interface ToolCall {
  id: string;                   // tool_use_id from JSONL
  name: string;
  input: string;                // serialized JSON from CLI
}

export interface ToolResult {
  toolUseId: string;            // References ToolCall.id
  output: string;               // Truncated tool output
}

export interface Message {
  id: string;
  session_id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  thinking: string | null;
  tool_calls: string;           // JSON-encoded array from SQLite
  tool_results: string;         // JSON-encoded array from SQLite
  usage: string | null;         // JSON-encoded object from SQLite
  timestamp: string;            // ISO 8601
  parent_id: string | null;
}

// Daily stats from /api/analytics/usage
export interface DailyStats {
  date: string;
  session_count: number;
  message_count: number;
  insight_count: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
}

/**
 * Safely parse a JSON string field from the API.
 * Returns defaultValue if the field is null, empty, or invalid JSON.
 */
export function parseJsonField<T>(value: string | null | undefined, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

// Dashboard stats from /api/analytics/dashboard
export interface DashboardStats {
  session_count: number;
  active_projects: number;
  total_messages: number | null;
  total_tool_calls: number | null;
  total_duration_min: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  estimated_cost_usd: number | null;
}

/**
 * Typed metadata for insight rendering.
 * Mirrors cli/src/types.ts InsightMetadata — all fields optional since
 * sessions may not have all metadata populated.
 */
export interface InsightMetadata {
  // Decision fields
  situation?: string;
  choice?: string;
  reasoning?: string;
  alternatives?: Array<string | { option: string; rejected_because: string }>;
  trade_offs?: string;
  revisit_when?: string;
  evidence?: string[];
  // Learning fields
  symptom?: string;
  root_cause?: string;
  takeaway?: string;
  applies_when?: string;
  // Summary fields — narrative outcome from LLM summary extraction.
  // Distinct from session_facets.outcome_satisfaction ('high'|'medium'|'low'|'abandoned')
  // which is a quantitative satisfaction rating used on the Patterns page.
  outcome?: 'success' | 'partial' | 'abandoned' | 'blocked';
  // Legacy learning/technique
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

// LLM config from /api/config/llm
export interface LLMConfig {
  dashboardPort: number;
  provider?: 'openai' | 'anthropic' | 'gemini' | 'ollama';
  model?: string;
  apiKey?: string;      // masked by server before returning (first4...last4)
  baseUrl?: string;
}
