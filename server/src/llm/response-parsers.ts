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

  // Observability: warn when LLM omits _reasoning CoT scratchpad fields.
  // These fields force the model to work through the attribution/driver decision trees
  // before committing to values. Missing _reasoning suggests the model skipped the CoT step.
  // Remove after confirming CoT compliance over ~20 new sessions.
  if (parsed.facets?.friction_points?.some(fp => !fp._reasoning)) {
    console.warn('[cot-monitor] LLM returned friction_point without _reasoning — classification may lack decision-tree rigor');
  }
  if (parsed.facets?.effective_patterns?.some(ep => !ep._reasoning)) {
    console.warn('[cot-monitor] LLM returned effective_pattern without _reasoning — classification may lack decision-tree rigor');
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
    parsed.dimension_scores[key] = Math.max(0, Math.min(100, Math.round(parsed.dimension_scores[key] ?? 50)));
  }

  // Observability: warn when findings missing category
  if (parsed.findings.some(f => !f.category)) {
    console.warn('[pq-monitor] LLM returned finding without category field');
  }

  // Observability: warn when findings have unexpected type values
  if (parsed.findings.some(f => f.type && f.type !== 'deficit' && f.type !== 'strength')) {
    console.warn('[pq-monitor] LLM returned finding with unexpected type value — expected deficit or strength');
  }

  return { success: true, data: parsed };
}
