// Analysis prompts and response parsers for LLM session analysis.
// Ported from web repo (src/lib/llm/prompts.ts) with SQLite-aware message formatting.

import { jsonrepair } from 'jsonrepair';

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

      // Include tool results for context — 500 chars per result (error messages need ~300-400 chars)
      const resultInfo = toolResults.length > 0
        ? `\n[Tool results: ${toolResults.map(r => (r.output || '').slice(0, 500)).join(' | ')}]`
        : '';

      return `### ${roleLabel}:\n${m.content}${thinkingInfo}${toolInfo}${resultInfo}`;
    })
    .join('\n\n');
}

/**
 * System prompt for session analysis.
 */
export const SESSION_ANALYSIS_SYSTEM_PROMPT = `You are a senior staff engineer writing entries for a team's engineering knowledge base. You've just observed an AI-assisted coding session and your job is to extract the insights that would save another engineer time if they encountered a similar situation 6 months from now.

Your audience is a developer who has never seen this session but works on the same codebase. They need enough context to understand WHY a decision was made, WHAT specific gotcha was discovered, and WHEN this knowledge applies.

You will extract:
1. **Summary**: A narrative of what was accomplished and the outcome
2. **Decisions**: Technical choices made — with full situation context, reasoning, rejected alternatives, trade-offs, and conditions for revisiting (max 3)
3. **Learnings**: Technical discoveries, gotchas, debugging breakthroughs — with the observable symptom, root cause, and a transferable takeaway (max 5)

Quality Standards:
- Only include insights you would write in a team knowledge base for future reference
- Each insight MUST reference concrete details: specific file names, library names, error messages, API endpoints, or code patterns
- Do not invent file names, APIs, errors, or details not present in the conversation
- Rate your confidence in each insight's value (0-100). Only include insights you rate 70+.
- It is better to return 0 insights in a category than to include generic or trivial ones
- If a session is straightforward with no notable decisions or learnings, say so in the summary and leave other categories empty

Length Guidance:
- Fill every field in the schema. An empty "trade_offs" or "revisit_when" is worse than a longer response.
- Total response: stay under 2000 tokens. If you must cut, drop lower-confidence insights rather than compressing high-confidence ones.
- Evidence: 1-3 short quotes per insight, referencing turn labels.
- Prefer precision over brevity — a specific 3-sentence insight beats a vague 1-sentence insight.

DO NOT include insights like these (too generic/trivial):
- "Used debugging techniques to fix an issue"
- "Made architectural decisions about the codebase"
- "Implemented a new feature" (the summary already covers this)
- "Used React hooks for state management" (too generic without specifics)
- "Fixed a bug in the code" (what bug? what was the root cause?)
- Anything that restates the task without adding transferable knowledge

Here are examples of EXCELLENT insights — this is the quality bar:

EXCELLENT decision:
{
  "title": "Use better-sqlite3 instead of sql.js for local database",
  "situation": "Needed a SQLite driver for a Node.js CLI that stores session data locally. Single-user, read-heavy from dashboard, occasional writes during sync.",
  "choice": "better-sqlite3 — synchronous C++ binding with native SQLite access, no async overhead.",
  "reasoning": "CLI runs locally with no concurrent users. Synchronous API eliminates callback complexity. WAL mode provides concurrent read access for the dashboard while CLI writes.",
  "alternatives": [
    {"option": "sql.js (WASM build)", "rejected_because": "3x slower for bulk inserts, entire DB in memory, no WAL support"},
    {"option": "PostgreSQL via Docker", "rejected_because": "Violates local-first constraint — requires running a server process"}
  ],
  "trade_offs": "Requires native compilation (node-gyp) which can fail on some systems. No browser compatibility.",
  "revisit_when": "If multi-device sync is added or users report node-gyp build failures.",
  "confidence": 92,
  "evidence": ["User#3: 'We need something that works without a server'", "Assistant#4: 'better-sqlite3 with WAL mode gives concurrent reads...'"]
}

EXCELLENT learning:
{
  "title": "Tailwind v4 requires @theme inline{} for CSS variable utilities",
  "symptom": "After Tailwind v3→v4 upgrade, custom utilities like bg-primary stopped working. Classes present in HTML but no styles applied.",
  "root_cause": "Tailwind v4 removed tailwind.config.js theme extension. CSS variables in :root are not automatically available as utilities — must be registered via @theme inline {} in the CSS file.",
  "takeaway": "When migrating Tailwind v3→v4 with shadcn/ui: add @theme inline {} mapping CSS variables, add @custom-variant dark for class-based dark mode, replace tailwindcss-animate with tw-animate-css.",
  "applies_when": "Any Tailwind v3→v4 migration using CSS variables for theming, especially with shadcn/ui.",
  "confidence": 95,
  "evidence": ["User#12: 'The colors are all gone after the upgrade'", "Assistant#13: 'Tailwind v4 requires explicit @theme inline registration...'"]
}

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
    "title": "Brief title describing main accomplishment (max 80 chars)",
    "content": "2-4 sentence narrative: what was the goal, what was done, what was the outcome. Mention the primary file or component changed.",
    "outcome": "success | partial | abandoned | blocked",
    "bullets": ["Each bullet names a specific artifact (file, function, endpoint) and what changed"]
  },
  "decisions": [
    {
      "title": "The specific technical choice made (max 80 chars)",
      "situation": "What problem or requirement led to this decision point",
      "choice": "What was chosen and how it was implemented",
      "reasoning": "Why this choice was made — the key factors that tipped the decision",
      "alternatives": [
        {"option": "Name of alternative", "rejected_because": "Why it was not chosen"}
      ],
      "trade_offs": "What downsides were accepted, what was given up",
      "revisit_when": "Under what conditions this decision should be reconsidered (or 'N/A' if permanent)",
      "confidence": 85,
      "evidence": ["User#4: quoted text...", "Assistant#5: quoted text..."]
    }
  ],
  "learnings": [
    {
      "title": "Specific technical discovery or gotcha (max 80 chars)",
      "symptom": "What went wrong or was confusing — the observable behavior that triggered investigation",
      "root_cause": "The underlying technical reason — why it happened",
      "takeaway": "The transferable lesson — what to do or avoid in similar situations, useful outside this project",
      "applies_when": "Conditions under which this knowledge is relevant (framework version, configuration, etc.)",
      "confidence": 80,
      "evidence": ["User#7: quoted text...", "Assistant#8: quoted text..."]
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
  } catch {
    // Attempt repair — handles trailing commas, unclosed braces, truncated output
    try {
      parsed = JSON.parse(jsonrepair(jsonPayload)) as AnalysisResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to parse analysis response (after jsonrepair):', err);
      return {
        success: false,
        error: { error_type: 'json_parse_error', error_message: msg, response_length, response_preview: preview },
      };
    }
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

export const PROMPT_QUALITY_SYSTEM_PROMPT = `You are a prompt engineering coach helping developers communicate more effectively with AI coding assistants. You review conversations and identify specific moments where better prompting would have saved time.

