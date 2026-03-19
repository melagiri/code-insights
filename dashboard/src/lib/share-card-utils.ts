// Utilities for the shareable AI Fluency Score card.
// Canvas 2D implementation — no external dependencies, pixel-perfect text rendering.
// V3: Score card + fingerprint — single hero score, 5 rainbow bars, evidence lines.
//
// Resolution: drawn at 2× physical pixels (2400×1260) for HiDPI sharpness,
// exported as 1200×630 PNG (OG image standard). The 2× internal resolution
// ensures crisp text rendering on Retina/HiDPI displays.

import type { PQDimensionScores } from '@/lib/api';
import {
  drawIcon, drawToolIcon, loadToolIcons, deduplicateToolsForIcons,
  ICON_BOOK_OPEN, ICON_TARGET, ICON_EYE, ICON_CLOCK, ICON_GIT_BRANCH,
  ICON_BAR_CHART_3, ICON_ZAP,
} from '@/lib/share-card-icons';
import { SOURCE_TOOL_DISPLAY_NAMES } from '@/lib/share-card-icons';

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO_STACK = '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace';

// Physical resolution multiplier — draw at 2× for HiDPI PNG export
const DPR = 2;

export interface ShareCardProps {
  tagline: string;
  dimensionScores: PQDimensionScores | null; // null = no PQ data
  totalSessions: number;       // sessions in 4-week scoring window
  totalTokens: number;         // tokens in 4-week scoring window
  lifetimeSessions: number;    // all-time session count
  sourceTools: string[];
  currentWeek: string;         // for month/year in header
  effectivePatterns?: Array<{ label: string; frequency: number }>; // top 3 by frequency
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

/**
 * Draw the favicon logo — indigo/purple gradient rounded rect with white magnifying
 * glass and amber crosshair. Matches dashboard/public/favicon.svg exactly.
 * (x, y) is top-left of the square; size is the side length in canvas pixels.
 */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const scale = size / 32; // favicon viewBox is 32×32

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Background: indigo→purple gradient rounded rect (rx=7)
  const bgGrad = ctx.createLinearGradient(0, 0, 32, 32);
  bgGrad.addColorStop(0, '#6366f1');
  bgGrad.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.fill();

  // Magnifying glass: white circle at (18,14) r=6
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(18, 14, 6, 0, Math.PI * 2);
  ctx.stroke();

  // Handle: white line from (22.2,18.2) to (25.5,21.5)
  ctx.beginPath();
  ctx.moveTo(22.2, 18.2);
  ctx.lineTo(25.5, 21.5);
  ctx.stroke();

