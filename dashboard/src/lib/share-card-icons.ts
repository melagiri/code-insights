// Canvas 2D icon rendering for share card.
// Lucide SVG paths extracted from lucide-react v0.475.0 (24×24 viewBox, 2px stroke).
// Tool logos loaded as Vite asset URLs and rendered via Image() objects.

// Tool logo URLs — served from dashboard/public/icons/ as static assets (no Vite hashing needed;
// these are brand marks, not app assets that change with code).
const claudeCodeUrl = '/icons/Claude_Code.svg';
const cursorUrl = '/icons/cursor.png';
const codexUrl = '/icons/codex.png';
const copilotUrl = '/icons/github-copilot-icon.png';

export interface IconDef {
  /** SVG path d-strings for a 24×24 viewBox */
  paths: string[];
  /** SVG circle definitions (cx, cy, r) */
  circles?: Array<{ cx: number; cy: number; r: number }>;
  /** SVG line definitions */
  lines?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** SVG polyline points strings */
  polylines?: string[];
}

// Lucide BookOpen icon paths (24x24 viewBox)
export const ICON_BOOK_OPEN: IconDef = {
  paths: [
    'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z',
    'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  ],
};

// Lucide Target icon paths (24x24 viewBox)
export const ICON_TARGET: IconDef = {
  circles: [
    { cx: 12, cy: 12, r: 10 },
    { cx: 12, cy: 12, r: 6 },
    { cx: 12, cy: 12, r: 2 },
  ],
  paths: [],
};

// Lucide Eye icon paths (24x24 viewBox)
export const ICON_EYE: IconDef = {
  paths: [
    'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z',
  ],
  circles: [
    { cx: 12, cy: 12, r: 3 },
  ],
};

// Lucide Clock icon paths (24x24 viewBox)
export const ICON_CLOCK: IconDef = {
  circles: [
    { cx: 12, cy: 12, r: 10 },
  ],
  polylines: ['12 6 12 12 16 14'],
  paths: [],
};

// Lucide GitBranch icon paths (24x24 viewBox)
export const ICON_GIT_BRANCH: IconDef = {
  paths: [
    'M6 3v12',
  ],
  circles: [
    { cx: 18, cy: 6, r: 3 },
    { cx: 6, cy: 18, r: 3 },
    { cx: 6, cy: 6, r: 3 },
  ],
  lines: [
    { x1: 18, y1: 9, x2: 18, y2: 21 },
  ],
  polylines: ['18 21 6 15'],
};

// Lucide BarChart3 icon paths (24x24 viewBox)
export const ICON_BAR_CHART_3: IconDef = {
  paths: [
    'M3 3v18h18',
    'M18 17V9',
    'M13 17V5',
    'M8 17v-3',
  ],
};

// Lucide Zap icon paths (24x24 viewBox)
export const ICON_ZAP: IconDef = {
  paths: [
    'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  ],
};

/**
 * Draw a Lucide-style icon on canvas at (x, y) with given size and color.
 * Icons are defined in 24×24 viewBox coordinates and scaled to `size` pixels.
 * Uses ctx.save()/restore() to sandbox transform state.
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: IconDef,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const scale = size / 24;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / scale; // keep 2px stroke weight regardless of scale
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Paths
  for (const d of icon.paths) {
    const path = new Path2D(d);
    ctx.stroke(path);
  }

  // Circles (no fill — stroke only to match Lucide outline style)
  for (const c of icon.circles ?? []) {
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Lines
  for (const l of icon.lines ?? []) {
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }

  // Polylines (space-separated x y pairs)
  for (const pts of icon.polylines ?? []) {
    const nums = pts.trim().split(/\s+/).map(Number);
    ctx.beginPath();
    for (let i = 0; i < nums.length; i += 2) {
      if (i === 0) ctx.moveTo(nums[0], nums[1]);
      else ctx.lineTo(nums[i], nums[i + 1]);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ── Tool logo loading ──────────────────────────────────────────────────────────

/**
 * Deduplication: copilot + copilot-cli map to the same icon.
 * Returns a deduplicated list of unique tool identifiers for icon rendering.
 */
export function deduplicateToolsForIcons(sourceTools: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tool of sourceTools) {
    // Both copilot variants share the same icon — normalize to 'copilot'
    const key = tool === 'copilot-cli' ? 'copilot' : tool;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

const TOOL_ICON_URLS: Record<string, string> = {
  'claude-code': claudeCodeUrl,
  'cursor': cursorUrl,
  'codex-cli': codexUrl,
  'copilot': copilotUrl,
  'copilot-cli': copilotUrl,
};

/** Human-readable display names for source tools (used in share card evidence section). */
export const SOURCE_TOOL_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  'cursor': 'Cursor',
  'codex-cli': 'Codex CLI',
  'copilot': 'GitHub Copilot',
  'copilot-cli': 'GitHub Copilot',
};

/** Pre-load tool logo images. Returns a map of tool key → HTMLImageElement. */
export async function loadToolIcons(tools: string[]): Promise<Map<string, HTMLImageElement>> {
  const deduped = deduplicateToolsForIcons(tools);
  const entries = await Promise.all(
    deduped.map(async (tool) => {
      const url = TOOL_ICON_URLS[tool];
      if (!url) return null;
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // skip broken icons gracefully
        img.src = url;
      });
      return [tool, img] as const;
    })
  );
  return new Map(entries.filter((e): e is [string, HTMLImageElement] => e !== null && e[1].complete && e[1].naturalWidth > 0));
}

/**
 * Draw a tool logo at (cx, cy) as an 18×18 circle-clipped image.
 * cx/cy are the CENTER of the circle.
 */
export function drawToolIcon(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  size: number = 18
): void {
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, size, size);
  ctx.restore();
}