You will identify:
1. **Wasted turns**: User messages that led to clarifications, corrections, or repeated instructions because the original prompt was unclear, missing context, or too vague.
2. **Anti-patterns**: Recurring bad habits in the user's prompting style, with specific fixes.
3. **Session traits**: Higher-level behavioral patterns about how the session was structured and managed.
4. **Efficiency score**: A 0-100 rating of how optimally the user communicated.
5. **Actionable tips**: Specific improvements the user can make.

Before evaluating, mentally walk through the conversation and identify:
1. Each time the assistant asked for clarification that could have been avoided
2. Each time the user corrected the assistant's interpretation
3. Each time the user repeated an instruction they gave earlier
4. Whether the session covers too many unrelated objectives (context drift / session bloat)
5. Whether the user provided critical context or requirements late that should have been mentioned upfront
6. Whether the user discussed the plan/approach before jumping into implementation, or dove straight into code
These are your candidate findings. Only include them if they are genuinely actionable.

Guidelines:
- Focus on USER messages only — don't critique the assistant's responses
- A "wasted turn" is when the user had to send a follow-up message to clarify, correct, or repeat something that could have been included in the original prompt
- Only mark a wasted turn if the assistant explicitly asked for clarification or corrected a misunderstanding
- Be constructive, not judgmental — the goal is to help users improve
- Consider the context: some clarification exchanges are normal and expected
- A score of 100 means every user message was perfectly clear and complete
- A score of 50 means about half the messages could have been more efficient

