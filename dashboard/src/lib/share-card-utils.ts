// Utilities for the shareable working style card.
// All display names and colors are hardcoded — no CSS variables, no Tailwind.

import { toJpeg } from 'html-to-image';

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

// Border colors use rgba() — 8-digit hex (#fb923c4d) breaks html-to-image SVG serialization
export const SOURCE_TOOL_PILL_COLORS: Record<string, ToolPillColors> = {
  'claude-code': { bg: '#2a1f16', text: '#fb923c', border: 'rgba(251,146,60,0.3)' },
  'cursor':      { bg: '#161d2e', text: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
  'codex-cli':   { bg: '#142319', text: '#4ade80', border: 'rgba(74,222,128,0.3)' },
  'copilot-cli': { bg: '#0f2027', text: '#22d3ee', border: 'rgba(34,211,238,0.3)' },
  'copilot':     { bg: '#1c172e', text: '#a78bfa', border: 'rgba(167,139,250,0.3)' },
};

export interface MilestonePill {
  icon: string;      // emoji
  label: string;
  iconColor: string; // hex
}

/**
 * Compute milestone pills from session stats.
 * Returns at most 3 pills, priority-ordered (compact card constraint).
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

  return milestones.slice(0, 3);
}

/**
 * Capture the given DOM element as a JPEG and trigger a browser download.
 * Exports at 1:1 pixel ratio (480×280px) — no upscaling, native resolution for crisp text.
 * JPEG at quality 0.92 compresses gradient-heavy cards 3-5x smaller than PNG.
 *
 * html-to-image cannot capture elements positioned far off-screen (left: -9999px)
 * because SVG foreignObject serialization clips elements outside the viewport.
 * We temporarily move the element to top:0/left:0 (behind page content via z-index:-1),
 * capture, then restore — this ensures the element is in the serializable viewport.
 */
export async function downloadShareCard(element: HTMLElement): Promise<void> {
  // Temporarily bring element into the viewport for html-to-image capture
  const prevLeft = element.style.left;
  const prevTop = element.style.top;
  const prevZIndex = element.style.zIndex;
  element.style.left = '0px';
  element.style.top = '0px';
  element.style.zIndex = '-1';

  let dataUrl: string;
  try {
    dataUrl = await toJpeg(element, {
      pixelRatio: 1,
      width: 480,
      height: 280,
      quality: 0.92,
      backgroundColor: '#0f0f23',
    });
  } finally {
    // Always restore — even if toJpeg throws
    element.style.left = prevLeft;
    element.style.top = prevTop;
    element.style.zIndex = prevZIndex;
  }

  const link = document.createElement('a');
  link.download = 'code-insights-working-style.jpg';
  link.href = dataUrl;
  link.click();
}
