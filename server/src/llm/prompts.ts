// Analysis prompts and response parsers for LLM session analysis.
// Ported from web repo (src/lib/llm/prompts.ts) with SQLite-aware message formatting.

import { jsonrepair } from 'jsonrepair';
import type { SessionCharacter } from '@code-insights/cli/types';

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

// Shared guidance for friction category and attribution classification.
// Contrastive pairs help the LLM distinguish similar categories.
// Attribution field captures who contributed to the friction for actionability.
export const FRICTION_CLASSIFICATION_GUIDANCE = `
FRICTION CLASSIFICATION GUIDANCE:

Each friction point captures WHAT went wrong (category + description) and WHO contributed (attribution).

CATEGORIES — classify the TYPE of friction:
- "wrong-approach": AI pursued a strategy that didn't fit the task — wrong architecture, wrong tool, wrong pattern
- "knowledge-gap": AI applied incorrect knowledge about a library, API, framework, or language feature
- "stale-assumptions": AI worked from assumptions about current state that were incorrect (stale files, changed config, different environment)
- "incomplete-requirements": AI worked from instructions missing critical context, constraints, or acceptance criteria
- "context-loss": AI lost track of prior decisions or constraints established earlier in the session
- "scope-creep": AI expanded work beyond the boundaries of the stated task
- "repeated-mistakes": AI made the same or similar error multiple times despite correction
- "documentation-gap": Relevant docs existed but were inaccessible during the session
- "tooling-limitation": The tool genuinely lacked a needed capability

"tooling-limitation" PRECISION — do NOT use for:
- Agent orchestration failures (spawning, communication) → "agent-orchestration-failure"
- Wrong commands that get self-corrected → "wrong-approach"
- API rate limits → "rate-limit-hit"
- User-rejected tool calls → not friction (omit)

ATTRIBUTION — classify WHO contributed to the friction:
- "user-actionable": Better user input would likely have prevented this. Evidence: vague prompt, missing context, no constraints specified, late intervention, or ambiguous correction.
- "ai-capability": AI failed despite adequate user input. Evidence: user gave clear instructions that the AI ignored, misread, or failed to follow.
- "environmental": Neither user nor AI could have prevented this — tooling limits, missing docs, infrastructure issues.

Decision logic:
1. Is the cause external to the user-AI interaction? → "environmental"
2. Was the user's input before the friction vague, missing context, or lacking constraints? → "user-actionable"
3. Was the user's input clear and the AI still failed? → "ai-capability"
When genuinely mixed, lean "user-actionable" — this tool helps users improve.

DESCRIPTION — write a neutral one-sentence description of what happened. Include specific details (file names, APIs, error messages). Do NOT assign blame in the description — let the attribution field carry that.

When no category fits, create a specific kebab-case category. A precise novel category is better than a vague canonical one.`;

export const CANONICAL_FRICTION_CATEGORIES = [
  'wrong-approach',
  'knowledge-gap',
  'stale-assumptions',
  'incomplete-requirements',
  'context-loss',
  'scope-creep',
  'repeated-mistakes',
  'documentation-gap',
  'tooling-limitation',
] as const;

export const CANONICAL_PATTERN_CATEGORIES = [
  'structured-planning',
  'incremental-implementation',
  'verification-workflow',
  'systematic-debugging',
  'self-correction',
  'context-gathering',
  'domain-expertise',
  'effective-tooling',
] as const;

export const CANONICAL_PQ_DEFICIT_CATEGORIES = [
  'vague-request',
  'missing-context',
  'late-constraint',
  'unclear-correction',
  'scope-drift',
  'missing-acceptance-criteria',
  'assumption-not-surfaced',
] as const;

export const CANONICAL_PQ_STRENGTH_CATEGORIES = [
  'precise-request',
  'effective-context',
  'productive-correction',
] as const;

export const CANONICAL_PQ_CATEGORIES = [
  ...CANONICAL_PQ_DEFICIT_CATEGORIES,
  ...CANONICAL_PQ_STRENGTH_CATEGORIES,
] as const;

