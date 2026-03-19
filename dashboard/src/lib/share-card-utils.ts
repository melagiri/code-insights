// Utilities for the shareable working style card.
// All display names and colors are hardcoded — no CSS variables, no Tailwind.

import { toPng } from 'html-to-image';

// Keep in sync with SOURCE_LABELS in dashboard/src/components/sessions/CompactSessionRow.tsx
export const SOURCE_TOOL_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  'cursor': 'Cursor',
  'codex-cli': 'Codex CLI',
  'copilot-cli': 'Copilot CLI',
  'copilot': 'VS Code Copilot',
};

export interface ToolPillColors {
  bg: string;
  text: string;
  border: string;
}

export const SOURCE_TOOL_PILL_COLORS: Record<string, ToolPillColors> = {
  'claude-code': { bg: '#2a1f16', text: '#fb923c', border: '#fb923c4d' },
  'cursor':      { bg: '#161d2e', text: '#60a5fa', border: '#60a5fa4d' },
  'codex-cli':   { bg: '#142319', text: '#4ade80', border: '#4ade804d' },
  'copilot-cli': { bg: '#0f2027', text: '#22d3ee', border: '#22d3ee4d' },
  'copilot':     { bg: '#1c172e', text: '#a78bfa', border: '#a78bfa4d' },
};

export interface MilestonePill {
  icon: string;      // emoji
  label: string;
  iconColor: string; // hex
}

/**
 * Compute milestone pills from session stats.
 * Returns at most 4 pills, priority-ordered.
 */
export function computeMilestones(
  totalSessions: number,
  streak: number,
  sourceToolCount: number,
  successRate: number   // 0–100
): MilestonePill[] {
  const milestones: MilestonePill[] = [];

  // Session count milestone
  const sessionThresholds = [1000, 500, 250, 100, 50] as const;
  for (const t of sessionThresholds) {
    if (totalSessions >= t) {
      milestones.push({ icon: '★', label: `${t}+ Sessions`, iconColor: '#c084fc' });
      break;
    }
  }

  // Streak milestone
  const streakThresholds = [90, 60, 30, 14, 7] as const;
  for (const t of streakThresholds) {
    if (streak >= t) {
      milestones.push({ icon: '🔥', label: `${t}-Day Streak`, iconColor: '#f59e0b' });
      break;
    }
  }

  // Multi-tool milestone
  if (sourceToolCount >= 5) {
    milestones.push({ icon: '⚡', label: '5 AI Tools', iconColor: '#22d3ee' });
  } else if (sourceToolCount >= 4) {
    milestones.push({ icon: '⚡', label: '4 AI Tools', iconColor: '#22d3ee' });
  } else if (sourceToolCount >= 3) {
    milestones.push({ icon: '⚡', label: '3+ AI Tools', iconColor: '#22d3ee' });
  } else if (sourceToolCount >= 2) {
    milestones.push({ icon: '⚡', label: '2+ AI Tools', iconColor: '#22d3ee' });
  }

  // Success rate milestone (>85% over 30+ sessions)
  if (successRate > 85 && totalSessions >= 30) {
    milestones.push({ icon: '✓', label: '85%+ Success', iconColor: '#4ade80' });
  }

  return milestones.slice(0, 4);
}

/**
 * Capture the given DOM element as a PNG and trigger a browser download.
 * Uses 2x pixel ratio for a crisp export.
 */
export async function downloadShareCard(element: HTMLElement): Promise<void> {
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    width: 1200,
    height: 630,
  });

  const link = document.createElement('a');
  link.download = 'code-insights-working-style.png';
  link.href = dataUrl;
  link.click();
}
