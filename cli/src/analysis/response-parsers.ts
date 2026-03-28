// LLM response parsing utilities.
// Extracted from prompts.ts — handles JSON extraction, repair, and validation.

import { jsonrepair } from 'jsonrepair';
import type { AnalysisResponse, ParseError, ParseResult, PromptQualityResponse, PromptQualityDimensionScores } from './prompt-types.js';

function buildResponsePreview(text: string, head = 200, tail = 200): string {
  if (text.length <= head + tail + 20) return text;
  return `${text.slice(0, head)}\n...[${text.length - head - tail} chars omitted]...\n${text.slice(-tail)}`;
}

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

  // Guard against LLM returning non-array values (e.g. "decisions": "none").
  // || [] alone won't catch truthy non-arrays — Array.isArray is required.
  parsed.decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  parsed.learnings = Array.isArray(parsed.learnings) ? parsed.learnings : [];

  // Normalize facet arrays before monitors access .some() — a non-array truthy value
  // (e.g. LLM returns "friction_points": "none") would throw a TypeError on .some().
  if (parsed.facets) {
    if (!Array.isArray(parsed.facets.friction_points)) parsed.facets.friction_points = [];
    if (!Array.isArray(parsed.facets.effective_patterns)) parsed.facets.effective_patterns = [];
  }

  // Observability: two-tier tooling-limitation monitor.
  // Tier 1: _reasoning contains misclassification signals NOT in a negation context → likely wrong category.
  // Tier 2: no conflicting signals (or signal was negated) → generic reminder to verify.
  // Re-evaluate after ~30 sessions with improved FRICTION_CLASSIFICATION_GUIDANCE.
  if (parsed.facets?.friction_points?.some(fp => fp.category === 'tooling-limitation')) {
    // Expanded regex covers both literal terms and GPT-4o paraphrasing patterns
    const MISCLASS_SIGNALS = /rate.?limit|throttl|quota.?exceed|crash|fail.{0,10}unexpect|lost.?state|context.{0,10}(?:drop|lost|unavail)|wrong.?tool|different.?(?:approach|method)|(?:didn.t|did not|unaware).{0,10}(?:know|capabil)|(?:older|previous).?version|used to (?:work|be)|behavio.?r.?change/i;
    const NEGATION_CONTEXT = /\bnot\b|\bnor\b|\bisn.t\b|\bwasn.t\b|\brule[d]? out\b|\brejected?\b|\beliminated?\b|\breclassif/i;
    const toolingFps = parsed.facets.friction_points.filter(fp => fp.category === 'tooling-limitation');
    for (const fp of toolingFps) {
      if (!fp._reasoning) {
        console.warn('[friction-monitor] LLM classified friction as "tooling-limitation" without _reasoning — cannot verify');
        continue;
      }
      const matchResult = fp._reasoning.match(MISCLASS_SIGNALS);
      if (matchResult) {
        // Check if the signal appears in a negation context (model correctly eliminating the alternative)
        const matchIdx = fp._reasoning.search(MISCLASS_SIGNALS);
        const preceding = fp._reasoning.slice(Math.max(0, matchIdx - 40), matchIdx);
        if (!NEGATION_CONTEXT.test(preceding)) {
          console.warn(`[friction-monitor] Likely misclassification: "tooling-limitation" with reasoning mentioning "${matchResult[0]}" — review category`);
        }
        // If negated, the model correctly considered and rejected the alternative — no warning
      } else {
        console.warn('[friction-monitor] LLM classified friction as "tooling-limitation" — verify genuine tool limitation');
      }
    }
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

  // Validation: check for missing _reasoning CoT scratchpad fields.
  // These fields ensure the model walks through the attribution/driver decision trees
  // before committing to classification values.
  // (Monitoring period complete — warn calls removed after confirming CoT compliance)
  if (parsed.facets?.friction_points?.some(fp => !fp._reasoning)) {
    // Missing _reasoning: classification may lack decision-tree rigor
  }
  if (parsed.facets?.effective_patterns?.some(ep => !ep._reasoning)) {
    // Missing _reasoning: classification may lack decision-tree rigor
  }

  return { success: true, data: parsed };
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
  parsed.message_overhead = parsed.message_overhead ?? 0;
  parsed.assessment = parsed.assessment || '';
  // Guard against LLM returning non-array values (e.g. "findings": "none") —
  // || [] alone won't catch truthy non-arrays, and .some() on line 166 would throw.
  parsed.takeaways = Array.isArray(parsed.takeaways) ? parsed.takeaways : [];
  parsed.findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  parsed.dimension_scores = parsed.dimension_scores || {
    context_provision: 50,
    request_specificity: 50,
    scope_management: 50,
    information_timing: 50,
    correction_quality: 50,
  };

  // Clamp dimension scores
  for (const key of Object.keys(parsed.dimension_scores) as Array<keyof PromptQualityDimensionScores>) {
    parsed.dimension_scores[key] = Math.max(0, Math.min(100, Math.round(parsed.dimension_scores[key] ?? 50)));
  }

  // Validation: check for missing category or unexpected type values in findings.
  // (Monitoring period complete — warn calls removed after confirming classification quality)
  if (parsed.findings.some(f => !f.category)) {
    // Finding missing category field
  }

  if (parsed.findings.some(f => f.type && f.type !== 'deficit' && f.type !== 'strength')) {
    // Finding has unexpected type value — expected deficit or strength
  }

  return { success: true, data: parsed };
}