export const PROMPT_QUALITY_CLASSIFICATION_GUIDANCE = `
PROMPT QUALITY CLASSIFICATION GUIDANCE:

Each finding captures a specific moment where the user's prompting either caused friction (deficit) or enabled productivity (strength).

DEFICIT CATEGORIES — classify prompting problems:
- "vague-request": Request lacked specificity needed for the AI to act without guessing. Missing file paths, function names, expected behavior, or concrete details.
  NOT this category if the AI had enough context to succeed but failed anyway — that is an AI capability issue, not a prompting issue.

- "missing-context": Critical background knowledge about architecture, conventions, dependencies, or current state was not provided.
  NOT this category if the information was available in the codebase and the AI could have found it by reading files — that is an AI context-gathering failure.

- "late-constraint": A requirement or constraint was provided AFTER the AI had already started implementing a different approach, causing rework.
  NOT this category if the constraint was genuinely discovered during implementation (requirements changed). Only classify if the user KNEW the constraint before the session started.

- "unclear-correction": The user told the AI its output was wrong without explaining what was wrong or why. "That's not right", "try again", "no" without context.
  NOT this category if the user gave a brief but sufficient correction ("use map instead of forEach" is clear enough).

- "scope-drift": The session objective shifted mid-conversation, or multiple unrelated objectives were addressed in one session.
  NOT this category if the user is working through logically connected subtasks of one objective.

- "missing-acceptance-criteria": The user did not define what successful completion looks like, leading to back-and-forth about whether the output meets expectations.
  NOT this category for exploratory sessions where the user is discovering what they want.

- "assumption-not-surfaced": The user held an unstated assumption that the AI could not reasonably infer from code or conversation.
  NOT this category if the assumption was reasonable for the AI to make (e.g., standard coding conventions).

STRENGTH CATEGORIES — classify prompting successes (only when notably above average):
- "precise-request": Request included enough specificity (file paths, function names, expected behavior, error messages) that the AI could act correctly on the first attempt.

- "effective-context": User proactively shared architecture, conventions, prior decisions, or current state that the AI demonstrably used to make better decisions.

- "productive-correction": When the AI went off track, the user provided a correction that included WHAT was wrong, WHY, and enough context for the AI to redirect effectively on the next response.

CONTRASTIVE PAIRS:
- vague-request vs missing-context: Was the problem in HOW THE TASK WAS DESCRIBED (vague-request) or WHAT BACKGROUND KNOWLEDGE WAS ABSENT (missing-context)?
- late-constraint vs missing-context: Did the user EVENTUALLY provide it in the same session? Yes → late-constraint. Never → missing-context.
- missing-context vs assumption-not-surfaced: Is this a FACT the user could have copy-pasted (missing-context), or a BELIEF/PREFERENCE they held (assumption-not-surfaced)?
- scope-drift vs missing-acceptance-criteria: Did the user try to do TOO MANY THINGS (scope-drift) or ONE THING WITHOUT DEFINING SUCCESS (missing-acceptance-criteria)?
- unclear-correction vs vague-request: Was this the user's FIRST MESSAGE about this task (vague-request) or a RESPONSE TO AI OUTPUT (unclear-correction)?

DIMENSION SCORING (0-100):
- context_provision: How well did the user provide relevant background upfront?
  90+: Proactively shared architecture, constraints, conventions. 50-69: Notable gaps causing detours. <30: No context, AI working blind.
- request_specificity: How precise were task requests?
  90+: File paths, expected behavior, scope boundaries. 50-69: Mix of specific and vague. <30: Nearly all requests lacked detail.
- scope_management: How focused was the session?
  90+: Single clear objective, logical progression. 50-69: Some drift but primary goal met. <30: Unfocused, no clear objective.
- information_timing: Were requirements provided when needed?
  90+: All constraints front-loaded before implementation. 50-69: Some important requirements late. <30: Requirements drip-fed, constant corrections.
- correction_quality: How well did the user redirect the AI?
  90+: Corrections included what, why, and context. 50-69: Mix of clear and unclear. <30: Corrections gave almost no signal.
  Score 75 if no corrections were needed (absence of corrections in a successful session = good prompting).

EDGE CASES:
- Short sessions (<5 user messages): Score conservatively. Do not penalize for missing elements unnecessary in quick tasks.
- Exploration sessions: Do not penalize for missing acceptance criteria or scope drift.
- Sessions where AI performed well despite vague prompts: Still classify deficits. Impact should be "low" since no visible cost.`;

