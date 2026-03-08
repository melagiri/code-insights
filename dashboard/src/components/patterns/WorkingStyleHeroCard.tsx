import { Brain } from 'lucide-react';

// Color palette for donut segments — matches the page's existing PALETTE
const DONUT_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

function buildDonutSegments(characterDistribution: Record<string, number>): DonutSegment[] {
  const entries = Object.entries(characterDistribution).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return [];

  // Top 3 by count, rest grouped as "other"
  const top = entries.slice(0, 3);
  const otherTotal = entries.slice(3).reduce((sum, [, v]) => sum + v, 0);

  const segments: DonutSegment[] = top.map(([label, value], i) => ({
    label: label.replace(/_/g, ' '),
    value,
    color: DONUT_COLORS[i],
  }));

  if (otherTotal > 0) {
    segments.push({ label: 'other', value: otherTotal, color: DONUT_COLORS[3] });
  }

  return segments;
}

function DonutChart({ segments }: { segments: DonutSegment[] }) {
  const cx = 60;
  const cy = 60;
  const outerR = 52;
  const innerR = 34;

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Session type distribution: no data">
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#ffffff20" strokeWidth={outerR - innerR} />
      </svg>
    );
  }

  let currentAngle = -Math.PI / 2; // Start at top (12 o'clock)
  const paths: Array<{ d: string; color: string }> = [];

  for (const segment of segments) {
    const fraction = segment.value / total;
    // Clamp to just under full circle to avoid degenerate arc (point to point)
    const sweepAngle = Math.min(fraction * 2 * Math.PI, 2 * Math.PI - 0.001);

    const x1 = cx + outerR * Math.cos(currentAngle);
    const y1 = cy + outerR * Math.sin(currentAngle);
    const x2 = cx + outerR * Math.cos(currentAngle + sweepAngle);
    const y2 = cy + outerR * Math.sin(currentAngle + sweepAngle);
    const ix1 = cx + innerR * Math.cos(currentAngle + sweepAngle);
    const iy1 = cy + innerR * Math.sin(currentAngle + sweepAngle);
    const ix2 = cx + innerR * Math.cos(currentAngle);
    const iy2 = cy + innerR * Math.sin(currentAngle);
    const largeArc = sweepAngle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ');

    paths.push({ d, color: segment.color });
    currentAngle += sweepAngle;
  }

  const ariaLabel = 'Session type distribution: ' + segments
    .map(s => `${s.label} ${Math.round((s.value / total) * 100)}%`)
    .join(', ');

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={ariaLabel}>
      {paths.map((p) => (
        <path key={p.color} d={p.d} fill={p.color} opacity={0.9} />
      ))}
    </svg>
  );
}

const MAX_TAGLINE_CHARS = 40;

interface WorkingStyleHeroCardProps {
  tagline?: string;
  sessionsAnalyzed: number;
  streak: number;
  toolsUsed: number;
  characterDistribution: Record<string, number>;
  hasGenerated: boolean;
}

export function WorkingStyleHeroCard({
  tagline,
  sessionsAnalyzed,
  streak,
  toolsUsed,
  characterDistribution,
  hasGenerated,
}: WorkingStyleHeroCardProps) {
  const segments = buildDonutSegments(characterDistribution);

  return (
    <div
      className="relative overflow-hidden rounded-xl p-6 border border-border/50"
      style={{ background: 'linear-gradient(135deg, #0f0f23, #1a1a3e)' }}
    >
      {/* Branding */}
      <div className="flex items-center gap-1.5 mb-4">
        <Brain className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-[10px] font-semibold tracking-widest text-blue-400/80 uppercase">
          Code Insights
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Tagline */}
          {hasGenerated && tagline ? (
            <h2
              className="text-2xl font-bold mb-3 leading-tight"
              style={{
                background: 'linear-gradient(to right, #60a5fa, #c084fc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {tagline.length > MAX_TAGLINE_CHARS ? tagline.slice(0, MAX_TAGLINE_CHARS - 1) + '…' : tagline}
            </h2>
          ) : (
            <p className="text-sm text-white/50 mb-3 italic">
              Generate patterns to discover your working style
            </p>
          )}

          {/* Stat pills */}
          <div className="flex flex-wrap gap-2">
            <StatPill label="Sessions analyzed" value={sessionsAnalyzed} />
            <StatPill label="Active streak" value={streak} unit="d" />
            <StatPill label="AI tools" value={toolsUsed} />
          </div>
        </div>

        {/* Donut chart */}
        <div className="shrink-0 opacity-90">
          <DonutChart segments={segments} />
        </div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit?: string;
}) {
  return (
    <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 flex items-center gap-1">
      <span className="font-semibold text-white">
        {value}{unit}
      </span>
      <span className="text-white/50">{label}</span>
    </div>
  );
}
