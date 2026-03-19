/**
 * WorkingStyleShareCard — 1200×630px shareable PNG export card.
 *
 * CRITICAL RULES:
 * - ALL colors as hex literals — NO CSS variables, NO Tailwind classes
 * - fontFamily: system-ui stack
 * - All sizing in px — NO rem, NO responsive units
 * - Rendered off-screen (position: absolute; left: -9999px) for html-to-image capture
 * - Privacy: never shows project names, file paths, session titles, cost data, or usernames
 */

import { forwardRef } from 'react';
import { ShareCardDonut } from './ShareCardDonut';
import {
  SOURCE_TOOL_DISPLAY_NAMES,
  SOURCE_TOOL_PILL_COLORS,
  computeMilestones,
} from '@/lib/share-card-utils';

// Donut segment colors — hex literals matching SESSION_CHARACTER_COLORS hues
const CHARACTER_DONUT_COLORS: Record<string, string> = {
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
 * Derive month + year label from an ISO week string (e.g. "2026-W11" → "Mar 2026").
 * Uses the Monday of that week — avoids showing the wrong month when viewing historical weeks.
 */
function getMonthYearFromWeek(isoWeek: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!match) {
    return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  // Find Monday of ISO week 1: Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay();
  const daysToMonday = jan4Day === 0 ? 6 : jan4Day - 1;
  const week1Monday = new Date(jan4.getTime() - daysToMonday * 86400000);
  const weekMonday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
  return weekMonday.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export interface WorkingStyleShareCardProps {
  tagline: string;
  totalSessions: number;
  streak: number;
  sourceTools: string[];
  characterDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  currentWeek: string;  // ISO week string — determines footer month label (avoids showing wrong month for historical weeks)
}

export const WorkingStyleShareCard = forwardRef<HTMLDivElement, WorkingStyleShareCardProps>(
  function WorkingStyleShareCard(
    { tagline, totalSessions, streak, sourceTools, characterDistribution, outcomeDistribution, currentWeek },
    ref
  ) {
    // Compute success rate (high outcomes / total faceted sessions)
    const outcomeTotal = Object.values(outcomeDistribution).reduce((s, v) => s + v, 0);
    const successCount = outcomeDistribution['high'] ?? 0;
    const successRate = outcomeTotal > 0 ? Math.round((successCount / outcomeTotal) * 100) : 0;

    // Build donut data: top 3 character types + "Other"
    const sortedChars = Object.entries(characterDistribution)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);

    const top3 = sortedChars.slice(0, 3);
    const otherSum = sortedChars.slice(3).reduce((s, [, v]) => s + v, 0);
    const donutData = [
      ...top3.map(([key, value]) => ({
        label: CHARACTER_DISPLAY_NAMES[key] ?? key,
        value,
        color: CHARACTER_DONUT_COLORS[key] ?? '#64748b',
      })),
      ...(otherSum > 0 ? [{ label: 'Other', value: otherSum, color: '#334155' }] : []),
    ];

    const milestones = computeMilestones(totalSessions, streak, sourceTools.length, successRate);

    const hasTools = sourceTools.length > 0;
    const hasMilestones = milestones.length > 0;
    const hasDonut = donutData.length > 0;

    return (
      <div
        ref={ref}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '1200px',
          height: '630px',
          fontFamily: FONT_STACK,
          overflow: 'hidden',
          // Background gradient
          background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%)',
        }}
      >
        {/* Radial glow accents */}
        <div
          style={{
            position: 'absolute',
            top: '-80px',
            left: '-80px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #3b82f620 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            right: '-80px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #a855f718 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Content area */}
        <div
          style={{
            position: 'relative',
            padding: '40px',
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── Top: Logo + app name ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            {/* App logo SVG */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="7" fill="#3b82f6" />
              <path d="M8 10h12M8 14h8M8 18h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span
              style={{
                fontSize: '13px',
                color: '#a0a0b8',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Code Insights
            </span>
          </div>

          {/* ── Tagline ── */}
          <p
            style={{
              fontSize: '42px',
              fontWeight: 700,
              lineHeight: 1.15,
              margin: '0 0 24px 0',
              background: 'linear-gradient(to right, #60a5fa, #c084fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              maxWidth: '900px',
            }}
          >
            {tagline}
          </p>

          {/* ── Stat boxes ── */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            {[
              { value: abbreviateCount(totalSessions), label: 'Sessions' },
              { value: streak > 0 ? `${streak}d` : '—', label: 'Streak' },
              { value: outcomeTotal > 0 ? `${successRate}%` : '—', label: 'Success' },
            ].map(({ value, label }) => (
              <div
                key={label}
                style={{
                  width: '140px',
                  height: '64px',
                  borderRadius: '8px',
                  background: '#ffffff06',
                  border: '1px solid #ffffff10',
                  padding: '12px 16px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>
                  {value}
                </span>
                <span
                  style={{
                    fontSize: '11px',
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

          {/* ── Middle zone: LEFT (tools + milestones) / RIGHT (donut) ── */}
          <div style={{ display: 'flex', flex: 1, gap: '24px', alignItems: 'flex-start' }}>
            {/* LEFT — 55% */}
            <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Tool pills */}
              {hasTools && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {sourceTools.map((tool) => {
                    const colors = SOURCE_TOOL_PILL_COLORS[tool] ?? {
                      bg: '#1e293b', text: '#94a3b8', border: '#94a3b84d',
                    };
                    return (
                      <span
                        key={tool}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '12px',
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

              {/* Milestone pills */}
              {hasMilestones && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {milestones.map((m, i) => (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 500,
                        backgroundColor: '#ffffff0a',
                        color: '#94a3b8',
                        border: '1px solid #ffffff15',
                      }}
                    >
                      <span style={{ color: m.iconColor }}>{m.icon}</span>
                      {m.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — 45% */}
            {hasDonut && (
              <div style={{ flex: '0 0 45%', display: 'flex', justifyContent: 'flex-end' }}>
                <ShareCardDonut data={donutData} size={150} strokeWidth={22} />
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
            <div style={{ height: '1px', backgroundColor: '#ffffff12', marginBottom: '14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
                  <rect width="28" height="28" rx="7" fill="#3b82f6" />
                  <path d="M8 10h12M8 14h8M8 18h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: '13px', color: '#64748b' }}>code-insights.app</span>
              </div>
              <span style={{ fontSize: '12px', color: '#475569' }}>
                Patterns · {getMonthYearFromWeek(currentWeek)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
