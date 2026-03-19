// Synthesis prompts for the Reflect/Patterns feature.
// These prompts receive pre-aggregated facet data and produce cross-session narratives.
// LLMs synthesize — they don't count. All counting is done in code before calling these.

// --- Friction & Wins ---

export const FRICTION_WINS_SYSTEM_PROMPT = `You are analyzing cross-session patterns from a developer's AI coding sessions. You will receive pre-aggregated friction categories and effective patterns with counts and severity scores.

Your job is to synthesize a narrative analysis of the 3-5 most significant patterns. For each pattern:
1. State what the pattern is
2. Explain why it matters (impact on productivity)
3. Identify the likely root cause
4. Note if it's trending (getting better or worse)

RULES:
- Every claim must trace to the statistics provided. Do not invent patterns.
- Patterns require 2+ occurrences to be mentioned.
- Do not give advice — that's for the Rules & Skills section.
- Be specific: "wrong-approach appeared 7 times with high severity" not "there were some issues"
- Keep the narrative under 500 words.
- Where PQ deficit signals corroborate friction categories, note the reinforcing evidence briefly.
- PQ signals are supplementary context, not primary evidence. Never dedicate a full pattern to PQ alone — mention PQ only within friction or wins paragraphs.

Respond with valid JSON only, wrapped in <json>...</json> tags.`;

export function generateFrictionWinsPrompt(data: {
  frictionCategories: Array<{ category: string; count: number; avg_severity: number; examples: string[] }>;
  effectivePatterns: Array<{ category: string; label: string; frequency: number; avg_confidence: number; descriptions: string[] }>;
  totalSessions: number;
  period: string;
  pqSignals?: {
    deficits: Array<{ category: string; count: number }>;
    strengths: Array<{ category: string; count: number }>;
  };
}): string {
  const hasPQData = data.pqSignals?.deficits.length || data.pqSignals?.strengths.length;
  const pqSection = hasPQData
    ? `
PROMPT QUALITY SIGNALS (supplementary):

Deficits:
${((data.pqSignals?.deficits ?? []).map(d => `  ${d.category}: ${d.count}`).join('\n') || '  (none above threshold)')}

Strengths:
${((data.pqSignals?.strengths ?? []).map(s => `  ${s.category}: ${s.count}`).join('\n') || '  (none above threshold)')}
`
    : '';

  return `Analyze these cross-session patterns from ${data.totalSessions} sessions over ${data.period}.

FRICTION CATEGORIES (ranked by frequency × severity):
${JSON.stringify(data.frictionCategories.slice(0, 15), null, 2)}

EFFECTIVE PATTERNS (ranked by frequency, grouped by category):
${JSON.stringify(data.effectivePatterns.slice(0, 10), null, 2)}
${pqSection}
Respond with this JSON format:
{
  "narrative": "Your 300-500 word analysis of the most significant patterns",
  "topFriction": [
    {
      "category": "category-name",
      "significance": "Why this matters",
      "rootCause": "Likely underlying cause",
      "trend": "increasing | stable | decreasing | new"
    }
  ],
  "topWins": [
    {
      "category": "structured-planning",
      "pattern": "Description of what works",
      "significance": "Why this is effective"
    }
  ]
}

Respond with valid JSON only, wrapped in <json>...</json> tags.`;
}

// --- Rules & Skills ---

export const RULES_SKILLS_SYSTEM_PROMPT = `You are generating actionable artifacts from cross-session analysis of a developer's AI coding sessions. You will receive recurring friction patterns and effective practices.

Your job is to produce concrete, copy-paste-ready artifacts:
1. CLAUDE.md rules — specific instructions to add to the AI assistant's config
2. Hook configurations — automation triggers

RULES:
- Only generate artifacts for patterns with 3+ occurrences (friction) or 2+ occurrences (effective patterns)
- Rules must be specific enough to be actionable: "Always run tests before creating PRs" not "Be careful with code"
- Hook configs must include the event trigger and command
- Max 6 rules, 3 hooks
- Each artifact must reference the friction pattern or effective practice it addresses

Respond with valid JSON only, wrapped in <json>...</json> tags.`;

