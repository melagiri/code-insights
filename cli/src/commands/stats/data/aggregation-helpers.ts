// Pure utility functions used across aggregation.ts and time-series.ts.
// No imports from aggregation.ts — these are leaf-level helpers.

import type { Period, SessionRow } from './types.js';

// ─── Numeric helpers ──────────────────────────────────────────────────────────

export function sum<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((acc, item) => acc + fn(item), 0);
}

export function diffMinutes(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

export function findMostFrequent(items: string[]): string | undefined {
  if (items.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function yesterday(): Date {
  const d = today();
  d.setDate(d.getDate() - 1);
  return d;
}

export function startOfWeek(): Date {
  const d = today();
  const day = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days back to Monday
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Returns the start date for a given period, or undefined for 'all'.
 */
export function periodStartDate(period: Period): Date | undefined {
  const d = today();
  switch (period) {
    case '7d':
      d.setDate(d.getDate() - 7);
      return d;
    case '30d':
      d.setDate(d.getDate() - 30);
      return d;
    case '90d':
      d.setDate(d.getDate() - 90);
      return d;
    case 'all':
      return undefined;
  }
}

/**
 * Resolve the display title for a session.
 */
export function resolveTitle(session: SessionRow): string {
  return (
    session.customTitle ??
    session.generatedTitle ??
    session.summary ??
    'Untitled Session'
  );
}

/**
 * Shorten a model identifier to a display-friendly name.
 */
export function shortenModelName(model: string): string {
  // Claude 4.x opus variants
  if (/^claude-opus-4/.test(model)) return 'Opus 4.x';
  // Claude 4.x sonnet variants
  if (/^claude-sonnet-4/.test(model)) return 'Sonnet 4.x';
  // Claude haiku variants (covers haiku-4-5, haiku-3-5, etc.)
  if (/^claude-haiku/.test(model)) return 'Haiku';
  // Claude 3.5 sonnet
  if (/^claude-3-5-sonnet/.test(model)) return 'Sonnet 3.5';
  // Claude 3.5 haiku
  if (/^claude-3-5-haiku/.test(model)) return 'Haiku 3.5';
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
  // Fallback: truncate to 20 chars
  return model.length > 20 ? model.slice(0, 20) : model;
}

/** Pad a number to 2 digits */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