export const EFFECTIVE_PATTERN_CLASSIFICATION_GUIDANCE = `
EFFECTIVE PATTERN CLASSIFICATION GUIDANCE:

Each effective pattern captures a technique or approach that contributed to a productive session outcome.

CATEGORIES — classify the TYPE of effective pattern:
- "structured-planning": User or AI decomposed the task into explicit steps, defined scope boundaries, or established an implementation plan BEFORE writing code. In-session signal: a plan, task list, or scope definition appears in the conversation before implementation begins.
- "incremental-implementation": Work progressed in small, verifiable steps rather than a monolithic change. Each step was validated before moving to the next. In-session signal: multiple small edits with verification between them, not one large batch of changes.
- "verification-workflow": Proactive correctness checks — running builds, tests, linters, or type checks — BEFORE considering the work complete. In-session signal: tool calls to build/test/lint commands followed by reviewing output, when nothing was known to be broken.
- "systematic-debugging": Methodical investigation of a problem using structured techniques: binary search, log insertion, reproduction isolation, expected-vs-actual comparison. In-session signal: multiple targeted diagnostic steps rather than random guessing.
- "self-correction": The AI recognized it was on a wrong path and changed approach WITHOUT the user pointing out the error. In-session signal: the AI explicitly acknowledges a mistake or wrong direction in its response and pivots to a different approach. NOT this category if the user corrected the AI — that is normal interaction, not self-correction.
- "context-gathering": Actively reading existing code, documentation, schemas, types, or configuration BEFORE making changes. In-session signal: Read/Grep/Glob/search tool calls at the start of a task, before any Edit/Write calls.
- "domain-expertise": Applying specific framework, library, API, or language knowledge correctly on first attempt, WITHOUT needing to search or experiment. In-session signal: correct usage of non-obvious APIs or patterns with no preceding search and no subsequent error. NOT this category if the AI read docs or code first — that is context-gathering, even if domain knowledge was also needed.
- "effective-tooling": Leveraging tool-specific capabilities that multiplied productivity — agent delegation, parallel work, multi-file edits, specialized commands, strategic mode selection (chat vs edit vs agent). In-session signal: use of advanced tool features beyond basic read/write/edit.

CONTRASTIVE PAIRS — use these to disambiguate confusable categories:
- structured-planning vs incremental-implementation: Planning is about DECIDING what to do (before implementation). Incremental is about HOW you execute (during implementation). A session can have planning without incremental execution, or incremental execution without upfront planning.
- context-gathering vs domain-expertise: Context-gathering involves ACTIVE INVESTIGATION (reading files, searching docs, exploring schemas). Domain-expertise involves APPLYING EXISTING KNOWLEDGE without investigation. If the AI read a file or searched before acting, classify as context-gathering even if domain knowledge was also required.
- verification-workflow vs systematic-debugging: Verification is PROACTIVE (checking that working code still works, running tests before moving on). Debugging is REACTIVE (investigating something that is broken, diagnosing a failure).
- self-correction vs user-directed correction: Self-correction means the AI caught its OWN mistake unprompted. If the user said "that's wrong" or "try a different approach," any subsequent pivot is normal interaction, NOT self-correction.

DRIVER — classify WHO drove this pattern:
- "user-driven": The user explicitly initiated this pattern (asked for a plan, requested tests, directed the investigation, specified the tool or approach).
- "ai-driven": The AI exhibited this pattern without user prompting (self-corrected, proactively ran tests, applied expertise without being asked to, independently explored the codebase).
- "collaborative": Both contributed, or the pattern emerged naturally from the interaction (user described the problem, AI chose the debugging methodology; user asked for a feature, AI chose to work incrementally).
When uncertain between user-driven and ai-driven, prefer the more specific label. Use "collaborative" only when BOTH the user AND the AI made distinct, identifiable contributions to this pattern.

When no canonical category fits, create a specific kebab-case category (a precise novel category is better than forcing a poor fit).`;

