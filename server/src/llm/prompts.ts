// Analysis prompts and response parsers for LLM session analysis.
// Ported from web repo (src/lib/llm/prompts.ts) with SQLite-aware message formatting.

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

interface ParsedToolCall {
  name?: string;
}

interface ParsedToolResult {
  output?: string;
}

/**
 * Format SQLite message rows for LLM consumption.
 * Handles snake_case fields and JSON-encoded tool_calls/tool_results.
 */
export function formatMessagesForAnalysis(messages: SQLiteMessageRow[]): string {
  let userIndex = 0;
  let assistantIndex = 0;

  return messages
    .map((m) => {
      const role = m.type === 'user' ? 'User' : m.type === 'assistant' ? 'Assistant' : 'System';
      const roleLabel = role === 'User'
        ? `User#${userIndex++}`
        : role === 'Assistant'
          ? `Assistant#${assistantIndex++}`
          : 'System';

      // Parse JSON-encoded tool_calls
      let toolCalls: ParsedToolCall[] = [];
      try {
        toolCalls = m.tool_calls ? (JSON.parse(m.tool_calls) as ParsedToolCall[]) : [];
      } catch {
        toolCalls = [];
      }

      // Parse JSON-encoded tool_results
      let toolResults: ParsedToolResult[] = [];
      try {
        toolResults = m.tool_results ? (JSON.parse(m.tool_results) as ParsedToolResult[]) : [];
      } catch {
        toolResults = [];
      }

      const toolInfo = toolCalls.length > 0
        ? `\n[Tools used: ${toolCalls.map(t => t.name || 'unknown').join(', ')}]`
        : '';

      // Include thinking content — capped at 1000 chars to stay within token budget
      const thinkingInfo = m.thinking
        ? `\n[Thinking: ${m.thinking.slice(0, 1000)}]`
        : '';

      // Include tool results for context — 200 chars per result
      const resultInfo = toolResults.length > 0
        ? `\n[Tool results: ${toolResults.map(r => (r.output || '').slice(0, 200)).join(' | ')}]`
        : '';

      return `### ${roleLabel}:\n${m.content}${thinkingInfo}${toolInfo}${resultInfo}`;
    })
    .join('\n\n');
}

/**
 * System prompt for session analysis.
 */
export const SESSION_ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing software development conversations and extracting valuable insights. Your task is to analyze an AI coding session (a conversation between a user and an AI coding assistant) and extract structured insights.

You will identify:
1. **Summary**: A high-level narrative of what was accomplished
2. **Decisions**: Technical choices made, including reasoning and alternatives considered (max 3)
3. **Learnings**: Technical discoveries, gotchas, problem-solving approaches, debugging strategies, or transferable knowledge (max 5)

Quality Standards:
- Only include insights you would write in a team knowledge base for future reference
- Each insight MUST reference concrete details: specific file names, library names, error messages, API endpoints, or code patterns
- Do not invent file names, APIs, errors, or details not present in the conversation
- Rate your confidence in each insight's value (0-100). Only include insights you rate 70+.
- It is better to return 0 insights in a category than to include generic or trivial ones
- If a session is straightforward with no notable decisions or learnings, say so in the summary and leave other categories empty
- The summary must mention the most important concrete artifact changed (file, endpoint, or test) if any

DO NOT include insights like these (too generic/trivial):
- "Used debugging techniques to fix an issue"
- "Made architectural decisions about the codebase"
- "Implemented a new feature" (the summary already covers this)
- "Used React hooks for state management" (too generic without specifics)
- "Fixed a bug in the code" (what bug? what was the root cause?)
- Anything that restates the task without adding transferable knowledge

Respond with valid JSON only, wrapped in <json>...</json> tags. Do not include any other text.`;

/**
 * Generate the user prompt for session analysis.
 */
export function generateSessionAnalysisPrompt(
  projectName: string,
  sessionSummary: string | null,
  formattedMessages: string
): string {
  return `Analyze this AI coding session and extract insights.

Project: ${projectName}
${sessionSummary ? `Session Summary: ${sessionSummary}\n` : ''}
--- CONVERSATION ---
${formattedMessages}
--- END CONVERSATION ---