Length Guidance:
- Max 5 wasted turns, max 3 anti-patterns, max 3 session traits, max 5 tips
- suggestedRewrite must be a complete, usable prompt — not vague meta-advice
- overallAssessment: 2-3 sentences
- Total response: stay under 2000 tokens

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
      "originalMessage": "The user's original message (abbreviated if long)",
      "whatWentWrong": "What information was missing or ambiguous that caused a follow-up",
      "suggestedRewrite": "A concrete rewrite that includes the missing context — must be a complete, usable prompt",
      "turnsWasted": 2
    }
  ],
  "antiPatterns": [
    {
      "name": "Vague Instructions",
      "description": "Requests that lack specificity about what file, function, or behavior to change",
      "count": 3,
      "examples": ["User#2: 'fix it'", "User#5: 'make it work'"],
      "fix": "Include the file path, function name, and expected vs actual behavior in the initial request"
    }
  ],
  "sessionTraits": [
    {
      "trait": "context_drift | objective_bloat | late_context | no_planning | good_structure",
      "severity": "high | medium | low",
      "description": "What was observed and why it matters",
      "evidence": "User#3 switched from auth to styling, then back to auth at User#12",
      "suggestion": "Break into separate sessions: one for auth, one for styling"
    }
  ],
  "tips": [
    "Always include file paths when asking to modify code",
    "Provide error messages verbatim when reporting bugs"
  ]
}

Session trait definitions:
- **context_drift**: Session covers too many unrelated objectives, causing the AI to lose context and produce lower quality output
- **objective_bloat**: Too many different tasks crammed into one session instead of focused, single-purpose sessions
- **late_context**: Critical requirements, constraints, or context provided late in the conversation that should have been mentioned upfront — causing rework or wasted turns
- **no_planning**: User jumped straight into implementation without discussing approach, requirements, or plan — leading to course corrections mid-session
- **good_structure**: Session was well-structured with clear objectives, upfront context, and logical flow (only include this if truly exemplary)

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
  originalMessage?: string;
  whatWentWrong?: string;
  suggestedRewrite: string;
  turnsWasted?: number;
}

export interface AntiPattern {
  name: string;
  description?: string;
  count: number;
  examples: string[];
  fix?: string;
}

export interface SessionTrait {
  trait: 'context_drift' | 'objective_bloat' | 'late_context' | 'no_planning' | 'good_structure';
  severity: 'high' | 'medium' | 'low';
  description: string;
  evidence?: string;
  suggestion?: string;
}

export interface PromptQualityResponse {
  efficiencyScore: number;
  potentialMessageReduction: number;
  overallAssessment: string;
  wastedTurns: WastedTurn[];
  antiPatterns: AntiPattern[];
  sessionTraits: SessionTrait[];
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
  } catch {
    try {
      parsed = JSON.parse(jsonrepair(jsonPayload)) as PromptQualityResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to parse prompt quality response (after jsonrepair):', err);
      return {
        success: false,
        error: { error_type: 'json_parse_error', error_message: msg, response_length, response_preview: preview },
      };
    }
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
  parsed.sessionTraits = parsed.sessionTraits || [];
  parsed.tips = parsed.tips || [];

  return { success: true, data: parsed };
}
