/**
 * WorkingStyleShareCard — 480×280px shareable JPEG export card.
 *
 * CRITICAL RULES:
 * - ALL colors as hex or rgba() — NO CSS variables, NO Tailwind classes
 * - Use rgba() for any alpha transparency — 8-digit hex (#ffffff06) breaks html-to-image
 * - NO background-clip:text — html-to-image cannot serialize it; use solid color instead
 * - fontFamily: system-ui stack
 * - All sizing in px — NO rem, NO responsive units
 * - Rendered off-screen (position: absolute; left: -9999px) for html-to-image capture
 * - Privacy: never shows project names, file paths, session titles, cost data, or usernames
 */

import { forwardRef } from 'react';
import {
  SOURCE_TOOL_DISPLAY_NAMES,
  SOURCE_TOOL_PILL_COLORS,
  computeMilestones,
} from '@/lib/share-card-utils';

// Character pill colors — hex literals matching SESSION_CHARACTER_COLORS hues
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
const CHARACTER_DISPLAY_NAMES: Record<string, string> = {
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

/**
 * Derive a placeholder subtitle from character distribution.
 * Used as fallback when no LLM-generated tagline_subtitle is available (e.g. old snapshots).
 */
function deriveSubtitle(characterDistribution: Record<string, number>): string {
  const sorted = Object.entries(characterDistribution)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return 'Exploring AI-assisted development workflows';

  const top2 = sorted.slice(0, 2).map(([key]) => {
    const name = (CHARACTER_DISPLAY_NAMES[key] ?? key).toLowerCase();
    return name;
  });

  if (top2.length === 1) return `Primarily ${top2[0]} sessions`;
  return `Primarily ${top2[0]} and ${top2[1]} sessions`;
}

export interface WorkingStyleShareCardProps {
  tagline: string;
  taglineSubtitle?: string;
  totalSessions: number;
  streak: number;
  sourceTools: string[];
  characterDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  currentWeek: string;  // ISO week string — kept for API compat
}

export const WorkingStyleShareCard = forwardRef<HTMLDivElement, WorkingStyleShareCardProps>(
  function WorkingStyleShareCard(
    { tagline, taglineSubtitle, totalSessions, streak, sourceTools, characterDistribution, outcomeDistribution },
    ref
  ) {
    // Compute success rate (high outcomes / total faceted sessions)
    const outcomeTotal = Object.values(outcomeDistribution).reduce((s, v) => s + v, 0);
    const successCount = outcomeDistribution['high'] ?? 0;
    const successRate = outcomeTotal > 0 ? Math.round((successCount / outcomeTotal) * 100) : 0;

    // Build character pill data: top 3 types
    const sortedChars = Object.entries(characterDistribution)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const charTotal = sortedChars.reduce((s, [, v]) => s + v, 0);
    const top3Chars = sortedChars.slice(0, 3);

    const milestones = computeMilestones(totalSessions, streak, sourceTools.length, successRate);

    const hasTools = sourceTools.length > 0;
    const hasMilestones = milestones.length > 0;
    const hasChars = top3Chars.length > 0;

    const subtitle = taglineSubtitle || deriveSubtitle(characterDistribution);

    return (
      <div
        ref={ref}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '480px',
          height: '280px',
          fontFamily: FONT_STACK,
          overflow: 'hidden',
          // Solid background — html-to-image toJpeg backgroundColor handles base color,
          // gradient is layered via inner div for better serialization compat
          backgroundColor: '#0f0f23',
        }}
      >
        {/* Gradient overlay — separate div for html-to-image compat */}
        {/* zIndex: 0 + explicit sides (not inset shorthand) — SVG foreignObject doesn't reliably preserve DOM-order stacking */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 0,
            background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%)',
          }}
        />

        {/* Radial glow accents — rgba() instead of 8-digit hex for html-to-image compat */}
        <div
          style={{
            position: 'absolute',
            top: '-40px',
            left: '-40px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            zIndex: 0,
            background: 'radial-gradient(circle, rgba(59,130,246,0.13) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-50px',
            right: '-40px',
            width: '250px',
            height: '250px',
            borderRadius: '50%',
            zIndex: 0,
            background: 'radial-gradient(circle, rgba(168,85,247,0.09) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Content area — zIndex: 1 ensures content renders above overlay/glows in SVG foreignObject */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '24px',
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── Header: Logo + app name (left) + tool pills (right) ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* App logo SVG */}
              <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="7" fill="#3b82f6" />
                <path d="M8 10h12M8 14h8M8 18h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span
                style={{
                  fontSize: '9px',
                  color: '#a0a0b8',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Code Insights
              </span>
            </div>
            {hasTools && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {sourceTools.map((tool) => {
                  const colors = SOURCE_TOOL_PILL_COLORS[tool] ?? {
                    bg: '#1e293b', text: '#94a3b8', border: 'rgba(148,163,184,0.3)',
                  };
                  return (
                    <span
                      key={tool}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        borderRadius: '999px',
                        fontSize: '9px',
                        fontWeight: 500,
                        backgroundColor: colors.bg,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      {SOURCE_TOOL_DISPLAY_NAMES[tool] ?? tool}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Tagline block: title + subtitle ── */}
          <div style={{ marginBottom: '14px', maxWidth: '400px' }}>
            {/* Solid color — html-to-image cannot render background-clip:text gradient */}
            <p
              style={{
                fontSize: '22px',
                fontWeight: 700,
                lineHeight: 1.2,
                margin: '0 0 4px 0',
                color: '#a78bfa',
                // Prevent 3-line overflow at 22px in 280px card
                maxHeight: '54px',
                overflow: 'hidden',
              }}
            >
              {tagline}
            </p>
            <p
              style={{
                fontSize: '11px',
                fontWeight: 400,
                lineHeight: 1.3,
                margin: 0,
                color: '#8b8ba0',
              }}
            >
              {subtitle}
            </p>
          </div>

          {/* ── Stat cards ── */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            {[
              { value: abbreviateCount(totalSessions), label: 'Sessions' },
              { value: streak > 0 ? `${streak}d` : '\u2014', label: 'Streak' },
              { value: outcomeTotal > 0 ? `${successRate}%` : '\u2014', label: 'Success' },
            ].map(({ value, label }) => (
              <div
                key={label}
                style={{
                  width: '100px',
                  height: '52px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  padding: '8px 12px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>
                  {value}
                </span>
                <span
                  style={{
                    fontSize: '8px',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginTop: '2px',
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Character distribution pills (replaces donut) ── */}
          {hasChars && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              {top3Chars.map(([key, count]) => {
                const pct = charTotal > 0 ? Math.round((count / charTotal) * 100) : 0;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: CHARACTER_COLORS[key] ?? '#64748b',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {CHARACTER_DISPLAY_NAMES[key] ?? key}
                    </span>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Milestone pills (max 3) ── */}
          {hasMilestones && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {milestones.map((m, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '3px 8px',
                    borderRadius: '999px',
                    fontSize: '9px',
                    fontWeight: 500,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  <span style={{ color: m.iconColor }}>{m.icon}</span>
                  {m.label}
                </span>
              ))}
            </div>
          )}

          {/* ── Footer: stacked brand + CTA ── */}
          <div style={{ marginTop: 'auto', paddingTop: '7px' }}>
            <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: '8px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="10" height="10" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="7" fill="#3b82f6" />
                <path d="M8 10h12M8 14h8M8 18h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: '9px', fontWeight: 500, color: '#94a3b8' }}>code-insights.app</span>
            </div>
            <p style={{ fontSize: '8px', fontWeight: 400, color: '#475569', margin: '2px 0 0 0' }}>
              Analyze your AI coding sessions
            </p>
          </div>
        </div>
      </div>
    );
  }
);