/**
 * System prompt for session analysis.
 */
export const SESSION_ANALYSIS_SYSTEM_PROMPT = `You are a senior staff engineer writing entries for a team's engineering knowledge base. You've just observed an AI-assisted coding session and your job is to extract the insights that would save another engineer time if they encountered a similar situation 6 months from now.

Your audience is a developer who has never seen this session but works on the same codebase. They need enough context to understand WHY a decision was made, WHAT specific gotcha was discovered, and WHEN this knowledge applies.

PART 1 — SESSION FACETS (extract these first as a holistic session assessment):

Before extracting individual insights, assess the session as a whole. Extract these structured facets:

1. outcome_satisfaction: Rate the session outcome.
   - "high": Task completed successfully, user satisfied
   - "medium": Partial completion or minor issues
   - "low": Significant problems, user frustrated
   - "abandoned": Session ended without achieving the goal

2. workflow_pattern: Identify the dominant workflow pattern (or null if unclear).
   Recommended values: "plan-then-implement", "iterative-refinement", "debug-fix-verify", "explore-then-build", "direct-execution"

3. friction_points: Identify up to 5 moments where progress was blocked or slowed (array, max 5).
   Each friction point has:
   - category: Use one of these PREFERRED categories when applicable: ${CANONICAL_FRICTION_CATEGORIES.join(', ')}. Create a new kebab-case category only when none of these fit.
   - attribution: "user-actionable" (better user input would have prevented this), "ai-capability" (AI failed despite adequate input), or "environmental" (external constraint)
   - description: One neutral sentence describing what happened, with specific details (file names, APIs, errors)
   - severity: "high" (blocked progress for multiple turns), "medium" (caused a detour), "low" (minor hiccup)
   - resolution: "resolved" (fixed in session), "workaround" (bypassed), "unresolved" (still broken)
${FRICTION_CLASSIFICATION_GUIDANCE}

4. effective_patterns: Up to 3 techniques or approaches that worked particularly well (array, max 3).
   Each has:
   - category: Use one of these PREFERRED categories when applicable: structured-planning, incremental-implementation, verification-workflow, systematic-debugging, self-correction, context-gathering, domain-expertise, effective-tooling. Create a new kebab-case category only when none fit.
   - description: Specific technique worth repeating (1-2 sentences with concrete detail)
   - confidence: 0-100 how confident you are this is genuinely effective
   - driver: Who drove this pattern — "user-driven" (user explicitly requested it), "ai-driven" (AI exhibited it without prompting), or "collaborative" (both contributed or emerged from interaction)
${EFFECTIVE_PATTERN_CLASSIFICATION_GUIDANCE}

5. had_course_correction: true if the user redirected the AI from a wrong approach, false otherwise
6. course_correction_reason: If had_course_correction is true, briefly explain what was corrected (or null)
7. iteration_count: Number of times the user had to clarify, correct, or re-explain something

If the session has minimal friction and straightforward execution, use empty arrays for friction_points, set outcome_satisfaction to "high", and iteration_count to 0.

PART 2 — INSIGHTS (then extract these):

You will extract:
1. **Summary**: A narrative of what was accomplished and the outcome
2. **Decisions**: Technical choices made — with full situation context, reasoning, rejected alternatives, trade-offs, and conditions for revisiting (max 3)
3. **Learnings**: Technical discoveries, gotchas, debugging breakthroughs — with the observable symptom, root cause, and a transferable takeaway (max 5)
4. **Session Character**: Classify the session into exactly one of these types based on its overall nature:
   - deep_focus: Long, concentrated work on a specific problem or area (50+ messages, deep into one topic)
   - bug_hunt: Debugging-driven — investigating errors, tracing issues, fixing bugs
   - feature_build: Building new functionality — creating files, adding endpoints, wiring components
   - exploration: Research-oriented — reading code, searching, understanding before acting
   - refactor: Restructuring existing code — renaming, moving, reorganizing without new features
   - learning: Knowledge-seeking — asking questions, understanding concepts, getting explanations
   - quick_task: Short and focused — small fix, config change, or one-off task (<10 messages)

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
  "facets": {
    "outcome_satisfaction": "high | medium | low | abandoned",
    "workflow_pattern": "plan-then-implement | iterative-refinement | debug-fix-verify | explore-then-build | direct-execution | null",
    "had_course_correction": false,
    "course_correction_reason": null,
    "iteration_count": 0,
    "friction_points": [
      {
        "category": "kebab-case-category",
        "attribution": "user-actionable | ai-capability | environmental",
        "description": "One neutral sentence about what happened, with specific details",
        "severity": "high | medium | low",
        "resolution": "resolved | workaround | unresolved"
      }
    ],
    "effective_patterns": [
      {
        "category": "structured-planning",
        "description": "Broke the migration into 3 phases: schema change, data backfill, API update",
        "confidence": 85,
        "driver": "user-driven | ai-driven | collaborative"
      }
    ]
  },
  "session_character": "deep_focus | bug_hunt | feature_build | exploration | refactor | learning | quick_task",
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

const VALID_SESSION_CHARACTERS = new Set<string>([
  'deep_focus', 'bug_hunt', 'feature_build', 'exploration', 'refactor', 'learning', 'quick_task',
]);

export interface AnalysisResponse {
  facets?: {
    outcome_satisfaction: string;
    workflow_pattern: string | null;
    had_course_correction: boolean;
    course_correction_reason: string | null;
    iteration_count: number;
    friction_points: Array<{
      category: string;
      attribution?: string;
      description: string;
      severity: string;
      resolution: string;
    }>;
    effective_patterns: Array<{
      category: string;
      description: string;
      confidence: number;
      driver?: 'user-driven' | 'ai-driven' | 'collaborative';
    }>;
  };
  session_character?: SessionCharacter;
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

export function extractJsonPayload(response: string): string | null {
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

  // Validate session_character — drop if not a recognized value
  if (parsed.session_character && !VALID_SESSION_CHARACTERS.has(parsed.session_character)) {
    parsed.session_character = undefined;
  }

  // Observability: warn when LLM still uses "tooling-limitation".
  // Monitors whether FRICTION_CLASSIFICATION_GUIDANCE is working.
  // Remove after confirming classification quality over ~20 new sessions.
  if (parsed.facets?.friction_points?.some(fp => fp.category === 'tooling-limitation')) {
    console.warn('[friction-monitor] LLM classified friction as "tooling-limitation" — verify this is a genuine tool limitation, not an agent/rate-limit/approach issue');
  }

  // Observability: warn when LLM returns effective_pattern without category or driver field,
  // or with an unrecognized driver value.
  // Catches models that ignore the classification instructions (especially smaller Ollama models).
  // Remove after confirming classification quality over ~20 new sessions.
  if (parsed.facets?.effective_patterns?.some(ep => !ep.category)) {
    console.warn('[pattern-monitor] LLM returned effective_pattern without category field');
  }
  if (parsed.facets?.effective_patterns?.some(ep => !ep.driver)) {
    console.warn('[pattern-monitor] LLM returned effective_pattern without driver field — driver classification may be incomplete');
  }
  const VALID_DRIVERS = new Set(['user-driven', 'ai-driven', 'collaborative']);
  if (parsed.facets?.effective_patterns?.some(ep => ep.driver && !VALID_DRIVERS.has(ep.driver))) {
    console.warn('[pattern-monitor] LLM returned unexpected driver value — check classification quality');
  }

  return { success: true, data: parsed };
}

/**
 * Lightweight facet-only prompt for backfilling sessions that already have insights
 * or for chunked sessions where facets can't be merged across chunks.
 * Input: session summary + first/last 20 messages (~2.5k tokens).
 * Output: facet JSON only (~350 tokens).
 */
export const FACET_ONLY_SYSTEM_PROMPT = `You are assessing an AI coding session to extract structured metadata for cross-session pattern analysis. You will receive a session summary and a sample of messages (first and last from the conversation).