Extract insights in this JSON format:
{
  "summary": {
    "title": "Brief title describing main accomplishment (max 60 chars)",
    "content": "2-3 sentence narrative of what was accomplished",
    "bullets": ["Key point 1", "Key point 2", "Key point 3"]
  },
  "decisions": [
    {
      "title": "The specific decision made (max 60 chars)",
      "content": "Detailed explanation with concrete details",
      "reasoning": "Why this choice was made over alternatives",
      "alternatives": ["Alternative 1 considered", "Alternative 2 considered"],
      "confidence": 85,
      "evidence": ["User#4: ...", "Assistant#5: ..."]
    }
  ],
  "learnings": [
    {
      "title": "Specific thing learned (max 60 chars)",
      "content": "Detailed explanation with concrete details",
      "context": "When/where this applies and why it matters",
      "confidence": 80,
      "evidence": ["User#7: ...", "Assistant#8: ..."]
    }
  ]
}

Only include insights rated 70+ confidence. If you cannot cite evidence, drop the insight. Return empty arrays for categories with no strong insights. Max 3 decisions, 5 learnings.
Evidence should reference the labeled turns in the conversation (e.g., "User#2", "Assistant#5").

Respond with valid JSON only, wrapped in <json>...</json> tags. Do not include any other text.`;
}

export interface AnalysisResponse {
  summary: {
    title: string;
    content: string;
    bullets: string[];
  };
  decisions: Array<{
    title: string;
    content: string;
    reasoning: string;
    alternatives?: string[];
    confidence?: number;
    evidence?: string[];
  }>;
  learnings: Array<{
    title: string;
    content: string;
    context: string;
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

function buildResponsePreview(text: string, head = 200, tail = 200): string {
  if (text.length <= head + tail + 20) return text;
  return `${text.slice(0, head)}\n...[${text.length - head - tail} chars omitted]...\n${text.slice(-tail)}`;
}

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: ParseError };

function extractJsonPayload(response: string): string | null {
  const tagged = response.match(/<json>\s*([\s\S]*?)\s*<\/json>/i);
  if (tagged?.[1]) return tagged[1].trim();
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : null;
}

/**
 * Parse the LLM response into structured insights.
 */
export function parseAnalysisResponse(response: string): ParseResult<AnalysisResponse> {
  const response_length = response.length;

  const preview = buildResponsePreview(response);

  const jsonPayload = extractJsonPayload(response);
  if (!jsonPayload) {
    console.error('No JSON found in analysis response');
    return {
      success: false,
      error: { error_type: 'no_json_found', error_message: 'No JSON found in analysis response', response_length, response_preview: preview },
    };
  }

  let parsed: AnalysisResponse;
  try {
    parsed = JSON.parse(jsonPayload) as AnalysisResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to parse analysis response:', err);
    return {
      success: false,
      error: { error_type: 'json_parse_error', error_message: msg, response_length, response_preview: preview },
    };
  }

  if (!parsed.summary || typeof parsed.summary.title !== 'string') {
    console.error('Invalid analysis response structure');
    return {
      success: false,
      error: { error_type: 'invalid_structure', error_message: 'Missing or invalid summary field', response_length, response_preview: preview },
    };
  }

  parsed.decisions = parsed.decisions || [];
  parsed.learnings = parsed.learnings || [];

  return { success: true, data: parsed };
}

// --- Prompt Quality Analysis ---

export const PROMPT_QUALITY_SYSTEM_PROMPT = `You are an expert at analyzing how effectively humans communicate with AI coding assistants. Your task is to review a conversation between a user and Claude Code, and evaluate the user's prompting efficiency.

You will identify:
1. **Wasted turns**: User messages that led to clarifications, corrections, or repeated instructions because the original prompt was unclear, missing context, or too vague.
2. **Anti-patterns**: Recurring bad habits in the user's prompting style.
3. **Efficiency score**: A 0-100 rating of how optimally the user communicated.
4. **Actionable tips**: Specific improvements the user can make.

