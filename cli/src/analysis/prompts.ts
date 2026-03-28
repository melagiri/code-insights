// Prompt template strings and generator functions for LLM session analysis.
// Types → prompt-types.ts, constants → prompt-constants.ts,
// formatting → message-format.ts, parsers → response-parsers.ts.

import type { SessionMetadata, ContentBlock } from './prompt-types.js';
import {
  FRICTION_CLASSIFICATION_GUIDANCE,
  CANONICAL_FRICTION_CATEGORIES,
  CANONICAL_PATTERN_CATEGORIES,
  CANONICAL_PQ_DEFICIT_CATEGORIES,
  CANONICAL_PQ_STRENGTH_CATEGORIES,
  PROMPT_QUALITY_CLASSIFICATION_GUIDANCE,
  EFFECTIVE_PATTERN_CLASSIFICATION_GUIDANCE,
} from './prompt-constants.js';
import { formatSessionMetaLine } from './message-format.js';

// =============================================================================
// SHARED SYSTEM PROMPT
// A minimal (~100 token) system prompt shared by all analysis calls.
// The full classification guidance and schema examples live in the instruction
// suffix (user[1]), keeping the system prompt cacheable across calls.
// =============================================================================

/**
 * Shared system prompt for all LLM analysis calls.
 * Paired with buildCacheableConversationBlock() + an analysis-specific instruction block.
 */
export const SHARED_ANALYST_SYSTEM_PROMPT = `You are a senior staff engineer analyzing an AI coding session. You will receive the conversation transcript followed by specific extraction instructions. Respond with valid JSON only, wrapped in <json>...</json> tags.`;

// =============================================================================
// CACHEABLE CONVERSATION BLOCK
// Wraps the formatted conversation in an Anthropic ephemeral cache block.
// CRITICAL: Must contain ONLY the formatted messages — no project name, no session
// metadata, no per-session variables. This ensures cache hits across sessions.
// =============================================================================

/**
 * Wrap formatted conversation messages in a cacheable content block.
 * The cache_control field instructs Anthropic to cache everything up to
 * and including this block (ephemeral, 5-minute TTL).
 *
 * Non-Anthropic providers receive this as a ContentBlock[] and use
 * flattenContent() to convert it to a plain string.
 *
 * @param formattedMessages - Output of formatMessagesForAnalysis()
 */
export function buildCacheableConversationBlock(formattedMessages: string): ContentBlock {
  return {
    type: 'text',
    // Trailing double newline ensures the instruction block (user[1]) reads as a
    // distinct section when providers flatten content blocks to a single string.
    text: `--- CONVERSATION ---\n${formattedMessages}\n--- END CONVERSATION ---\n\n`,
    cache_control: { type: 'ephemeral' },
  };
}

// =============================================================================
// SESSION ANALYSIS INSTRUCTIONS
// The instruction suffix for session analysis calls (user[1]).
// Contains the full analyst persona, schema, and quality guidance.
// Per-session variables (project name, summary, meta) go here — NOT in the
// cached conversation block.
// =============================================================================

/**
 * Build the instruction suffix for session analysis.
 * Used as the second content block in the user message, after the cached conversation.
 */
