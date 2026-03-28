// Canonical category arrays and classification guidance strings for LLM analysis.
// Extracted from prompts.ts — imported by normalizers and prompt generators.

// Shared guidance for friction category and attribution classification.
// Actor-neutral category definitions describe the gap, not the actor.
// Attribution field captures who contributed to the friction for actionability.
export const FRICTION_CLASSIFICATION_GUIDANCE = `
FRICTION CLASSIFICATION GUIDANCE:

Each friction point captures WHAT went wrong (category + description), WHO contributed (attribution), and WHY you classified it that way (_reasoning).

CATEGORIES — classify the TYPE of gap or obstacle:
- "wrong-approach": A strategy was pursued that didn't fit the task — wrong architecture, wrong tool, wrong pattern. Includes choosing a suboptimal tool when a better one was available.
- "knowledge-gap": Incorrect knowledge was applied about a library, API, framework, or language feature. The capability existed but was used wrong.
- "stale-assumptions": Work proceeded from assumptions about current state that were incorrect (stale files, changed config, different environment, tool behavior changed between versions).
- "incomplete-requirements": Instructions were missing critical context, constraints, or acceptance criteria needed to proceed correctly.
- "context-loss": Prior decisions or constraints established earlier in the session were lost or forgotten.
- "scope-creep": Work expanded beyond the boundaries of the stated task.
- "repeated-mistakes": The same or similar error occurred multiple times despite earlier correction.
- "documentation-gap": Relevant docs existed but were inaccessible or unfindable during the session.
- "tooling-limitation": The AI coding tool or its underlying model genuinely could not perform a needed action — missing file system access, unsupported language feature, context window overflow, inability to run a specific command type. Diagnostic: Could a reasonable user prompt or approach have achieved the same result? If the only workaround is unreasonably complex or loses significant fidelity, this IS a tooling-limitation. If a straightforward alternative existed → it is NOT tooling-limitation.
  RECLASSIFY if any of these apply:
  - Rate-limited or throttled → create "rate-limit-hit" instead
  - Agent crashed or lost state → use "wrong-approach" or create "agent-orchestration-failure"
  - Wrong tool chosen when a better one existed → "wrong-approach"
  - User didn't know the tool could do something → "knowledge-gap"
  - Tool worked differently than expected → "stale-assumptions"

DISAMBIGUATION — use these to break ties when two categories seem to fit:
- tooling-limitation vs wrong-approach: Limitation = the tool CANNOT do it (no workaround exists). Wrong-approach = the tool CAN do it but a suboptimal method was chosen.
- tooling-limitation vs knowledge-gap: Limitation = the capability genuinely does not exist. Knowledge-gap = the capability exists but was applied incorrectly.
- tooling-limitation vs stale-assumptions: Limitation = permanent gap in the tool. Stale-assumptions = the tool USED TO work differently or the assumption about current behavior was wrong.
- wrong-approach vs knowledge-gap: Wrong-approach = strategic choice (chose library X over Y). Knowledge-gap = factual error (used library X's API incorrectly).
- incomplete-requirements vs context-loss: Incomplete = the information was NEVER provided. Context-loss = it WAS provided earlier but was forgotten or dropped.

When no category fits, create a specific kebab-case category. A precise novel category is better than a vague canonical one.

ATTRIBUTION — 3-step decision tree (follow IN ORDER):
Step 1: Is the cause external to the user-AI interaction? (missing docs, broken tooling, infra outage) → "environmental"
Step 2: Could the USER have prevented this with better input? Evidence: vague prompt, missing context, no constraints, late requirements, ambiguous correction → "user-actionable"
Step 3: User input was clear and the AI still failed → "ai-capability"
When genuinely mixed between user-actionable and ai-capability, lean "user-actionable" — this tool helps users improve.

DESCRIPTION RULES:
- One neutral sentence describing the GAP, not the actor
- Include specific details (file names, APIs, error messages)
- Frame as "Missing X caused Y" NOT "The AI failed to X" or "The user forgot to X"
- Let the attribution field carry the who`;

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
- Sessions where AI performed well despite vague prompts: Still classify deficits. Impact should be "low" since no visible cost.
- Agentic/delegation sessions: If the user gave a clear high-level directive and the AI autonomously planned and executed successfully, do not penalize for low message count or lack of micro-level specificity. Effective delegation IS good prompting. Focus on the quality of the initial delegation prompt.`;

export const EFFECTIVE_PATTERN_CLASSIFICATION_GUIDANCE = `
EFFECTIVE PATTERN CLASSIFICATION GUIDANCE:

Each effective pattern captures a technique or approach that contributed to a productive session outcome.

BASELINE EXCLUSION — do NOT classify these as patterns:
- Routine file reads at session start (Read/Glob/Grep on <5 files before editing)
- Following explicit user instructions (user said "run tests" → running tests is not a pattern)
- Basic tool usage (single file edits, standard CLI commands)
- Trivial self-corrections (typo fixes, minor syntax errors caught immediately)
Only classify behavior that is NOTABLY thorough, strategic, or beyond baseline expectations.

CATEGORIES — classify the TYPE of effective pattern:
- "structured-planning": Decomposed the task into explicit steps, defined scope boundaries, or established a plan BEFORE writing code. Signal: plan/task-list/scope-definition appears before implementation.
- "incremental-implementation": Work progressed in small, verifiable steps with validation between them. Signal: multiple small edits with checks between, not one large batch.
- "verification-workflow": Proactive correctness checks (builds, tests, linters, types) BEFORE considering work complete. Signal: test/build/lint commands when nothing was known broken.
- "systematic-debugging": Methodical investigation using structured techniques (binary search, log insertion, reproduction isolation). Signal: multiple targeted diagnostic steps, not random guessing.
- "self-correction": Recognized a wrong path and pivoted WITHOUT user correction. Signal: explicit acknowledgment of mistake + approach change. NOT this if the user pointed out the error.
- "context-gathering": NOTABLY thorough investigation before changes — reading 5+ files, cross-module exploration, schema/type/config review. Signal: substantial Read/Grep/Glob usage spanning multiple directories before any Edit/Write.
- "domain-expertise": Applied specific framework/API/language knowledge correctly on first attempt without searching. Signal: correct non-obvious API usage with no preceding search and no subsequent error. NOT this if files were read first — that is context-gathering.
- "effective-tooling": Leveraged advanced tool capabilities that multiplied productivity — agent delegation, parallel work, multi-file coordination, strategic mode selection. Signal: use of tool features beyond basic read/write/edit.

CONTRASTIVE PAIRS:
- structured-planning vs incremental-implementation: Planning = DECIDING what to do (before). Incremental = HOW you execute (during). Can have one without the other.
- context-gathering vs domain-expertise: Gathering = ACTIVE INVESTIGATION (reading files). Expertise = APPLYING EXISTING KNOWLEDGE without investigation. If files were read first → context-gathering.
- verification-workflow vs systematic-debugging: Verification = PROACTIVE (checking working code). Debugging = REACTIVE (investigating a failure).
- self-correction vs user-directed: Self-correction = AI caught own mistake unprompted. User said "that's wrong" → NOT self-correction.

DRIVER — 4-step decision tree (follow IN ORDER):
Step 1: Did user infrastructure enable this? (CLAUDE.md rules, agent configs, hookify hooks, custom commands, system prompts) → "user-driven"
Step 2: Did the user explicitly request this behavior? (asked for plan, requested tests, directed investigation) → "user-driven"
Step 3: Did the AI exhibit this without any user prompting or infrastructure? → "ai-driven"
Step 4: Both made distinct, identifiable contributions → "collaborative"
Use "collaborative" ONLY when you can name what EACH party contributed. If uncertain, prefer the more specific label.

When no canonical category fits, create a specific kebab-case category (a precise novel category is better than forcing a poor fit).`;