Guidelines:
- Focus on USER messages only — don't critique the assistant's responses
- A "wasted turn" is when the user had to send a follow-up message to clarify, correct, or repeat something that could have been included in the original prompt
- Only mark a wasted turn if the assistant explicitly asked for clarification or corrected a misunderstanding
- Common anti-patterns: vague instructions, missing file paths, not providing error messages, incomplete requirements, repeated instructions, not specifying what "it" refers to
- Be constructive, not judgmental — the goal is to help users improve
- Consider the context: some clarification exchanges are normal and expected
- A score of 100 means every user message was perfectly clear and complete
- A score of 50 means about half the messages could have been more efficient

Respond with valid JSON only, wrapped in <json>...</json> tags. Do not include any other text.`;

export function generatePromptQualityPrompt(
  projectName: string,
  formattedMessages: string,
  messageCount: number
): string {
  return `Analyze the user's prompting efficiency in this AI coding session.

Project: ${projectName}
Total messages: ${messageCount}

--- CONVERSATION ---
${formattedMessages}
--- END CONVERSATION ---

Evaluate the user's prompting quality and respond with this JSON format:
{
  "efficiencyScore": 75,
  "potentialMessageReduction": 3,
  "overallAssessment": "2-3 sentence summary of the user's prompting style and efficiency",
  "wastedTurns": [
    {
      "messageIndex": 5,
      "reason": "Missing context — didn't specify which file to modify",
      "suggestedRewrite": "A better version of the user's original message that would have avoided the follow-up"
    }
  ],
  "antiPatterns": [
    {
      "name": "Vague Instructions",
      "count": 3,
      "examples": ["fix it", "make it work", "do the thing"]
    }
  ],
  "tips": [
    "Always include file paths when asking to modify code",
    "Provide error messages verbatim when reporting bugs"
  ]
}

Rules:
- messageIndex refers to the 0-based index of the USER message, as labeled in the conversation (e.g., User#0)
- Only include genuinely wasted turns, not normal back-and-forth
- Tips should be specific and actionable, not generic; include the relevant user message index in parentheses
- If the user prompted well, say so — don't manufacture issues
- potentialMessageReduction is how many fewer messages the session could have taken with better prompts

Respond with valid JSON only, wrapped in <json>...</json> tags. Do not include any other text.`;
}

export interface WastedTurn {
  messageIndex: number;
  reason: string;
  suggestedRewrite: string;
}

export interface AntiPattern {
  name: string;
  count: number;
  examples: string[];
}

export interface PromptQualityResponse {
  efficiencyScore: number;
  potentialMessageReduction: number;
  overallAssessment: string;
  wastedTurns: WastedTurn[];
  antiPatterns: AntiPattern[];
  tips: string[];
}

export function parsePromptQualityResponse(response: string): ParseResult<PromptQualityResponse> {
  const response_length = response.length;

  const preview = buildResponsePreview(response);

  const jsonPayload = extractJsonPayload(response);
  if (!jsonPayload) {
    console.error('No JSON found in prompt quality response');
    return {
      success: false,
      error: { error_type: 'no_json_found', error_message: 'No JSON found in prompt quality response', response_length, response_preview: preview },
    };
  }

  let parsed: PromptQualityResponse;
  try {
    parsed = JSON.parse(jsonPayload) as PromptQualityResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to parse prompt quality response:', err);
    return {
      success: false,
      error: { error_type: 'json_parse_error', error_message: msg, response_length, response_preview: preview },
    };
  }

  if (typeof parsed.efficiencyScore !== 'number') {
    console.error('Invalid prompt quality response: missing efficiencyScore');
    return {
      success: false,
      error: { error_type: 'invalid_structure', error_message: 'Missing or invalid efficiencyScore field', response_length, response_preview: preview },
    };
  }

  parsed.efficiencyScore = Math.max(0, Math.min(100, Math.round(parsed.efficiencyScore)));
  parsed.potentialMessageReduction = parsed.potentialMessageReduction || 0;
  parsed.overallAssessment = parsed.overallAssessment || '';
  parsed.wastedTurns = parsed.wastedTurns || [];
  parsed.antiPatterns = parsed.antiPatterns || [];
  parsed.tips = parsed.tips || [];

  return { success: true, data: parsed };
}