Extract session facets — a holistic assessment of how the session went:

1. outcome_satisfaction: "high" (completed successfully), "medium" (partial), "low" (problems), "abandoned" (gave up)
2. workflow_pattern: The dominant pattern, or null. Values: "plan-then-implement", "iterative-refinement", "debug-fix-verify", "explore-then-build", "direct-execution"
3. friction_points: Up to 5 moments where progress stalled (array).
   Each: { category (kebab-case, prefer: ${CANONICAL_FRICTION_CATEGORIES.join(', ')}), attribution ("user-actionable"|"ai-capability"|"environmental"), description (one neutral sentence with specific details), severity ("high"|"medium"|"low"), resolution ("resolved"|"workaround"|"unresolved") }
${FRICTION_CLASSIFICATION_GUIDANCE}
4. effective_patterns: Up to 3 things that worked well (array).
   Each: { category (kebab-case, prefer: ${CANONICAL_PATTERN_CATEGORIES.join(', ')}), description (specific technique, 1-2 sentences), confidence (0-100), driver ("user-driven"|"ai-driven"|"collaborative") }
${EFFECTIVE_PATTERN_CLASSIFICATION_GUIDANCE}
5. had_course_correction: true/false — did the user redirect the AI?
6. course_correction_reason: Brief explanation if true, null otherwise
7. iteration_count: How many user clarification/correction cycles occurred

