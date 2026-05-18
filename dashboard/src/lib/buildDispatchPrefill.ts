import type { Session, FacetRow, FrictionPoint, EffectivePattern, DispatchPrefill } from '@/lib/types';
import { parseJsonField } from '@/lib/types';

const FORMAT_MAP: Partial<Record<string, DispatchPrefill['format']>> = {
  feature_build: 'blog',
  bug_hunt: 'linkedin',
  refactor: 'blog',
  deep_focus: 'blog',
};

// Note: the spec maps bug_hunt→postmortem and refactor/deep_focus→deep-dive, but
// DispatchFormat only has 'blog' | 'linkedin'. Mapping to closest available format.
// feature_build→blog, bug_hunt→linkedin (most punchy), refactor/deep_focus→blog.

export function buildDispatchPrefill(session: Session, facetRow: FacetRow): DispatchPrefill {
  const title = session.custom_title ?? session.generated_title ?? 'Untitled Session';
  const format = FORMAT_MAP[session.session_character ?? ''] ?? 'blog';

  const patterns = parseJsonField<EffectivePattern[]>(facetRow.effective_patterns, []);
  const friction = parseJsonField<FrictionPoint[]>(facetRow.friction_points, []);

  const topPatterns = patterns.slice(0, 3);
  const topFriction = friction
    .filter((f) => f.attribution === 'user-actionable')
    .slice(0, 3);

  const sections: string[] = [];

  if (topPatterns.length > 0) {
    const lines = topPatterns.map((p) => `- ${p.description}`).join('\n');
    sections.push(`## What you learned\n${lines}`);
  }

  if (topFriction.length > 0) {
    const lines = topFriction.map((f) => `- ${f.description}`).join('\n');
    sections.push(`## What was hard\n${lines}`);
  }

  return {
    sessionId: session.id,
    title,
    format,
    contextMarkdown: sections.join('\n\n'),
  };
}