  // Amber crosshair center dot at (18,13) r=0.7
  const accentGrad = ctx.createLinearGradient(0, 0, 32, 32);
  accentGrad.addColorStop(0, '#fbbf24');
  accentGrad.addColorStop(1, '#f59e0b');
  ctx.fillStyle = accentGrad;
  ctx.beginPath();
  ctx.arc(18, 13, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Amber crosshair vertical line (18,11)→(18,15)
  ctx.strokeStyle = accentGrad;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(18, 11);
  ctx.lineTo(18, 15);
  ctx.stroke();

  // Amber crosshair horizontal line (16,13)→(20,13)
  ctx.beginPath();
  ctx.moveTo(16, 13);
  ctx.lineTo(20, 13);
  ctx.stroke();

  ctx.restore();
}

/**
 * Derive month + year label from an ISO week string (e.g. "2026-W11" → "Mar 2026").
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

/** Format token count: 1,200,000 → "1.2M tokens", 850,000 → "850K tokens". */
function abbreviateTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K tokens`;
  return `${n} tokens`;
}

/** Score color tiers — arc gradient start/end and number color. */
function scoreColors(score: number | null): { numberColor: string; arcStart: string; arcEnd: string } {
  if (score === null) return { numberColor: '#64748b', arcStart: '#64748b', arcEnd: '#475569' };
  if (score >= 80) return { numberColor: '#f1f5f9', arcStart: '#6366f1', arcEnd: '#d946ef' };
  if (score >= 60) return { numberColor: '#e2e8f0', arcStart: '#6366f1', arcEnd: '#a855f7' };
  if (score >= 40) return { numberColor: '#cbd5e1', arcStart: '#f59e0b', arcEnd: '#eab308' };
  return { numberColor: '#94a3b8', arcStart: '#64748b', arcEnd: '#475569' };
}

// Fingerprint bar definitions — order matches V3 spec
const FINGERPRINT_BARS = [
  { label: 'CONTEXT',       field: 'context_provision',   color: '#6366f1', icon: ICON_BOOK_OPEN,   yCentre: 252 },
  { label: 'CLARITY',       field: 'request_specificity', color: '#8b5cf6', icon: ICON_TARGET,      yCentre: 284 },
  { label: 'FOCUS',         field: 'scope_management',    color: '#a855f7', icon: ICON_EYE,         yCentre: 316 },
  { label: 'TIMING',        field: 'information_timing',  color: '#d946ef', icon: ICON_CLOCK,       yCentre: 348 },
  { label: 'ORCHESTRATION', field: 'correction_quality',  color: '#ec4899', icon: ICON_GIT_BRANCH,  yCentre: 380 },
] as const;

// Effective pattern pill colors — cycle through these for top 3 patterns
const PATTERN_PILL_COLORS = [
  { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', text: '#c4b5fd' },
  { bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.3)',  text: '#6ee7b7' },
  { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.3)',  text: '#fcd34d' },
];

/**
 * Draw the full share card onto the given canvas.
 * The canvas must be set to LOGICAL_W * DPR × LOGICAL_H * DPR before calling.
 * ctx.scale(DPR, DPR) is applied internally — all coordinates use logical pixels.
 * V3: Score card + fingerprint layout.
 * toolIcons pre-loaded via loadToolIcons() for async image rendering.
 */
export function drawShareCard(
  canvas: HTMLCanvasElement,
  props: ShareCardProps,
  toolIcons: Map<string, HTMLImageElement>
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Logical dimensions — all drawing coordinates use these
  const W = 1200;
  const H = 630;
  const PAD = 48;
  const CONTENT_W = W - PAD * 2; // 1104

  // Scale up for HiDPI: draw at DPR× physical resolution
  ctx.scale(DPR, DPR);

  // ── Background ──────────────────────────────────────────────────────────────

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0c0c18');
  bg.addColorStop(1, '#141428');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow1 = ctx.createRadialGradient(-60, -60, 0, -60, -60, 400);
  glow1.addColorStop(0, 'rgba(99,102,241,0.12)');
  glow1.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(1260, 690, 0, 1260, 690, 500);
  glow2.addColorStop(0, 'rgba(168,85,247,0.10)');
  glow2.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  const glow3 = ctx.createRadialGradient(240, 320, 0, 240, 320, 200);
  glow3.addColorStop(0, 'rgba(167,139,250,0.08)');
  glow3.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.fillStyle = glow3;
  ctx.fillRect(0, 0, W, H);

  // ── Section 1: Header (y=48) ─────────────────────────────────────────────────

  const LOGO_SIZE = 28;
  drawLogo(ctx, PAD, PAD, LOGO_SIZE);

  ctx.font = `600 13px ${FONT_STACK}`;
  ctx.fillStyle = '#64748b';
  ctx.letterSpacing = '2px';
  ctx.fillText('CODE INSIGHTS', PAD + LOGO_SIZE + 10, PAD + LOGO_SIZE * 0.72);
  ctx.letterSpacing = '0px';

  const monthYear = getMonthYearFromWeek(props.currentWeek);
  ctx.font = `500 14px ${FONT_STACK}`;
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'right';
  ctx.fillText(monthYear, W - PAD, PAD + LOGO_SIZE * 0.72);
  ctx.textAlign = 'left';

  // ── Section 2: Archetype Identity (y=138) ────────────────────────────────────

  const displayTagline = props.tagline || 'AI Coding Profile';
  ctx.font = `700 40px ${FONT_STACK}`;
  ctx.fillStyle = '#e2e0ff';
  ctx.fillText(truncateText(ctx, displayTagline, CONTENT_W), PAD, 138);

  // ── Section 3: Hero Score Circle (center at x=200, y=320) ────────────────────

  const SCORE_CX = 200;
  const SCORE_CY = 320;
  const SCORE_R = 90;
  const score = props.dimensionScores?.overall ?? null;
  const colors = scoreColors(score);

  // Hero watermark — favicon logo drawn large at very low opacity, centered behind score
  ctx.globalAlpha = 0.04;
  const WATERMARK_SIZE = 160;
  drawLogo(ctx, SCORE_CX - WATERMARK_SIZE / 2, SCORE_CY - WATERMARK_SIZE / 2, WATERMARK_SIZE);
  ctx.globalAlpha = 1.0;

  // Track ring (full circle background)
  ctx.beginPath();
  ctx.arc(SCORE_CX, SCORE_CY, SCORE_R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 8;
  ctx.stroke();

  // Score arc (filled portion) — save/restore to prevent lineCap leaking to subsequent strokes
  if (score !== null && score > 0) {
    ctx.save();
    const arcGradient = ctx.createLinearGradient(
      SCORE_CX - SCORE_R, SCORE_CY,
      SCORE_CX + SCORE_R, SCORE_CY
    );
    arcGradient.addColorStop(0, colors.arcStart);
    arcGradient.addColorStop(1, colors.arcEnd);

    const startAngle = -Math.PI / 2; // 12 o'clock
    const endAngle = startAngle + (score / 100) * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(SCORE_CX, SCORE_CY, SCORE_R, startAngle, endAngle);
    ctx.strokeStyle = arcGradient;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // Score number
  ctx.textAlign = 'center';
  if (score !== null) {
    ctx.font = `700 72px ${FONT_STACK}`;
    ctx.fillStyle = colors.numberColor;
    ctx.fillText(String(score), SCORE_CX, 316);
  } else {
    ctx.font = `700 64px ${FONT_STACK}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText('—', SCORE_CX, 316);
  }

  ctx.font = `600 13px ${FONT_STACK}`;
  ctx.fillStyle = '#64748b';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('AI FLUENCY', SCORE_CX, 354);
  ctx.letterSpacing = '0px';

  ctx.font = `600 11px ${FONT_STACK}`;
  ctx.fillStyle = '#4a4a62';
  ctx.letterSpacing = '2px';
  ctx.fillText('SCORE', SCORE_CX, 372);
  ctx.letterSpacing = '0px';

  ctx.textAlign = 'left';

  // ── Section 4: Fingerprint Bars (right zone) ──────────────────────────────────
  //
  // Label zone: LABEL_LEFT_X → BAR_START_X - GAP
  // Labels (icon + text) are right-aligned to LABEL_RIGHT_X so all bars start
  // at exactly BAR_START_X regardless of label width.

  const BAR_START_X = 560;
  const BAR_END_X = W - PAD; // 1152
  const BAR_MAX_W = BAR_END_X - BAR_START_X; // 592
  const BAR_H = 20;
  const BAR_RADIUS = 10;
  const ICON_SIZE = 16;
  const ICON_GAP = 8;
  const LABEL_RIGHT_X = BAR_START_X - 14; // all labels right-align here
  const MIN_FILL_W = 20;

  for (const bar of FINGERPRINT_BARS) {
    const barY = bar.yCentre - BAR_H / 2;
    // Dimension score is null if no data for this dimension — show track only (no fill)
    const dimScore: number | null = props.dimensionScores
      ? (props.dimensionScores[bar.field as keyof PQDimensionScores] as number | null)
      : null;

    // Draw bar track (full width pill)
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.roundRect(BAR_START_X, barY, BAR_MAX_W, BAR_H, BAR_RADIUS);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(BAR_START_X, barY, BAR_MAX_W, BAR_H, BAR_RADIUS);
    ctx.stroke();

    // Draw bar fill — only if dimension has data. Null = no data, skip fill entirely.
    if (dimScore !== null) {
      const fillW = Math.max(MIN_FILL_W, Math.round((dimScore / 100) * BAR_MAX_W));
      ctx.fillStyle = bar.color;
      ctx.beginPath();
      ctx.roundRect(BAR_START_X, barY, fillW, BAR_H, BAR_RADIUS);
      ctx.fill();
    }

    // Draw label: icon + text, right-aligned at LABEL_RIGHT_X
    // Measure first, then position so the right edge lands exactly at LABEL_RIGHT_X
    ctx.font = `500 12px ${FONT_STACK}`;
    const labelTextW = ctx.measureText(bar.label).width;
    const totalLabelW = ICON_SIZE + ICON_GAP + labelTextW;
    const iconX = LABEL_RIGHT_X - totalLabelW;
    const iconY = bar.yCentre - ICON_SIZE / 2;

    drawIcon(ctx, bar.icon, iconX, iconY, ICON_SIZE, bar.color);

    ctx.fillStyle = '#6b6b88';
    ctx.fillText(bar.label, iconX + ICON_SIZE + ICON_GAP, bar.yCentre + 4);
  }

  // ── Section 5: Evidence Lines (y=420, y=452) ──────────────────────────────────
  // Line 1: scoring context — sample size + time window
  // Line 2: total sessions + tool logos with names

  const EVIDENCE_CENTER_X = 600;
  const EVIDENCE_Y1 = 422;
  const EVIDENCE_Y2 = 458;

  // Line 1: "Score from {N} sessions · {tokens} · last 4 weeks"
  if (props.totalSessions > 0 || props.dimensionScores) {
    const ICON_SMALL = 16;
    const prefix = 'Score from ';
    const sessionLabel = `${props.totalSessions} session${props.totalSessions !== 1 ? 's' : ''}`;
    const tokenLabel = abbreviateTokens(props.totalTokens);
    const windowLabel = 'last 4 weeks';
    const SEP = '  ·  ';

    ctx.font = `500 17px ${FONT_STACK}`;
    const prefixW = ctx.measureText(prefix).width;
    const sessionW = ctx.measureText(sessionLabel).width;
    const tokenW = ctx.measureText(tokenLabel).width;
    const windowW = ctx.measureText(windowLabel).width;
    const sepW = ctx.measureText(SEP).width;

    const line1TotalW = prefixW + sessionW + sepW + tokenW + sepW + windowW;
    let x1 = EVIDENCE_CENTER_X - line1TotalW / 2;

    ctx.fillStyle = '#64748b';
    ctx.fillText(prefix, x1, EVIDENCE_Y1);
    x1 += prefixW;

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(sessionLabel, x1, EVIDENCE_Y1);
    x1 += sessionW;

    ctx.fillStyle = '#3a3a52';
    ctx.fillText(SEP, x1, EVIDENCE_Y1);
    x1 += sepW;

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(tokenLabel, x1, EVIDENCE_Y1);
    x1 += tokenW;

    ctx.fillStyle = '#3a3a52';
    ctx.fillText(SEP, x1, EVIDENCE_Y1);
    x1 += sepW;

    ctx.fillStyle = '#64748b';
    ctx.fillText(windowLabel, x1, EVIDENCE_Y1);
  } else {
    ctx.font = `500 17px ${FONT_STACK}`;
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.fillText('Get started at code-insights.app', EVIDENCE_CENTER_X, EVIDENCE_Y1);
    ctx.textAlign = 'left';
  }

  // Line 2: {N} total sessions · [logo] Tool Name [logo] Tool Name ...
  {
    const lifetimeLabel = `${props.lifetimeSessions} total sessions`;
    const dedupedTools = deduplicateToolsForIcons(props.sourceTools).slice(0, 4);
    const LOGO_PX = 20;
    const LOGO_TEXT_GAP = 6;
    const LOGO_ENTRY_GAP = 16; // gap between tool entries
    const SEP = '  ·  ';

    ctx.font = `400 15px ${FONT_STACK}`;
    const totalSessionsW = ctx.measureText(lifetimeLabel).width;
    const sepW2 = ctx.measureText(SEP).width;

    // Pre-measure each tool entry width: logo + gap + label text
    const toolEntries = dedupedTools
      .filter(t => toolIcons.has(t))
      .map(t => {
        const label = SOURCE_TOOL_DISPLAY_NAMES[t] ?? t;
        const labelW = ctx.measureText(label).width;
        return { tool: t, label, entryW: LOGO_PX + LOGO_TEXT_GAP + labelW };
      });

    const logosW = toolEntries.length > 0
      ? toolEntries.reduce((s, e) => s + e.entryW, 0) + (toolEntries.length - 1) * LOGO_ENTRY_GAP
      : 0;

    const line2TotalW = totalSessionsW + (toolEntries.length > 0 ? sepW2 + logosW : 0);
    let x2 = EVIDENCE_CENTER_X - line2TotalW / 2;

    ctx.fillStyle = '#64748b';
    ctx.fillText(lifetimeLabel, x2, EVIDENCE_Y2);
    x2 += totalSessionsW;

    if (toolEntries.length > 0) {
      ctx.fillStyle = '#3a3a52';
      ctx.fillText(SEP, x2, EVIDENCE_Y2);
      x2 += sepW2;

      for (let i = 0; i < toolEntries.length; i++) {
        const { tool, label, entryW } = toolEntries[i];
        const img = toolIcons.get(tool);
        if (img) {
          const cy = EVIDENCE_Y2 - LOGO_PX / 2 + 2;
          drawToolIcon(ctx, img, x2 + LOGO_PX / 2, cy, LOGO_PX);
        }
        x2 += LOGO_PX + LOGO_TEXT_GAP;

        ctx.fillStyle = '#94a3b8';
        ctx.fillText(label, x2, EVIDENCE_Y2);
        x2 += entryW - LOGO_PX - LOGO_TEXT_GAP;

        if (i < toolEntries.length - 1) x2 += LOGO_ENTRY_GAP;
      }
    }
  }

  // ── Section 6: Effective Pattern Pills (y=494) ────────────────────────────────

  const topPatterns = (props.effectivePatterns ?? []).slice(0, 3);
  if (topPatterns.length > 0) {
    const PILL_H = 28;
    const PILL_PAD_X = 12;
    const PILL_GAP = 10;
    const PILL_Y = 494;

    ctx.font = `500 13px ${FONT_STACK}`;
    const STAR = '★ ';
    const starW = ctx.measureText(STAR).width;

    // Measure all pills first to center them as a group
    const pillWidths = topPatterns.map(p => {
      const labelW = ctx.measureText(p.label).width;
      return PILL_PAD_X * 2 + starW + labelW;
    });
    const totalPillsW = pillWidths.reduce((s, w) => s + w, 0) + PILL_GAP * (topPatterns.length - 1);
    let pillX = EVIDENCE_CENTER_X - totalPillsW / 2;

    for (let i = 0; i < topPatterns.length; i++) {
      const pattern = topPatterns[i];
      const pillW = pillWidths[i];
      const pc = PATTERN_PILL_COLORS[i % PATTERN_PILL_COLORS.length];

      // Pill background
      ctx.fillStyle = pc.bg;
      ctx.beginPath();
      ctx.roundRect(pillX, PILL_Y, pillW, PILL_H, PILL_H / 2);
      ctx.fill();

      // Pill border
      ctx.strokeStyle = pc.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, PILL_Y, pillW, PILL_H, PILL_H / 2);
      ctx.stroke();

      // Star + label text
      const textBaseline = PILL_Y + PILL_H * 0.65;
      ctx.fillStyle = pc.text;
      ctx.fillText(STAR, pillX + PILL_PAD_X, textBaseline);
      ctx.fillText(pattern.label, pillX + PILL_PAD_X + starW, textBaseline);

      pillX += pillW + PILL_GAP;
    }
  }

  // ── Section 7: Footer (pinned to bottom) ─────────────────────────────────────

  const DIVIDER_Y = H - 90; // 540
  const FOOTER_Y = H - 54;  // 576

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, DIVIDER_Y);
  ctx.lineTo(W - PAD, DIVIDER_Y);
  ctx.stroke();

  const FOOTER_LOGO_SIZE = 22;
  drawLogo(ctx, PAD, FOOTER_Y - FOOTER_LOGO_SIZE + 4, FOOTER_LOGO_SIZE);

  ctx.font = `400 15px ${FONT_STACK}`;
  ctx.fillStyle = '#475569';
  ctx.fillText('code-insights.app', PAD + FOOTER_LOGO_SIZE + 10, FOOTER_Y);

  // CLI CTA: `npx @code-insights/cli` — monospace, terminal-style with subtle bg
  const CLI_CMD = 'npx @code-insights/cli';
  ctx.font = `500 13px ${MONO_STACK}`;
  const cmdW = ctx.measureText(CLI_CMD).width;
  const CMD_PAD_X = 10;
  const CMD_PAD_Y = 6;
  const CMD_H = 22;
  const cmdBoxW = cmdW + CMD_PAD_X * 2;
  const cmdBoxX = W - PAD - cmdBoxW;
  const cmdBoxY = FOOTER_Y - CMD_H + CMD_PAD_Y - 1;

  // Terminal command background
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.roundRect(cmdBoxX, cmdBoxY, cmdBoxW, CMD_H, 4);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cmdBoxX, cmdBoxY, cmdBoxW, CMD_H, 4);
  ctx.stroke();

  ctx.fillStyle = '#a5b4fc';
  ctx.fillText(CLI_CMD, cmdBoxX + CMD_PAD_X, FOOTER_Y);
}

