// Knowledge Base template formatter
// Produces human-readable markdown organized by session, with rich insight content

export interface SessionRow {
  id: string;
  project_name: string | null;
  generated_title: string | null;
  custom_title: string | null;
  started_at: string | null;
  ended_at: string | null;
  message_count: number | null;
  estimated_cost_usd: number | null;
  session_character: string | null;
  source_tool: string | null;
}

export interface InsightRow {
  id: string;
  session_id: string;
  project_id: string;
  project_name: string | null;
  type: string;
  title: string;
  content: string;
  summary: string | null;
  bullets: string | null; // JSON array string
  confidence: number | null;
  source: string | null;
  metadata: string | null; // JSON object string
  timestamp: string;
  created_at: string;
  scope: string | null;
  analysis_version: string | null;
  linked_insight_ids: string | null;
}

function parseBullets(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function renderSummary(insight: InsightRow, lines: string[]) {
  const meta = parseMetadata(insight.metadata);
  const bullets = parseBullets(insight.bullets);

  lines.push('### Summary');
  const outcome = meta.outcome as string | undefined;
  if (outcome) lines.push(`**Outcome:** ${outcome}`);
  if (insight.content) lines.push(insight.content);
  for (const bullet of bullets) lines.push(`- ${bullet}`);
}

function renderDecisions(insights: InsightRow[], lines: string[]) {
  lines.push('### Decisions');
  lines.push('');
  for (const insight of insights) {
    const meta = parseMetadata(insight.metadata);
    lines.push(`#### ${insight.title}`);
    const situation = meta.situation as string | undefined;
    if (situation) lines.push(`**Situation:** ${situation}`);
    const choice = meta.choice as string | undefined;
    if (choice) lines.push(`**Choice:** ${choice}`);
    const reasoning = meta.reasoning as string | undefined;
    if (reasoning) lines.push(`**Reasoning:** ${reasoning}`);
    const alternatives = meta.alternatives as Array<{ option?: string; reason?: string } | string> | undefined;
    if (alternatives && alternatives.length > 0) {
      lines.push('');
      lines.push('**Alternatives Considered:**');
      for (const alt of alternatives) {
        if (typeof alt === 'string') {
          lines.push(`- ${alt}`);
        } else if (alt.option) {
          const reason = alt.reason ? ` — rejected because ${alt.reason}` : '';
          lines.push(`- ${alt.option}${reason}`);
        }
      }
    }
    const trade_offs = meta.trade_offs as string | undefined;
    if (trade_offs) lines.push(`**Trade-offs:** ${trade_offs}`);
    const revisit_when = meta.revisit_when as string | undefined;
    if (revisit_when) lines.push(`**Revisit When:** ${revisit_when}`);
    // Fallback to raw content when no structured metadata is present
    if (!situation && !choice && !reasoning && insight.content) lines.push(insight.content);
    lines.push('');
  }
}

function renderLearnings(insights: InsightRow[], lines: string[]) {
  lines.push('### Learnings');
  lines.push('');
  for (const insight of insights) {
    const meta = parseMetadata(insight.metadata);
    lines.push(`#### ${insight.title}`);
    const symptom = meta.symptom as string | undefined;
    if (symptom) lines.push(`**What Happened:** ${symptom}`);
    const root_cause = meta.root_cause as string | undefined;
    if (root_cause) lines.push(`**Root Cause:** ${root_cause}`);
    const takeaway = meta.takeaway as string | undefined;
    if (takeaway) lines.push(`**Takeaway:** ${takeaway}`);
    const applies_when = meta.applies_when as string | undefined;
    if (applies_when) lines.push(`**Applies When:** ${applies_when}`);
    if (!symptom && !root_cause && !takeaway && insight.content) lines.push(insight.content);
    lines.push('');
  }
}

function renderTechniques(insights: InsightRow[], lines: string[]) {
  lines.push('### Techniques');
  lines.push('');
  for (const insight of insights) {
    const meta = parseMetadata(insight.metadata);
    lines.push(`#### ${insight.title}`);
    const context = meta.context as string | undefined;
    if (context) lines.push(`**Context:** ${context}`);
    const applicability = meta.applicability as string | undefined;
    if (applicability) lines.push(`**Applicability:** ${applicability}`);
    if (insight.content) lines.push(insight.content);
    lines.push('');
  }
}

function renderPromptQuality(insight: InsightRow, lines: string[]) {
  const meta = parseMetadata(insight.metadata);
  lines.push('### Prompt Quality');
  const score = meta.efficiencyScore as number | undefined;
  const reduction = meta.potentialMessageReduction as number | undefined;
  if (score !== undefined) lines.push(`**Efficiency:** ${score}/100`);
  if (reduction !== undefined) lines.push(`**Potential Savings:** ${reduction} fewer messages`);

  const antiPatterns = meta.antiPatterns as Array<{
    name?: string;
    count?: number;
    fix?: string;
  }> | undefined;
  if (antiPatterns && antiPatterns.length > 0) {
    lines.push('');
    lines.push('**Anti-Patterns:**');
    for (const pattern of antiPatterns) {
      const countStr = pattern.count !== undefined ? ` (seen ${pattern.count}x)` : '';
      const fixStr = pattern.fix ? ` — Fix: ${pattern.fix}` : '';
      lines.push(`- ${pattern.name ?? 'Unknown'}${countStr}${fixStr}`);
    }
  }

  const wastedTurns = meta.wastedTurns as Array<{
    messageIndex?: number;
    reason?: string;
    suggestedRewrite?: string;
  }> | undefined;
  if (wastedTurns && wastedTurns.length > 0) {
    lines.push('');
    lines.push('**Wasted Turns:**');
    for (const turn of wastedTurns) {
      const msgStr = turn.messageIndex !== undefined ? `Msg #${turn.messageIndex}` : 'Message';
      lines.push(`- ${msgStr}: ${turn.reason ?? ''}`);
      if (turn.suggestedRewrite) {
        lines.push(`  - Better: "${turn.suggestedRewrite}"`);
      }
    }
  }
}

export function formatKnowledgeBase(sessions: SessionRow[], insights: InsightRow[]): string {
  const now = new Date().toISOString().split('T')[0];
  const lines: string[] = [
    `# Code Insights Export`,
    `> Exported on ${now} — ${sessions.length} session${sessions.length !== 1 ? 's' : ''}, ${insights.length} insight${insights.length !== 1 ? 's' : ''}`,
    '',
  ];

  if (insights.length === 0) {
    lines.push(
      '> **Note:** No insights found for the selected sessions. Run analysis on sessions first to generate insights.',
    );
    lines.push('');
  }

  // Build a map of session_id -> insights grouped by type
  const insightsBySession = new Map<string, Map<string, InsightRow[]>>();
  for (const insight of insights) {
    if (!insightsBySession.has(insight.session_id)) {
      insightsBySession.set(insight.session_id, new Map());
    }
    const byType = insightsBySession.get(insight.session_id)!;
    const list = byType.get(insight.type) ?? [];
    list.push(insight);
    byType.set(insight.type, list);
  }

  for (const session of sessions) {
    const title = session.custom_title ?? session.generated_title ?? session.id;
    lines.push(`## Session: ${title}`);

    const metaLine1: string[] = [];
    if (session.project_name) metaLine1.push(`**Project:** ${session.project_name}`);
    if (session.session_character) metaLine1.push(`**Character:** ${session.session_character}`);
    if (session.source_tool) metaLine1.push(`**Source:** ${session.source_tool}`);
    if (session.estimated_cost_usd != null) {
      metaLine1.push(`**Cost:** $${Number(session.estimated_cost_usd).toFixed(2)}`);
    }
    if (metaLine1.length > 0) lines.push(metaLine1.join(' | '));

    const metaLine2: string[] = [];
    if (session.started_at && session.ended_at) {
      metaLine2.push(`**Period:** ${session.started_at} — ${session.ended_at}`);
    } else if (session.started_at) {
      metaLine2.push(`**Period:** ${session.started_at}`);
    }
    if (session.message_count != null) metaLine2.push(`**Messages:** ${session.message_count}`);
    if (metaLine2.length > 0) lines.push(metaLine2.join(' | '));

    lines.push('');

    const byType = insightsBySession.get(session.id);
    if (!byType || byType.size === 0) {
      lines.push('*No insights for this session.*');
      lines.push('');
      continue;
    }

    const summaries = byType.get('summary');
    if (summaries) {
      for (const s of summaries) {
        renderSummary(s, lines);
        lines.push('');
      }
    }

    const decisions = byType.get('decision');
    if (decisions) {
      renderDecisions(decisions, lines);
    }

    const learnings = byType.get('learning');
    if (learnings) {
      renderLearnings(learnings, lines);
    }

    const techniques = byType.get('technique');
    if (techniques) {
      renderTechniques(techniques, lines);
    }

    const pqInsights = byType.get('prompt_quality');
    if (pqInsights) {
      for (const pq of pqInsights) {
        renderPromptQuality(pq, lines);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
