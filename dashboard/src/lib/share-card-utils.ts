// Utilities for the shareable working style card.
// Canvas 2D implementation — no external dependencies, pixel-perfect text rendering.
// V2: Content-dense redesign — stacked bar, strengths pills, prompt clarity score.

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
  'claude-code': { bg: '#2a1f16', text: '#fb923c', border: 'rgba(251,146,60,0.3)' },
  'cursor':      { bg: '#161d2e', text: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
  'codex-cli':   { bg: '#142319', text: '#4ade80', border: 'rgba(74,222,128,0.3)' },
  'copilot-cli': { bg: '#0f2027', text: '#22d3ee', border: 'rgba(34,211,238,0.3)' },
  'copilot':     { bg: '#1c172e', text: '#a78bfa', border: 'rgba(167,139,250,0.3)' },
};

// Character type colors — match SESSION_CHARACTER_COLORS hues
const CHARACTER_COLORS: Record<string, string> = {
  deep_focus:    '#6366f1',
  bug_hunt:      '#ef4444',
  feature_build: '#10b981',
  exploration:   '#f59e0b',
  refactor:      '#06b6d4',
  learning:      '#8b5cf6',
  quick_task:    '#64748b',
};

// Keep in sync with SESSION_CHARACTER_LABELS in dashboard/src/lib/constants/colors.ts
const CHARACTER_LABELS: Record<string, string> = {
  deep_focus:    'Deep Focus',
  bug_hunt:      'Bug Hunt',
  feature_build: 'Feature Build',
  exploration:   'Exploration',
  refactor:      'Refactor',
  learning:      'Learning',
  quick_task:    'Quick Task',
};

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function abbreviateCount(n: number): string {
  if (n >= 10000) return `${Math.floor(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Truncate text to fit within maxWidth, appending ellipsis if needed. */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '\u2026').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '\u2026';
}

/** Draw the app logo (blue rounded rect + white lines) at (x, y) with given size. */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const rx = size * 0.25;
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, rx);
  ctx.fill();

  ctx.strokeStyle = 'white';
  ctx.lineWidth = size * 0.13;
  ctx.lineCap = 'round';
  const pad = size * 0.28;

  ctx.beginPath();
  ctx.moveTo(x + pad, y + size * 0.36);
  ctx.lineTo(x + size - pad, y + size * 0.36);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + pad, y + size * 0.50);
  ctx.lineTo(x + size - pad * 1.5, y + size * 0.50);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + pad, y + size * 0.64);
  ctx.lineTo(x + size - pad * 0.8, y + size * 0.64);
  ctx.stroke();
}

/**
 * Derive month + year label from an ISO week string (e.g. "2026-W11" to "Mar 2026").
 * Uses the Monday of that ISO week to avoid wrong month for historical weeks.
 */
function getMonthYearFromWeek(isoWeek: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!match) {
    return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay();
  const daysToMonday = jan4Day === 0 ? 6 : jan4Day - 1;
  const week1Monday = new Date(jan4.getTime() - daysToMonday * 86400000);
  const weekMonday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
  return weekMonday.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export interface ShareCardProps {
  tagline: string;
  taglineSubtitle?: string;
  totalSessions: number;
  streak: number;
  sourceTools: string[];
  characterDistribution: Record<string, number>;
  currentWeek: string;
  // V2 additions:
  promptClarityScore?: number;              // 0-100, undefined = no PQ data
  effectivePatterns?: Array<{               // top 3 by frequency
    label: string;
    frequency: number;
  }>;
}

/**
 * Draw the full share card onto the given canvas at 1200x630px.
 * The canvas must already have width=1200 and height=630 set.
 * V2: Content-dense layout — stacked bar, strengths pills, prompt clarity score.
 */
export function drawShareCard(canvas: HTMLCanvasElement, props: ShareCardProps): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = 1200;
  const H = 630;
  const PAD = 48;
  const CONTENT_W = W - PAD * 2; // 1104

  // ── Background ──────────────────────────────────────────────────────────────

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f0f23');
  bg.addColorStop(1, '#1a1a3e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow1 = ctx.createRadialGradient(-60, -60, 0, -60, -60, 380);
  glow1.addColorStop(0, 'rgba(59,130,246,0.18)');
  glow1.addColorStop(1, 'rgba(59,130,246,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W + 80, H + 80, 0, W + 80, H + 80, 500);
  glow2.addColorStop(0, 'rgba(168,85,247,0.14)');
  glow2.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // ── Section 1: Header (y = 48) ──────────────────────────────────────────────

  const LOGO_SIZE = 28;
  drawLogo(ctx, PAD, PAD, LOGO_SIZE);

  ctx.font = `600 13px ${FONT_STACK}`;
  ctx.fillStyle = '#a0a0b8';
  ctx.letterSpacing = '2px';
  ctx.fillText('CODE INSIGHTS', PAD + LOGO_SIZE + 10, PAD + LOGO_SIZE * 0.72);
  ctx.letterSpacing = '0px';

  const monthYear = getMonthYearFromWeek(props.currentWeek);
  ctx.font = `500 14px ${FONT_STACK}`;
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.fillText(monthYear, W - PAD, PAD + LOGO_SIZE * 0.72);
  ctx.textAlign = 'left';

  // ── Section 2: Tagline + Subtitle (y = 128) ─────────────────────────────────

  const TAGLINE_Y = 128;
  ctx.font = `bold 44px ${FONT_STACK}`;
  ctx.fillStyle = '#a78bfa';
  ctx.fillText(truncateText(ctx, props.tagline, CONTENT_W), PAD, TAGLINE_Y);

  let contentCursor = TAGLINE_Y + 10;
  if (props.taglineSubtitle) {
    const SUBTITLE_Y = 164;
    ctx.font = `400 22px ${FONT_STACK}`;
    ctx.fillStyle = '#8b8ba0';
    ctx.fillText(truncateText(ctx, props.taglineSubtitle, CONTENT_W), PAD, SUBTITLE_Y);
    contentCursor = SUBTITLE_Y + 10;
  }

  // ── Section 3: Stat Boxes ───────────────────────────────────────────────────

  const STAT_BOX_W = 180;
  const STAT_BOX_H = 88;
  const STAT_GAP = 16;
  const STAT_RADIUS = 8;
  const STAT_TOP = contentCursor + 36;

  const stats = [
    { value: abbreviateCount(props.totalSessions), label: 'SESSIONS' },
    { value: props.streak > 0 ? `${props.streak}d` : '\u2014', label: 'STREAK' },
    {
      value: props.promptClarityScore !== undefined ? String(props.promptClarityScore) : '\u2014',
      label: 'PROMPT CLARITY',
    },
  ];

  for (let i = 0; i < stats.length; i++) {
    const bx = PAD + i * (STAT_BOX_W + STAT_GAP);
    const by = STAT_TOP;

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.roundRect(bx, by, STAT_BOX_W, STAT_BOX_H, STAT_RADIUS);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, STAT_BOX_W, STAT_BOX_H, STAT_RADIUS);
    ctx.stroke();

    ctx.font = `bold 44px ${FONT_STACK}`;
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.fillText(stats[i].value, bx + STAT_BOX_W / 2, by + 52);

    ctx.font = `600 14px ${FONT_STACK}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(stats[i].label, bx + STAT_BOX_W / 2, by + 72);
    ctx.textAlign = 'left';
  }

  const statBottom = STAT_TOP + STAT_BOX_H;

  // ── Section 4: Character Distribution Bar ───────────────────────────────────

  const sortedChars = Object.entries(props.characterDistribution)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const charTotal = sortedChars.reduce((s, [, v]) => s + v, 0);

  let sectionBottom = statBottom;

  if (sortedChars.length > 0 && charTotal > 0) {
    const BAR_TOP = statBottom + 32;
    const BAR_H = 36;
    const BAR_RADIUS = 6;

    // Clip to rounded rect so segments get rounded corners from the overall shape
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PAD, BAR_TOP, CONTENT_W, BAR_H, BAR_RADIUS);
    ctx.clip();

    let segX = PAD;
    for (let i = 0; i < sortedChars.length; i++) {
      const [key, count] = sortedChars[i];
      const pct = count / charTotal;
      // Last segment fills the remainder to avoid a rounding gap at the bar's right edge
      const segW = (i === sortedChars.length - 1)
        ? (PAD + CONTENT_W) - segX
        : Math.round(pct * CONTENT_W);
      const color = CHARACTER_COLORS[key] ?? '#64748b';

      ctx.fillStyle = color;
      ctx.fillRect(segX, BAR_TOP, segW, BAR_H);

      // Inline label for segments >= 15%
      if (pct >= 0.15) {
        const label = `${CHARACTER_LABELS[key] ?? key} ${Math.round(pct * 100)}%`;
        ctx.font = `500 12px ${FONT_STACK}`;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'center';
        ctx.fillText(label, segX + segW / 2, BAR_TOP + BAR_H * 0.62);
        ctx.textAlign = 'left';
      }

      segX += segW;
    }
    ctx.restore();

    // Legend row (y = BAR_TOP + BAR_H + 14)
    const LEGEND_Y = BAR_TOP + BAR_H + 14;
    ctx.font = `400 13px ${FONT_STACK}`;
    let legendX = PAD;
    const DOT_R = 5;
    const LEGEND_GAP = 24;

    for (const [key, count] of sortedChars) {
      const pct = Math.round((count / charTotal) * 100);
      const label = `${CHARACTER_LABELS[key] ?? key} ${pct}%`;
      const color = CHARACTER_COLORS[key] ?? '#64748b';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(legendX + DOT_R, LEGEND_Y - 4, DOT_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.fillText(label, legendX + DOT_R * 2 + 6, LEGEND_Y);
      legendX += ctx.measureText(label).width + DOT_R * 2 + 6 + LEGEND_GAP;
    }

    sectionBottom = LEGEND_Y + 6;
  }

  // ── Section 5: Strengths Pills ──────────────────────────────────────────────

  const topPatterns = (props.effectivePatterns ?? []).slice(0, 3);

  if (topPatterns.length > 0) {
    const STRENGTHS_TOP = sectionBottom + 16;
    const PILL_H = 32;
    const PILL_PAD_X = 14;
    const PILL_GAP = 10;

    ctx.font = `600 11px ${FONT_STACK}`;
    ctx.fillStyle = '#64748b';
    ctx.letterSpacing = '1.5px';
    ctx.fillText('STRENGTHS', PAD, STRENGTHS_TOP);
    ctx.letterSpacing = '0px';

    const PILLS_START_Y = STRENGTHS_TOP + 16;
    let pillX = PAD;
    let pillRow = 0;
    const MAX_ROWS = 2;

    ctx.font = `500 14px ${FONT_STACK}`;
    for (const pattern of topPatterns) {
      const starW = ctx.measureText('★').width;
      const labelW = ctx.measureText(pattern.label).width;
      const pillW = PILL_PAD_X * 2 + starW + 6 + labelW;

      // Wrap to next row if needed
      if (pillX + pillW > W - PAD && pillRow < MAX_ROWS - 1) {
        pillX = PAD;
        pillRow++;
      }
      if (pillRow >= MAX_ROWS) break;

      const pillY = PILLS_START_Y + pillRow * (PILL_H + PILL_GAP);

      ctx.fillStyle = 'rgba(167,139,250,0.1)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, PILL_H, PILL_H / 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(167,139,250,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, PILL_H, PILL_H / 2);
      ctx.stroke();

      const textBaseline = pillY + PILL_H * 0.64;
      ctx.fillStyle = '#a78bfa';
      ctx.fillText('★', pillX + PILL_PAD_X, textBaseline);

      ctx.fillStyle = '#c4b5fd';
      ctx.fillText(pattern.label, pillX + PILL_PAD_X + starW + 6, textBaseline);

      pillX += pillW + PILL_GAP;
    }
  }

  // ── Section 6: Footer (pinned to bottom) ────────────────────────────────────

  const DIVIDER_Y = H - 120; // 510
  const FOOTER_Y = H - 84;   // 546

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, DIVIDER_Y);
  ctx.lineTo(W - PAD, DIVIDER_Y);
  ctx.stroke();

  const FOOTER_LOGO_SIZE = 20;
  drawLogo(ctx, PAD, FOOTER_Y - 14, FOOTER_LOGO_SIZE);

  ctx.font = `400 16px ${FONT_STACK}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('code-insights.app', PAD + FOOTER_LOGO_SIZE + 10, FOOTER_Y);

  // Tool pills in footer center (after URL + 24px gap)
  const urlW = ctx.measureText('code-insights.app').width;
  const TOOL_PILL_START_X = PAD + FOOTER_LOGO_SIZE + 10 + urlW + 24;
  const tools = props.sourceTools.slice(0, 4);
  const TOOL_PILL_H = 22;
  const TOOL_PILL_PAD_X = 10;

  ctx.font = `500 11px ${FONT_STACK}`;
  let toolX = TOOL_PILL_START_X;
  for (const tool of tools) {
    const colors = SOURCE_TOOL_PILL_COLORS[tool] ?? { bg: '#1e293b', text: '#94a3b8', border: 'rgba(148,163,184,0.3)' };
    const label = SOURCE_TOOL_DISPLAY_NAMES[tool] ?? tool;
    const textW = ctx.measureText(label).width;
    const pillW = textW + TOOL_PILL_PAD_X * 2;

    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.roundRect(toolX, FOOTER_Y - TOOL_PILL_H + 4, pillW, TOOL_PILL_H, TOOL_PILL_H / 2);
    ctx.fill();

    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(toolX, FOOTER_Y - TOOL_PILL_H + 4, pillW, TOOL_PILL_H, TOOL_PILL_H / 2);
    ctx.stroke();

    ctx.fillStyle = colors.text;
    ctx.fillText(label, toolX + TOOL_PILL_PAD_X, FOOTER_Y - 1);

    toolX += pillW + 8;
  }

  // Footer right: #MyCodeStyle hashtag
  ctx.font = `500 14px ${FONT_STACK}`;
  ctx.fillStyle = '#a78bfa';
  ctx.textAlign = 'right';
  ctx.fillText('#MyCodeStyle', W - PAD, FOOTER_Y);
  ctx.textAlign = 'left';
}

/**
 * Create an ephemeral canvas, draw the share card, and trigger a PNG download.
 * No DOM element ref needed — canvas is created and discarded in memory.
 */
export async function downloadShareCard(props: ShareCardProps): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  drawShareCard(canvas, props);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png')
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = 'code-insights-working-style.png';
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