export function generateRulesSkillsPrompt(data: {
  recurringFriction: Array<{ category: string; count: number; avg_severity: number; examples: string[] }>;
  effectivePatterns: Array<{ category: string; label: string; frequency: number; avg_confidence: number; descriptions: string[] }>;
  targetTool: string;
}): string {
  return `Generate actionable artifacts from these recurring patterns.

TARGET TOOL: ${data.targetTool} (generate artifacts compatible with this tool's ecosystem)

RECURRING FRICTION (3+ occurrences):
${JSON.stringify(data.recurringFriction, null, 2)}

EFFECTIVE PATTERNS (2+ occurrences):
${JSON.stringify(data.effectivePatterns, null, 2)}

Respond with this JSON format:
{
  "claudeMdRules": [
    {
      "rule": "The exact text to add to CLAUDE.md",
      "rationale": "Why this rule helps (reference the friction pattern)",
      "frictionSource": "category-name (N occurrences)"
    }
  ],
  "hookConfigs": [
    {
      "event": "pre-commit | post-file-edit | etc.",
      "command": "The shell command to run",
      "rationale": "Why this automation helps"
    }
  ]
}

Respond with valid JSON only, wrapped in <json>...</json> tags.`;
}

// --- Working Style ---

export const WORKING_STYLE_SYSTEM_PROMPT = `You are writing a brief working style profile based on aggregated statistics from a developer's AI coding sessions. You will receive distributions of workflow patterns, outcomes, session types, and friction frequency.

Your job is to describe WHAT you see, not what they should change. Write in second person ("You tend to...").

RULES:
- Base every statement on the statistics provided
- Keep the narrative to 3-5 sentences
- Be descriptive, not prescriptive (no advice)
- Mention the dominant workflow pattern, outcome distribution, and any notable characteristics
- If the data is too sparse (< 5 sessions), say so and keep it brief
- Generate a tagline: a 2-4 word archetype label in title case, maximum 40 characters (e.g. "The Methodical Builder", "Relentless Debugger", "Ship Fast Fix Later", "Deep Focus Specialist")
- The tagline must be empowering and descriptive, never critical or negative
- Base the tagline on the dominant session types, workflow patterns, and outcome distribution
- Think of it like a developer personality type — specific and earned, not generic
- Generate a tagline_subtitle: a single sentence behavioral description, maximum 80 characters, that complements the tagline archetype with specifics grounded in the session statistics (e.g. "Plans thoroughly, debugs systematically, ships with high success"). It must be a complete, meaningful sentence fragment — not a restatement of the tagline.

Respond with valid JSON only, wrapped in <json>...</json> tags.`;

export function generateWorkingStylePrompt(data: {
  workflowDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  characterDistribution: Record<string, number>;
  totalSessions: number;
  period: string;
  frictionFrequency: number;
}): string {
  return `Write a working style profile based on ${data.totalSessions} sessions over ${data.period}.

WORKFLOW PATTERNS:
${JSON.stringify(data.workflowDistribution, null, 2)}

OUTCOME SATISFACTION:
${JSON.stringify(data.outcomeDistribution, null, 2)}

SESSION TYPES:
${JSON.stringify(data.characterDistribution, null, 2)}

FRICTION FREQUENCY: ${data.frictionFrequency} total friction points across all sessions

Respond with this JSON format:
{
  "tagline": "2-4 word archetype label (e.g. The Methodical Builder)",
  "tagline_subtitle": "1-sentence behavioral description max 80 chars (e.g. Plans thoroughly, debugs systematically, ships with high success)",
  "narrative": "3-5 sentence working style description"
}

Respond with valid JSON only, wrapped in <json>...</json> tags.`;
}
