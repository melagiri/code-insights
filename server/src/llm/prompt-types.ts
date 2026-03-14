// Type definitions for LLM prompt analysis.
// Extracted from prompts.ts — shared by message-format.ts, response-parsers.ts, and analysis.ts.

// SQLite row format for messages — snake_case with JSON-encoded arrays.
// This matches the shape returned by server/src/routes/messages.ts.
export interface SQLiteMessageRow {
  id: string;
  session_id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  thinking: string | null;
  tool_calls: string;       // JSON-encoded ToolCall[]
  tool_results: string;     // JSON-encoded ToolResult[]
  usage: string | null;
  timestamp: string;
  parent_id: string | null;
}

/**
 * Optional session metadata from V6 columns.
 * Passed to prompt generators to add context signals about context compaction
 * and slash command usage. Only present when at least one V6 field is non-empty.
 */
export interface SessionMetadata {
  compactCount?: number;       // from sessions.compact_count (user-initiated /compact)
  autoCompactCount?: number;   // from sessions.auto_compact_count (LLM-initiated compaction)
  slashCommands?: string[];    // from sessions.slash_commands (JSON array of command names)
}

export interface AnalysisResponse {
  facets?: {
    outcome_satisfaction: string;
    workflow_pattern: string | null;
    had_course_correction: boolean;
    course_correction_reason: string | null;
    iteration_count: number;
    friction_points: Array<{
      _reasoning?: string;
      category: string;
      attribution?: string;
      description: string;
      severity: string;
      resolution: string;
    }>;
    effective_patterns: Array<{
      _reasoning?: string;
      category: string;
      description: string;
      confidence: number;
      driver?: 'user-driven' | 'ai-driven' | 'collaborative';
    }>;
  };
  summary: {
    title: string;
    content: string;
    outcome?: 'success' | 'partial' | 'abandoned' | 'blocked';
    bullets: string[];
  };
  decisions: Array<{
    title: string;
    situation?: string;
    choice?: string;
    reasoning: string;
    alternatives?: Array<{ option: string; rejected_because: string }>;
    trade_offs?: string;
    revisit_when?: string;
    confidence?: number;
    evidence?: string[];
  }>;
  learnings: Array<{
    title: string;
    symptom?: string;
    root_cause?: string;
    takeaway?: string;
    applies_when?: string;
    confidence?: number;
    evidence?: string[];
  }>;
}

export interface ParseError {
  error_type: 'json_parse_error' | 'no_json_found' | 'invalid_structure';
  error_message: string;
  response_length: number;
  response_preview: string;
}

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: ParseError };

export interface PromptQualityFinding {
  category: string;
  type: 'deficit' | 'strength';
  description: string;
  message_ref: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  suggested_improvement?: string;
}

export interface PromptQualityTakeaway {
  type: 'improve' | 'reinforce';
  category: string;
  label: string;
  message_ref: string;
  // improve fields
  original?: string;
  better_prompt?: string;
  why?: string;
  // reinforce fields
  what_worked?: string;
  why_effective?: string;
}

export interface PromptQualityDimensionScores {
  context_provision: number;
  request_specificity: number;
  scope_management: number;
  information_timing: number;
  correction_quality: number;
}

export interface PromptQualityResponse {
  efficiency_score: number;
  message_overhead: number;
  assessment: string;
  takeaways: PromptQualityTakeaway[];
  findings: PromptQualityFinding[];
  dimension_scores: PromptQualityDimensionScores;
}
