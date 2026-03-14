import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parse } from 'date-fns';
import type { Session } from '@/lib/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a session duration in human-friendly units.
 * Examples: "45m", "5h 23m", "1d 2h"
 */
export function formatDuration(startedAt: Date, endedAt: Date): string {
  const totalMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
  if (totalMinutes < 1) return '<1m';
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Format a duration given in whole minutes into a human-friendly string.
 * Examples: "45m", "1h 30m", "2h"
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format a model ID into a display-friendly name.
 *
 * Produces friendly names (e.g. "Sonnet 3.5", "Opus 4.x") for known Claude
 * and GPT model families. Mirrors the CLI's shortenModelName() in
 * cli/src/commands/stats/data/aggregation.ts — keep the two in sync when
 * adding new model families.
 *
 * Falls back to stripping the 'claude-' prefix and any trailing date suffix
 * (e.g. '-20250929') for unknown model IDs.
 */
export function formatModelName(model: string): string {
  // Claude 4.x opus variants
  if (/^claude-opus-4/.test(model)) return 'Opus 4.x';
  // Claude 4.x sonnet variants
  if (/^claude-sonnet-4/.test(model)) return 'Sonnet 4.x';
  // Claude 3.5 sonnet (must come before generic haiku/sonnet 3 checks)
  if (/^claude-3-5-sonnet/.test(model)) return 'Sonnet 3.5';
  // Claude 3.5 haiku (must come before generic haiku 3 check)
  if (/^claude-3-5-haiku/.test(model)) return 'Haiku 3.5';
  // Claude haiku variants (covers haiku-4-5, haiku-3, etc.)
  if (/^claude-haiku/.test(model)) return 'Haiku';
  // Claude 3 opus
  if (/^claude-3-opus/.test(model)) return 'Opus 3';
  // Claude 3 sonnet
  if (/^claude-3-sonnet/.test(model)) return 'Sonnet 3';
  // Claude 3 haiku
  if (/^claude-3-haiku/.test(model)) return 'Haiku 3';
  // GPT-4o
  if (/^gpt-4o/.test(model)) return 'GPT-4o';
  // GPT-4-turbo
  if (/^gpt-4-turbo/.test(model)) return 'GPT-4 Turbo';
  // Fallback: strip 'claude-' prefix and trailing date suffix for readability
  return model.replace('claude-', '').replace(/-\d{8}$/, '');
}

/**
 * Format a date range for display.
 * Same day: "Feb 12, 1:20 PM – 3:40 PM"
 * Multi-day: "Feb 12, 1:20 PM – Feb 13, 3:40 PM"
 */
export function formatDateRange(startedAt: Date, endedAt: Date): string {
  const sameDay = startedAt.toDateString() === endedAt.toDateString();
  if (sameDay) {
    return `${format(startedAt, 'MMM d, h:mm a')} – ${format(endedAt, 'h:mm a')}`;
  }
  return `${format(startedAt, 'MMM d, h:mm a')} – ${format(endedAt, 'MMM d, h:mm a')}`;
}

/**
 * Format a token count with human-friendly units.
 * Examples: "1,234", "45.2K", "3.1M", "6.2B"
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString();
}

/**
 * Get display title for a session with priority: custom_title > generated_title > summary > fallback
 */
export function getSessionTitle(session: Pick<Session, 'custom_title' | 'generated_title' | 'summary'>): string {
  return session.custom_title || session.generated_title || session.summary || 'Untitled Session';
}

export function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (sessionDay.getTime() === today.getTime()) return 'Today';
  if (sessionDay.getTime() === yesterday.getTime()) return 'Yesterday';
  if (date.getFullYear() !== now.getFullYear()) {
    return format(date, 'EEEE, MMM d, yyyy');
  }
  return format(date, 'EEEE, MMM d');
}

/**
 * Sort date group entries: Today first, Yesterday second, then remaining groups
 * sorted newest-first by parsing the date label.
 */
export function sortDateGroups<T>(entries: [string, T][]): [string, T][] {
  const now = new Date();
  return [...entries].sort((a, b) => {
    const labelA = a[0];
    const labelB = b[0];

    // Today always first
    if (labelA === 'Today') return -1;
    if (labelB === 'Today') return 1;
    // Yesterday always second
    if (labelA === 'Yesterday') return -1;
    if (labelB === 'Yesterday') return 1;

    // Parse dates from labels for remaining groups (newest first)
    const dateA = parseDateGroupLabel(labelA, now);
    const dateB = parseDateGroupLabel(labelB, now);
    return dateB.getTime() - dateA.getTime();
  });
}

function parseDateGroupLabel(label: string, now: Date): Date {
  // Remove the day-of-week prefix (e.g., "Monday, ")
  const commaIdx = label.indexOf(', ');
  if (commaIdx === -1) return new Date(0);
  const datePart = label.slice(commaIdx + 2);
  // Try "MMM d, yyyy" first (cross-year labels)
  const withYear = parse(datePart, 'MMM d, yyyy', now);
  if (!isNaN(withYear.getTime())) return withYear;
  // Fall back to "MMM d" (current year)
  const currentYear = parse(datePart, 'MMM d', now);
  if (!isNaN(currentYear.getTime())) return currentYear;
  return new Date(0);
}