Respond with valid JSON only, wrapped in <json>...</json> tags.`;

export function generateFacetOnlyPrompt(
  projectName: string,
  sessionSummary: string | null,
  firstMessages: string,
  lastMessages: string
): string {
  return `Assess this AI coding session and extract facets.

Project: ${projectName}
${sessionSummary ? `Session Summary: ${sessionSummary}\n` : ''}
--- FIRST MESSAGES ---
${firstMessages}
--- END FIRST MESSAGES ---

--- LAST MESSAGES ---
${lastMessages}
--- END LAST MESSAGES ---

Extract facets in this JSON format:
{
  "outcome_satisfaction": "high | medium | low | abandoned",
  "workflow_pattern": "string or null",
  "had_course_correction": false,
  "course_correction_reason": null,
  "iteration_count": 0,
  "friction_points": [],
  "effective_patterns": [
    { "category": "kebab-case-category", "description": "technique", "confidence": 85, "driver": "user-driven | ai-driven | collaborative" }
  ]
}

Respond with valid JSON only, wrapped in <json>...</json> tags.`;
}

// --- Prompt Quality Analysis ---

export const PROMPT_QUALITY_SYSTEM_PROMPT = `You are a prompt engineering coach helping developers communicate more effectively with AI coding assistants. You review conversations and identify specific moments where better prompting would have saved time — AND moments where the user prompted particularly well.

You will produce:
1. **Takeaways**: Concrete before/after examples the user can learn from (max 4)
2. **Findings**: Categorized findings for cross-session aggregation (max 8)
3. **Dimension scores**: 5 numeric dimensions for progress tracking
4. **Efficiency score**: 0-100 overall rating
5. **Assessment**: 2-3 sentence summary

Before evaluating, mentally walk through the conversation and identify:
1. Each time the assistant asked for clarification that could have been avoided
2. Each time the user corrected the assistant's interpretation
3. Each time the user repeated an instruction they gave earlier
4. Whether critical context or requirements were provided late
5. Whether the user discussed the plan/approach before implementation
6. Moments where the user's prompt was notably well-crafted
These are your candidate findings. Only include them if they are genuinely actionable.

${PROMPT_QUALITY_CLASSIFICATION_GUIDANCE}

Guidelines:
- Focus on USER messages only — don't critique the assistant's responses
- Be constructive, not judgmental — the goal is to help users improve
- A score of 100 means every user message was perfectly clear and complete
- A score of 50 means about half the messages could have been more efficient
- Include BOTH deficits and strengths — what went right matters as much as what went wrong
- If the user prompted well, say so — don't manufacture issues

Length Guidance:
- Max 4 takeaways (ordered: improve first, then reinforce), max 8 findings
- better_prompt must be a complete, usable prompt — not vague meta-advice
- assessment: 2-3 sentences
- Total response: stay under 2500 tokens

Respond with valid JSON only, wrapped in <json>...</json> tags. Do not include any other text.`;

export function generatePromptQualityPrompt(
  projectName: string,
  formattedMessages: string,
  messageCount: number
): string {
  return `Analyze the user's prompting quality in this AI coding session.

