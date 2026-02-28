import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ensureConfigDir, getConfigDir } from './config.js';

// Tips stop showing after this many displays per command.
// Five is enough to surface the tip on early uses without becoming annoying.
const MAX_TIPS_PER_COMMAND = 5;

const TIPS_STATE_FILE = '.tips-state.json';

/**
 * Per-command tip arrays. Tips cycle with modulo so they don't repeat
 * in strict sequence once the list wraps — they're educational hints,
 * not a tutorial that must be seen in order.
 */
const TIPS: Record<string, string[]> = {
  stats: [
    'Try `code-insights stats cost` for a cost and token breakdown by session',
    'Try `code-insights stats today` to see only today\'s activity',
    'Try `code-insights stats models` to compare usage across AI models',
    'Try `code-insights stats projects` to see which projects you\'ve worked on most',
    'Run `code-insights dashboard` to explore your sessions in the built-in dashboard',
  ],
  'stats cost': [
    'Use `--period 30d` to see cost over the last 30 days (default is 7d)',
    'Try `code-insights stats models` to break down cost by model',
    'Try `code-insights stats` for a full activity overview',
  ],
  'stats today': [
    'Try `code-insights stats` for a full activity overview across all time',
    'Try `code-insights stats cost` to see what today\'s sessions cost',
  ],
  'stats projects': [
    'Use `--project <name>` to filter sessions to a specific project',
    'Try `code-insights stats cost` to see how spend is distributed across projects',
  ],
  'stats models': [
    'Try `code-insights stats cost` to see per-session cost alongside model usage',
    'Try `code-insights stats` for the full overview including all activity',
  ],
};

interface TipsState {
  shown: Record<string, number>;
}

/**
 * Load tips state from ~/.code-insights/.tips-state.json.
 * Returns an empty state on any I/O or parse error — tips are non-critical.
 */
function loadTipsState(): TipsState {
  try {
    const file = path.join(getConfigDir(), TIPS_STATE_FILE);
    if (!fs.existsSync(file)) {
      return { shown: {} };
    }
    const content = fs.readFileSync(file, 'utf-8');
    return JSON.parse(content) as TipsState;
  } catch {
    return { shown: {} };
  }
}

/**
 * Persist tips state. Silently swallows errors — a failed write just
 * means the same tip might show again next run, which is acceptable.
 */
function saveTipsState(state: TipsState): void {
  try {
    ensureConfigDir();
    const file = path.join(getConfigDir(), TIPS_STATE_FILE);
    fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch {
    // Non-critical — swallow silently
  }
}

/**
 * Show a rotating contextual tip after a CLI command.
 *
 * Tips are suppressed once a command has accumulated MAX_TIPS_PER_COMMAND
 * displays, so they phase out naturally after the user's first few runs.
 * All state is stored in ~/.code-insights/.tips-state.json.
 *
 * Returns the tip string if one was printed, or null if suppressed.
 */
export function showTip(command: string): string | null {
  try {
    const tips = TIPS[command];

    // No tips defined for this command — nothing to show
    if (!tips || tips.length === 0) {
      return null;
    }

    const state = loadTipsState();
    const count = state.shown[command] ?? 0;

    // User has seen enough tips for this command — stop showing them
    if (count >= MAX_TIPS_PER_COMMAND) {
      return null;
    }

    // Cycle through tips so we don't always repeat the first one
    const tip = tips[count % tips.length];
    const formatted = chalk.gray(`\n  Tip: ${tip}`);

    console.log(formatted);

    state.shown[command] = count + 1;
    saveTipsState(state);

    return formatted;
  } catch {
    // Tips are non-critical — swallow all errors silently
    return null;
  }
}
