import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
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
 * Format a Claude model ID for display by stripping the 'claude-' prefix
 * and any trailing date suffix (e.g., '-20250929').
 */
export function formatModelName(model: string): string {
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
