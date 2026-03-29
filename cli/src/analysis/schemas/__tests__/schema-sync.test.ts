/**
 * Schema sync test — ensures hand-maintained JSON schemas stay in sync with
 * the TypeScript types in prompt-types.ts.
 *
 * Why: The JSON schemas are used by `claude -p --json-schema` for structured output.
 * If someone adds a field to AnalysisResponse or PromptQualityResponse but forgets
 * to update the schema (or vice versa), this test fails in CI.
 *
 * Coverage: Top-level required properties only.
 * Nested object shapes are not validated here — the LLM and response parsers
 * provide the runtime validation layer for nested fields.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, '..');

function loadSchema(filename: string): { required?: string[]; properties?: Record<string, unknown> } {
  const raw = readFileSync(join(schemasDir, filename), 'utf-8');
  return JSON.parse(raw);
}

// ── AnalysisResponse top-level required fields ────────────────────────────────
// Source of truth: AnalysisResponse interface in cli/src/analysis/prompt-types.ts
// Update this list when you add/remove top-level properties from AnalysisResponse.
const ANALYSIS_RESPONSE_TOP_LEVEL_REQUIRED = [
  'facets',
  'summary',
  'decisions',
  'learnings',
] as const;

// ── AnalysisResponse.facets required fields ───────────────────────────────────
const ANALYSIS_FACETS_REQUIRED = [
  'outcome_satisfaction',
  'workflow_pattern',
  'had_course_correction',
  'course_correction_reason',
  'iteration_count',
  'friction_points',
  'effective_patterns',
] as const;

// ── PromptQualityResponse top-level required fields ───────────────────────────
// Source of truth: PromptQualityResponse interface in cli/src/analysis/prompt-types.ts
// Update this list when you add/remove top-level properties from PromptQualityResponse.
const PROMPT_QUALITY_RESPONSE_TOP_LEVEL_REQUIRED = [
  'efficiency_score',
  'message_overhead',
  'assessment',
  'takeaways',
  'findings',
  'dimension_scores',
] as const;

// ── PromptQualityDimensionScores required fields ──────────────────────────────
const DIMENSION_SCORES_REQUIRED = [
  'context_provision',
  'request_specificity',
  'scope_management',
  'information_timing',
  'correction_quality',
] as const;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('session-analysis.json schema sync', () => {
  const schema = loadSchema('session-analysis.json');

  it('has all AnalysisResponse top-level required fields', () => {
    const schemaRequired = schema.required ?? [];
    for (const field of ANALYSIS_RESPONSE_TOP_LEVEL_REQUIRED) {
      expect(schemaRequired, `Missing required field '${field}' in session-analysis.json`).toContain(field);
    }
  });

  it('has no extra top-level required fields not in AnalysisResponse', () => {
    const schemaRequired = schema.required ?? [];
    for (const field of schemaRequired) {
      expect(
        ANALYSIS_RESPONSE_TOP_LEVEL_REQUIRED as readonly string[],
        `Extra required field '${field}' in session-analysis.json not present in AnalysisResponse`
      ).toContain(field);
    }
  });

  it('has all facets required fields', () => {
    const facetsSchema = (schema.properties?.facets as { required?: string[] }) ?? {};
    const facetsRequired = facetsSchema.required ?? [];
    for (const field of ANALYSIS_FACETS_REQUIRED) {
      expect(facetsRequired, `Missing facets required field '${field}' in session-analysis.json`).toContain(field);
    }
  });

  it('schema file is valid JSON', () => {
    // If loadSchema didn't throw, the file is valid JSON.
    expect(schema).toBeDefined();
    expect(typeof schema).toBe('object');
  });
});

describe('prompt-quality.json schema sync', () => {
  const schema = loadSchema('prompt-quality.json');

  it('has all PromptQualityResponse top-level required fields', () => {
    const schemaRequired = schema.required ?? [];
    for (const field of PROMPT_QUALITY_RESPONSE_TOP_LEVEL_REQUIRED) {
      expect(schemaRequired, `Missing required field '${field}' in prompt-quality.json`).toContain(field);
    }
  });

  it('has no extra top-level required fields not in PromptQualityResponse', () => {
    const schemaRequired = schema.required ?? [];
    for (const field of schemaRequired) {
      expect(
        PROMPT_QUALITY_RESPONSE_TOP_LEVEL_REQUIRED as readonly string[],
        `Extra required field '${field}' in prompt-quality.json not present in PromptQualityResponse`
      ).toContain(field);
    }
  });

  it('has all dimension_scores required fields', () => {
    const dimSchema = (schema.properties?.dimension_scores as { required?: string[] }) ?? {};
    const dimRequired = dimSchema.required ?? [];
    for (const field of DIMENSION_SCORES_REQUIRED) {
      expect(dimRequired, `Missing dimension_scores field '${field}' in prompt-quality.json`).toContain(field);
    }
  });

  it('schema file is valid JSON', () => {
    expect(schema).toBeDefined();
    expect(typeof schema).toBe('object');
  });
});
