/**
 * Shared color constants and display labels for insight types and session character types.
 * Used across sessions list, InsightCard, and anywhere these domain concepts
 * need consistent visual treatment.
 *
 * Format: Tailwind utility classes (bg/text/border) compatible with dark mode
 * via the alpha-based (500/10, 500/20) approach.
 *
 * CHART_COLORS: Hex values for Recharts inline styles. Must be hex/rgb literals
 * (not HSL/oklch CSS variable references) because Recharts resolves these as SVG
 * fill/stroke attributes, not CSS classes.
 */

import type { InsightType } from '@/lib/types';

export const INSIGHT_TYPE_COLORS: Record<InsightType, string> = {
  summary: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  decision: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  learning: 'bg-green-500/10 text-green-500 border-green-500/20',
  technique: 'bg-green-500/10 text-green-500 border-green-500/20',
  prompt_quality: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

/** Human-readable labels for insight types. */
export const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  summary: 'Summary',
  decision: 'Decision',
  learning: 'Learning',
  technique: 'Learning',    // display as Learning for backward compat
  prompt_quality: 'Prompt Quality',
};

export const SESSION_CHARACTER_COLORS: Record<string, string> = {
  deep_focus: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  bug_hunt: 'bg-red-500/10 text-red-600 border-red-500/20',
  feature_build: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  exploration: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  refactor: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  learning: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  quick_task: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

/** Human-readable labels for session character types. */
export const SESSION_CHARACTER_LABELS: Record<string, string> = {
  deep_focus: 'Deep Focus',
  bug_hunt: 'Bug Hunt',
  feature_build: 'Feature Build',
  exploration: 'Exploration',
  refactor: 'Refactor',
  learning: 'Learning',
  quick_task: 'Quick Task',
};

/** Visual identity for agent participants in chat conversations. */
export const AGENT_PARTICIPANT_COLORS: Record<string, string> = {
  'general-purpose': 'bg-blue-500 text-white',
  'Explore': 'bg-cyan-500 text-white',
  'Plan': 'bg-indigo-500 text-white',
  'Bash': 'bg-zinc-700 text-white',
  'ux-engineer': 'bg-pink-500 text-white',
  'technical-architect': 'bg-blue-600 text-white',
  'web-engineer': 'bg-emerald-500 text-white',
  'code-reviewer': 'bg-amber-500 text-white',
};

/** Fallback color for unknown agent types. */
export const AGENT_DEFAULT_COLOR = 'bg-gray-500 text-white';

/** Outcome indicator dot colors and labels for session outcome status. */
export const OUTCOME_DOT: Record<string, { color: string; label: string }> = {
  success: { color: 'bg-emerald-500', label: 'Completed successfully' },
  partial: { color: 'bg-amber-500', label: 'Partially completed' },
  abandoned: { color: 'bg-red-500', label: 'Abandoned' },
  blocked: { color: 'bg-red-500', label: 'Blocked' },
};

/** Badge colors for source tool indicators. */
export const SOURCE_TOOL_COLORS: Record<string, string> = {
  'claude-code': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  'cursor': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'codex-cli': 'bg-green-500/10 text-green-600 border-green-500/20',
  'copilot-cli': 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  'copilot': 'bg-violet-500/10 text-violet-600 border-violet-500/20',
};

/** Border + background colors for teammate message cards, keyed by the `color` attribute from <teammate-message>. */
export const TEAMMATE_BORDER_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  green: { border: 'border-green-500/40', bg: 'bg-green-500/5', text: 'text-green-500' },
  blue: { border: 'border-blue-500/40', bg: 'bg-blue-500/5', text: 'text-blue-500' },
  red: { border: 'border-red-500/40', bg: 'bg-red-500/5', text: 'text-red-500' },
  yellow: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', text: 'text-yellow-500' },
  purple: { border: 'border-purple-500/40', bg: 'bg-purple-500/5', text: 'text-purple-500' },
  cyan: { border: 'border-cyan-500/40', bg: 'bg-cyan-500/5', text: 'text-cyan-500' },
  orange: { border: 'border-orange-500/40', bg: 'bg-orange-500/5', text: 'text-orange-500' },
  pink: { border: 'border-pink-500/40', bg: 'bg-pink-500/5', text: 'text-pink-500' },
};

export const TEAMMATE_DEFAULT_COLORS = { border: 'border-gray-500/40', bg: 'bg-gray-500/5', text: 'text-gray-500' };

/**
 * Hex color values for Recharts SVG elements (stroke, fill, Cell fill).
 * Using hex literals avoids hsl(var(--...)) / oklch incompatibility where
 * Recharts passes these strings directly to SVG attributes, not through CSS.
 */
export const CHART_COLORS = {
  // Insight type pie chart — aligned with INSIGHT_TYPE_COLORS badge colors
  insightTypes: {
    summary: '#a855f7',        // purple-500
    decision: '#3b82f6',       // blue-500
    learning: '#22c55e',       // green-500
    technique: '#22c55e',      // green-500 (same as learning — merged for display)
    prompt_quality: '#f43f5e', // rose-500
  },
  // Activity area chart lines
  activity: {
    sessions: '#3b82f6',  // blue-500
    insights: '#22c55e',  // green-500
  },
  // Top projects bar chart
  projects: {
    sessions: '#3b82f6',  // blue-500
  },
  // Model distribution pie chart
  models: ['#3b82f6', '#a855f7', '#22c55e', '#f59e0b', '#f43f5e', '#06b6d4'],
  // Cost chart
  cost: {
    area: '#f59e0b',   // amber-500
  },
} as const;