Project: ${projectName}
Total messages: ${messageCount}

--- CONVERSATION ---
${formattedMessages}
--- END CONVERSATION ---

Evaluate the user's prompting quality and respond with this JSON format:
{
  "efficiency_score": 75,
  "message_overhead": 3,
  "assessment": "2-3 sentence summary of prompting style and efficiency",
  "takeaways": [
    {
      "type": "improve",
      "category": "late-constraint",
      "label": "Short human-readable heading",
      "message_ref": "User#5",
      "original": "The user's original message (abbreviated)",
      "better_prompt": "A concrete rewrite with the missing context included",
      "why": "One sentence: why the original caused friction"
    },
    {
      "type": "reinforce",
      "category": "precise-request",
      "label": "Short human-readable heading",
      "message_ref": "User#0",
      "what_worked": "What the user did well",
      "why_effective": "Why it led to a good outcome"
    }
  ],
  "findings": [
    {
      "category": "late-constraint",
      "type": "deficit",
      "description": "One neutral sentence with specific details",
      "message_ref": "User#5",
      "impact": "high",
      "confidence": 90,
      "suggested_improvement": "Concrete rewrite or behavioral change"
    },
    {
      "category": "precise-request",
      "type": "strength",
      "description": "One sentence describing what the user did well",
      "message_ref": "User#0",
      "impact": "medium",
      "confidence": 85
    }
  ],
  "dimension_scores": {
    "context_provision": 70,
    "request_specificity": 65,
    "scope_management": 80,
    "information_timing": 55,
    "correction_quality": 75
  }
}

Category values — use these PREFERRED categories:
Deficits: ${CANONICAL_PQ_DEFICIT_CATEGORIES.join(', ')}
Strengths: ${CANONICAL_PQ_STRENGTH_CATEGORIES.join(', ')}
Create a new kebab-case category only when none of these fit.

Rules:
- message_ref uses the labeled turns in the conversation (e.g., "User#0", "User#5")
- Only include genuinely notable findings, not normal back-and-forth
- Takeaways are the user-facing highlights — max 4, ordered: improve first, then reinforce
- Findings are the full categorized set for aggregation — max 8
- If the user prompted well, include strength findings and reinforce takeaways — don't manufacture issues
- message_overhead is how many fewer messages the session could have taken with better prompts
- dimension_scores: each 0-100. Score correction_quality as 75 if no corrections were needed.

Respond with valid JSON only, wrapped in <json>...</json> tags. Do not include any other text.`;
}

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
      console.error('Failed to parse prompt quality response (after jsonrepair):', msg);
      return {
        success: false,
        error: { error_type: 'json_parse_error', error_message: msg, response_length, response_preview: preview },
      };
    }
  }

  if (typeof parsed.efficiency_score !== 'number') {
    console.error('Invalid prompt quality response: missing efficiency_score');
    return {
      success: false,
      error: { error_type: 'invalid_structure', error_message: 'Missing or invalid efficiency_score field', response_length, response_preview: preview },
    };
  }

  // Clamp and default
  parsed.efficiency_score = Math.max(0, Math.min(100, Math.round(parsed.efficiency_score)));
  parsed.message_overhead = parsed.message_overhead || 0;
  parsed.assessment = parsed.assessment || '';
  parsed.takeaways = parsed.takeaways || [];
  parsed.findings = parsed.findings || [];
  parsed.dimension_scores = parsed.dimension_scores || {
    context_provision: 50,
    request_specificity: 50,
    scope_management: 50,
    information_timing: 50,
    correction_quality: 50,
  };

  // Clamp dimension scores
  for (const key of Object.keys(parsed.dimension_scores) as Array<keyof PromptQualityDimensionScores>) {
    parsed.dimension_scores[key] = Math.max(0, Math.min(100, Math.round(parsed.dimension_scores[key] || 50)));
  }

  // Observability: warn when findings missing category
  if (parsed.findings.some(f => !f.category)) {
    console.warn('[pq-monitor] LLM returned finding without category field');
  }

  return { success: true, data: parsed };
}
