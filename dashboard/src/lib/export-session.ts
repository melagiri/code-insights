import { getSessionTitle, formatDurationMinutes } from '@/lib/utils';
import type { Insight, Session } from '@/lib/types';

/**
 * Trigger a markdown file download for a session.
 * Toast notification is the caller's responsibility (UI concern).
 */
export function exportSession(
  session: Session,
  insights: Insight[],
  summaryText: string | null | undefined,
  format: 'plain' | 'obsidian' | 'notion'
): void {
  const title = getSessionTitle(session);
  const startedAt = new Date(session.started_at);
  const endedAt = new Date(session.ended_at);
  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
  const dateStr = startedAt.toISOString().slice(0, 10);
  const lines: string[] = [];

  if (format === 'obsidian') {
    lines.push(`# ${title}`, '', `> [!info]`);
    lines.push(
      `> Date: ${dateStr}  `,
      `> Duration: ${formatDurationMinutes(durationMinutes)}  `,
      `> Project: ${session.project_name}`
    );
  } else {
    lines.push(
      `# ${title}`,
      '',
      `**Date:** ${dateStr}  `,
      `**Duration:** ${formatDurationMinutes(durationMinutes)}  `,
      `**Project:** ${session.project_name}`
    );
  }

  if (summaryText) {
    lines.push('', '## Summary', '', summaryText);
  }
  if (insights.length > 0) {
    lines.push('', '## Insights');
    for (const insight of insights.filter((i) => i.type !== 'summary')) {
      lines.push('', `### ${insight.title} (${insight.type})`, '', insight.content);
    }
  }

  const content = lines.join('\n');
  const projectSlug = session.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `session-${projectSlug}-${dateStr}.md`;
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
