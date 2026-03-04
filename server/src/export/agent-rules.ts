// Agent Rules template formatter
// Produces imperative instructions suitable for CLAUDE.md and cursor rules

import type { SessionRow, InsightRow } from './knowledge-base.js';

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function formatAgentRules(sessions: SessionRow[], insights: InsightRow[]): string {
  if (sessions.length === 0) return '# Agent Rules Export\n\n*No sessions selected.*\n';

  // Compute date range and project name from sessions
  const dates = sessions.flatMap((s) => [s.started_at, s.ended_at]).filter(Boolean) as string[];
  const minDate = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  const maxDate = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  const dateRange = minDate && maxDate ? `${minDate.split('T')[0]} – ${maxDate.split('T')[0]}` : 'all time';

  // Use the most common project name, or the first one
  const projectNames = sessions.map((s) => s.project_name).filter(Boolean) as string[];
  const projectName = projectNames[0] ?? 'unknown';

  const lines: string[] = [
    `# Agent Rules Export`,
    `> Generated from ${sessions.length} session${sessions.length !== 1 ? 's' : ''} analyzed by Code Insights`,
    `> Project: ${projectName} | Period: ${dateRange}`,
    '',
  ];

  if (insights.length === 0) {
    lines.push(
      '> **Note:** No insights found. Run analysis on sessions first to generate rules.',
    );
    return lines.join('\n');
  }

  // Group all insights by type (cross-session, for a global rules document)
  const byType = new Map<string, InsightRow[]>();
  for (const insight of insights) {
    const list = byType.get(insight.type) ?? [];
    list.push(insight);
    byType.set(insight.type, list);
  }

  const decisions = byType.get('decision');
  if (decisions && decisions.length > 0) {
    lines.push('## Decisions');
    lines.push('');
    for (const insight of decisions) {
      const meta = parseMetadata(insight.metadata);
      lines.push(`### ${insight.title}`);
      const choice = meta.choice as string | undefined;
      const situation = meta.situation as string | undefined;
      const revisit_when = meta.revisit_when as string | undefined;
      const alternatives = meta.alternatives as Array<{ option?: string; reason?: string } | string> | undefined;

      if (choice && situation) {
        lines.push(`- USE ${choice} for ${situation}`);
      } else if (choice) {
        lines.push(`- USE ${choice}`);
      } else if (insight.content) {
        // No structured metadata — emit a plain directive from the content
        lines.push(`- ${insight.content}`);
      }

      if (alternatives && alternatives.length > 0) {
        for (const alt of alternatives) {
          if (typeof alt === 'string') {
            lines.push(`- DO NOT use ${alt}`);
          } else if (alt.option) {
            const reason = alt.reason ? ` because ${alt.reason}` : '';
            lines.push(`- DO NOT use ${alt.option}${reason}`);
          }
        }
      }

      if (revisit_when) {
        lines.push(`- REVISIT this decision when ${revisit_when}`);
      }
      lines.push('');
    }
  }

  const learnings = byType.get('learning');
  if (learnings && learnings.length > 0) {
    lines.push('## Learnings');
    lines.push('');
    for (const insight of learnings) {
      const meta = parseMetadata(insight.metadata);
      lines.push(`### ${insight.title}`);
      const applies_when = meta.applies_when as string | undefined;
      const symptom = meta.symptom as string | undefined;
      const root_cause = meta.root_cause as string | undefined;
      const takeaway = meta.takeaway as string | undefined;

      if (applies_when && symptom && root_cause) {
        lines.push(`- WHEN ${applies_when}, be aware that ${symptom} is caused by ${root_cause}`);
      } else if (symptom && root_cause) {
        lines.push(`- Be aware that ${symptom} is caused by ${root_cause}`);
      }

      if (takeaway) {
        lines.push(`- ${takeaway}`);
      } else if (!symptom && !root_cause && insight.content) {
        lines.push(`- ${insight.content}`);
      }
      lines.push('');
    }
  }

  const techniques = byType.get('technique');
  if (techniques && techniques.length > 0) {
    lines.push('## Techniques');
    lines.push('');
    for (const insight of techniques) {
      const meta = parseMetadata(insight.metadata);
      lines.push(`### ${insight.title}`);
      const context = meta.context as string | undefined;
      const applicability = meta.applicability as string | undefined;

      if (context) {
        lines.push(`- WHEN ${context}, use this approach:`);
      }
      if (insight.content) {
        // Indent content as a block under the directive
        for (const contentLine of insight.content.split('\n')) {
          lines.push(`  ${contentLine}`);
        }
      }
      if (applicability) {
        lines.push(`- Applicability: ${applicability}`);
      }
      lines.push('');
    }
  }

  const pqInsights = byType.get('prompt_quality');
  if (pqInsights && pqInsights.length > 0) {
    const antiPatternLines: string[] = [];
    for (const insight of pqInsights) {
      const meta = parseMetadata(insight.metadata);
      const antiPatterns = meta.antiPatterns as Array<{
        name?: string;
        description?: string;
        fix?: string;
      }> | undefined;
      if (antiPatterns) {
        for (const pattern of antiPatterns) {
          const desc = pattern.description ? `: ${pattern.description}` : '';
          const fix = pattern.fix ? `. Instead: ${pattern.fix}` : '';
          antiPatternLines.push(`- AVOID ${pattern.name ?? 'unknown pattern'}${desc}${fix}`);
        }
      }
    }
    if (antiPatternLines.length > 0) {
      lines.push('## Prompt Patterns to Avoid');
      lines.push('');
      lines.push(...antiPatternLines);
      lines.push('');
    }
  }

  return lines.join('\n');
}