export function buildSessionAnalysisInstructions(
  projectName: string,
  sessionSummary: string | null,
  meta?: SessionMetadata
): string {
  return `You are a senior staff engineer writing entries for a team's engineering knowledge base. You've just observed an AI-assisted coding session and your job is to extract the insights that would save another engineer time if they encountered a similar situation 6 months from now.

Your audience is a developer who has never seen this session but works on the same codebase. They need enough context to understand WHY a decision was made, WHAT specific gotcha was discovered, and WHEN this knowledge applies.

Project: ${projectName}
${sessionSummary ? `Session Summary: ${sessionSummary}\n` : ''}${formatSessionMetaLine(meta)}
=== PART 1: SESSION FACETS ===
Extract these FIRST as a holistic session assessment:

1. outcome_satisfaction: Rate the session outcome.
   - "high": Task completed successfully, user satisfied
   - "medium": Partial completion or minor issues
   - "low": Significant problems, user frustrated
   - "abandoned": Session ended without achieving the goal

2. workflow_pattern: Identify the dominant workflow pattern (or null if unclear).
   Recommended values: "plan-then-implement", "iterative-refinement", "debug-fix-verify", "explore-then-build", "direct-execution"

3. friction_points: Identify up to 5 moments where progress was blocked or slowed (array, max 5).
   Each friction point has:
   - _reasoning: (REQUIRED) Your reasoning chain for category + attribution. 2-3 sentences max. Walk through the decision tree steps. This field is saved but not shown to users — use it to think before classifying.
   - category: Use one of these PREFERRED categories when applicable: ${CANONICAL_FRICTION_CATEGORIES.join(', ')}. Create a new kebab-case category only when none of these fit.
   - attribution: "user-actionable" (better user input would have prevented this), "ai-capability" (AI failed despite adequate input), or "environmental" (external constraint)
   - description: One neutral sentence describing what happened, with specific details (file names, APIs, errors)
   - severity: "high" (blocked progress for multiple turns), "medium" (caused a detour), "low" (minor hiccup)
   - resolution: "resolved" (fixed in session), "workaround" (bypassed), "unresolved" (still broken)
${FRICTION_CLASSIFICATION_GUIDANCE}

4. effective_patterns: Up to 3 techniques or approaches that worked particularly well (array, max 3).
   Each has:
   - _reasoning: (REQUIRED) Your reasoning chain for category + driver. 2-3 sentences max. Walk through the decision tree steps and baseline exclusion check. This field is saved but not shown to users — use it to think before classifying.
   - category: Use one of these PREFERRED categories when applicable: structured-planning, incremental-implementation, verification-workflow, systematic-debugging, self-correction, context-gathering, domain-expertise, effective-tooling. Create a new kebab-case category only when none fit.
   - description: Specific technique worth repeating (1-2 sentences with concrete detail)
   - confidence: 0-100 how confident you are this is genuinely effective
   - driver: Who drove this pattern — "user-driven" (user explicitly requested it), "ai-driven" (AI exhibited it without prompting), or "collaborative" (both contributed or emerged from interaction)
${EFFECTIVE_PATTERN_CLASSIFICATION_GUIDANCE}

5. had_course_correction: true if the user redirected the AI from a wrong approach, false otherwise
6. course_correction_reason: If had_course_correction is true, briefly explain what was corrected (or null)
7. iteration_count: Number of times the user had to clarify, correct, or re-explain something

If the session has minimal friction and straightforward execution, use empty arrays for friction_points, set outcome_satisfaction to "high", and iteration_count to 0.

=== PART 2: INSIGHTS ===
Then extract these:

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

Here is an example of an EXCELLENT insight — this is the quality bar:

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
        "_reasoning": "User said 'fix the auth' without specifying OAuth vs session-based or which file. Step 1: not external — this is about the prompt, not infrastructure. Step 2: user could have specified which auth flow → user-actionable. Category: incomplete-requirements fits better than vague-request because specific constraints (which flow, which file) were missing, not the overall task description.",
        "category": "incomplete-requirements",
        "attribution": "user-actionable",
        "description": "Missing specification of which auth flow (OAuth vs session) caused implementation of wrong provider in auth.ts",
        "severity": "medium",
        "resolution": "resolved"
      },
      {
        "_reasoning": "AI applied Express middleware pattern to a Hono route despite conversation showing Hono imports. Step 1: not external. Step 2: user provided clear Hono context in prior messages. Step 3: AI failed despite adequate input → ai-capability. Category: knowledge-gap — incorrect framework API knowledge was applied.",
        "category": "knowledge-gap",
        "attribution": "ai-capability",
        "description": "Express-style middleware pattern applied to Hono route despite Hono imports visible in conversation context",
        "severity": "high",
        "resolution": "resolved"
      }
    ],
    "effective_patterns": [
      {
        "_reasoning": "Before editing, AI read 8 files across server/src/routes/ and server/src/llm/ to understand the data flow. Baseline check: 8 files across 2 directories = beyond routine (<5 file) reads. Step 1: no CLAUDE.md rule requiring this. Step 2: user didn't ask for investigation. Step 3: AI explored autonomously → ai-driven. Category: context-gathering (active investigation, not pre-existing knowledge).",
        "category": "context-gathering",
        "description": "Read 8 files across routes/ and llm/ directories to map the data flow before modifying the aggregation query, preventing a type mismatch that would have required rework",
        "confidence": 88,
        "driver": "ai-driven"
      }
    ]
  },
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

// =============================================================================
// PROMPT QUALITY INSTRUCTIONS
// The instruction suffix for prompt quality analysis calls (user[1]).
// =============================================================================

/**
 * Build the instruction suffix for prompt quality analysis.
 * Used as the second content block in the user message, after the cached conversation.
 */
export function buildPromptQualityInstructions(
  projectName: string,
  sessionMeta: {
    humanMessageCount: number;
    assistantMessageCount: number;
    toolExchangeCount: number;
  },
  meta?: SessionMetadata
): string {
  return `You are a prompt engineering coach helping developers communicate more effectively with AI coding assistants. You review conversations and identify specific moments where better prompting would have saved time — AND moments where the user prompted particularly well.

You will produce:
1. **Takeaways**: Concrete before/after examples the user can learn from (max 4)
2. **Findings**: Categorized findings for cross-session aggregation (max 8)
3. **Dimension scores**: 5 numeric dimensions for progress tracking
4. **Efficiency score**: 0-100 overall rating
5. **Assessment**: 2-3 sentence summary

Project: ${projectName}
Session shape: ${sessionMeta.humanMessageCount} user messages, ${sessionMeta.assistantMessageCount} assistant messages, ${sessionMeta.toolExchangeCount} tool exchanges
${formatSessionMetaLine(meta)}
Before evaluating, mentally walk through the conversation and identify:
1. Each time the assistant asked for clarification that could have been avoided
2. Each time the user corrected the assistant's interpretation
3. Each time the user repeated an instruction they gave earlier
4. Whether critical context or requirements were provided late
5. Whether the user discussed the plan/approach before implementation
6. Moments where the user's prompt was notably well-crafted
7. If context compactions occurred, note that the AI may have lost context — repeated instructions IMMEDIATELY after a compaction are NOT a user prompting deficit
These are your candidate findings. Only include them if they are genuinely actionable.

${PROMPT_QUALITY_CLASSIFICATION_GUIDANCE}

Guidelines:
- Focus on USER messages only — don't critique the assistant's responses
- Be constructive, not judgmental — the goal is to help users improve
- A score of 100 means every user message was perfectly clear and complete
- A score of 50 means about half the messages could have been more efficient
- Include BOTH deficits and strengths — what went right matters as much as what went wrong
- If the user prompted well, say so — don't manufacture issues
- If the session had context compactions, do NOT penalize the user for repeating instructions immediately after a compaction — the AI lost context, not the user. Repetition unrelated to compaction events should still be flagged.

Length Guidance:
- Max 4 takeaways (ordered: improve first, then reinforce), max 8 findings
- better_prompt must be a complete, usable prompt — not vague meta-advice
- assessment: 2-3 sentences
- Total response: stay under 2500 tokens

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

// =============================================================================
// FACET-ONLY INSTRUCTIONS
// The instruction suffix for facet-only extraction calls (user[1]).
// =============================================================================

/**
 * Build the instruction suffix for facet-only extraction (backfill path).
 * Used as the second content block in the user message, after the cached conversation.
 */
export function buildFacetOnlyInstructions(
  projectName: string,
  sessionSummary: string | null,
  meta?: SessionMetadata
): string {
  return `You are assessing an AI coding session to extract structured metadata for cross-session pattern analysis.

Project: ${projectName}
${sessionSummary ? `Session Summary: ${sessionSummary}\n` : ''}${formatSessionMetaLine(meta)}
Extract session facets — a holistic assessment of how the session went:

1. outcome_satisfaction: "high" (completed successfully), "medium" (partial), "low" (problems), "abandoned" (gave up)
2. workflow_pattern: The dominant pattern, or null. Values: "plan-then-implement", "iterative-refinement", "debug-fix-verify", "explore-then-build", "direct-execution"
3. friction_points: Up to 5 moments where progress stalled (array).
   Each: { _reasoning (3-step attribution decision tree reasoning), category (kebab-case, prefer: ${CANONICAL_FRICTION_CATEGORIES.join(', ')}), attribution ("user-actionable"|"ai-capability"|"environmental"), description (one neutral sentence with specific details), severity ("high"|"medium"|"low"), resolution ("resolved"|"workaround"|"unresolved") }
${FRICTION_CLASSIFICATION_GUIDANCE}
4. effective_patterns: Up to 3 things that worked well (array).
   Each: { _reasoning (driver decision tree reasoning — check user infrastructure first), category (kebab-case, prefer: ${CANONICAL_PATTERN_CATEGORIES.join(', ')}), description (specific technique, 1-2 sentences), confidence (0-100), driver ("user-driven"|"ai-driven"|"collaborative") }
${EFFECTIVE_PATTERN_CLASSIFICATION_GUIDANCE}
5. had_course_correction: true/false — did the user redirect the AI?
6. course_correction_reason: Brief explanation if true, null otherwise
7. iteration_count: How many user clarification/correction cycles occurred

Extract facets in this JSON format:
{
  "outcome_satisfaction": "high | medium | low | abandoned",
  "workflow_pattern": "string or null",
  "had_course_correction": false,
  "course_correction_reason": null,
  "iteration_count": 0,
  "friction_points": [
    {
      "_reasoning": "Reasoning for category + attribution classification",
      "category": "kebab-case-category",
      "attribution": "user-actionable | ai-capability | environmental",
      "description": "One neutral sentence about the gap, with specific details",
      "severity": "high | medium | low",
      "resolution": "resolved | workaround | unresolved"
    }
  ],
  "effective_patterns": [
    {
      "_reasoning": "Reasoning for category + driver classification, including baseline check",
      "category": "kebab-case-category",
      "description": "technique",
      "confidence": 85,
      "driver": "user-driven | ai-driven | collaborative"
    }
  ]
}

Respond with valid JSON only, wrapped in <json>...</json> tags.`;
}