/**
 * Create an ephemeral 2× canvas, draw the share card at HiDPI resolution,
 * then export as a 1200×630 PNG (OG image standard for X, LinkedIn, Slack,
 * Discord). The draw canvas is 2400×1260 (2× of 1200×630 logical coords)
 * for crisp text on Retina/HiDPI displays.
 */
export async function downloadShareCard(props: ShareCardProps): Promise<void> {
  // Pre-load tool logos before drawing (canvas drawImage requires loaded images)
  const toolIcons = await loadToolIcons(props.sourceTools);

  // Internal draw canvas: 1200×630 logical, 2400×1260 physical (DPR=2)
  const LOGICAL_W = 1200;
  const LOGICAL_H = 630;

  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = LOGICAL_W * DPR;   // 2400
  drawCanvas.height = LOGICAL_H * DPR;  // 1260
  drawShareCard(drawCanvas, props, toolIcons);

  // Export at 1200×630 (OG standard) — scale from 2400×1260 internal (clean 2× downscale)
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = LOGICAL_W;
  exportCanvas.height = LOGICAL_H;
  const exportCtx = exportCanvas.getContext('2d');
  if (!exportCtx) throw new Error('Failed to get 2D context for export canvas');

  exportCtx.drawImage(drawCanvas, 0, 0, LOGICAL_W, LOGICAL_H);

  const blob = await new Promise<Blob>((resolve, reject) =>
    exportCanvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png')
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = 'code-insights-ai-fluency.png';
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
